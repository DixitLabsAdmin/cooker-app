import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { krogerService } from '../../services/kroger';
import { useKrogerStore } from '../../contexts/KrogerStoreContext';

export default function RecipeForm({ recipe, onSuccess, onCancel }) {
  const { selectedStore } = useKrogerStore();
  
  // Basic recipe info
  const [name, setName] = useState(recipe?.name || '');
  const [description, setDescription] = useState(recipe?.description || '');
  const [instructions, setInstructions] = useState(recipe?.instructions || '');
  const [cuisine, setCuisine] = useState(recipe?.cuisine || '');
  const [difficulty, setDifficulty] = useState(recipe?.difficulty || 'Medium');
  const [cookingTime, setCookingTime] = useState(recipe?.cooking_time || '');
  const [servings, setServings] = useState(recipe?.servings || 4);
  const [imageUrl, setImageUrl] = useState(recipe?.image_url || '');
  
  // Ingredients
  const [ingredients, setIngredients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  
  const [loading, setLoading] = useState(false);

  // Load existing ingredients if editing
  useEffect(() => {
    if (recipe) {
      loadIngredients();
    }
  }, [recipe]);

  const loadIngredients = async () => {
    try {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', recipe.id);

      if (error) throw error;
      setIngredients(data || []);
    } catch (error) {
      console.error('Error loading ingredients:', error);
    }
  };

  // Search Kroger for ingredients
  const searchIngredients = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      console.log('🔍 Searching Kroger for:', searchQuery);
      const results = await krogerService.searchProducts(
        searchQuery, 
        selectedStore?.locationId || null, 
        10
      );
      
      console.log('✅ Found', results.length, 'products');
      setSearchResults(results);
      setShowSearch(true);
    } catch (error) {
      console.error('Error searching ingredients:', error);
      alert('Failed to search for ingredients. Make sure the Kroger proxy server is running.');
    } finally {
      setSearching(false);
    }
  };

  // Add ingredient from search results
  const addIngredient = (product) => {
    const newIngredient = {
      id: Date.now(), // Temporary ID for new items
      name: product.name,
      amount: 1,
      unit: 'item',
      calories: product.calories || 0,
      protein: product.protein || 0,
      carbs: product.carbs || 0,
      fat: product.fat || 0
    };
    
    setIngredients([...ingredients, newIngredient]);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
    console.log('✅ Added ingredient:', product.name);
  };

  // Add ingredient manually (without Kroger search)
  const addManualIngredient = () => {
    if (!searchQuery.trim()) return;
    
    const newIngredient = {
      id: Date.now(),
      name: searchQuery,
      amount: 1,
      unit: 'item',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    };
    
    setIngredients([...ingredients, newIngredient]);
    setSearchQuery('');
    console.log('✅ Added manual ingredient:', searchQuery);
  };

  const updateIngredient = (id, field, value) => {
    setIngredients(ingredients.map(ing => 
      ing.id === id ? { ...ing, [field]: value } : ing
    ));
  };

  const removeIngredient = (id) => {
    setIngredients(ingredients.filter(ing => ing.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate total nutrition
      const totalCalories = ingredients.reduce((sum, ing) => sum + (parseFloat(ing.calories) || 0), 0);
      const totalProtein = ingredients.reduce((sum, ing) => sum + (parseFloat(ing.protein) || 0), 0);
      const totalCarbs = ingredients.reduce((sum, ing) => sum + (parseFloat(ing.carbs) || 0), 0);
      const totalFat = ingredients.reduce((sum, ing) => sum + (parseFloat(ing.fat) || 0), 0);

      const recipeData = {
        user_id: user.id,
        name,
        description,
        instructions,
        cuisine,
        difficulty,
        cooking_time: cookingTime ? parseInt(cookingTime) : null,
        servings: parseInt(servings),
        image_url: imageUrl || null,
        total_calories: totalCalories,
        total_protein: totalProtein,
        total_carbs: totalCarbs,
        total_fat: totalFat
      };

      let recipeId;

      if (recipe) {
        // Update existing recipe
        const { error } = await supabase
          .from('recipes')
          .update(recipeData)
          .eq('id', recipe.id);

        if (error) throw error;
        recipeId = recipe.id;

        // Delete old ingredients
        await supabase
          .from('recipe_ingredients')
          .delete()
          .eq('recipe_id', recipe.id);
      } else {
        // Create new recipe
        const { data, error } = await supabase
          .from('recipes')
          .insert(recipeData)
          .select()
          .maybeSingle();

        if (error) throw error;
        recipeId = data.id;
      }

      // Insert ingredients
      if (ingredients.length > 0) {
        const ingredientsData = ingredients.map(ing => ({
          recipe_id: recipeId,
          name: ing.name,
          amount: parseFloat(ing.amount) || 1,
          unit: ing.unit || 'item',
          calories: parseFloat(ing.calories) || 0,
          protein: parseFloat(ing.protein) || 0,
          carbs: parseFloat(ing.carbs) || 0,
          fat: parseFloat(ing.fat) || 0
        }));

        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsData);

        if (ingredientsError) throw ingredientsError;
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving recipe:', error);
      alert('Failed to save recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {recipe ? 'Edit Recipe' : 'Create New Recipe'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipe Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image URL
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cuisine
              </label>
              <input
                type="text"
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                placeholder="e.g., Italian"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cooking Time (min)
              </label>
              <input
                type="number"
                value={cookingTime}
                onChange={(e) => setCookingTime(e.target.value)}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Servings
              </label>
              <input
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                min="1"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Ingredients Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Ingredients</h3>
            
            {/* Search Bar */}
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), searchIngredients())}
                  placeholder="Search for ingredients (e.g., chicken breast)..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={searchIngredients}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {searching ? '⏳ Searching...' : '🔍 Search Kroger'}
                </button>
                <button
                  type="button"
                  onClick={addManualIngredient}
                  disabled={!searchQuery.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  ➕ Add Manual
                </button>
              </div>
            </div>

            {/* Search Results */}
            {showSearch && searchResults.length > 0 && (
              <div className="mb-4 bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">
                    Search Results ({searchResults.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowSearch(false)}
                    className="text-gray-500 hover:text-gray-700"
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
                      </div>
                      <button
                        type="button"
                        onClick={() => addIngredient(product)}
                        className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        ➕ Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ingredients List */}
            {ingredients.length > 0 ? (
              <div className="space-y-2 mb-4">
                {ingredients.map((ingredient) => (
                  <div key={ingredient.id} className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                    <input
                      type="number"
                      value={ingredient.amount}
                      onChange={(e) => updateIngredient(ingredient.id, 'amount', e.target.value)}
                      min="0"
                      step="0.25"
                      className="w-20 px-2 py-1 border border-gray-300 rounded"
                    />
                    <input
                      type="text"
                      value={ingredient.unit}
                      onChange={(e) => updateIngredient(ingredient.id, 'unit', e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                    />
                    <input
                      type="text"
                      value={ingredient.name}
                      onChange={(e) => updateIngredient(ingredient.id, 'name', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded"
                    />
                    {ingredient.calories > 0 && (
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        {ingredient.calories} cal
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeIngredient(ingredient.id)}
                      className="text-red-600 hover:text-red-700 p-1"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm mb-4">
                No ingredients added yet. Search for ingredients above or add them manually.
              </p>
            )}
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Step-by-step cooking instructions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !name}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? '⏳ Saving...' : recipe ? 'Update Recipe' : 'Create Recipe'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}