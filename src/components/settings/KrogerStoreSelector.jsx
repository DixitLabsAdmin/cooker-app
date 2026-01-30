import { useState } from 'react';
import { krogerService } from '../../services/kroger';
import { useKrogerStore } from '../../contexts/KrogerStoreContext';

export default function KrogerStoreSelector() {
  const [zipCode, setZipCode] = useState('');
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // ✅ Get the function from context
  const { selectedStore, setSelectedStore } = useKrogerStore();

  const handleSearch = async () => {
    if (!zipCode) {
      setError('Please enter a ZIP code');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const results = await krogerService.searchByZipCode(zipCode);
      setStores(results || []);
      
      if (!results || results.length === 0) {
        setError('No stores found in this area');
      }
    } catch (err) {
      console.error('Kroger Locations Search Error:', err);
      setError('Failed to search stores. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStore = async (store) => {
    try {
      // ✅ CRITICAL FIX: Make sure setSelectedStore is actually a function
      if (typeof setSelectedStore !== 'function') {
        console.error('❌ setSelectedStore is not a function:', setSelectedStore);
        throw new Error('setSelectedStore is not a function');
      }

      console.log('💾 Saving store:', store.name);
      
      // Call the function from context
      await setSelectedStore(store);
      
      console.log('✅ Store saved successfully');
      alert(`✅ Selected: ${store.name}`);
    } catch (err) {
      console.error('❌ Error saving store:', err);
      alert(`Failed to save store: ${err.message}`);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Select Your Kroger Store
      </h2>

      {selectedStore && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            <strong>Current Store:</strong> {selectedStore.name}
          </p>
          <p className="text-xs text-green-600 mt-1">
            {selectedStore.address?.addressLine1}, {selectedStore.address?.city}, {selectedStore.address?.state}
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Enter ZIP code"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? 'Searching...' : 'Search Stores'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {stores.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Found {stores.length} store{stores.length !== 1 ? 's' : ''}
          </p>
          
          {stores.map((store) => (
            <div
              key={store.locationId}
              className="p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors cursor-pointer"
              onClick={() => handleSelectStore(store)}
            >
              <h3 className="font-semibold text-gray-900">{store.name}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {store.address?.addressLine1}
              </p>
              <p className="text-sm text-gray-600">
                {store.address?.city}, {store.address?.state} {store.address?.zipCode}
              </p>
              {store.phone && (
                <p className="text-sm text-gray-500 mt-1">
                  📞 {store.phone}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}