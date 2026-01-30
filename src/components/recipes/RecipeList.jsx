import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

export default function RecipeList({ onSelectRecipe, onCreateNew }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavorites, setFilterFavorites] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter out the dummy placeholder recipes
      const filteredRecipes = (data || []).filter(recipe => {
        const dummyRecipes = ['Grilled Chicken Salad', 'Salmon Teriyaki', 'Spaghetti Carbonara'];
        return !dummyRecipes.includes(recipe.name);
      });

      setRecipes(filteredRecipes);
    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (recipeId, currentFavoriteStatus) => {
    try {
      const { error } = await supabase
        .from('recipes')
        .update({ is_favorite: !currentFavoriteStatus })
        .eq('id', recipeId);

      if (error) throw error;

      // Update local state
      setRecipes(recipes.map(recipe => 
        recipe.id === recipeId 
          ? { ...recipe, is_favorite: !currentFavoriteStatus }
          : recipe
      ));
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const filteredRecipes = recipes.filter(recipe => {
    // Search filter
    if (searchQuery && !recipe.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Favorites filter
    if (filterFavorites && !recipe.is_favorite) {
      return false;
    }
    
    return true;
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
          <h2 className="text-2xl font-bold text-gray-900">My Recipes</h2>
          <p className="text-gray-600">{filteredRecipes.length} recipes</p>
        </div>
        <button
          onClick={onCreateNew}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          ➕ Create Recipe
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          {/* Favorites Filter */}
          <button
            onClick={() => setFilterFavorites(!filterFavorites)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterFavorites
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {filterFavorites ? '⭐ Showing Favorites' : '⭐ Show Favorites Only'}
          </button>
        </div>
      </div>

      {/* Recipe Grid */}
      {filteredRecipes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow cursor-pointer"
            >
              {/* Recipe Image */}
              <div className="relative">
                {recipe.image_url ? (
                  <img
                    src={recipe.image_url}
                    alt={recipe.name}
                    className="w-full h-48 object-cover"
                    onClick={() => onSelectRecipe(recipe)}
                  />
                ) : (
                  <div 
                    className="w-full h-48 bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center cursor-pointer"
                    onClick={() => onSelectRecipe(recipe)}
                  >
                    <span className="text-6xl">🍽️</span>
                  </div>
                )}

                {/* Favorite Star */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(recipe.id, recipe.is_favorite);
                  }}
                  className="absolute top-2 right-2 bg-white rounded-full p-2 shadow-lg hover:scale-110 transition-transform"
                >
                  {recipe.is_favorite ? (
                    <span className="text-2xl">⭐</span>
                  ) : (
                    <span className="text-2xl text-gray-400">☆</span>
                  )}
                </button>
              </div>

              {/* Recipe Info */}
              <div className="p-4" onClick={() => onSelectRecipe(recipe)}>
                <h3 className="font-bold text-lg text-gray-900 mb-2">{recipe.name}</h3>
                
                {recipe.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {recipe.description}
                  </p>
                )}

                {/* Quick Stats */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {recipe.cuisine && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      {recipe.cuisine}
                    </span>
                  )}
                  {recipe.difficulty && (
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      recipe.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                      recipe.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {recipe.difficulty}
                    </span>
                  )}
                  {recipe.cooking_time && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                      ⏱️ {recipe.cooking_time}m
                    </span>
                  )}
                </div>

                {/* Nutrition Summary */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="font-semibold text-gray-900">{recipe.total_calories || 0}</div>
                    <div className="text-gray-500">cal</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{recipe.total_protein || 0}g</div>
                    <div className="text-gray-500">protein</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{recipe.total_carbs || 0}g</div>
                    <div className="text-gray-500">carbs</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{recipe.total_fat || 0}g</div>
                    <div className="text-gray-500">fat</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">🍳</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchQuery || filterFavorites ? 'No recipes found' : 'No recipes yet'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchQuery || filterFavorites
              ? 'Try adjusting your filters or search'
              : 'Create your first recipe to get started'
            }
          </p>
          {!searchQuery && !filterFavorites && (
            <button
              onClick={onCreateNew}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              ➕ Create Your First Recipe
            </button>
          )}
        </div>
      )}
    </div>
  );
}