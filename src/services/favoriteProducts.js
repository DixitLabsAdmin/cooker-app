import { supabase } from './supabase';

export const favoriteProductsService = {
  /**
   * Get all favorite products for current user
   */
  async getFavorites(sortBy = 'recent') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      let query = supabase
        .from('favorite_products')
        .select('*')
        .eq('user_id', user.id);

      // Sort options
      if (sortBy === 'recent') {
        query = query.order('last_used_at', { ascending: false });
      } else if (sortBy === 'name') {
        query = query.order('name', { ascending: true });
      } else if (sortBy === 'price') {
        query = query.order('price', { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching favorites:', error);
      throw error;
    }
  },

  /**
   * Check if a product is favorited
   */
  async isFavorite(krogerProductId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return false;
      }

      const { data, error } = await supabase
        .from('favorite_products')
        .select('id')
        .eq('user_id', user.id)
        .eq('kroger_product_id', krogerProductId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking favorite:', error);
      return false;
    }
  },

  /**
   * Add product to favorites
   */
  async addFavorite(product) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const favoriteData = {
        user_id: user.id,
        kroger_product_id: product.krogerProductId,
        upc: product.upc,
        name: product.name,
        brand_name: product.brandName,
        category: product.category,
        price: product.price,
        price_unit: product.priceUnit,
        serving_size: product.servingSize,
        serving_unit: product.servingUnit,
        calories: product.calories || 0,
        protein: product.protein || 0,
        carbs: product.carbs || 0,
        fat: product.fat || 0,
        fiber: product.fiber || 0,
        sugar: product.sugar || 0,
        sodium: product.sodium || 0,
        image_url: product.images?.[0] || null,
        nutrition_source: product.nutritionSource,
        last_used_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('favorite_products')
        .insert([favoriteData])
        .select()
        .maybeSingle();

      if (error) {
        // Check for duplicate
        if (error.code === '23505') {
          throw new Error('Product already in favorites');
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error adding favorite:', error);
      throw error;
    }
  },

  /**
   * Remove product from favorites
   */
  async removeFavorite(krogerProductId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('favorite_products')
        .delete()
        .eq('user_id', user.id)
        .eq('kroger_product_id', krogerProductId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error removing favorite:', error);
      throw error;
    }
  },

  /**
   * Update last_used_at when product is added to shopping list
   */
  async markAsUsed(krogerProductId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return;
      }

      const { error } = await supabase
        .from('favorite_products')
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('kroger_product_id', krogerProductId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking favorite as used:', error);
      // Don't throw - this is non-critical
    }
  },

  /**
   * Get favorite count
   */
  async getFavoriteCount() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return 0;
      }

      const { count, error } = await supabase
        .from('favorite_products')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error('Error getting favorite count:', error);
      return 0;
    }
  },

  /**
   * Search favorites by name
   */
  async searchFavorites(query) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('favorite_products')
        .select('*')
        .eq('user_id', user.id)
        .ilike('name', `%${query}%`)
        .order('last_used_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error searching favorites:', error);
      throw error;
    }
  },
};