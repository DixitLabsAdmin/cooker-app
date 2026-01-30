import { useState, useEffect } from 'react';

export default function EditInventoryModal({ item, onClose, onSave, onDelete, onToggleFavorite }) {
  const [formData, setFormData] = useState({
    name: '',
    amount: 0,
    unit: 'g',
    category: 'Other',
    brand_name: '',
  });

  const [nutrition, setNutrition] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  const [editingNutrition, setEditingNutrition] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        amount: item.amount || 0,
        unit: item.unit || 'g',
        category: item.category || 'Other',
        brand_name: item.brand_name || '',
      });

      setNutrition({
        calories: item.calories || 0,
        protein: item.protein || 0,
        carbs: item.carbs || 0,
        fat: item.fat || 0,
      });

      setIsFavorite(item.is_favorite || false);
    }
  }, [item]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(item.id, {
      ...formData,
      ...nutrition,
    });
  };

  const handleNutritionChange = (field, value) => {
    setNutrition({
      ...nutrition,
      [field]: parseFloat(value) || 0,
    });
  };

  const hasZeroNutrition = 
    nutrition.calories === 0 && 
    nutrition.protein === 0 && 
    nutrition.carbs === 0 && 
    nutrition.fat === 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header with Favorite Star */}
        <div className="flex justify-between items-start p-6 border-b sticky top-0 bg-white">
          <h3 className="text-xl font-bold text-gray-900">Edit Item</h3>
          
          <div className="flex items-center gap-3">
            {/* Favorite Star */}
            <button
              type="button"
              onClick={() => {
                setIsFavorite(!isFavorite);
                onToggleFavorite();
              }}
              className="text-3xl hover:scale-110 transition-transform"
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorite ? '⭐' : '☆'}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand
              </label>
              <input
                type="text"
                value={formData.brand_name}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount *
              </label>
              <input
                type="number"
                required
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit *
              </label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="g">grams (g)</option>
                <option value="kg">kilograms (kg)</option>
                <option value="ml">milliliters (ml)</option>
                <option value="l">liters (L)</option>
                <option value="oz">ounces (oz)</option>
                <option value="lb">pounds (lb)</option>
                <option value="item">items</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="Meat">Meat</option>
                <option value="Seafood">Seafood</option>
                <option value="Produce">Produce</option>
                <option value="Dairy">Dairy</option>
                <option value="Grains">Grains</option>
                <option value="Canned">Canned</option>
                <option value="Frozen">Frozen</option>
                <option value="Snacks">Snacks</option>
                <option value="Beverages">Beverages</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Nutrition Section */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">
                  Nutrition Information
                </h4>
                {hasZeroNutrition && (
                  <p className="text-sm text-yellow-600 mt-1">
                    ⚠️ Nutrition data is missing. Click "Edit Nutrition" to add manually.
                  </p>
                )}
              </div>
              
              <button
                type="button"
                onClick={() => setEditingNutrition(!editingNutrition)}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
              >
                {editingNutrition ? 'Done Editing' : 'Edit Nutrition'}
              </button>
            </div>

            {editingNutrition ? (
              // Editable Nutrition Form
              <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calories
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={nutrition.calories}
                    onChange={(e) => handleNutritionChange('calories', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={nutrition.protein}
                    onChange={(e) => handleNutritionChange('protein', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={nutrition.carbs}
                    onChange={(e) => handleNutritionChange('carbs', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={nutrition.fat}
                    onChange={(e) => handleNutritionChange('fat', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ) : (
              // Read-Only Nutrition Display
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Calories:</span>
                  <span className="font-semibold">{nutrition.calories}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Protein:</span>
                  <span className="font-semibold">{nutrition.protein}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Carbs:</span>
                  <span className="font-semibold">{nutrition.carbs}g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fat:</span>
                  <span className="font-semibold">{nutrition.fat}g</span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t">
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
            >
              Delete Item
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}