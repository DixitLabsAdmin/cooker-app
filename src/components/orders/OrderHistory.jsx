import { useState, useEffect } from 'react';
import { krogerOrdersService } from '../../services/krogerOrders';

export default function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewMode, setViewMode] = useState('local'); // 'local' or 'api'
  const [dateFilter, setDateFilter] = useState('all'); // 'all', '30days', '90days', 'year'

  useEffect(() => {
    loadOrders();
  }, [viewMode]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      if (viewMode === 'api') {
        // Try to load from Kroger API
        console.log('🔍 Loading orders from Kroger API...');
        const apiOrders = await krogerOrdersService.getOrderHistory();
        setOrders(apiOrders);
        
        // Save to local database
        for (const order of apiOrders) {
          await krogerOrdersService.saveOrderToDatabase(order);
        }
      } else {
        // Load from local database
        console.log('🔍 Loading orders from database...');
        const localOrders = await krogerOrdersService.getLocalOrderHistory();
        setOrders(localOrders.map(order => ({
          ...order,
          orderId: order.kroger_order_id,
          orderDate: order.order_date,
          totalAmount: order.total_amount,
          items: order.order_items || []
        })));
      }
      console.log(`✅ Loaded ${orders.length} orders`);
    } catch (error) {
      console.error('Error loading orders:', error);
      if (error.message.includes('endpoint not available')) {
        alert('Order history API not available. This feature requires special Kroger API access. Showing local orders only.');
        if (viewMode === 'api') {
          setViewMode('local');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddToInventory = async (order) => {
    try {
      const result = await krogerOrdersService.addOrderToInventory(order);
      alert(`✅ Added ${result.addedCount} new items and updated ${result.updatedCount} existing items in your inventory!`);
    } catch (error) {
      console.error('Error adding to inventory:', error);
      alert('Failed to add to inventory. Please try again.');
    }
  };

  const handleReorder = async (order) => {
    try {
      const count = await krogerOrdersService.addOrderToShoppingList(order);
      alert(`✅ Added ${count} items to your shopping list!`);
    } catch (error) {
      console.error('Error reordering:', error);
      alert('Failed to add to shopping list. Please try again.');
    }
  };

  const filterOrders = (orders) => {
    if (dateFilter === 'all') return orders;

    const now = new Date();
    const cutoffDate = new Date();

    switch (dateFilter) {
      case '30days':
        cutoffDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        cutoffDate.setDate(now.getDate() - 90);
        break;
      case 'year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return orders;
    }

    return orders.filter(order => new Date(order.orderDate) >= cutoffDate);
  };

  const filteredOrders = filterOrders(orders);
  const totalSpent = filteredOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">📦 Order History</h2>
        <p className="text-blue-100">View past purchases, reorder favorites, and track spending</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-wrap gap-4 items-center justify-between mb-4">
          {/* View Mode */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('local')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'local'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📋 Saved Orders
            </button>
            <button
              onClick={() => setViewMode('api')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'api'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              🔄 Sync from Kroger
            </button>
          </div>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Time</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="year">Last Year</option>
          </select>

          {/* Refresh */}
          <button
            onClick={loadOrders}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Total Orders</div>
            <div className="text-2xl font-bold text-blue-900">{filteredOrders.length}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Total Spent</div>
            <div className="text-2xl font-bold text-green-900">${totalSpent.toFixed(2)}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm text-purple-600 font-medium">Avg Order Value</div>
            <div className="text-2xl font-bold text-purple-900">
              ${filteredOrders.length > 0 ? (totalSpent / filteredOrders.length).toFixed(2) : '0.00'}
            </div>
          </div>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div
              key={order.orderId || order.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow"
            >
              <div className="p-6">
                {/* Order Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Order #{order.orderId || order.kroger_order_id}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {new Date(order.orderDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      ${parseFloat(order.totalAmount).toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {order.items?.length || order.item_count || 0} items
                    </div>
                  </div>
                </div>

                {/* Order Meta */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {order.fulfillmentType && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {order.fulfillmentType}
                    </span>
                  )}
                  {order.status && (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                      order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {order.status}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    👁️ View Details
                  </button>
                  <button
                    onClick={() => handleReorder(order)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    🔄 Reorder
                  </button>
                  <button
                    onClick={() => handleAddToInventory(order)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                  >
                    📦 Add to Inventory
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No orders found
          </h3>
          <p className="text-gray-600 mb-4">
            {viewMode === 'api' 
              ? 'Try syncing from Kroger or check your date filter'
              : 'Sync your orders from Kroger to see them here'
            }
          </p>
          {viewMode === 'local' && (
            <button
              onClick={() => setViewMode('api')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              🔄 Sync from Kroger
            </button>
          )}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">
                  Order #{selectedOrder.orderId || selectedOrder.kroger_order_id}
                </h3>
                <p className="text-sm text-gray-600">
                  {new Date(selectedOrder.orderDate).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Order Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Total Amount</div>
                  <div className="text-xl font-bold">${parseFloat(selectedOrder.totalAmount).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Items</div>
                  <div className="text-xl font-bold">{selectedOrder.items?.length || 0}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Fulfillment</div>
                  <div className="text-xl font-bold">{selectedOrder.fulfillmentType || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <div className="text-xl font-bold">{selectedOrder.status || 'N/A'}</div>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Order Items</h4>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{item.name}</div>
                        {item.brand && (
                          <div className="text-sm text-gray-600">{item.brand}</div>
                        )}
                      </div>
                      <div className="text-center mx-4">
                        <div className="text-sm text-gray-600">Qty</div>
                        <div className="font-medium">{item.quantity}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">${parseFloat(item.totalPrice || item.total_price).toFixed(2)}</div>
                        <div className="text-sm text-gray-600">${parseFloat(item.price).toFixed(2)} each</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    handleReorder(selectedOrder);
                    setSelectedOrder(null);
                  }}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  🔄 Reorder All
                </button>
                <button
                  onClick={() => {
                    handleAddToInventory(selectedOrder);
                    setSelectedOrder(null);
                  }}
                  className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  📦 Add to Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}