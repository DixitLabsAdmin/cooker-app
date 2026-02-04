import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { krogerService } from '../../services/kroger';
import { shoppingAssistantService } from '../../services/shoppingAssistant';
import { usdaService } from '../../services/usda';

export default function ShoppingList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPurchased, setShowPurchased] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Claude Assistant State
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantProcessing, setAssistantProcessing] = useState(false);
  const [assistantResponse, setAssistantResponse] = useState(null);
  const [showAssistant, setShowAssistant] = useState(true);

  // Background enrichment state
  const enrichmentInProgress = useRef(false);
  const enrichmentCompleted = useRef(false); // Track if we've already enriched

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

  // Start background enrichment ONCE when items first load
  useEffect(() => {
    if (!loading && items.length > 0 && !enrichmentInProgress.current && !enrichmentCompleted.current) {
      startBackgroundEnrichment();
    }
  }, [loading]); // ✅ Only depend on loading, not items

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

  // Background enrichment - runs without blocking UI
  const startBackgroundEnrichment = async () => {
    const itemsNeedingEnrichment = items.filter(item =>
      (!item.calories || item.calories === 0) &&
      item.category !== 'Recipe Ingredient'
    );

    if (itemsNeedingEnrichment.length === 0) {
      console.log('✅ All items already enriched');
      enrichmentCompleted.current = true;
      return;
    }

    enrichmentInProgress.current = true;
    console.log(`🔄 Starting background enrichment for ${itemsNeedingEnrichment.length} items`);

    await usdaService.batchEnrichInBackground(
      itemsNeedingEnrichment,
      async (itemId, nutritionData) => {
        // Update item in database
        const { error } = await supabase
          .from('shopping_list_items')
          .update({
            calories: nutritionData.calories,
            protein: nutritionData.protein,
            carbs: nutritionData.carbs,
            fat: nutritionData.fat,
            serving_size: nutritionData.servingSize,
            serving_unit: nutritionData.servingUnit
          })
          .eq('id', itemId);

        if (!error) {
          // Update local state
          setItems(prevItems =>
            prevItems.map(item =>
              item.id === itemId
                ? { ...item, ...nutritionData }
                : item
            )
          );
        }
      }
    );

    enrichmentInProgress.current = false;
    enrichmentCompleted.current = true; // Mark as completed
    console.log('✅ Background enrichment complete');
  };

  // Claude Assistant: Process natural language command
  const processAssistantCommand = async () => {
    if (!assistantInput.trim()) return;

    setAssistantProcessing(true);
    setAssistantResponse(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Parse command with Claude
      const parsed = await shoppingAssistantService.processCommand(assistantInput);

      if (parsed.action === 'add') {
        const results = await shoppingAssistantService.addItemsToShoppingList(
          parsed.items,
          supabase,
          user.id
        );

        setAssistantResponse({
          type: 'success',
          message: `✅ Added ${results.added.length} items to your shopping list!`,
          details: results.added.map(r => r.name),
          enriched: results.enriched,
          failed: results.failed
        });

        // Reload items
        await loadItems();
      } else if (parsed.action === 'remove') {
        const results = await shoppingAssistantService.removeItemsFromShoppingList(
          parsed.items,
          supabase,
          user.id
        );

        setAssistantResponse({
          type: 'success',
          message: `✅ Removed ${results.removed.length} items from your shopping list`,
          details: results.removed.map(r => `${r.name} (${r.count} item${r.count > 1 ? 's' : ''})`),
          notFound: results.notFound
        });

        // Reload items
        await loadItems();
      } else {
        setAssistantResponse({
          type: 'error',
          message: `I couldn't understand that command. Try: "add chicken, milk, and eggs" or "remove milk"`
        });
      }

      setAssistantInput('');
    } catch (error) {
      console.error('Assistant error:', error);
      setAssistantResponse({
        type: 'error',
        message: `Error: ${error.message}`
      });
    } finally {
      setAssistantProcessing(false);
    }
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Quick USDA lookup (uses cache if available)
      const nutritionData = await usdaService.quickNutritionLookup(newItemName);

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

      // If no nutrition data, enrich in background
      if (!nutritionData || nutritionData.calories === 0) {
        usdaService.enrichItemInBackground(data.id, newItemName, async (itemId, enrichedData) => {
          const { error: updateError } = await supabase
            .from('shopping_list_items')
            .update(enrichedData)
            .eq('id', itemId);

          if (!updateError) {
            setItems(prevItems =>
              prevItems.map(item =>
                item.id === itemId ? { ...item, ...enrichedData } : item
              )
            );
          }
        });
      }
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

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

      const { error: updateError } = await supabase
        .from('shopping_list_items')
        .update({ is_purchased: !currentStatus })
        .eq('id', itemId);

      if (updateError) throw updateError;

      if (!currentStatus) {
        const item = items.find(i => i.id === itemId);
        
        if (item) {
          console.log('✅ Adding to inventory:', item.name);

          const { data: existingItems, error: checkError } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('name', item.name);

          if (checkError) throw checkError;

          if (existingItems && existingItems.length > 0) {
            const existingItem = existingItems[0];
            const { error: inventoryError } = await supabase
              .from('inventory_items')
              .update({
                amount: existingItem.amount + (item.amount || 1)
              })
              .eq('id', existingItem.id);

            if (inventoryError) throw inventoryError;
            console.log('✅ Updated inventory quantity');
          } else {
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

  const filteredItems = items.filter(item => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) {
      return false;
    }
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

  // Sort items within each category alphabetically by name
  Object.keys(groupedItems).forEach(category => {
    groupedItems[category].sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  });

  // Sort categories alphabetically
  const sortedCategories = Object.keys(groupedItems).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  // Get categories that have items (for filter buttons)
  const categoriesWithItems = ['All', ...sortedCategories];

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

      {/* Claude Assistant */}
      {showAssistant && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-lg p-6 border-2 border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xl">🤖</span>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">AI Shopping Assistant</h3>
                <p className="text-sm text-gray-600">Powered by Claude</p>
              </div>
            </div>
            <button
              onClick={() => setShowAssistant(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && processAssistantCommand()}
                placeholder='Try: "add chicken, pork, onions, milk, and cheese to shopping list"'
                className="flex-1 px-4 py-3 border-2 border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={assistantProcessing}
              />
              <button
                onClick={processAssistantCommand}
                disabled={assistantProcessing || !assistantInput.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assistantProcessing ? '⏳ Processing...' : '🚀 Go'}
              </button>
            </div>

            {/* Response */}
            {assistantResponse && (
              <div className={`p-4 rounded-lg ${
                assistantResponse.type === 'success' 
                  ? 'bg-green-50 border-2 border-green-200' 
                  : 'bg-red-50 border-2 border-red-200'
              }`}>
                <p className={`font-medium ${
                  assistantResponse.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {assistantResponse.message}
                </p>
                {assistantResponse.details && assistantResponse.details.length > 0 && (
                  <ul className="mt-2 text-sm text-gray-700 space-y-1">
                    {assistantResponse.details.map((detail, idx) => (
                      <li key={idx}>• {detail}</li>
                    ))}
                  </ul>
                )}
                {assistantResponse.enriched > 0 && (
                  <p className="mt-2 text-sm text-blue-600">
                    🔬 {assistantResponse.enriched} items enriched with nutrition data
                  </p>
                )}
                {assistantResponse.failed && assistantResponse.failed.length > 0 && (
                  <p className="mt-2 text-sm text-orange-600">
                    ⚠️ {assistantResponse.failed.length} items failed to add
                  </p>
                )}
              </div>
            )}

            {/* Examples */}
            <div className="text-xs text-gray-600">
              <p className="font-medium mb-1">Example commands:</p>
              <div className="space-y-1">
                <button
                  onClick={() => setAssistantInput("add 2 pounds of chicken breast, 5 apples, and 1 gallon of milk")}
                  className="block hover:text-purple-600 transition-colors"
                >
                  • "add 2 pounds of chicken breast, 5 apples, and 1 gallon of milk"
                </button>
                <button
                  onClick={() => setAssistantInput("add ground beef, pasta, and tomato sauce")}
                  className="block hover:text-purple-600 transition-colors"
                >
                  • "add ground beef, pasta, and tomato sauce"
                </button>
                <button
                  onClick={() => setAssistantInput("remove milk")}
                  className="block hover:text-purple-600 transition-colors"
                >
                  • "remove milk"
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!showAssistant && (
        <button
          onClick={() => setShowAssistant(true)}
          className="w-full px-4 py-3 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors font-medium"
        >
          🤖 Show AI Assistant
        </button>
      )}

      {/* Manual Add Item */}
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
          {categoriesWithItems.map(category => (
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
      {sortedCategories.length > 0 ? (
        <div className="space-y-4">
          {sortedCategories.map(category => {
            const categoryItems = groupedItems[category];
            return (
            <div key={category} className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="bg-green-600 px-4 py-2 flex items-center justify-between">
                <h3 className="font-semibold text-white">{category}</h3>
                <span className="bg-white text-green-600 px-2 py-1 rounded-full text-sm font-medium">
                  {categoryItems.length}
                </span>
              </div>

              <div className="divide-y">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      item.is_purchased ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
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

                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className={`font-medium ${
                              item.is_purchased ? 'line-through text-gray-500' : 'text-gray-900'
                            }`}>
                              {item.name}
                            </h4>
                            
                            <p className="text-sm text-gray-600">
                              {item.amount} {item.unit}
                            </p>

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

                            {item.price && (
                              <p className="text-sm font-semibold text-green-600 mt-1">
                                ${parseFloat(item.price).toFixed(2)}
                              </p>
                            )}
                          </div>

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
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {selectedCategory === 'All' ? 'Your shopping list is empty' : `No ${selectedCategory} items`}
          </h3>
          <p className="text-gray-600">
            {selectedCategory === 'All' 
              ? 'Use the AI assistant or add items manually to get started' 
              : 'Try selecting a different category'
            }
          </p>
        </div>
      )}
    </div>
  );
}