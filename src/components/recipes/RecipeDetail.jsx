import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

export default function RecipeDetail({ recipeId, onEdit, onDelete, onBack }) {
  const [recipe, setRecipe] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [ingredientStatus, setIngredientStatus] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecipeDetails();
    loadInventory();
  }, [recipeId]);

  const loadRecipeDetails = async () => {
    try {
      // Load recipe
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', recipeId)
        .maybeSingle();

      if (recipeError) throw recipeError;
      setRecipe(recipeData);

      // Load ingredients
      const { data: ingredientsData, error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', recipeId);

      if (ingredientsError) throw ingredientsError;
      setIngredients(ingredientsData || []);
    } catch (error) {
      console.error('Error loading recipe:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadInventory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('Error loading inventory:', error);
    }
  };

  // Check ingredient availability
  useEffect(() => {
    if (ingredients.length > 0 && inventory.length >= 0) {
      const status = {};
      
      ingredients.forEach(ingredient => {
        const inventoryItem = inventory.find(item => 
          item.name.toLowerCase().includes(ingredient.name.toLowerCase()) ||
          ingredient.name.toLowerCase().includes(item.name.toLowerCase())
        );
        
        if (inventoryItem) {
          // Check if we have enough quantity
          const hasEnough = inventoryItem.amount >= ingredient.amount;
          status[ingredient.id] = {
            available: true,
            hasEnough: hasEnough,
            inventoryAmount: inventoryItem.amount,
            neededAmount: ingredient.amount
          };
        } else {
          status[ingredient.id] = {
            available: false,
            hasEnough: false
          };
        }
      });
      
      setIngredientStatus(status);
    }
  }, [ingredients, inventory]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this recipe?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipeId);

      if (error) throw error;
      onDelete();
    } catch (error) {
      console.error('Error deleting recipe:', error);
      alert('Failed to delete recipe');
    }
  };

  const toggleFavorite = async () => {
    try {
      const { error } = await supabase
        .from('recipes')
        .update({ is_favorite: !recipe.is_favorite })
        .eq('id', recipeId);

      if (error) throw error;
      setRecipe({ ...recipe, is_favorite: !recipe.is_favorite });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const addMissingIngredientsToShoppingList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const missingIngredients = ingredients.filter(ingredient => {
        const status = ingredientStatus[ingredient.id];
        return !status?.available || !status?.hasEnough;
      });

      if (missingIngredients.length === 0) {
        alert('You have all ingredients in your inventory!');
        return;
      }

      const shoppingItems = missingIngredients.map(ingredient => ({
        user_id: user.id,
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit || 'item',
        category: 'Recipe Ingredient',
        is_purchased: false
      }));

      const { error } = await supabase
        .from('shopping_list_items')
        .insert(shoppingItems);

      if (error) throw error;

      alert(`✅ Added ${missingIngredients.length} missing ingredients to shopping list!`);
    } catch (error) {
      console.error('Error adding to shopping list:', error);
      alert('Failed to add ingredients to shopping list');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Recipe not found</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          ← Back to Recipes
        </button>
      </div>
    );
  }

  const missingCount = ingredients.filter(ing => {
    const status = ingredientStatus[ing.id];
    return !status?.available || !status?.hasEnough;
  }).length;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
      >
        ← Back to Recipes
      </button>

      {/* Recipe Header with Image */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Recipe Image */}
        {recipe.image_url && (
          <img
            src={recipe.image_url}
            alt={recipe.name}
            className="w-full h-96 object-cover"
          />
        )}

        <div className="p-6">
          {/* Title and Actions */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{recipe.name}</h2>
              {recipe.description && (
                <p className="text-gray-600">{recipe.description}</p>
              )}
            </div>

            <div className="flex gap-2 ml-4">
              {/* Favorite Button */}
              <button
                onClick={toggleFavorite}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {recipe.is_favorite ? (
                  <span className="text-2xl">⭐</span>
                ) : (
                  <span className="text-2xl text-gray-400">☆</span>
                )}
              </button>

              {/* Edit Button */}
              <button
                onClick={() => onEdit(recipe)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                ✏️ Edit
              </button>

              {/* Delete Button */}
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                🗑️ Delete
              </button>
            </div>
          </div>

          {/* Recipe Meta */}
          <div className="flex flex-wrap gap-3 mb-6">
            {recipe.cuisine && (
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                {recipe.cuisine}
              </span>
            )}
            {recipe.difficulty && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                recipe.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                recipe.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {recipe.difficulty}
              </span>
            )}
            {recipe.cooking_time && (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                ⏱️ {recipe.cooking_time} minutes
              </span>
            )}
            {recipe.servings && (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                🍽️ {recipe.servings} servings
              </span>
            )}
          </div>

          {/* Nutrition Facts */}
          <div className="bg-green-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Nutrition Facts (per serving)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{recipe.total_calories || 0}</div>
                <div className="text-sm text-gray-600">Calories</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{recipe.total_protein || 0}g</div>
                <div className="text-sm text-gray-600">Protein</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{recipe.total_carbs || 0}g</div>
                <div className="text-sm text-gray-600">Carbs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{recipe.total_fat || 0}g</div>
                <div className="text-sm text-gray-600">Fat</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ingredients Section with Inventory Check */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Ingredients</h3>
          {missingCount > 0 && (
            <button
              onClick={addMissingIngredientsToShoppingList}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              🛒 Add {missingCount} Missing to Shopping List
            </button>
          )}
        </div>

        {ingredients.length > 0 ? (
          <div className="space-y-2">
            {ingredients.map((ingredient) => {
              const status = ingredientStatus[ingredient.id] || {};
              const isAvailable = status.available && status.hasEnough;

              return (
                <div
                  key={ingredient.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    isAvailable ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Status Icon */}
                    <div className="text-2xl">
                      {isAvailable ? '✅' : '❌'}
                    </div>

                    {/* Ingredient Info */}
                    <div>
                      <div className="font-medium text-gray-900">
                        {ingredient.amount} {ingredient.unit} {ingredient.name}
                      </div>
                      {status.available && !status.hasEnough && (
                        <div className="text-sm text-orange-600">
                          Have {status.inventoryAmount} {ingredient.unit}, need {status.neededAmount}
                        </div>
                      )}
                      {!status.available && (
                        <div className="text-sm text-red-600">
                          Not in inventory
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No ingredients added yet</p>
        )}
      </div>

      {/* Instructions */}
      {recipe.instructions && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Instructions</h3>
          <div className="prose max-w-none">
            <p className="text-gray-700 whitespace-pre-line">{recipe.instructions}</p>
          </div>
        </div>
      )}

      {/* Tags */}
      {recipe.tags && recipe.tags.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}