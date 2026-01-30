// Kroger Order History Service - Phase 5
// Handles order history, spending analytics, and reordering

import { supabase } from './supabase';
import axios from 'axios';

const PROXY_BASE_URL = 'http://localhost:3001/api/kroger';

class KrogerOrdersService {
  /**
   * Get order history from Kroger API
   * Note: This requires special API access and user authorization
   */
  async getOrderHistory(limit = 50) {
    try {
      console.log('🔍 Fetching order history...');
      
      // Call proxy server for order history
      const response = await axios.get(`${PROXY_BASE_URL}/orders`, {
        params: { limit }
      });

      if (response.data?.orders) {
        const orders = response.data.orders.map(order => ({
          orderId: order.orderId,
          orderDate: order.orderDate,
          fulfillmentDate: order.fulfillmentDate,
          fulfillmentType: order.fulfillmentType, // 'PICKUP', 'DELIVERY', etc.
          status: order.status,
          totalAmount: order.totalAmount,
          items: order.items?.map(item => ({
            productId: item.productId,
            name: item.name,
            brand: item.brand,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.totalPrice,
            category: item.category,
            imageUrl: item.imageUrl
          })) || []
        }));

        console.log(`✅ Loaded ${orders.length} orders`);
        return orders;
      }

      return [];
    } catch (error) {
      console.error('Error fetching order history:', error);
      
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Cannot connect to proxy server. Make sure it is running on port 3001.');
      }
      
      if (error.response?.status === 404) {
        throw new Error('Order history endpoint not available. This feature requires special Kroger API access.');
      }
      
      throw error;
    }
  }

  /**
   * Save order to local database for tracking
   */
  async saveOrderToDatabase(order) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Save order record
      const { data: savedOrder, error: orderError } = await supabase
        .from('order_history')
        .insert({
          user_id: user.id,
          kroger_order_id: order.orderId,
          order_date: order.orderDate,
          fulfillment_date: order.fulfillmentDate,
          fulfillment_type: order.fulfillmentType,
          status: order.status,
          total_amount: order.totalAmount,
          item_count: order.items?.length || 0
        })
        .select()
        .maybeSingle();

      if (orderError) throw orderError;

      // Save order items
      if (order.items && order.items.length > 0) {
        const items = order.items.map(item => ({
          order_id: savedOrder.id,
          product_id: item.productId,
          name: item.name,
          brand: item.brand,
          quantity: item.quantity,
          price: item.price,
          total_price: item.totalPrice,
          category: item.category
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      console.log('✅ Order saved to database');
      return savedOrder;
    } catch (error) {
      console.error('Error saving order:', error);
      throw error;
    }
  }

  /**
   * Get orders from local database
   */
  async getLocalOrderHistory() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('order_history')
        .select(`
          *,
          order_items (*)
        `)
        .eq('user_id', user.id)
        .order('order_date', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error loading local orders:', error);
      return [];
    }
  }

  /**
   * Add order items to inventory
   */
  async addOrderToInventory(order) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let addedCount = 0;
      let updatedCount = 0;

      for (const item of order.items) {
        // Check if item already exists in inventory
        const { data: existing } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('user_id', user.id)
          .eq('name', item.name)
          .maybeSingle();

        if (existing) {
          // Update quantity
          const { error } = await supabase
            .from('inventory_items')
            .update({
              amount: existing.amount + item.quantity,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (!error) updatedCount++;
        } else {
          // Add new item
          const { error } = await supabase
            .from('inventory_items')
            .insert({
              user_id: user.id,
              name: item.name,
              amount: item.quantity,
              unit: 'item',
              category: item.category || 'Other',
              brand_name: item.brand
            });

          if (!error) addedCount++;
        }
      }

      console.log(`✅ Added ${addedCount} items, updated ${updatedCount} items`);
      return { addedCount, updatedCount };
    } catch (error) {
      console.error('Error adding to inventory:', error);
      throw error;
    }
  }

  /**
   * Add order items to shopping list
   */
  async addOrderToShoppingList(order) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const items = order.items.map(item => ({
        user_id: user.id,
        name: item.name,
        amount: item.quantity,
        unit: 'item',
        category: item.category || 'Other',
        brand_name: item.brand,
        price: item.price,
        is_purchased: false
      }));

      const { error } = await supabase
        .from('shopping_list_items')
        .insert(items);

      if (error) throw error;

      console.log(`✅ Added ${items.length} items to shopping list`);
      return items.length;
    } catch (error) {
      console.error('Error adding to shopping list:', error);
      throw error;
    }
  }

  /**
   * Calculate spending analytics
   */
  async getSpendingAnalytics(startDate, endDate) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: orders, error } = await supabase
        .from('order_history')
        .select(`
          *,
          order_items (*)
        `)
        .eq('user_id', user.id)
        .gte('order_date', startDate)
        .lte('order_date', endDate)
        .order('order_date', { ascending: false });

      if (error) throw error;

      // Calculate totals
      const totalSpent = orders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
      const totalOrders = orders.length;
      const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

      // Category breakdown
      const categorySpending = {};
      const itemFrequency = {};

      orders.forEach(order => {
        order.order_items?.forEach(item => {
          const category = item.category || 'Other';
          categorySpending[category] = (categorySpending[category] || 0) + parseFloat(item.total_price || 0);

          const itemName = item.name;
          if (!itemFrequency[itemName]) {
            itemFrequency[itemName] = {
              count: 0,
              totalSpent: 0,
              name: itemName,
              brand: item.brand,
              category: category
            };
          }
          itemFrequency[itemName].count += item.quantity;
          itemFrequency[itemName].totalSpent += parseFloat(item.total_price || 0);
        });
      });

      // Top items
      const topItems = Object.values(itemFrequency)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalSpent,
        totalOrders,
        averageOrderValue,
        categorySpending,
        topItems,
        dateRange: { startDate, endDate }
      };
    } catch (error) {
      console.error('Error calculating analytics:', error);
      throw error;
    }
  }

  /**
   * Get most frequently purchased items
   */
  async getFrequentlyPurchased(limit = 20) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('order_items')
        .select(`
          name,
          brand,
          category,
          quantity,
          price
        `)
        .eq('order_id', supabase.from('order_history').select('id').eq('user_id', user.id))
        .order('quantity', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Aggregate by item name
      const aggregated = {};
      data?.forEach(item => {
        if (!aggregated[item.name]) {
          aggregated[item.name] = {
            name: item.name,
            brand: item.brand,
            category: item.category,
            totalQuantity: 0,
            averagePrice: 0,
            purchaseCount: 0
          };
        }
        aggregated[item.name].totalQuantity += item.quantity;
        aggregated[item.name].averagePrice = 
          (aggregated[item.name].averagePrice * aggregated[item.name].purchaseCount + item.price) / 
          (aggregated[item.name].purchaseCount + 1);
        aggregated[item.name].purchaseCount++;
      });

      return Object.values(aggregated)
        .sort((a, b) => b.purchaseCount - a.purchaseCount)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting frequent items:', error);
      return [];
    }
  }
}

export const krogerOrdersService = new KrogerOrdersService();
export default krogerOrdersService;