import { useState, useEffect } from 'react';
import { krogerService } from '../../services/kroger';
import { favoriteProductsService } from '../../services/favoriteProducts';
import { useKrogerStore } from '../../contexts/KrogerStoreContext';

export default function FoodSearch({ onSelectFood }) {
  const { store, hasStore } = useKrogerStore();
  
  const [activeTab, setActiveTab] = useState('search'); // 'search' or 'favorites'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load favorites on mount
  useEffect(() => {
    if (activeTab === 'favorites') {
      loadFavorites();
    }
  }, [activeTab]);

  // Load favorite IDs for star indicators
  useEffect(() => {
    loadFavoriteIds();
  }, []);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const favs = await favoriteProductsService.getFavorites('recent');
      setFavorites(favs);
    } catch (err) {
      console.error('Error loading favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFavoriteIds = async () => {
    try {
      const favs = await favoriteProductsService.getFavorites();
      const ids = new Set(favs.map(f => f.kroger_product_id));
      setFavoriteIds(ids);
    } catch (err) {
      console.error('Error loading favorite IDs:', err);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const locationId = store?.locationId || null;
      const products = await krogerService.searchProducts(query, locationId, 25);
      setResults(products);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleToggleFavorite = async (product, event) => {
    event.stopPropagation();
    
    const isFav = favoriteIds.has(product.krogerProductId);
    
    try {
      if (isFav) {
        await favoriteProductsService.removeFavorite(product.krogerProductId);
        setFavoriteIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(product.krogerProductId);
          return newSet;
        });
        // Reload favorites list if on that tab
        if (activeTab === 'favorites') {
          loadFavorites();
        }
      } else {
        await favoriteProductsService.addFavorite(product);
        setFavoriteIds(prev => new Set(prev).add(product.krogerProductId));
      }
    } catch (err) {
      if (err.message.includes('already in favorites')) {
        // Refresh favorite IDs
        loadFavoriteIds();
      } else {
        alert('Error: ' + err.message);
      }
    }
  };

  const handleSelectProduct = async (product) => {
    // Mark as used if it's a favorite
    if (favoriteIds.has(product.kroger_product_id || product.krogerProductId)) {
      await favoriteProductsService.markAsUsed(product.kroger_product_id || product.krogerProductId);
    }

    const foodData = {
      krogerProductId: product.kroger_product_id || product.krogerProductId,
      upc: product.upc,
      price: product.price,
      priceUnit: product.price_unit || product.priceUnit,
      onSale: product.onSale,
      images: product.image_url ? [product.image_url] : product.images || [],
      category: product.category,
      
      fdcId: product.fdcId || product.kroger_product_id || product.krogerProductId,
      name: product.name,
      brandName: product.brand_name || product.brandName,
      servingSize: product.serving_size || product.servingSize,
      servingUnit: product.serving_unit || product.servingUnit,
      calories: product.calories,
      protein: product.protein,
      carbs: product.carbs,
      fat: product.fat,
      fiber: product.fiber || 0,
      sugar: product.sugar || 0,
      sodium: product.sodium || 0,
      
      source: 'kroger',
      nutritionSource: product.nutrition_source || product.nutritionSource,
      hasNutrition: product.calories > 0,
    };

    onSelectFood(foodData);
  };

  const ProductCard = ({ product, isFavorite }) => {
    const productId = product.kroger_product_id || product.krogerProductId;
    const imageUrl = product.image_url || product.images?.[0];
    const brandName = product.brand_name || product.brandName;
    const priceUnit = product.price_unit || product.priceUnit;
    const servingSize = product.serving_size || product.servingSize;
    const servingUnit = product.serving_unit || product.servingUnit;
    const nutritionSource = product.nutrition_source || product.nutritionSource;

    return (
      <div className="p-4 bg-white border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-md transition-all">
        <div className="flex gap-4">
          {/* Product Image */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt={product.name}
              className="w-16 h-16 object-cover rounded flex-shrink-0"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          )}

          {/* Product Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2 mb-1">
              <h3 className="font-medium text-gray-900 flex-1">{product.name}</h3>
              
              {/* Favorite Star - Top Right */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite(product, e);
                }}
                className="text-2xl hover:scale-110 transition-transform flex-shrink-0"
                title={favoriteIds.has(productId) ? 'Remove from favorites' : 'Add to favorites'}
              >
                {favoriteIds.has(productId) ? '⭐' : '☆'}
              </button>
            </div>
            {brandName && (
              <p className="text-sm text-blue-600 mt-1">
                🏷️ {brandName}
              </p>
            )}

            {/* Price */}
            {product.price && (
              <div className="mt-2">
                <span className={`text-lg font-bold ${product.onSale ? 'text-red-600' : 'text-gray-900'}`}>
                  ${product.price.toFixed(2)}
                </span>
                {product.onSale && (
                  <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                    On Sale!
                  </span>
                )}
                <span className="text-xs text-gray-500 ml-2">
                  {priceUnit}
                </span>
              </div>
            )}

            {/* Nutrition */}
            {product.calories > 0 && (
              <div className="mt-2">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold">{Math.round(product.calories)} cal</span>
                  {' • '}
                  <span>P: {Math.round(product.protein)}g</span>
                  {' • '}
                  <span>C: {Math.round(product.carbs)}g</span>
                  {' • '}
                  <span>F: {Math.round(product.fat)}g</span>
                  <span className="text-gray-400 ml-2">
                    (per {servingSize}{servingUnit})
                  </span>
                </div>
                {/* Nutrition Source Badge */}
                {nutritionSource && (
                  <div className="mt-1">
                    {nutritionSource === 'kroger' && (
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                        ✓ Kroger
                      </span>
                    )}
                    {nutritionSource === 'usda' && (
                      <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                        ✓ USDA
                      </span>
                    )}
                    {nutritionSource === 'kroger+usda' && (
                      <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                        ✓ Kroger + USDA
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Category */}
            {product.category && (
              <div className="mt-2">
                <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                  {product.category}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Add Button - Full Width at Bottom */}
        <button
          onClick={() => handleSelectProduct(product)}
          className="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          Add to Shopping List
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'search'
              ? 'border-b-2 border-green-600 text-green-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Search Products
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'favorites'
              ? 'border-b-2 border-green-600 text-green-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span>⭐</span>
          Favorites
          {favoriteIds.size > 0 && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
              {favoriteIds.size}
            </span>
          )}
        </button>
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <>
          {/* Store Indicator */}
          {hasStore && store && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-blue-600 font-medium">🏪</span>
              <div className="flex-1">
                <p className="text-sm text-blue-900 font-medium">
                  Searching at: {store.name}
                </p>
                <p className="text-xs text-blue-700">{store.address}</p>
              </div>
            </div>
          )}

          {!hasStore && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                💡 <strong>Tip:</strong> Set your preferred store in Settings for store-specific pricing and availability.
              </p>
            </div>
          )}

          {/* Search Bar */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Search Kroger products (e.g., 'chicken breast', 'milk')"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Found {results.length} products • Click ☆ to save favorites
              </p>
              
              <div className="max-h-96 overflow-y-auto space-y-2">
                {results.map((product) => (
                  <ProductCard
                    key={product.krogerProductId}
                    product={product}
                    isFavorite={favoriteIds.has(product.krogerProductId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && results.length === 0 && query && (
            <div className="text-center py-8 text-gray-500">
              <p>No products found for "{query}"</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !query && results.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">🛒</div>
              <p>Search for Kroger products to add to your shopping list</p>
              <p className="text-sm mt-2">Click ☆ to save frequently bought items</p>
            </div>
          )}
        </>
      )}

      {/* Favorites Tab */}
      {activeTab === 'favorites' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
          ) : favorites.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {favorites.length} favorite products • Click ⭐ to remove
              </p>
              
              <div className="max-h-96 overflow-y-auto space-y-2">
                {favorites.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={true}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">⭐</div>
              <p>No favorite products yet</p>
              <p className="text-sm mt-2">
                Search for products and click the star to save them here
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}