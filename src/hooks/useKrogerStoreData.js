// useKrogerStoreData.js - Direct store loading hook
// Loads Kroger store from user_preferences table

import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

export function useKrogerStoreData() {
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStore();
  }, []);

  const loadStore = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('❌ No user authenticated');
        setLoading(false);
        return;
      }

      console.log('🔍 Loading store from user_preferences...');

      // Load from user_preferences table
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.log('⚠️ Error loading preferences:', error.message);
        setStore(null);
        setLoading(false);
        return;
      }
      
      if (data) {
        console.log('📋 User preferences loaded:', Object.keys(data));
        
        // Check all possible column name variations for Kroger store
        const possibleLocationIds = [
          data.kroger_store_id,
          data.kroger_location_id,
          data.favorite_kroger_store,
          data.selected_store_id,
          data.store_id
        ];
        
        const locationId = possibleLocationIds.find(id => id);
        
        if (locationId) {
          const storeData = {
            locationId: locationId,
            name: data.kroger_store_name || data.store_name || 'Kroger Store',
            address: data.kroger_store_address || data.store_address,
            city: data.kroger_store_city || data.store_city,
            state: data.kroger_store_state || data.store_state,
            zip: data.kroger_store_zip || data.store_zip
          };
          console.log('✅ Found store in preferences:', storeData.name, storeData.locationId);
          setStore(storeData);
        } else {
          console.log('⚠️ No Kroger store ID found in user_preferences');
          console.log('💡 Available columns:', Object.keys(data).join(', '));
          setStore(null);
        }
      } else {
        console.log('⚠️ No user_preferences record found');
        setStore(null);
      }
    } catch (error) {
      console.error('❌ Error loading store:', error);
      setStore(null);
    } finally {
      setLoading(false);
    }
  };

  return { store, loading, reload: loadStore };
}