import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { krogerService } from '../../services/kroger';

export default function ShoppingList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPurchased, setShowPurchased] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const categories = [
    'All',
    'Produce',
    'Meat & Seafood',
    'Dairy',
    'Bakery',
    'Pantry',
    'Frozen',
    'Beverages',
    'Snacks',
    'Other'
  ];

  useEffect(() => {
    loadItems();
  }, []);

  // Auto-enrich recipe ingredients when items are loaded
  useEffect(() => {
    const hasRecipeIngredients = items.some(item => 
      item.category === 'Recipe Ingredient' && 
      (!item.calories || item.calories === 0)
    );
    
    if (hasRecipeIngredients && !loading) {
      console.log('🔍 Detected recipe ingredients without nutrition, enriching...');
      // Run enrichment after a short delay
      const timer = setTimeout(() => {
        enrichRecipeIngredients();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [items, loading]);

  // Enrich recipe ingredients with Kroger and USDA data
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading shopping list:', error);
    } finally {
      setLoading(false);
    }
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Search Kroger for nutrition data
      let nutritionData = null;
      try {
        const krogerResults = await krogerService.searchProducts(newItemName, null, 1);
        if (krogerResults && krogerResults.length > 0) {
          const product = krogerResults[0];
          nutritionData = {
            calories: product.calories || 0,
            protein: product.protein || 0,
            carbs: product.carbs || 0,
            fat: product.fat || 0,
            servingSize: product.servingSize || 100,
            servingUnit: product.servingUnit || 'g'
          };
        }
      } catch (err) {
        console.log('Could not fetch nutrition data:', err);
      }

      const { data, error } = await supabase
        .from('shopping_list_items')
        .insert({
          user_id: user.id,
          name: newItemName,
          amount: 1,
          unit: 'item',
          category: 'Other',
          is_purchased: false,
          calories: nutritionData?.calories || 0,
          protein: nutritionData?.protein || 0,
          carbs: nutritionData?.carbs || 0,
          fat: nutritionData?.fat || 0,
          serving_size: nutritionData?.servingSize || 100,
          serving_unit: nutritionData?.servingUnit || 'g'
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      setItems([data, ...items]);
      setNewItemName('');
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  // Search Kroger for products
  const searchKroger = async () => {
    if (!newItemName.trim()) return;
    
    setSearching(true);
    try {
      console.log('🔍 Searching Kroger for:', newItemName);
      const results = await krogerService.searchProducts(newItemName, null, 10);
      console.log('✅ Found', results.length, 'products');
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Error searching Kroger:', error);
      alert('Failed to search. Make sure Kroger proxy server is running on port 3001.');
    } finally {
      setSearching(false);
    }
  };

  // Add item from Kroger search results
  const addItemFromSearch = async (product) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('shopping_list_items')
        .insert({
          user_id: user.id,
          name: product.name,
          amount: 1,
          unit: 'item',
          category: product.category || 'Other',
          is_purchased: false,
          brand_name: product.brandName,
          calories: product.calories || 0,
          protein: product.protein || 0,
          carbs: product.carbs || 0,
          fat: product.fat || 0,
          serving_size: product.servingSize || 100,
          serving_unit: product.servingUnit || 'g',
          price: product.price
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      setItems([data, ...items]);
      setNewItemName('');
      setSearchResults([]);
      setShowSearchResults(false);
      console.log('✅ Added:', product.name);
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const togglePurchased = async (itemId, currentStatus) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Update shopping list item
      const { error: updateError } = await supabase
        .from('shopping_list_items')
        .update({ is_purchased: !currentStatus })
        .eq('id', itemId);

      if (updateError) throw updateError;

      // If marking as purchased, add to inventory
      if (!currentStatus) {
        const item = items.find(i => i.id === itemId);
        
        if (item) {
          console.log('✅ Adding to inventory:', item.name);

          // Check if item already exists in inventory
          const { data: existingItems, error: checkError } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('name', item.name);

          if (checkError) throw checkError;

          if (existingItems && existingItems.length > 0) {
            // Update existing item - increase quantity
            const existingItem = existingItems[0];
            const { error: inventoryError } = await supabase
              .from('inventory_items')
              .update({
                amount: existingItem.amount + (item.amount || 1),
                updated_at: new Date().toISOString()
              })
              .eq('id', existingItem.id);

            if (inventoryError) throw inventoryError;
            console.log('✅ Updated inventory quantity');
          } else {
            // Add new item to inventory
            const { error: inventoryError } = await supabase
              .from('inventory_items')
              .insert({
                user_id: user.id,
                name: item.name,
                amount: item.amount || 1,
                unit: item.unit || 'item',
                category: item.category || 'Other',
                brand_name: item.brand_name,
                calories: item.calories || 0,
                protein: item.protein || 0,
                carbs: item.carbs || 0,
                fat: item.fat || 0,
                serving_size: item.serving_size || 100,
                serving_unit: item.serving_unit || 'g',
                price: item.price
              });

            if (inventoryError) throw inventoryError;
            console.log('✅ Added to inventory');
          }
        }
      }

      // Update local state
      setItems(items.map(item => 
        item.id === itemId ? { ...item, is_purchased: !currentStatus } : item
      ));
    } catch (error) {
      console.error('Error toggling purchased status:', error);
      alert('Failed to update item. Please try again.');
    }
  };

  const deleteItem = async (itemId) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setItems(items.filter(item => item.id !== itemId));
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const clearPurchased = async () => {
    if (!window.confirm('Clear all purchased items?')) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('user_id', user.id)
        .eq('is_purchased', true);

      if (error) throw error;

      setItems(items.filter(item => !item.is_purchased));
    } catch (error) {
      console.error('Error clearing purchased items:', error);
    }
  };

  // Smart category detection based on ingredient name
  const categorizeIngredient = (name) => {
    const nameLower = name.toLowerCase();
    
    // Produce
    if (/tomato|lettuce|onion|garlic|pepper|carrot|celery|potato|spinach|kale|broccoli|cauliflower|cucumber|zucchini|squash|apple|banana|orange|lemon|lime|berry|fruit|vegetable|avocado|mushroom|ginger|herbs?|parsley|cilantro|basil/.test(nameLower)) {
      return 'Produce';
    }
    
    // Meat & Seafood
    if (/chicken|beef|pork|turkey|lamb|fish|salmon|tuna|shrimp|meat|steak|ground|breast|thigh|wing|bacon|sausage|ham/.test(nameLower)) {
      return 'Meat & Seafood';
    }
    
    // Dairy
    if (/milk|cheese|butter|cream|yogurt|dairy|egg|parmesan|cheddar|mozzarella/.test(nameLower)) {
      return 'Dairy';
    }
    
    // Bakery
    if (/bread|bun|roll|bagel|croissant|muffin|flour|yeast|tortilla/.test(nameLower)) {
      return 'Bakery';
    }
    
    // Pantry
    if (/oil|vinegar|salt|pepper|spice|sugar|rice|pasta|noodle|sauce|can|jar|stock|broth|soy sauce|honey|mustard|mayo|ketchup|olive oil|vegetable oil/.test(nameLower)) {
      return 'Pantry';
    }
    
    // Frozen
    if (/frozen|ice/.test(nameLower)) {
      return 'Frozen';
    }
    
    // Beverages
    if (/juice|soda|water|coffee|tea|drink|beverage|wine|beer/.test(nameLower)) {
      return 'Beverages';
    }
    
    // Snacks
    if (/chip|cracker|cookie|candy|snack|popcorn|nuts?/.test(nameLower)) {
      return 'Snacks';
    }
    
    return 'Other';
  };

  // Enrich recipe ingredients with Kroger and USDA data
  const enrichRecipeIngredients = async () => {
    try {
      console.log('🔍 Enriching recipe ingredients...');
      
      const { data: { user } } = await supabase.auth.getUser();
      
      // Find items in "Recipe Ingredient" category without nutrition data
      const recipeItems = items.filter(item => 
        item.category === 'Recipe Ingredient' && 
        (!item.calories || item.calories === 0)
      );

      if (recipeItems.length === 0) {
        console.log('✅ No recipe ingredients need enrichment');
        return;
      }

      console.log(`📋 Found ${recipeItems.length} recipe ingredients to enrich`);

      for (const item of recipeItems) {
        try {
          console.log(`🔍 Enriching: ${item.name}`);
          
          let productData = null;
          let category = 'Other';
          
          // Try Kroger first
          try {
            const krogerResults = await krogerService.searchProducts(item.name, null, 1);
            if (krogerResults && krogerResults.length > 0) {
              const product = krogerResults[0];
              
              // Get category from Kroger
              if (product.category) {
                category = product.category;
              }
              
              // Get nutrition from Kroger
              if (product.calories > 0) {
                productData = {
                  calories: product.calories,
                  protein: product.protein || 0,
                  carbs: product.carbs || 0,
                  fat: product.fat || 0,
                  servingSize: product.servingSize || 100,
                  servingUnit: product.servingUnit || 'g',
                  price: product.price || null
                };
                console.log(`✅ Got nutrition from Kroger: ${product.calories} cal`);
              }
            }
          } catch (err) {
            console.log(`⚠️ Kroger search failed: ${err.message}`);
          }

          // If no nutrition from Kroger, try USDA
          if (!productData || productData.calories === 0) {
            try {
              const { usdaService } = await import('../../services/usda');
              const usdaResults = await usdaService.searchFoods(item.name, 1);
              
              if (usdaResults && usdaResults.length > 0) {
                const usdaFood = usdaResults[0];
                productData = {
                  calories: usdaFood.calories || 0,
                  protein: usdaFood.protein || 0,
                  carbs: usdaFood.carbs || 0,
                  fat: usdaFood.fat || 0,
                  servingSize: usdaFood.servingSize || 100,
                  servingUnit: usdaFood.servingUnit || 'g',
                  price: productData?.price || null
                };
                console.log(`✅ Got nutrition from USDA: ${usdaFood.calories} cal`);
              }
            } catch (err) {
              console.log(`⚠️ USDA lookup failed: ${err.message}`);
            }
          }

          // Smart categorization if we don't have a good category
          if (category === 'Other' || category === 'Recipe Ingredient') {
            category = categorizeIngredient(item.name);
            console.log(`🏷️ Categorized as: ${category}`);
          }

          // Update the item
          if (productData && productData.calories > 0) {
            const { error } = await supabase
              .from('shopping_list_items')
              .update({
                category: category,
                calories: productData.calories,
                protein: productData.protein,
                carbs: productData.carbs,
                fat: productData.fat,
                serving_size: productData.servingSize,
                serving_unit: productData.servingUnit,
                price: productData.price
              })
              .eq('id', item.id);

            if (error) {
              console.error(`❌ Database error for ${item.name}:`, error);
              throw error;
            }
            console.log(`✅ Updated ${item.name}: ${category} | ${productData.calories} cal`);
          } else {
            // Just update category even if no nutrition
            const { error } = await supabase
              .from('shopping_list_items')
              .update({ category: category })
              .eq('id', item.id);

            if (error) {
              console.error(`❌ Database error updating category for ${item.name}:`, error);
              throw error;
            }
            console.log(`✅ Updated ${item.name} category to: ${category}`);
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
          console.error(`❌ Error enriching ${item.name}:`, err);
        }
      }

      // Reload items to show updates
      await loadItems();
      console.log('🎉 All recipe ingredients enriched!');
    } catch (error) {
      console.error('Error enriching recipe ingredients:', error);
    }
  };

  const filteredItems = items.filter(item => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) {
      return false;
    }
    // If showPurchased is true, ONLY show purchased items
    // If showPurchased is false, ONLY show unpurchased items
    if (showPurchased && !item.is_purchased) {
      return false;
    }
    if (!showPurchased && item.is_purchased) {
      return false;
    }
    return true;
  });

  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  const purchasedCount = items.filter(i => i.is_purchased).length;
  const totalCount = items.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Shopping List</h2>
          <p className="text-gray-600">
            {totalCount - purchasedCount} items to buy
            {purchasedCount > 0 && `, ${purchasedCount} purchased`}
          </p>
        </div>
        {purchasedCount > 0 && (
          <button
            onClick={clearPurchased}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            🗑️ Clear Purchased
          </button>
        )}
      </div>

      {/* Add Item */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchKroger()}
            placeholder="Search for items to add..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={searchKroger}
            disabled={searching || !newItemName.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {searching ? '⏳ Searching...' : '🔍 Search Kroger'}
          </button>
          <button
            onClick={addItem}
            disabled={!newItemName.trim()}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
          >
            ➕ Add Manual
          </button>
        </div>

        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">
                Search Results ({searchResults.length})
              </h4>
              <button
                onClick={() => setShowSearchResults(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕ Close
              </button>
            </div>
            <div className="space-y-2">
              {searchResults.map((product, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-white p-3 rounded-lg hover:bg-green-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{product.name}</div>
                    {product.brandName && (
                      <div className="text-sm text-gray-600">{product.brandName}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {product.calories > 0 && `${product.calories} cal`}
                      {product.protein > 0 && ` | ${product.protein}g protein`}
                      {product.carbs > 0 && ` | ${product.carbs}g carbs`}
                      {product.fat > 0 && ` | ${product.fat}g fat`}
                    </div>
                    {product.price && (
                      <div className="text-sm font-semibold text-green-600 mt-1">
                        ${product.price.toFixed(2)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => addItemFromSearch(product)}
                    className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    ➕ Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSearchResults && searchResults.length === 0 && !searching && (
          <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-600">
            No items found. Try a different search term or add manually.
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
          <button
            onClick={() => setShowPurchased(!showPurchased)}
            className={`ml-auto px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              showPurchased
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {showPurchased ? '✅ Showing Purchased' : '👁️ Show Purchased'}
          </button>
        </div>
      </div>

      {/* Shopping List Items */}
      {Object.keys(groupedItems).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category} className="bg-white rounded-xl shadow-lg overflow-hidden">
              {/* Category Header - FIXED TEXT COLOR */}
              <div className="bg-green-600 px-4 py-2 flex items-center justify-between">
                <h3 className="font-semibold text-white">{category}</h3>
                <span className="bg-white text-green-600 px-2 py-1 rounded-full text-sm font-medium">
                  {categoryItems.length}
                </span>
              </div>

              {/* Items */}
              <div className="divide-y">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      item.is_purchased ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => togglePurchased(item.id, item.is_purchased)}
                        className={`mt-1 flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                          item.is_purchased
                            ? 'bg-green-600 border-green-600'
                            : 'border-gray-300 hover:border-green-600'
                        }`}
                      >
                        {item.is_purchased && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      {/* Item Details */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className={`font-medium ${
                              item.is_purchased ? 'line-through text-gray-500' : 'text-gray-900'
                            }`}>
                              {item.name}
                            </h4>
                            
                            {/* Amount */}
                            <p className="text-sm text-gray-600">
                              {item.amount} {item.unit}
                            </p>

                            {/* Nutrition Info - ADDED PROTEIN, CARBS, FAT */}
                            {(item.calories > 0 || item.protein > 0 || item.carbs > 0 || item.fat > 0) && (
                              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                {item.serving_size && (
                                  <span className="text-gray-600">
                                    Serving: {item.serving_size}{item.serving_unit}
                                  </span>
                                )}
                                {item.calories > 0 && (
                                  <span className="text-gray-600">
                                    {item.calories} cal
                                  </span>
                                )}
                                {item.protein > 0 && (
                                  <span className="text-blue-600 font-medium">
                                    {item.protein}g protein
                                  </span>
                                )}
                                {item.carbs > 0 && (
                                  <span className="text-yellow-600 font-medium">
                                    {item.carbs}g carbs
                                  </span>
                                )}
                                {item.fat > 0 && (
                                  <span className="text-red-600 font-medium">
                                    {item.fat}g fat
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Price */}
                            {item.price && (
                              <p className="text-sm font-semibold text-green-600 mt-1">
                                ${parseFloat(item.price).toFixed(2)}
                              </p>
                            )}
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="text-red-600 hover:text-red-700 transition-colors p-1"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {selectedCategory === 'All' ? 'Your shopping list is empty' : `No ${selectedCategory} items`}
          </h3>
          <p className="text-gray-600">
            {selectedCategory === 'All' 
              ? 'Add items to get started' 
              : 'Try selecting a different category'
            }
          </p>
        </div>
      )}
    </div>
  );
}