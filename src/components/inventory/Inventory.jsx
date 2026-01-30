import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedItems, setExpandedItems] = useState({}); // Track which items are expanded to show history

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

  const loadItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Group and combine duplicate items
      const processedItems = processDuplicates(data || []);
      setItems(processedItems);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  // Process duplicates: combine same items but track purchase history
  const processDuplicates = (rawItems) => {
    const itemMap = {};

    rawItems.forEach(item => {
      const key = item.name.toLowerCase().trim();
      
      if (!itemMap[key]) {
        // First occurrence - create new entry
        itemMap[key] = {
          id: item.id, // Use first ID as primary
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
        // Duplicate found - combine amounts and track history
        const existing = itemMap[key];
        existing.totalAmount += (item.amount || 0);
        
        // Track oldest and newest dates
        if (new Date(item.created_at) < new Date(existing.oldestDate)) {
          existing.oldestDate = item.created_at;
        }
        if (new Date(item.created_at) > new Date(existing.newestDate)) {
          existing.newestDate = item.created_at;
        }
        
        // Add to purchase history
        existing.purchaseHistory.push({
          id: item.id,
          amount: item.amount || 0,
          date: item.created_at,
          price: item.price
        });
        
        // Sort purchase history by date (newest first)
        existing.purchaseHistory.sort((a, b) => 
          new Date(b.date) - new Date(a.date)
        );
      }
    });

    return Object.values(itemMap);
  };

  // Check if item is 7+ days old
  const isOld = (date) => {
    const daysSinceAdded = (Date.now() - new Date(date)) / (1000 * 60 * 60 * 24);
    return daysSinceAdded >= 7;
  };

  // Format date for display
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
      
      // Reload to recalculate combined amounts
      await loadItems();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const updateAmount = async (item, amountChange) => {
    try {
      // Update the primary (first) purchase amount
      const primaryPurchase = item.purchaseHistory[0];
      const newAmount = primaryPurchase.amount + amountChange;
      
      if (newAmount <= 0) {
        // If primary purchase amount becomes 0 or less, delete it
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
    console.log('🔍 Toggle clicked for:', itemName);
    setExpandedItems(prev => {
      const newState = {
        ...prev,
        [itemName]: !prev[itemName]
      };
      console.log('📋 Expanded state:', newState);
      return newState;
    });
  };

  // Filter items by category
  const filteredItems = items.filter(item => 
    selectedCategory === 'All' || item.category === selectedCategory
  );

  // Group items by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  // Sort items within each group (newest to oldest based on newestDate)
  Object.keys(groupedItems).forEach(category => {
    groupedItems[category].sort((a, b) => 
      new Date(b.newestDate) - new Date(a.newestDate)
    );
  });

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
          <p className="text-gray-600">{filteredItems.length} items in stock</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium text-gray-700">Category:</span>
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
        </div>
      </div>

      {/* Inventory Items Grouped by Category */}
      {Object.keys(groupedItems).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category} className="bg-white rounded-xl shadow-lg overflow-hidden">
              {/* Category Header */}
              <div className="bg-green-600 px-4 py-2 flex items-center justify-between">
                <h3 className="font-semibold text-white">{category}</h3>
                <span className="bg-white text-green-600 px-2 py-1 rounded-full text-sm font-medium">
                  {categoryItems.length}
                </span>
              </div>

              {/* Items */}
              <div className="divide-y">
                {categoryItems.map((item) => {
                  const isExpanded = expandedItems[item.name];
                  const showWarning = isOld(item.oldestDate);
                  const hasMultiplePurchases = item.purchaseHistory.length > 1;

                  return (
                    <div 
                      key={item.id} 
                      className={`p-4 ${hasMultiplePurchases ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
                      onClick={() => {
                        if (hasMultiplePurchases) {
                          console.log('🖱️ Clicked item:', item.name);
                          toggleExpanded(item.name);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Item Info */}
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
                          </div>

                          {item.brand_name && (
                            <p className="text-sm text-gray-600">{item.brand_name}</p>
                          )}

                          {/* Amount Display */}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-lg font-semibold text-green-600">
                              {item.totalAmount} {item.unit}
                            </span>
                            {hasMultiplePurchases && (
                              <span className="text-sm text-blue-600 font-medium">
                                {isExpanded ? '▼' : '▶'} {item.purchaseHistory.length} purchases
                              </span>
                            )}
                          </div>

                          {/* Date Added (oldest) */}
                          <p className="text-xs text-gray-500 mt-1">
                            First added: {formatDate(item.oldestDate)}
                          </p>

                          {/* Nutrition Info */}
                          {(item.calories > 0 || item.protein > 0 || item.carbs > 0 || item.fat > 0) && (
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

                          {/* Purchase History Dropdown */}
                          {isExpanded && hasMultiplePurchases && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-2">
                              <h5 className="text-sm font-semibold text-gray-900">Purchase History:</h5>
                              {item.purchaseHistory.map((purchase, idx) => (
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

                        {/* Actions */}
                        <div 
                          className="flex flex-col gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Quick Adjust Amount */}
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

                          {/* Delete All */}
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
          ))}
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
    </div>
  );
}