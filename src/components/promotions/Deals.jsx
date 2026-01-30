import { useState, useEffect } from 'react';
import { krogerPromotionsService } from '../../services/krogerPromotions';
import { shoppingListService } from '../../services/shoppingList';
import { useKrogerStore } from '../../contexts/KrogerStoreContext';

export default function Deals({ onNavigateToTab }) {
  // ✅ USE CONTEXT INSTEAD OF HOOK
  const { selectedStore, loading: storeLoading } = useKrogerStore();
  
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('savings');
  const [filterCategory, setFilterCategory] = useState('');

  // ✅ Load deals when store changes
  useEffect(() => {
    console.log('🔍 Store changed:', selectedStore);
    if (!storeLoading && selectedStore?.locationId) {
      console.log('✅ Store available:', selectedStore.name, selectedStore.locationId);
      loadDeals();
    } else if (!storeLoading && !selectedStore) {
      console.log('⚠️ No store selected');
    }
  }, [selectedStore, storeLoading]);

  const loadDeals = async () => {
    if (!selectedStore?.locationId) {
      console.log('⚠️ Cannot load deals - no store locationId');
      return;
    }

    setLoading(true);
    try {
      console.log('🔍 Loading deals for store:', selectedStore.locationId, selectedStore.name);
      const weeklyDeals = await krogerPromotionsService.getWeeklyDeals(selectedStore.locationId);
      setDeals(weeklyDeals);
      console.log('✅ Loaded deals:', weeklyDeals.length);
      
      if (weeklyDeals.length === 0) {
        console.log('💡 No products on sale found at this store right now');
      }
    } catch (error) {
      console.error('❌ Error loading deals:', error);
      if (error.code === 'ERR_NETWORK') {
        console.error('⚠️ Cannot connect to proxy server on localhost:3001');
      }
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    console.log('🔄 Manual refresh triggered');
    if (selectedStore) {
      loadDeals();
    } else {
      alert('Please select a store in Settings first');
    }
  };

  // ✅ FIXED: Navigate to Settings
  const handleGoToSettings = () => {
    if (onNavigateToTab) {
      console.log('📍 Navigating to Settings tab');
      onNavigateToTab('settings');
    } else {
      console.warn('⚠️ onNavigateToTab prop not provided');
      alert('Please go to Settings to select a store');
    }
  };

  const handleAddToList = async (deal) => {
    try {
      await shoppingListService.addItem({
        name: deal.name,
        amount: 1,
        unit: deal.size || 'item',
        category: deal.category || 'Other',
        price: deal.salePrice,
        brand_name: deal.brand,
        is_on_sale: true,
        sale_savings: deal.savings,
        regular_price: deal.regularPrice,
        sale_price: deal.salePrice
      });
      
      alert(`✅ Added "${deal.name}" to shopping list at sale price!`);
    } catch (error) {
      console.error('Error adding to list:', error);
      alert('Failed to add to shopping list');
    }
  };

  // Sort deals
  const sortedDeals = [...deals].sort((a, b) => {
    switch (sortBy) {
      case 'savings':
        return b.savings - a.savings;
      case 'percent':
        return b.savingsPercent - a.savingsPercent;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'price':
        return a.salePrice - b.salePrice;
      default:
        return 0;
    }
  });

  // Filter by category
  const filteredDeals = filterCategory
    ? sortedDeals.filter(d => d.category === filterCategory)
    : sortedDeals;

  const categories = [...new Set(deals.map(d => d.category).filter(Boolean))];

  const totalPotentialSavings = deals.reduce((sum, deal) => sum + deal.savings, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-pink-600 rounded-xl shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">🔥 Weekly Deals</h2>
        <p className="text-red-100 mb-4">
          {selectedStore 
            ? `Deals at ${selectedStore.name}`
            : storeLoading 
              ? 'Loading store...'
              : 'Select a store to see deals'
          }
        </p>
        {deals.length > 0 && (
          <div className="flex items-center gap-6">
            <div>
              <div className="text-3xl font-bold">{deals.length}</div>
              <div className="text-red-100">Items on sale</div>
            </div>
            <div>
              <div className="text-3xl font-bold">${totalPotentialSavings.toFixed(2)}</div>
              <div className="text-red-100">Potential savings</div>
            </div>
          </div>
        )}
      </div>

      {/* Filters & Sorting */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-wrap gap-4 items-center justify-between mb-4">
          {/* Sort Options */}
          <div className="flex items-center gap-2">
            <span className="text-gray-700 font-medium">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="savings">Highest Savings $</option>
              <option value="percent">Highest Savings %</option>
              <option value="price">Lowest Price</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh Deals'}
          </button>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategory('')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                !filterCategory 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Categories ({deals.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filterCategory === cat 
                    ? 'bg-red-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat} ({deals.filter(d => d.category === cat).length})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Deals Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      ) : filteredDeals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDeals.map((deal, idx) => (
            <div
              key={`${deal.productId}-${idx}`}
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow"
            >
              {/* Savings Badge */}
              <div className="relative">
                {deal.imageUrl && (
                  <img
                    src={deal.imageUrl}
                    alt={deal.name}
                    className="w-full h-48 object-cover"
                  />
                )}
                <div className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded-full font-bold shadow-lg">
                  {deal.savingsPercent}% OFF
                </div>
              </div>

              <div className="p-4">
                {/* Brand & Category */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {deal.brand && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      {deal.brand}
                    </span>
                  )}
                  {deal.category && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                      {deal.category}
                    </span>
                  )}
                </div>

                {/* Product Name */}
                <h3 className="font-bold text-gray-900 mb-2">{deal.name}</h3>

                {/* Size */}
                {deal.size && (
                  <p className="text-sm text-gray-600 mb-3">{deal.size}</p>
                )}

                {/* Pricing */}
                <div className="mb-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-red-600">
                      ${deal.salePrice.toFixed(2)}
                    </span>
                    <span className="text-gray-500 line-through">
                      ${deal.regularPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-medium text-green-600">
                      Save ${deal.savings.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({deal.savingsPercent}% off)
                    </span>
                  </div>
                </div>

                {/* Add to List Button */}
                <button
                  onClick={() => handleAddToList(deal)}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  ➕ Add to Shopping List
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">🔥</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {selectedStore ? 'No deals found' : 'Select a store'}
          </h3>
          <p className="text-gray-600 mb-4">
            {selectedStore 
              ? 'Check back later for new deals or try refreshing'
              : 'Choose your Kroger store in Settings to see weekly deals'
            }
          </p>
          {selectedStore ? (
            <button
              onClick={handleRefresh}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              🔄 Refresh Deals
            </button>
          ) : (
            <button
              onClick={handleGoToSettings}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              ⚙️ Go to Settings
            </button>
          )}
        </div>
      )}
    </div>
  );
}