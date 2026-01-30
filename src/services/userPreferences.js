import { supabase } from './supabase';

export const userPreferencesService = {
  /**
   * Get user preferences
   */
  async getPreferences() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error;
      }

      return data || {};
    } catch (error) {
      console.error('Error fetching preferences:', error);
      throw error;
    }
  },

  /**
   * Set a single preference
   */
  async setPreference(key, value) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      // First check if preferences exist
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing preferences
        const { error } = await supabase
          .from('user_preferences')
          .update({ [key]: value })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Create new preferences row
        const { error } = await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            [key]: value,
          });

        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('Error setting preference:', error);
      throw error;
    }
  },

  /**
   * Update multiple preferences at once
   */
  async updatePreferences(preferences) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      // First check if preferences exist
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing preferences
        const { error } = await supabase
          .from('user_preferences')
          .update(preferences)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Create new preferences row
        const { error } = await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            ...preferences,
          });

        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  },

  /**
   * Get household size (for backward compatibility)
   */
  async getHouseholdSize() {
    try {
      const prefs = await this.getPreferences();
      return prefs.household_size || 1;
    } catch (error) {
      console.error('Error getting household size:', error);
      return 1;
    }
  },

  /**
   * Set household size (for backward compatibility)
   */
  async setHouseholdSize(size) {
    return this.setPreference('household_size', size);
  },

  /**
   * Get Kroger store preferences
   */
  async getKrogerStore() {
    try {
      const prefs = await this.getPreferences();
      return {
        locationId: prefs.kroger_location_id,
        name: prefs.kroger_location_name,
        address: prefs.kroger_location_address,
      };
    } catch (error) {
      console.error('Error getting Kroger store:', error);
      return null;
    }
  },

  /**
   * Set Kroger store preferences
   */
  async setKrogerStore(locationId, name, address) {
    return this.updatePreferences({
      kroger_location_id: locationId,
      kroger_location_name: name,
      kroger_location_address: address,
    });
  },
};