import { supabase } from './supabase';

export const inventoryService = {
  /**
   * Get all inventory items for current user
   */
  async getItems() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id)
        .order('is_favorite', { ascending: false }) // Favorites first
        .order('name', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching inventory:', error);
      throw error;
    }
  },

  /**
   * Get only favorite items
   */
  async getFavoriteItems() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_favorite', true)
        .order('name', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching favorite items:', error);
      throw error;
    }
  },

  /**
   * Toggle favorite status for an item
   */
  async toggleFavorite(itemId, currentStatus) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('inventory_items')
        .update({ is_favorite: !currentStatus })
        .eq('id', itemId)
        .eq('user_id', user.id);

      if (error) throw error;

      return !currentStatus;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  },

  /**
   * Add new item to inventory
   */
  async addItem(item) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('inventory_items')
        .insert([
          {
            user_id: user.id,
            name: item.name,
            amount: item.amount || 0,
            unit: item.unit || 'g',
            category: item.category || 'Other',
            calories: item.calories || 0,
            protein: item.protein || 0,
            carbs: item.carbs || 0,
            fat: item.fat || 0,
            fiber: item.fiber || 0,
            sugar: item.sugar || 0,
            sodium: item.sodium || 0,
            brand_name: item.brandName || null,
            is_favorite: item.is_favorite || false,
          },
        ])
        .select()
        .maybeSingle();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error adding item:', error);
      throw error;
    }
  },

  /**
   * Update existing item
   */
  async updateItem(itemId, updates) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('inventory_items')
        .update(updates)
        .eq('id', itemId)
        .eq('user_id', user.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error updating item:', error);
      throw error;
    }
  },

  /**
   * Delete item from inventory
   */
  async deleteItem(itemId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', user.id);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error deleting item:', error);
      throw error;
    }
  },

  /**
   * Update nutrition for an item
   */
  async updateNutrition(itemId, nutrition) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('inventory_items')
        .update({
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
          fiber: nutrition.fiber,
          sugar: nutrition.sugar,
          sodium: nutrition.sodium,
        })
        .eq('id', itemId)
        .eq('user_id', user.id);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error updating nutrition:', error);
      throw error;
    }
  },
};