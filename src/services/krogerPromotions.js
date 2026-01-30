// Kroger Promotions Service - Simplified for Proxy Server
// Works with your existing proxy-based Kroger setup

import { supabase } from './supabase';
import axios from 'axios';

const PROXY_BASE_URL = 'http://localhost:3001/api/kroger';

class KrogerPromotionsService {
  /**
   * Get Products on Sale
   * Searches multiple categories and filters for items with promo prices
   */
  async getProductsOnSale(locationId, limit = 50) {
    try {
      const categories = ['meat', 'produce', 'dairy', 'bakery', 'snacks', 'frozen'];
      const allProducts = [];

      console.log(`🔍 Searching for deals in ${categories.length} categories...`);

      for (const category of categories) {
        try {
          const response = await axios.get(`${PROXY_BASE_URL}/products`, {
            params: {
              term: category,
              locationId: locationId,
              limit: 15
            }
          });

          if (response.data?.data) {
            // Filter for products with promo prices
            const onSale = response.data.data
              .filter(product => {
                const item = product.items?.[0];
                return item?.price?.promo > 0 && item?.price?.regular > 0;
              })
              .map(product => {
                const item = product.items[0];
                const regularPrice = item.price.regular;
                const promoPrice = item.price.promo;
                const savings = regularPrice - promoPrice;
                const savingsPercent = Math.round((savings / regularPrice) * 100);

                return {
                  productId: product.productId,
                  upc: product.upc,
                  name: product.description,
                  brand: product.brand || 'Kroger',
                  category: product.categories?.[0] || category,
                  regularPrice,
                  salePrice: promoPrice,
                  savings,
                  savingsPercent,
                  imageUrl: product.images?.[0]?.sizes?.[0]?.url || null,
                  size: item.size || '',
                  soldBy: item.soldBy || 'each',
                };
              });

            allProducts.push(...onSale);
            console.log(`✅ Found ${onSale.length} deals in ${category}`);
          }
        } catch (err) {
          console.error(`Error fetching ${category}:`, err.message);
        }
      }

      console.log(`📊 Total deals found: ${allProducts.length}`);
      return allProducts.slice(0, limit);
    } catch (error) {
      console.error('Error fetching products on sale:', error);
      throw error;
    }
  }

  /**
   * Get Weekly Deals (sorted by best savings)
   */
  async getWeeklyDeals(locationId) {
    try {
      const deals = await this.getProductsOnSale(locationId, 100);
      
      // Sort by highest savings percentage
      deals.sort((a, b) => b.savingsPercent - a.savingsPercent);
      
      return deals;
    } catch (error) {
      console.error('Error fetching weekly deals:', error);
      return [];
    }
  }

  /**
   * Get Savings History from database
   */
  async getSavingsHistory() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('savings_history')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Calculate totals
      const totalSavings = data?.reduce((sum, record) => sum + parseFloat(record.amount || 0), 0) || 0;
      
      const now = new Date();
      const thisMonth = data?.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate.getMonth() === now.getMonth() && 
               recordDate.getFullYear() === now.getFullYear();
      }).reduce((sum, record) => sum + parseFloat(record.amount || 0), 0) || 0;

      return {
        history: data || [],
        totalSavings,
        thisMonth,
        averagePerMonth: data?.length > 0 ? totalSavings / 12 : 0
      };
    } catch (error) {
      console.error('Error fetching savings history:', error);
      return {
        history: [],
        totalSavings: 0,
        thisMonth: 0,
        averagePerMonth: 0
      };
    }
  }

  /**
   * Record sale savings to database
   */
  async recordSaleSavings(productName, savingsAmount) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('savings_history')
        .insert({
          user_id: user.id,
          type: 'sale',
          amount: parseFloat(savingsAmount),
          date: new Date().toISOString(),
          description: `Sale: ${productName}`
        });

      console.log(`💰 Recorded $${savingsAmount} savings for ${productName}`);
    } catch (error) {
      console.error('Error recording sale savings:', error);
    }
  }

  /**
   * Get clipped coupons from database
   */
  async getClippedCoupons() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('clipped_coupons')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_used', false)
        .order('clipped_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching clipped coupons:', error);
      return [];
    }
  }
}

export const krogerPromotionsService = new KrogerPromotionsService();
export default krogerPromotionsService;