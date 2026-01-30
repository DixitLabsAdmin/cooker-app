import { useState, useEffect } from 'react';
import { krogerPromotionsService } from '../../services/krogerPromotions';
import { krogerService } from '../../services/kroger';
import { useKrogerStore } from '../../contexts/KrogerStoreContext';

export default function Coupons() {
  const { selectedStore } = useKrogerStore();
  const [coupons, setCoupons] = useState([]);
  const [clippedCoupons, setClippedCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'clipped', 'available'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Savings summary
  const [totalSavings, setTotalSavings] = useState(0);

  useEffect(() => {
    loadCoupons();
    loadClippedCoupons();
    loadSavingsHistory();
  }, []);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      // Kroger digital coupons require Plus Card API access
      // For now, this feature is disabled - would need proxy server update
      console.log('💡 Digital Coupons: Requires Kroger Plus Card API');
      console.log('   This feature needs to be added to your proxy server at localhost:3001');
      setCoupons([]);
    } catch (error) {
      console.error('Error loading coupons:', error);
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  const loadClippedCoupons = async () => {
    try {
      const clipped = await krogerPromotionsService.getClippedCoupons();
      setClippedCoupons(clipped);
    } catch (error) {
      console.error('Error loading clipped coupons:', error);
    }
  };

  const loadSavingsHistory = async () => {
    try {
      const history = await krogerPromotionsService.getSavingsHistory();
      setTotalSavings(history.thisMonth);
    } catch (error) {
      console.error('Error loading savings:', error);
    }
  };

  const handleClipCoupon = async (coupon) => {
    try {
      await krogerPromotionsService.clipCoupon(coupon.id);
      
      // Update UI
      setCoupons(coupons.map(c => 
        c.id === coupon.id ? { ...c, isClipped: true } : c
      ));
      
      await loadClippedCoupons();
      alert(`✂️ Coupon clipped! Save $${coupon.value} on your next purchase.`);
    } catch (error) {
      console.error('Error clipping coupon:', error);
      alert('Failed to clip coupon. Please try again.');
    }
  };

  const filteredCoupons = coupons.filter(coupon => {
    // Filter by clip status
    if (filter === 'clipped' && !coupon.isClipped) return false;
    if (filter === 'available' && coupon.isClipped) return false;
    
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!coupon.description.toLowerCase().includes(query) &&
          !coupon.brand?.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    // Filter by category
    if (selectedCategory && coupon.category !== selectedCategory) return false;
    
    return true;
  });

  const categories = [...new Set(coupons.map(c => c.category).filter(Boolean))];

  return (
    <div className="space-y-6">
      {/* Savings Summary */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">
              ${totalSavings.toFixed(2)}
            </h2>
            <p className="text-green-100">Saved this month with coupons</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{clippedCoupons.length}</div>
            <p className="text-green-100">Coupons clipped</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">🎟️ Digital Coupons</h3>
        
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coupons..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Coupons ({coupons.length})
          </button>
          <button
            onClick={() => setFilter('available')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'available' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Available ({coupons.filter(c => !c.isClipped).length})
          </button>
          <button
            onClick={() => setFilter('clipped')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'clipped' 
                ? 'bg-purple-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ✂️ Clipped ({coupons.filter(c => c.isClipped).length})
          </button>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                !selectedCategory 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Categories
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Coupons Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      ) : filteredCoupons.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCoupons.map(coupon => (
            <div
              key={coupon.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow"
            >
              {coupon.imageUrl && (
                <img
                  src={coupon.imageUrl}
                  alt={coupon.description}
                  className="w-full h-40 object-cover"
                />
              )}
              
              <div className="p-4">
                {/* Value Badge */}
                <div className="mb-3">
                  <span className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-xl">
                    {coupon.valueType === 'PERCENT_OFF' 
                      ? `${coupon.value}% OFF`
                      : `$${coupon.value} OFF`
                    }
                  </span>
                </div>

                {/* Brand & Category */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {coupon.brand && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      {coupon.brand}
                    </span>
                  )}
                  {coupon.category && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                      {coupon.category}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-gray-900 font-medium mb-2">
                  {coupon.shortDescription || coupon.description}
                </p>

                {/* Expiration */}
                {coupon.expirationDate && (
                  <p className="text-sm text-gray-500 mb-3">
                    Expires: {new Date(coupon.expirationDate).toLocaleDateString()}
                  </p>
                )}

                {/* Clip Button */}
                {coupon.isClipped ? (
                  <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-center font-medium">
                    ✅ Clipped!
                  </div>
                ) : (
                  <button
                    onClick={() => handleClipCoupon(coupon)}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    ✂️ Clip Coupon
                  </button>
                )}

                {/* Minimum Purchase */}
                {coupon.minimumPurchase && (
                  <p className="text-xs text-gray-500 mt-2">
                    Min. purchase: ${coupon.minimumPurchase}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">🎟️</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No coupons found
          </h3>
          <p className="text-gray-600">
            Try adjusting your filters or search
          </p>
        </div>
      )}
    </div>
  );
}