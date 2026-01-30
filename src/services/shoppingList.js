import { supabase } from './supabase';

export const shoppingListService = {
  // Get all shopping list items for current user
  async getShoppingList() {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Add item to shopping list
  async addItem(itemData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({
        user_id: user.id,
        ...itemData,
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Update item
  async updateItem(id, updates) {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Mark item as purchased (and add to inventory)
  async markPurchased(id) {
    // Get the item
    const { data: item, error: itemError } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (itemError) throw itemError;

    // Mark as purchased
    const { data: updatedItem, error: updateError } = await supabase
      .from('shopping_list_items')
      .update({
        is_purchased: true,
        purchased_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;

    // Add to inventory
    const { data: { user } } = await supabase.auth.getUser();
    const { error: inventoryError } = await supabase
      .from('inventory_items')
      .insert({
        user_id: user.id,
        name: item.name,
        category: item.category,
        amount: item.amount,
        unit: item.unit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        usda_food_id: item.usda_food_id,
        serving_size: item.serving_size,
        serving_unit: item.serving_unit,
      });

    if (inventoryError) throw inventoryError;

    return updatedItem;
  },

  // Delete item
  async deleteItem(id) {
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  // Clear purchased items
  async clearPurchased() {
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('is_purchased', true);

    if (error) throw error;
    return true;
  },
  // ============ ADD THESE METHODS TO shoppingList.js ============

  // Archive a purchased item
  async archiveItem(id) {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Get archived items
  async getArchivedItems() {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('is_archived', true)
      .order('archived_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get archived items grouped by date
  async getArchivedGroupedByDate() {
    const items = await this.getArchivedItems();
    
    const grouped = {};
    items.forEach(item => {
      const date = item.archived_at ? item.archived_at.split('T')[0] : 'Unknown';
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(item);
    });

    return grouped;
  },

  // Clear archived items
  async clearArchived() {
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('is_archived', true);

    if (error) throw error;
    return true;
  },

  // Modified mark purchased - now archives instead of deleting
  async markPurchasedAndArchive(id) {
    // First mark as purchased and add to inventory
    const item = await this.markPurchased(id);
    
    // Then archive it
    await this.archiveItem(id);
    
    return item;
  },
};