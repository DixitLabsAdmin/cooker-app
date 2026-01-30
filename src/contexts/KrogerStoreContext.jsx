import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { authService } from '../services/auth';

const KrogerStoreContext = createContext();

export const useKrogerStore = () => {
  const context = useContext(KrogerStoreContext);
  if (!context) {
    throw new Error('useKrogerStore must be used within KrogerStoreProvider');
  }
  return context;
};

export const KrogerStoreProvider = ({ children }) => {
  const [selectedStore, setSelectedStore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFavoriteStore();
  }, []);

  const loadFavoriteStore = async () => {
    try {
      console.log('🔍 Loading store from user_preferences...');
      const user = await authService.getCurrentUser();
      
      if (!user) {
        console.log('⚠️ No user found');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(); // ✅ CHANGED FROM .maybeSingle()

      if (error) {
        console.error('⚠️ Error loading preferences:', error);
        setLoading(false);
        return;
      }

      if (!data) {
        console.log('⚠️ No favorite store found in database');
        setLoading(false);
        return;
      }

      if (data.favorite_store_location) {
        try {
          const storeData = typeof data.favorite_store_location === 'string'
            ? JSON.parse(data.favorite_store_location)
            : data.favorite_store_location;
          
          setSelectedStore(storeData);
          console.log('✅ Loaded Kroger store:', storeData.name);
        } catch (parseError) {
          console.error('Error parsing store data:', parseError);
        }
      }
    } catch (error) {
      console.error('Error loading favorite store:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveStore = async (store) => {
    try {
      const user = await authService.getCurrentUser();
      
      if (!user) {
        console.error('No user found');
        return;
      }

      const { data: existing, error: fetchError } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(); // ✅ CHANGED FROM .maybeSingle()

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      const storeData = JSON.stringify(store);

      if (existing) {
        const { error: updateError } = await supabase
          .from('user_preferences')
          .update({ favorite_store_location: storeData })
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            favorite_store_location: storeData,
          });

        if (insertError) throw insertError;
      }

      setSelectedStore(store);
      console.log('✅ Saved Kroger store:', store.name);
    } catch (error) {
      console.error('Error saving store:', error);
      throw error;
    }
  };

  const value = {
    selectedStore,
    setSelectedStore: saveStore, // ✅ This is the function
    loading,
  };

  return (
    <KrogerStoreContext.Provider value={value}>
      {children}
    </KrogerStoreContext.Provider>
  );
};