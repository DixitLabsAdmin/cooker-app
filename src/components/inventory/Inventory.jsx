import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { usdaService } from '../../services/usda';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedItems, setExpandedItems] = useState({});
  
  // Background enrichment state
  const enrichmentInProgress = useRef(false);

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

  // Start background enrichment when items load
  useEffect(() => {
    if (!loading && items.length > 0 && !enrichmentInProgress.current) {
      startBackgroundEnrichment();
    }
  }, [items, loading]);

  const loadItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const processedItems = processDuplicates(data || []);
      setItems(processedItems);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  // Background enrichment for items without nutrition data
  const startBackgroundEnrichment = async () => {
    // Find all database items that need enrichment
    const { data: { user } } = await supabase.auth.getUser();
    const { data: rawItems } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id);

    if (!rawItems) return;

    const itemsNeedingEnrichment = rawItems.filter(item =>
      !item.calories || item.calories === 0
    );

    if (itemsNeedingEnrichment.length === 0) {
      console.log('✅ All inventory items already enriched');
      return;
    }

    enrichmentInProgress.current = true;
    console.log(`🔄 Starting background enrichment for ${itemsNeedingEnrichment.length} inventory items`);

    await usdaService.batchEnrichInBackground(
      itemsNeedingEnrichment,
      async (itemId, nutritionData) => {
        // Update item in database
        const { error } = await supabase
          .from('inventory_items')
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
          // Reload to show updates
          await loadItems();
        }
      }
    );

    enrichmentInProgress.current = false;
    console.log('✅ Background enrichment complete');
  };

  const processDuplicates = (rawItems) => {
    const itemMap = {};

    rawItems.forEach(item => {
      const key = item.name.toLowerCase().trim();
      
      if (!itemMap[key]) {
        itemMap[key] = {
          id: item.id,
          name: item.name,
          category: item.category || 'Other',
          unit: item.unit || 'item',
          brand_name: item.brand_name,
          calories: item.calories || 0,
          protein: item.protein || 0,
          carbs: item.carbs || 0,
          fat: item.fat || 0,
          serving_size: item.serving_size || 100,
          serving_unit: item.serving_unit || 'g',
          price: item.price,
          totalAmount: item.amount || 0,
          oldestDate: item.created_at,
          newestDate: item.created_at,
          purchaseHistory: [{
            id: item.id,
            amount: item.amount || 0,
            date: item.created_at,
            price: item.price
          }]
        };
      } else {
        const existing = itemMap[key];
        existing.totalAmount += (item.amount || 0);
        
        if (new Date(item.created_at) < new Date(existing.oldestDate)) {
          existing.oldestDate = item.created_at;
        }
        if (new Date(item.created_at) > new Date(existing.newestDate)) {
          existing.newestDate = item.created_at;
        }
        
        existing.purchaseHistory.push({
          id: item.id,
          amount: item.amount || 0,
          date: item.created_at,
          price: item.price
        });
        
        existing.purchaseHistory.sort((a, b) => 
          new Date(b.date) - new Date(a.date)
        );
      }
    });

    return Object.values(itemMap);
  };

  const isOld = (date) => {
    const daysSinceAdded = (Date.now() - new Date(date)) / (1000 * 60 * 60 * 24);
    return daysSinceAdded >= 7;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const deleteItem = async (itemId) => {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      
      await loadItems();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const updateAmount = async (item, amountChange) => {
    try {
      const primaryPurchase = item.purchaseHistory[0];
      const newAmount = primaryPurchase.amount + amountChange;
      
      if (newAmount <= 0) {
        await deleteItem(primaryPurchase.id);
        return;
      }

      const { error } = await supabase
        .from('inventory_items')
        .update({ amount: newAmount })
        .eq('id', primaryPurchase.id);

      if (error) throw error;
      await loadItems();
    } catch (error) {
      console.error('Error updating amount:', error);
    }
  };

  const toggleExpanded = (itemName) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemName]: !prev[itemName]
    }));
  };

  const filteredItems = items.filter(item => 
    selectedCategory === 'All' || item.category === selectedCategory
  );

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
          <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
          <p className="text-gray-600">
            {filteredItems.length} items in stock
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium text-gray-700">Category:</span>
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
        </div>
      </div>

      {/* Inventory Items Grouped by Category */}
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
                {categoryItems.map((item) => {
                  const isExpanded = expandedItems[item.name];
                  const showWarning = isOld(item.oldestDate);
                  const hasMultiplePurchases = item.purchaseHistory.length > 1;
                  const hasNutrition = item.calories > 0 || item.protein > 0 || item.carbs > 0 || item.fat > 0;

                  return (
                    <div 
                      key={item.id} 
                      className={`p-4 ${hasMultiplePurchases ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
                      onClick={() => {
                        if (hasMultiplePurchases) {
                          toggleExpanded(item.name);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900">
                              {item.name}
                            </h4>
                            {showWarning && (
                              <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                                ⚠️ {Math.floor((Date.now() - new Date(item.oldestDate)) / (1000 * 60 * 60 * 24))} days old
                              </span>
                            )}
                            {!hasNutrition && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                                🔬 Searching nutrition...
                              </span>
                            )}
                          </div>

                          {item.brand_name && (
                            <p className="text-sm text-gray-600">{item.brand_name}</p>
                          )}

                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-lg font-semibold text-green-600">
                              {item.totalAmount} {item.unit}
                            </span>
                            {hasMultiplePurchases && (
                              <span className="text-sm text-blue-600 font-medium cursor-pointer">
                                {isExpanded ? '▼' : '▶'} {item.purchaseHistory.length} purchases
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-gray-500 mt-1">
                            First added: {formatDate(item.oldestDate)}
                          </p>

                          {hasNutrition && (
                            <div className="flex flex-wrap gap-2 text-xs mt-2">
                              {item.serving_size && (
                                <span className="text-gray-600">
                                  Per {item.serving_size}{item.serving_unit}:
                                </span>
                              )}
                              {item.calories > 0 && (
                                <span className="text-gray-600">{item.calories} cal</span>
                              )}
                              {item.protein > 0 && (
                                <span className="text-blue-600 font-medium">{item.protein}g protein</span>
                              )}
                              {item.carbs > 0 && (
                                <span className="text-yellow-600 font-medium">{item.carbs}g carbs</span>
                              )}
                              {item.fat > 0 && (
                                <span className="text-red-600 font-medium">{item.fat}g fat</span>
                              )}
                            </div>
                          )}

                          {isExpanded && hasMultiplePurchases && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-2">
                              <h5 className="text-sm font-semibold text-gray-900">Purchase History:</h5>
                              {item.purchaseHistory.map((purchase) => (
                                <div key={purchase.id} className="flex items-center justify-between text-sm">
                                  <div>
                                    <span className="font-medium text-gray-900">
                                      {purchase.amount} {item.unit}
                                    </span>
                                    <span className="text-gray-600 ml-2">
                                      • {formatDate(purchase.date)}
                                    </span>
                                    {purchase.price && (
                                      <span className="text-green-600 ml-2">
                                        • ${purchase.price.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteItem(purchase.id);
                                    }}
                                    className="text-red-600 hover:text-red-700 text-xs"
                                  >
                                    🗑️ Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div 
                          className="flex flex-col gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAmount(item, -1);
                              }}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium transition-colors"
                            >
                              −
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAmount(item, +1);
                              }}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium transition-colors"
                            >
                              +
                            </button>
                          </div>

                          {!isExpanded && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete all ${item.name}?`)) {
                                  item.purchaseHistory.forEach(p => deleteItem(p.id));
                                }
                              }}
                              className="text-red-600 hover:text-red-700 text-sm"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {selectedCategory === 'All' ? 'Your inventory is empty' : `No ${selectedCategory} items`}
          </h3>
          <p className="text-gray-600">
            {selectedCategory === 'All'
              ? 'Add items from your shopping list to get started'
              : 'Try selecting a different category'
            }
          </p>
        </div>
      )}

      {/* Enrichment Info Banner - At Bottom */}
      {enrichmentInProgress.current && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <div>
              <p className="font-medium text-blue-900">
                🔬 Background Enrichment In Progress
              </p>
              <p className="text-sm text-blue-700">
                We're automatically looking up nutrition data for your items. This happens in the background and won't slow down the app.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}