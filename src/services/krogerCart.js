import axios from 'axios';
import { krogerService } from './kroger';

const PROXY_BASE_URL = 'http://localhost:3001/api/kroger';

class KrogerCartService {
  /**
   * Add items to Kroger cart
   * @param {string} userId - User ID
   * @param {Array} items - Array of {upc, quantity} or {productId, quantity}
   */
  async addItems(userId, items) {
    try {
      // Format items for Kroger API
      const formattedItems = items.map(item => ({
        upc: item.upc,
        quantity: item.quantity || 1,
        modality: 'PICKUP', // or 'DELIVERY'
      }));

      const response = await axios.post(`${PROXY_BASE_URL}/cart/add`, {
        userId,
        items: formattedItems,
      });

      return response.data;
    } catch (error) {
      console.error('Error adding to cart:', error);
      
      if (error.response?.data?.needsAuth) {
        throw new Error('NEEDS_AUTH');
      }

      throw new Error(error.response?.data?.error || 'Failed to add items to cart');
    }
  }

  /**
   * Get current cart contents
   */
  async getCart(userId) {
    try {
      const response = await axios.get(`${PROXY_BASE_URL}/cart`, {
        params: { userId },
      });

      return response.data;
    } catch (error) {
      console.error('Error getting cart:', error);
      
      if (error.response?.data?.needsAuth) {
        throw new Error('NEEDS_AUTH');
      }

      throw new Error('Failed to get cart');
    }
  }

  /**
   * Convert shopping list items to cart items
   * Searches for each item and gets the best match
   */
  async convertShoppingListToCartItems(shoppingListItems, locationId = null) {
    const cartItems = [];
    const failedItems = [];

    for (const item of shoppingListItems) {
      try {
        // Search for the product
        const products = await krogerService.searchProducts(
          item.name,
          locationId,
          5
        );

        if (products.length > 0) {
          // Use first result (best match)
          const product = products[0];
          
          cartItems.push({
            upc: product.upc,
            productId: product.krogerProductId,
            name: item.name,
            quantity: this.calculateQuantity(item),
          });
        } else {
          failedItems.push(item.name);
        }
      } catch (error) {
        console.error(`Error finding product for ${item.name}:`, error);
        failedItems.push(item.name);
      }
    }

    return { cartItems, failedItems };
  }

  /**
   * Calculate quantity from shopping list item
   */
  calculateQuantity(item) {
    // Default to 1 if no amount specified
    if (!item.amount) return 1;

    // Convert amounts to reasonable quantities
    // For example: 500g of chicken = 1 package
    const amount = parseFloat(item.amount) || 1;
    const unit = item.unit?.toLowerCase() || '';

    // Weight-based items (approximate to packages)
    if (unit === 'g' || unit === 'kg') {
      const grams = unit === 'kg' ? amount * 1000 : amount;
      // Rough estimation: 1 package ≈ 500g
      return Math.max(1, Math.round(grams / 500));
    }

    // Volume-based items
    if (unit === 'ml' || unit === 'l') {
      const ml = unit === 'l' ? amount * 1000 : amount;
      // Rough estimation: 1 container ≈ 1000ml
      return Math.max(1, Math.round(ml / 1000));
    }

    // Already in item units
    return Math.max(1, Math.round(amount));
  }

  /**
   * Open Kroger cart in browser
   */
  openKrogerCart() {
    window.open('https://www.kroger.com/cart', '_blank');
  }
}

export const krogerCartService = new KrogerCartService();