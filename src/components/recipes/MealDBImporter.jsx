import { useState } from 'react';
import { recipeService } from '../../services/recipes';

export default function MealDBImporter({ onRecipeImported }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      return;
    }

    try {
      setLoading(true);
      const results = await recipeService.searchMealDB(searchQuery);
      setSearchResults(results);
      setShowModal(true);
    } catch (err) {
      alert('Error searching MealDB: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (mealDBId) => {
    try {
      setImporting(mealDBId);
      const recipe = await recipeService.importFromMealDB(mealDBId);
      alert('✅ Recipe imported successfully!');
      setShowModal(false);
      setSearchQuery('');
      setSearchResults([]);
      if (onRecipeImported) {
        onRecipeImported(recipe);
      }
    } catch (err) {
      alert('Error importing recipe: ' + err.message);
    } finally {
      setImporting(null);
    }
  };

  const handleGetRandom = async () => {
    try {
      setLoading(true);
      const recipe = await recipeService.getRandomMealDB();
      if (recipe) {
        setSearchResults([recipe]);
        setShowModal(true);
      }
    } catch (err) {
      alert('Error getting random recipe: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Search Form */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-3 text-gray-900">
          🌐 Import from MealDB
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Search thousands of recipes from TheMealDB.com and import them to your collection
        </p>
        
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a recipe... (e.g., 'chicken curry')"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading || !searchQuery.trim()}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button
            type="button"
            onClick={handleGetRandom}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            🎲 Random
          </button>
        </form>
      </div>

      {/* Search Results Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 z-10">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">
                  Search Results ({searchResults.length})
                </h3>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSearchResults([]);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {searchResults.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No recipes found. Try a different search term.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.map((recipe) => (
                    <div
                      key={recipe.externalId}
                      className="border border-gray-200 rounded-lg overflow-hidden hover:border-green-500 transition-colors"
                    >
                      {/* Recipe Image */}
                      {recipe.thumbnail && (
                        <img
                          src={recipe.thumbnail}
                          alt={recipe.name}
                          className="w-full h-48 object-cover"
                        />
                      )}

                      {/* Recipe Info */}
                      <div className="p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">
                          {recipe.name}
                        </h4>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          {recipe.category && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                              {recipe.category}
                            </span>
                          )}
                          {recipe.area && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                              {recipe.area}
                            </span>
                          )}
                          {recipe.tags && recipe.tags.length > 0 && (
                            recipe.tags.slice(0, 2).map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                              >
                                {tag}
                              </span>
                            ))
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {recipe.description}
                        </p>

                        <div className="flex gap-2 text-xs text-gray-500 mb-4">
                          <span>⏱️ {recipe.prep_time + recipe.cooking_time} min</span>
                          <span>•</span>
                          <span>🍽️ {recipe.servings} servings</span>
                          {recipe.ingredients && (
                            <>
                              <span>•</span>
                              <span>📝 {recipe.ingredients.length} ingredients</span>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => handleImport(recipe.externalId)}
                          disabled={importing === recipe.externalId}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors text-sm font-medium"
                        >
                          {importing === recipe.externalId ? (
                            <span className="flex items-center justify-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Importing...
                            </span>
                          ) : (
                            '➕ Import Recipe'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}