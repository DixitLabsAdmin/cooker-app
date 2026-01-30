import { useState, useEffect } from 'react';
import { mealDBService } from '../../services/mealDBService';
import { supabase } from '../../services/supabase';

export default function MealIdeas() {
  const [meals, setMeals] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [ingredientStatus, setIngredientStatus] = useState({});
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [viewMode, setViewMode] = useState('inventory');
  
  // AI Features
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    loadFilters();
    loadInventory();
    loadInventoryBasedMeals();
  }, []);

  const loadInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('Error loading inventory:', error);
      setInventory([]);
    }
  };

  const loadFilters = async () => {
    const [cats, ars] = await Promise.all([
      mealDBService.listCategories(),
      mealDBService.listAreas(),
    ]);
    setCategories(cats);
    setAreas(ars);
  };

  const checkIngredientStatus = (ingredients) => {
    const status = {};
    
    ingredients.forEach((ingredient, idx) => {
      const ingName = ingredient.name.toLowerCase();
      const inventoryItem = inventory.find(invItem => {
        const invName = invItem.name.toLowerCase();
        return invName.includes(ingName) || ingName.includes(invName);
      });
      
      status[idx] = {
        available: !!inventoryItem,
        inventoryItem: inventoryItem
      };
    });
    
    setIngredientStatus(status);
  };

  const addMissingToShoppingList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const missingIngredients = selectedMeal.ingredients?.filter((ing, idx) => {
        return !ingredientStatus[idx]?.available;
      }) || [];

      if (missingIngredients.length === 0) {
        alert('You have all ingredients in your inventory!');
        return;
      }

      const shoppingItems = missingIngredients.map(ing => ({
        user_id: user.id,
        name: ing.name,
        amount: parseFloat(ing.measure.match(/[\d.]+/)?.[0] || 1),
        unit: ing.measure.replace(/[\d.]+/g, '').trim() || 'item',
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

  const loadInventoryBasedMeals = async () => {
    setLoading(true);
    setViewMode('inventory');
    try {
      // Load inventory directly
      const { data: items, error } = await supabase
        .from('inventory_items')
        .select('*');
      
      if (error) throw error;
      
      if (!items || items.length === 0) {
        setMeals([]);
        return;
      }

      // Get main ingredients from inventory - SEARCH MORE INGREDIENTS
      const mainIngredients = extractMainIngredients(items);
      
      console.log('🔍 Searching ENTIRE MealDB database with ingredients:', mainIngredients);
      
      if (mainIngredients.length === 0) {
        // If no main ingredients, show latest meals
        const latest = await mealDBService.getLatestMeals();
        setMeals(latest);
        return;
      }

      // EXPANDED SEARCH - Search by ALL main ingredients found
      const allRecipes = [];
      
      // Search by MORE ingredients (all of them, not just 5)
      for (const ingredient of mainIngredients) {
        console.log(`🔍 Searching MealDB for: ${ingredient}`);
        try {
          const recipes = await mealDBService.filterByIngredient(ingredient);
          console.log(`✅ Found ${recipes.length} recipes for ${ingredient}`);
          allRecipes.push(...recipes);
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Error searching for ${ingredient}:`, err);
        }
      }

      // Remove duplicates
      const uniqueRecipes = Array.from(
        new Map(allRecipes.map(r => [r.id, r])).values()
      );

      console.log(`📊 Got ${uniqueRecipes.length} unique recipes from ENTIRE MealDB database`);

      // Fetch full details for MANY more recipes (increased from 15 to 50)
      const detailedRecipes = [];
      for (const recipe of uniqueRecipes.slice(0, 50)) {
        try {
          const fullRecipe = await mealDBService.getMealById(recipe.id);
          if (fullRecipe && fullRecipe.ingredients) {
            detailedRecipes.push(fullRecipe);
          }
          
          // Small delay
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          console.error(`Error fetching recipe ${recipe.id}:`, err);
        }
      }

      console.log(`✅ Fetched ${detailedRecipes.length} detailed recipes from MealDB`);

      // Calculate match percentage
      const scoredRecipes = detailedRecipes.map(recipe => {
        const recipeIngredients = recipe.ingredients?.map(i => i.name.toLowerCase()) || [];
        const availableIngredients = items.map(item => item.name.toLowerCase());
        
        // Enhanced matching logic
        const matchCount = recipeIngredients.filter(recipeIng => {
          return availableIngredients.some(userIng => {
            // Direct match
            if (recipeIng === userIng) return true;
            
            // Contains match (either direction)
            if (recipeIng.includes(userIng) || userIng.includes(recipeIng)) return true;
            
            // Word-by-word matching
            const recipeWords = recipeIng.split(/[\s,]+/).filter(w => w.length > 3);
            const userWords = userIng.split(/[\s,]+/).filter(w => w.length > 3);
            
            const hasCommonWord = recipeWords.some(rWord => 
              userWords.some(uWord => 
                rWord.includes(uWord) || uWord.includes(rWord)
              )
            );
            
            if (hasCommonWord) return true;
            
            // Common ingredient variations
            const variations = {
              'chicken': ['chicken breast', 'chicken thigh', 'chicken leg', 'chicken tender', 'whole chicken', 'chicken quarter'],
              'beef': ['ground beef', 'beef steak', 'beef roast', 'stewing beef', 'beef chuck'],
              'pork': ['pork chop', 'pork loin', 'pork shoulder', 'ground pork'],
              'rice': ['white rice', 'brown rice', 'basmati rice', 'jasmine rice', 'long grain rice'],
              'onion': ['onions', 'yellow onion', 'red onion', 'white onion', 'sweet onion'],
              'tomato': ['tomatoes', 'cherry tomatoes', 'roma tomatoes', 'plum tomatoes'],
              'milk': ['whole milk', 'skim milk', '2% milk', 'milk gallon'],
            };
            
            for (const [base, vars] of Object.entries(variations)) {
              if (recipeIng.includes(base)) {
                if (userIng.includes(base)) return true;
                if (vars.some(v => userIng.includes(v))) return true;
              }
            }
            
            return false;
          });
        }).length;
        
        const matchPercentage = recipeIngredients.length > 0
          ? Math.round((matchCount / recipeIngredients.length) * 100)
          : 0;

        return {
          ...recipe,
          matchPercentage,
          matchCount,
          totalIngredients: recipeIngredients.length,
          missingCount: recipeIngredients.length - matchCount
        };
      });

      // Sort by match percentage (highest first)
      scoredRecipes.sort((a, b) => b.matchPercentage - a.matchPercentage);

      console.log(`🎯 Top matches:`);
      scoredRecipes.slice(0, 5).forEach(r => {
        console.log(`  ${r.matchPercentage}% - ${r.name} (${r.matchCount}/${r.totalIngredients})`);
      });

      setMeals(scoredRecipes);
    } catch (error) {
      console.error('Error loading inventory-based meals:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractMainIngredients = (inventoryItems) => {
    const mainIngredientKeywords = [
      'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'turkey', 'lamb',
      'rice', 'pasta', 'noodles', 'bread', 'potato', 
      'tomato', 'onion', 'garlic', 'cheese', 'egg'
    ];

    const found = [];
    for (const keyword of mainIngredientKeywords) {
      if (inventoryItems.some(item => item.name.toLowerCase().includes(keyword))) {
        found.push(keyword);
      }
    }

    return found;
  };

  const loadLatestMeals = async () => {
    setLoading(true);
    setViewMode('latest');
    try {
      const latest = await mealDBService.getLatestMeals();
      setMeals(latest.map(m => ({ ...m, matchPercentage: undefined })));
    } catch (error) {
      console.error('Error loading latest meals:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRandomMeals = async () => {
    setLoading(true);
    setViewMode('random');
    try {
      const random = await mealDBService.getRandomMeals();
      setMeals(random.map(m => ({ ...m, matchPercentage: undefined })));
    } catch (error) {
      console.error('Error loading random meals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery && !selectedCategory && !selectedArea) {
      loadInventoryBasedMeals();
      return;
    }

    setLoading(true);
    setViewMode('search');
    try {
      const results = await mealDBService.advancedSearch({
        name: searchQuery,
        category: selectedCategory,
        area: selectedArea,
      });
      setMeals(results.map(m => ({ ...m, matchPercentage: undefined })));
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = async (category) => {
    setSelectedCategory(category);
    setLoading(true);
    setViewMode('browse');
    try {
      const results = await mealDBService.filterByCategory(category);
      setMeals(results.map(m => ({ ...m, matchPercentage: undefined })));
    } catch (error) {
      console.error('Error filtering by category:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAreaClick = async (area) => {
    setSelectedArea(area);
    setLoading(true);
    setViewMode('browse');
    try {
      const results = await mealDBService.filterByArea(area);
      setMeals(results.map(m => ({ ...m, matchPercentage: undefined })));
    } catch (error) {
      console.error('Error filtering by area:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAIPrompt = async () => {
    if (!aiPrompt.trim()) return;

    setAiLoading(true);
    try {
      const results = await mealDBService.searchByName(aiPrompt);
      
      if (results.length > 0) {
        setMeals(results.map(m => ({ ...m, matchPercentage: undefined })));
        setViewMode('search');
        setAiPrompt('');
      } else {
        alert('No recipes found. Try a different search term!');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleImportRecipe = async (meal) => {
    try {
      console.log('🔄 Starting import for:', meal);
      
      const fullMealResponse = await mealDBService.getMealById(meal.id);
      console.log('📦 Full meal data:', fullMealResponse);
      
      if (!fullMealResponse) {
        alert('Could not load recipe details');
        return;
      }

      const fullMeal = fullMealResponse;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const ing = fullMeal.ingredients?.[i - 1]?.name || fullMeal[`strIngredient${i}`];
        const meas = fullMeal.ingredients?.[i - 1]?.measure || fullMeal[`strMeasure${i}`];
        
        if (ing && ing.trim()) {
          const parts = (meas || '1').trim().match(/^([\d.\/]+)\s*(.*)$/);
          ingredients.push({
            name: ing.trim(),
            amount: parts ? parseFloat(parts[1]) || 1 : 1,
            unit: parts && parts[2] ? parts[2].trim() : 'item',
          });
        }
      }
      
      console.log('✅ Parsed ingredients:', ingredients.length);
      
      const recipeName = fullMeal.name || fullMeal.strMeal || meal.name || 'Imported Recipe';
      const recipeCategory = fullMeal.category || fullMeal.strCategory || 'Other';
      const recipeArea = fullMeal.area || fullMeal.strArea || 'International';
      const recipeInstructions = fullMeal.instructions || fullMeal.strInstructions || 'See source';
      const recipeImage = fullMeal.thumbnail || fullMeal.strMealThumb || null;
      const recipeVideo = fullMeal.youtube || fullMeal.strYoutube || null;
      const recipeSource = fullMeal.source || fullMeal.strSource || null;
      const recipeTags = fullMeal.tags || (fullMeal.strTags ? fullMeal.strTags.split(',') : []);
      const recipeId = fullMeal.id || fullMeal.idMeal || fullMeal.externalId || meal.id;
      
      console.log('📝 Recipe data:', { name: recipeName, category: recipeCategory });
      
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          user_id: user.id,
          name: recipeName,
          description: `${recipeCategory} from ${recipeArea}`,
          cuisine: recipeArea,
          category: recipeCategory,
          difficulty: 'Medium',
          cooking_time: 30,
          servings: 4,
          instructions: recipeInstructions,
          total_calories: 400,
          total_protein: 25,
          total_carbs: 40,
          total_fat: 15,
          source: 'MealDB',
          source_id: String(recipeId),
          source_url: recipeSource,
          image_url: recipeImage,
          video_url: recipeVideo,
          tags: recipeTags,
        })
        .select()
        .maybeSingle();
      
      if (recipeError) throw recipeError;
      
      console.log('✅ Recipe created:', recipe.id);
      
      if (ingredients.length > 0) {
        await supabase
          .from('recipe_ingredients')
          .insert(ingredients.map(ing => ({
            recipe_id: recipe.id,
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
          })));
        
        console.log('✅ Ingredients added:', ingredients.length);
      }

      alert(`✅ "${recipeName}" imported successfully!`);
      setSelectedMeal(null);
    } catch (error) {
      console.error('❌ Import failed:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleViewDetails = async (meal) => {
    setLoading(true);
    try {
      const fullMeal = await mealDBService.getMealById(meal.id);
      setSelectedMeal({ ...fullMeal, matchPercentage: meal.matchPercentage });
      checkIngredientStatus(fullMeal.ingredients || []);
    } catch (error) {
      console.error('Error loading meal details:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedArea('');
    loadInventoryBasedMeals();
  };

  const missingCount = selectedMeal ? 
    selectedMeal.ingredients?.filter((_, idx) => !ingredientStatus[idx]?.available).length || 0 
    : 0;

  return (
    <div className="space-y-6">
      {/* AI Assistant Panel */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">🤖 AI Meal Assistant</h2>
        <p className="text-purple-100 mb-4 text-sm">
          Search for recipes or ask: "What can I make with chicken?"
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAIPrompt()}
            placeholder="e.g., 'pasta recipes' or 'chicken dishes'"
            className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-300"
            disabled={aiLoading}
          />
          <button
            onClick={handleAIPrompt}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-6 py-3 bg-white text-purple-600 rounded-lg hover:bg-purple-50 transition-colors font-medium disabled:opacity-50"
          >
            {aiLoading ? '⏳' : '✨'} Search
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={loadInventoryBasedMeals}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'inventory' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🥗 Based on My Inventory ({inventory.length} items)
          </button>
          <button
            onClick={loadLatestMeals}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'latest' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🆕 Latest Recipes
          </button>
          <button
            onClick={loadRandomMeals}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'random' 
                ? 'bg-purple-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🎲 Random Selection
          </button>
          {(searchQuery || selectedCategory || selectedArea) && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
            >
              ✖️ Clear
            </button>
          )}
        </div>

        {viewMode === 'inventory' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">
              📦 Using Your Inventory ({inventory.length} items)
            </h3>
            <p className="text-sm text-green-700">
              Showing recipes that match ingredients you already have! Higher percentage = fewer items to buy.
            </p>
          </div>
        )}
      </div>

      {/* Categories */}
      {categories.length > 0 && viewMode !== 'inventory' && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Browse by Category</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {categories.slice(0, 12).map(cat => (
              <button
                key={cat.idCategory}
                onClick={() => handleCategoryClick(cat.strCategory)}
                className={`p-3 rounded-lg text-center transition-all ${
                  selectedCategory === cat.strCategory
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.strCategoryThumb && (
                  <img
                    src={cat.strCategoryThumb}
                    alt={cat.strCategory}
                    className="w-12 h-12 mx-auto rounded-lg object-cover mb-1"
                  />
                )}
                <div className="text-sm font-medium">{cat.strCategory}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      ) : meals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meals.map(meal => (
            <div
              key={meal.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow cursor-pointer"
              onClick={() => handleViewDetails(meal)}
            >
              <div className="relative">
                {meal.thumbnail && (
                  <img
                    src={meal.thumbnail}
                    alt={meal.name}
                    className="w-full h-48 object-cover"
                  />
                )}
                {meal.matchPercentage !== undefined && (
                  <div className={`absolute top-2 right-2 px-3 py-1 rounded-full text-sm font-bold ${
                    meal.matchPercentage >= 70 ? 'bg-green-600 text-white' :
                    meal.matchPercentage >= 40 ? 'bg-yellow-500 text-white' :
                    'bg-red-500 text-white'
                  }`}>
                    {meal.matchPercentage}% Match
                  </div>
                )}
              </div>
              
              <div className="p-4">
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{meal.name}</h3>
                
                {meal.matchPercentage !== undefined && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>You have {meal.matchCount} of {meal.totalIngredients}</span>
                      <span>Need {meal.missingCount}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          meal.matchPercentage >= 70 ? 'bg-green-500' :
                          meal.matchPercentage >= 40 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${meal.matchPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {meal.category && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                      {meal.category}
                    </span>
                  )}
                  {meal.area && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      🌍 {meal.area}
                    </span>
                  )}
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleImportRecipe(meal);
                  }}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  ➕ Import Recipe
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">🍽️</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {viewMode === 'inventory' 
              ? 'No matching recipes found'
              : 'No recipes found'
            }
          </h3>
          <p className="text-gray-600 mb-4">
            {viewMode === 'inventory' 
              ? 'Try adding more items to your inventory or browse all recipes'
              : 'Try a different search or browse categories'
            }
          </p>
          {viewMode === 'inventory' && inventory.length === 0 && (
            <p className="text-sm text-gray-500 mb-4">
              💡 Tip: Add items to your inventory first to get personalized suggestions!
            </p>
          )}
          {viewMode === 'inventory' && (
            <button
              onClick={loadLatestMeals}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Browse All Recipes
            </button>
          )}
        </div>
      )}

      {/* Recipe Detail Modal - SCROLLABLE WITH FIXED HEADER */}
      {selectedMeal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* FIXED HEADER */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedMeal.name}</h3>
                {selectedMeal.matchPercentage !== undefined && (
                  <p className="text-sm text-green-600 mt-1">
                    ✨ {selectedMeal.matchPercentage}% match • Missing {missingCount} ingredient{missingCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedMeal(null)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {/* SCROLLABLE CONTENT */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {/* IMAGE - Fits between header and content */}
              {selectedMeal.thumbnail && (
                <img
                  src={selectedMeal.thumbnail}
                  alt={selectedMeal.name}
                  className="w-full h-64 object-cover rounded-xl"
                />
              )}

              {/* KEY FACTS: Tags + Nutrition */}
              <div className="flex flex-wrap gap-4 items-start">
                {/* Tags/Categories */}
                <div className="flex flex-wrap gap-2 flex-1">
                  {selectedMeal.category && (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      {selectedMeal.category}
                    </span>
                  )}
                  {selectedMeal.area && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      🌍 {selectedMeal.area}
                    </span>
                  )}
                  {selectedMeal.tags?.map(tag => (
                    <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* NUTRITION INFO from MealDB */}
                {(selectedMeal.calories || selectedMeal.protein || selectedMeal.carbs || selectedMeal.fat) && (
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-2">Nutrition</div>
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      {selectedMeal.calories && (
                        <div>
                          <div className="font-bold text-green-600">{selectedMeal.calories}</div>
                          <div className="text-gray-600">cal</div>
                        </div>
                      )}
                      {selectedMeal.protein && (
                        <div>
                          <div className="font-bold text-blue-600">{selectedMeal.protein}g</div>
                          <div className="text-gray-600">protein</div>
                        </div>
                      )}
                      {selectedMeal.carbs && (
                        <div>
                          <div className="font-bold text-yellow-600">{selectedMeal.carbs}g</div>
                          <div className="text-gray-600">carbs</div>
                        </div>
                      )}
                      {selectedMeal.fat && (
                        <div>
                          <div className="font-bold text-red-600">{selectedMeal.fat}g</div>
                          <div className="text-gray-600">fat</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* INGREDIENTS */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-bold text-gray-900">🛒 Ingredients</h4>
                  {missingCount > 0 && (
                    <button
                      onClick={addMissingToShoppingList}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                    >
                      🛒 Add {missingCount} Missing to Shopping List
                    </button>
                  )}
                </div>
                {/* 2 COLUMN LAYOUT */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedMeal.ingredients?.map((ing, idx) => {
                    const status = ingredientStatus[idx] || {};
                    const isAvailable = status.available;
                    return (
                      <div key={idx} className={`flex items-center gap-2 p-2 rounded-lg ${
                        isAvailable ? 'bg-green-50' : 'bg-red-50'
                      }`}>
                        <span className="text-xl">{isAvailable ? '✅' : '❌'}</span>
                        <div className="flex-1">
                          <span className="font-medium text-sm">{ing.measure}</span>
                          <span className="text-gray-700 text-sm ml-1">{ing.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* INSTRUCTIONS */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">👨‍🍳 Instructions</h4>
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {selectedMeal.instructions}
                </p>
              </div>

              {/* EXTERNAL LINKS */}
              <div className="flex gap-3">
                {selectedMeal.youtube && (
                  <a
                    href={selectedMeal.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    📺 Watch Video
                  </a>
                )}
                {selectedMeal.source && (
                  <a
                    href={selectedMeal.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    🔗 View Source
                  </a>
                )}
              </div>

              {/* IMPORT BUTTON */}
              <button
                onClick={() => handleImportRecipe(selectedMeal)}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg"
              >
                ➕ Import to My Recipes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}