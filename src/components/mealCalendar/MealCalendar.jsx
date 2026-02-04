import { useState, useEffect } from 'react';
import { mealScheduleService } from '../../services/mealSchedule';
import { recipeService } from '../../services/recipes';
import { shoppingListService } from '../../services/shoppingList';
import { calendarService } from '../../services/calendarService';
import { calendarToShoppingListService } from '../../services/calendarToShoppingList';
import { mealDbService } from '../../services/mealDb';
import { supabase } from '../../services/supabase';

export default function MealCalendar() {
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(new Date()));
  const [schedule, setSchedule] = useState({});
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [weekSummary, setWeekSummary] = useState(null);
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [selectedMealAvailability, setSelectedMealAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(false);
  const [deletingRecipeId, setDeletingRecipeId] = useState(null);

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];

  const mealTypeLabels = {
    breakfast: '🌅 Breakfast',
    lunch: '☀️ Lunch', 
    dinner: '🌙 Dinner',
    snack: '🍿 Snack'
  };

  useEffect(() => {
    loadWeekData();
  }, [currentWeekStart]);

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  function getDateForDay(dayIndex) {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + dayIndex);
    return date.toISOString().split('T')[0];
  }

  const loadWeekData = async () => {
    try {
      setLoading(true);
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const [scheduleData, recipesData, summaryData, availability] = await Promise.all([
        mealScheduleService.getWeekSchedule(
          currentWeekStart.toISOString().split('T')[0],
          weekEnd.toISOString().split('T')[0]
        ),
        recipeService.getAllRecipes(),
        mealScheduleService.getWeekNutritionSummary(
          currentWeekStart.toISOString().split('T')[0],
          weekEnd.toISOString().split('T')[0]
        ),
        calendarService.checkWeekAvailability(
          currentWeekStart.toISOString().split('T')[0],
          weekEnd.toISOString().split('T')[0]
        )
      ]);

      const organized = {};
      scheduleData.forEach(meal => {
        if (!organized[meal.scheduled_date]) {
          organized[meal.scheduled_date] = {};
        }
        organized[meal.scheduled_date][meal.meal_type] = meal;
      });

      setSchedule(organized);
      setRecipes(recipesData);
      setWeekSummary(summaryData);
      setAvailabilityMap(availability);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const determineMealType = (category, recipeName) => {
    const categoryLower = (category || '').toLowerCase();
    const nameLower = (recipeName || '').toLowerCase();
    
    if (categoryLower.includes('breakfast') || 
        nameLower.includes('breakfast') ||
        nameLower.includes('pancake') ||
        nameLower.includes('waffle') ||
        nameLower.includes('omelette') ||
        nameLower.includes('omelet') ||
        nameLower.includes('eggs benedict') ||
        nameLower.includes('french toast') ||
        nameLower.includes('cereal') ||
        nameLower.includes('porridge') ||
        nameLower.includes('oatmeal')) {
      return 'breakfast';
    }
    
    if (categoryLower.includes('dessert') || 
        categoryLower.includes('snack') ||
        categoryLower.includes('starter') ||
        categoryLower.includes('side') ||
        nameLower.includes('cookie') ||
        nameLower.includes('cake') ||
        nameLower.includes('brownie') ||
        nameLower.includes('pudding') ||
        nameLower.includes('ice cream') ||
        nameLower.includes('chips') ||
        nameLower.includes('dip')) {
      return 'snack';
    }
    
    if (nameLower.includes('sandwich') ||
        nameLower.includes('salad') ||
        nameLower.includes('soup') ||
        nameLower.includes('wrap') ||
        nameLower.includes('burger')) {
      return 'lunch';
    }
    
    return 'dinner';
  };

  const loadAiSuggestions = async (mealType) => {
    setLoadingAiSuggestions(true);
    setAiSuggestions([]);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inventory } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id);

      if (inventory && inventory.length > 0) {
        const mealDbRecipes = await mealDbService.findRecipesByInventory(inventory);
        
        const filteredSuggestions = mealDbRecipes
          .filter(recipe => {
            const recipeMealType = determineMealType(recipe.strCategory, recipe.strMeal);
            return recipeMealType === mealType;
          })
          .slice(0, 3);

        setAiSuggestions(filteredSuggestions);
      }
    } catch (error) {
      console.error('Error loading AI suggestions:', error);
    } finally {
      setLoadingAiSuggestions(false);
    }
  };

  const handleAddMeal = async (dayIndex, mealType) => {
    setSelectedSlot({
      date: getDateForDay(dayIndex),
      mealType: mealType,
    });
    setShowRecipeModal(true);
    await loadAiSuggestions(mealType);
  };

  const handleSelectRecipe = async (recipe) => {
    try {
      await mealScheduleService.scheduleMeal({
        recipe_id: recipe.id,
        scheduled_date: selectedSlot.date,
        meal_type: selectedSlot.mealType,
        servings: 1,
      });
      setShowRecipeModal(false);
      setSelectedSlot(null);
      setAiSuggestions([]);
      loadWeekData();
    } catch (err) {
      alert('Error scheduling meal: ' + err.message);
    }
  };

  const handleSelectAiSuggestion = async (suggestion) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const mealType = determineMealType(suggestion.strCategory, suggestion.strMeal);
      
      const recipeData = {
        user_id: user.id,
        name: suggestion.strMeal,
        description: `${suggestion.strCategory} • ${suggestion.strArea} cuisine`,
        instructions: suggestion.fullDetails?.strInstructions || '',
        cuisine: suggestion.strArea,
        difficulty: 'Medium',
        cooking_time: 30,
        servings: 4,
        image_url: suggestion.strMealThumb,
        total_calories: 400,
        total_protein: 30,
        total_carbs: 40,
        total_fat: 15,
        external_id: suggestion.idMeal,
        external_source: 'mealdb',
        is_favorite: false,
        is_active: true,
        meal_type: mealType
      };

      const { data: savedRecipe, error: recipeError } = await supabase
        .from('recipes')
        .insert(recipeData)
        .select()
        .maybeSingle();

      if (recipeError) throw recipeError;

      if (suggestion.ingredients && suggestion.ingredients.length > 0) {
        const ingredientsData = suggestion.ingredients.map((ing, index) => ({
          recipe_id: savedRecipe.id,
          name: ing.name,
          amount: parseFloat(ing.measure) || 1,
          unit: ing.measure || 'item',
          order_index: index
        }));

        await supabase.from('recipe_ingredients').insert(ingredientsData);
      }

      await mealScheduleService.scheduleMeal({
        recipe_id: savedRecipe.id,
        scheduled_date: selectedSlot.date,
        meal_type: selectedSlot.mealType,
        servings: 1,
      });

      setShowRecipeModal(false);
      setSelectedSlot(null);
      setAiSuggestions([]);
      loadWeekData();
      
      alert(`✅ "${suggestion.strMeal}" has been added to your recipes and scheduled!`);
    } catch (err) {
      alert('Error scheduling meal: ' + err.message);
    }
  };

  // NEW: Delete a saved recipe from the modal
  const handleDeleteSavedRecipe = async (recipeId, recipeName, event) => {
    event.stopPropagation(); // Prevent selecting the recipe
    
    if (!window.confirm(`Are you sure you want to delete "${recipeName}"?\n\nThis will also remove it from any scheduled meals.`)) {
      return;
    }

    setDeletingRecipeId(recipeId);

    try {
      // Delete from meal_schedule first (foreign key constraint)
      await supabase
        .from('meal_schedule')
        .delete()
        .eq('recipe_id', recipeId);

      // Delete ingredients
      await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', recipeId);

      // Delete the recipe
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipeId);

      if (error) throw error;

      // Update local state
      setRecipes(prev => prev.filter(r => r.id !== recipeId));
      
      // Reload week data to update calendar
      loadWeekData();

      console.log(`✅ Deleted recipe: ${recipeName}`);
    } catch (err) {
      console.error('Error deleting recipe:', err);
      alert('Error deleting recipe: ' + err.message);
    } finally {
      setDeletingRecipeId(null);
    }
  };

  const handleRemoveMeal = async (mealId) => {
    if (!window.confirm('Remove this meal from your schedule?')) return;

    try {
      await mealScheduleService.deleteScheduledMeal(mealId);
      loadWeekData();
    } catch (err) {
      alert('Error removing meal: ' + err.message);
    }
  };

  const handleMarkConsumed = async (mealId) => {
    try {
      await mealScheduleService.completeMeal(mealId);
      loadWeekData();
    } catch (err) {
      alert('Error marking meal as consumed: ' + err.message);
    }
  };

  const handleAddMealToShoppingList = async (mealId, mealName, event) => {
    event.stopPropagation();
    if (!window.confirm(`Add all ingredients from "${mealName}" to shopping list?`)) return;

    try {
      const result = await calendarToShoppingListService.addMealToShoppingList(mealId);
      let message = `✅ Added ${result.addedCount} ingredients to shopping list!`;
      if (result.failedCount > 0) {
        message += `\n\n⚠️ Could not add: ${result.failedItems.join(', ')}`;
      }
      alert(message);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleGenerateShoppingList = async () => {
    try {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const ingredients = await mealScheduleService.generateShoppingList(
        currentWeekStart.toISOString().split('T')[0],
        weekEnd.toISOString().split('T')[0]
      );

      if (ingredients.length === 0) {
        alert('No meals scheduled this week!');
        return;
      }

      for (const ingredient of ingredients) {
        await shoppingListService.addItem({
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
          calories: ingredient.calories,
          protein: ingredient.protein,
          carbs: ingredient.carbs,
          fat: ingredient.fat,
          category: 'Other',
          notes: 'From meal plan',
        });
      }

      alert(`Added ${ingredients.length} items to your shopping list!`);
    } catch (err) {
      alert('Error generating shopping list: ' + err.message);
    }
  };

  const handleViewAvailability = async (date, mealType) => {
    const meal = schedule[date]?.[mealType];
    if (!meal || !meal.recipes) return;

    setLoadingAvailability(true);
    setShowAvailabilityModal(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inventory } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id);

      const { data: recipeIngredients } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', meal.recipes.id);

      const ingredientStatus = (recipeIngredients || []).map(ingredient => {
        const inventoryMatch = (inventory || []).find(invItem => {
          const invName = invItem.name.toLowerCase().trim();
          const ingName = ingredient.name.toLowerCase().trim();
          return invName.includes(ingName) || ingName.includes(invName);
        });

        return {
          ...ingredient,
          isAvailable: !!inventoryMatch,
          inventoryAmount: inventoryMatch?.amount || 0,
          inventoryUnit: inventoryMatch?.unit || '',
          inventoryName: inventoryMatch?.name || null
        };
      });

      const totalIngredients = ingredientStatus.length;
      const availableCount = ingredientStatus.filter(i => i.isAvailable).length;
      const matchPercentage = totalIngredients > 0 
        ? Math.round((availableCount / totalIngredients) * 100) 
        : 0;

      let status = 'unknown';
      if (totalIngredients > 0) {
        if (matchPercentage >= 90) status = 'available';
        else if (matchPercentage >= 50) status = 'partial';
        else status = 'unavailable';
      }

      setSelectedMealAvailability({
        recipe: meal.recipes,
        mealId: meal.id,
        scheduledDate: date,
        mealType: mealType,
        status,
        matchPercentage,
        totalIngredients,
        availableCount,
        ingredients: ingredientStatus,
        availableIngredients: ingredientStatus.filter(i => i.isAvailable),
        missingIngredients: ingredientStatus.filter(i => !i.isAvailable)
      });
    } catch (error) {
      setSelectedMealAvailability({ error: error.message, status: 'unknown' });
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleQuickAddMissing = async () => {
    if (!selectedMealAvailability?.missingIngredients) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let addedCount = 0;

      for (const ingredient of selectedMealAvailability.missingIngredients) {
        const { error } = await supabase
          .from('shopping_list_items')
          .insert({
            user_id: user.id,
            name: ingredient.name,
            amount: ingredient.amount || 1,
            unit: ingredient.unit || 'item',
            category: 'Recipe Ingredient',
            is_purchased: false
          });
        if (!error) addedCount++;
      }

      alert(`✅ Added ${addedCount} missing ingredients to your shopping list!`);
      setShowAvailabilityModal(false);
      setSelectedMealAvailability(null);
    } catch (err) {
      alert('Error adding ingredients: ' + err.message);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getMealAvailabilityInfo = (date, mealType) => {
    const key = `${date}_${mealType}`;
    const availability = availabilityMap[key];
    if (!availability) return calendarService.getAvailabilityColor('unknown');
    return calendarService.getAvailabilityColor(availability.status);
  };

  const getFilteredRecipes = () => {
    if (!selectedSlot) return [];
    const mealType = selectedSlot.mealType;
    
    const filteredByType = recipes.filter(recipe => {
      if (recipe.meal_type) return recipe.meal_type === mealType;
      const inferredType = determineMealType(recipe.cuisine, recipe.name);
      return inferredType === mealType;
    });

    return filteredByType.sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  if (loading && !weekSummary) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading calendar...</p>
      </div>
    );
  }

  const filteredRecipes = getFilteredRecipes();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Meal Calendar</h2>
          <p className="text-sm text-gray-600 mt-1">Plan your week of meals • Color-coded for ingredient availability</p>
        </div>
        <button onClick={handleGenerateShoppingList} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
          📋 Generate Shopping List
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-2 text-sm">Ingredient Availability Legend:</h3>
        <div className="flex gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-2"><span>🟢</span><span className="text-gray-600">All available</span></div>
          <div className="flex items-center gap-2"><span>🟡</span><span className="text-gray-600">Some missing</span></div>
          <div className="flex items-center gap-2"><span>🔴</span><span className="text-gray-600">Most missing</span></div>
          <div className="flex items-center gap-2"><span>⚪</span><span className="text-gray-600">Unknown</span></div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-white rounded-lg shadow p-4">
        <button onClick={handlePreviousWeek} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">← Previous Week</button>
        <div className="text-center">
          <p className="text-lg font-semibold">
            {currentWeekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {' - '}
            {new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={handleNextWeek} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Next Week →</button>
      </div>

      {weekSummary && weekSummary.totalMeals > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3">Week Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div><p className="text-sm text-gray-600">Total Meals</p><p className="text-xl font-bold text-gray-900">{weekSummary.totalMeals}</p></div>
            <div><p className="text-sm text-gray-600">Daily Avg Calories</p><p className="text-xl font-bold text-green-900">{weekSummary.daily.calories}</p></div>
            <div><p className="text-sm text-gray-600">Daily Avg Protein</p><p className="text-xl font-bold text-blue-900">{weekSummary.daily.protein}g</p></div>
            <div><p className="text-sm text-gray-600">Daily Avg Carbs</p><p className="text-xl font-bold text-yellow-900">{weekSummary.daily.carbs}g</p></div>
            <div><p className="text-sm text-gray-600">Daily Avg Fat</p><p className="text-xl font-bold text-red-900">{weekSummary.daily.fat}g</p></div>
          </div>
        </div>
      )}

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-32">Meal Type</th>
              {daysOfWeek.map((day, index) => (
                <th key={day} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 min-w-[180px]">
                  <div>{day}</div>
                  <div className="text-xs font-normal text-gray-500">{formatDate(getDateForDay(index))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mealTypes.map((mealType) => (
              <tr key={mealType} className="border-b hover:bg-gray-50">
                <td className="px-4 py-4 font-medium text-gray-700 capitalize bg-gray-50">{mealType}</td>
                {daysOfWeek.map((day, dayIndex) => {
                  const date = getDateForDay(dayIndex);
                  const meal = schedule[date]?.[mealType];
                  const availabilityInfo = getMealAvailabilityInfo(date, mealType);

                  return (
                    <td key={`${date}-${mealType}`} className="px-2 py-2 align-top">
                      {meal ? (
                        <div className={`border-2 rounded p-2 min-h-[80px] ${meal.is_completed ? 'bg-gray-100 border-gray-300' : `${availabilityInfo.bg} ${availabilityInfo.border}`}`}>
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-start gap-1 flex-1">
                              {!meal.is_completed && <span className="text-sm" title={availabilityInfo.text}>{availabilityInfo.indicator}</span>}
                              <p className={`text-sm font-medium line-clamp-2 ${meal.is_completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                {meal.recipes?.name || 'Unknown Recipe'}
                              </p>
                            </div>
                            <button onClick={() => handleRemoveMeal(meal.id)} className="text-red-600 hover:text-red-800 ml-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                          {meal.recipes && (
                            <div className="text-xs text-gray-600 space-y-0.5">
                              <p>{Math.round(meal.recipes.total_calories * meal.servings)} cal</p>
                              <p>⏱️ {meal.recipes.cooking_time} min</p>
                              <p>{meal.servings} serving(s)</p>
                            </div>
                          )}
                          {!meal.is_completed && (
                            <div className="mt-2 space-y-1">
                              <button onClick={(e) => handleAddMealToShoppingList(meal.id, meal.recipes?.name, e)} className="w-full px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors flex items-center justify-center gap-1">
                                <span>📋</span>Add to List
                              </button>
                              <button onClick={() => handleViewAvailability(date, mealType)} className="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">📊 Check Availability</button>
                              <button onClick={() => handleMarkConsumed(meal.id)} className="w-full px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors">✓ Mark Consumed</button>
                            </div>
                          )}
                          {meal.is_completed && <div className="mt-2 text-center"><span className="text-xs text-gray-500">✓ Consumed</span></div>}
                        </div>
                      ) : (
                        <button onClick={() => handleAddMeal(dayIndex, mealType)} className="w-full min-h-[80px] border-2 border-dashed border-gray-300 rounded hover:border-green-500 hover:bg-green-50 transition-colors flex items-center justify-center text-gray-400 hover:text-green-600">
                          <span className="text-2xl">+</span>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recipe Selection Modal */}
      {showRecipeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">{mealTypeLabels[selectedSlot?.mealType] || 'Select a Recipe'}</h3>
              <button onClick={() => { setShowRecipeModal(false); setSelectedSlot(null); setAiSuggestions([]); }} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
            </div>

            {/* AI Suggestions Section */}
            {(loadingAiSuggestions || aiSuggestions.length > 0) && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🤖</span>
                  <h4 className="font-semibold text-purple-700">AI Suggestions Based on Your Inventory</h4>
                </div>
                
                {loadingAiSuggestions ? (
                  <div className="flex items-center gap-2 p-4 bg-purple-50 rounded-lg">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                    <span className="text-purple-700">Finding recipes you can make...</span>
                  </div>
                ) : aiSuggestions.length > 0 ? (
                  <div className="space-y-2">
                    {aiSuggestions.map((suggestion) => (
                      <div key={suggestion.idMeal} onClick={() => handleSelectAiSuggestion(suggestion)} className="p-3 border-2 border-purple-200 bg-purple-50 rounded-lg hover:border-purple-400 cursor-pointer transition-all">
                        <div className="flex items-center gap-3">
                          <img src={suggestion.strMealThumb} alt={suggestion.strMeal} className="w-16 h-16 rounded-lg object-cover" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium text-gray-900">{suggestion.strMeal}</h5>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${suggestion.matchPercentage >= 70 ? 'bg-green-100 text-green-700' : suggestion.matchPercentage >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'}`}>
                                {suggestion.matchPercentage}% match
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">{suggestion.strCategory} • {suggestion.strArea}</p>
                          </div>
                          <span className="text-purple-400">→</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">No AI suggestions available. Add items to your inventory to get personalized recommendations!</p>
                )}
              </div>
            )}

            {/* Saved Recipes Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📖</span>
                <h4 className="font-semibold text-gray-700">Your Saved Recipes</h4>
                {filteredRecipes.length > 0 && <span className="text-sm text-gray-500">({filteredRecipes.length} recipes)</span>}
              </div>

              {filteredRecipes.length === 0 ? (
                <p className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">
                  No {selectedSlot?.mealType} recipes saved yet. Save some recipes from the AI Assistant or create your own!
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredRecipes.map((recipe) => (
                    <div key={recipe.id} className={`p-4 border rounded-lg hover:border-green-500 hover:bg-green-50 transition-all ${recipe.is_favorite ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 cursor-pointer" onClick={() => handleSelectRecipe(recipe)}>
                          <div className="flex items-center gap-2">
                            {recipe.is_favorite && <span className="text-yellow-500">⭐</span>}
                            <h4 className="font-medium text-gray-900">{recipe.name}</h4>
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{recipe.description}</p>
                          <div className="flex gap-2 mt-2 text-xs">
                            {recipe.cuisine && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">{recipe.cuisine}</span>}
                            {recipe.difficulty && (
                              <span className={`px-2 py-1 rounded ${recipe.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : recipe.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                {recipe.difficulty}
                              </span>
                            )}
                            {recipe.cooking_time && <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">⏱️ {recipe.cooking_time} min</span>}
                          </div>
                        </div>
                        
                        {/* Right side: Calories and Delete button */}
                        <div className="flex flex-col items-end gap-2 ml-4">
                          {recipe.total_calories > 0 && (
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900">{Math.round(recipe.total_calories)}</p>
                              <p className="text-xs text-gray-500">calories</p>
                            </div>
                          )}
                          {/* Delete button */}
                          <button
                            onClick={(e) => handleDeleteSavedRecipe(recipe.id, recipe.name, e)}
                            disabled={deletingRecipeId === recipe.id}
                            className="px-2 py-1 text-red-600 hover:bg-red-100 rounded text-sm transition-colors disabled:opacity-50"
                            title="Delete recipe"
                          >
                            {deletingRecipeId === recipe.id ? (
                              <span className="flex items-center gap-1">
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                              </span>
                            ) : (
                              '🗑️ Delete'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setShowRecipeModal(false); setSelectedSlot(null); setAiSuggestions([]); }} className="w-full mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Availability Modal */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Ingredient Availability</h3>
              <button onClick={() => { setShowAvailabilityModal(false); setSelectedMealAvailability(null); }} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
            </div>

            <div className="p-6">
              {loadingAvailability ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Checking your inventory...</p>
                </div>
              ) : selectedMealAvailability?.error ? (
                <div className="text-center py-8"><p className="text-red-600">Error: {selectedMealAvailability.error}</p></div>
              ) : selectedMealAvailability ? (
                <div className="space-y-6">
                  {selectedMealAvailability.recipe && (
                    <div className="flex items-center gap-4">
                      {selectedMealAvailability.recipe.image_url && <img src={selectedMealAvailability.recipe.image_url} alt={selectedMealAvailability.recipe.name} className="w-20 h-20 rounded-lg object-cover" />}
                      <div>
                        <h4 className="text-lg font-bold text-gray-900">{selectedMealAvailability.recipe.name}</h4>
                        {selectedMealAvailability.recipe.cuisine && <p className="text-sm text-gray-600">{selectedMealAvailability.recipe.cuisine} cuisine</p>}
                      </div>
                    </div>
                  )}

                  <div className={`rounded-xl p-6 text-center ${selectedMealAvailability.matchPercentage >= 90 ? 'bg-green-50 border-2 border-green-200' : selectedMealAvailability.matchPercentage >= 50 ? 'bg-yellow-50 border-2 border-yellow-200' : 'bg-red-50 border-2 border-red-200'}`}>
                    <div className="flex items-center justify-center gap-3 mb-2">
                      <span className="text-4xl">{calendarService.getAvailabilityColor(selectedMealAvailability.status).indicator}</span>
                      <span className={`text-5xl font-bold ${selectedMealAvailability.matchPercentage >= 90 ? 'text-green-600' : selectedMealAvailability.matchPercentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {selectedMealAvailability.matchPercentage}%
                      </span>
                    </div>
                    <p className="text-gray-700 font-medium">{selectedMealAvailability.availableCount} of {selectedMealAvailability.totalIngredients} ingredients available</p>
                    <p className="text-sm text-gray-500 mt-1">{calendarService.getAvailabilityColor(selectedMealAvailability.status).text}</p>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2"><span>Ingredient Match</span><span>{selectedMealAvailability.matchPercentage}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className={`h-3 rounded-full transition-all ${selectedMealAvailability.matchPercentage >= 90 ? 'bg-green-500' : selectedMealAvailability.matchPercentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${selectedMealAvailability.matchPercentage}%` }}></div>
                    </div>
                  </div>

                  {selectedMealAvailability.availableIngredients?.length > 0 && (
                    <div>
                      <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><span className="text-green-600">✅</span>Ingredients You Have ({selectedMealAvailability.availableIngredients.length})</h5>
                      <div className="space-y-2">
                        {selectedMealAvailability.availableIngredients.map((ingredient, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center gap-3">
                              <span className="text-green-600 text-lg">✓</span>
                              <div>
                                <span className="font-medium text-gray-900">{ingredient.name}</span>
                                <span className="text-gray-600 ml-2">(need {ingredient.amount} {ingredient.unit})</span>
                              </div>
                            </div>
                            <div className="text-right text-sm"><span className="text-green-700 font-medium">{ingredient.inventoryAmount} {ingredient.inventoryUnit} in stock</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedMealAvailability.missingIngredients?.length > 0 && (
                    <div>
                      <h5 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><span className="text-red-600">❌</span>Missing Ingredients ({selectedMealAvailability.missingIngredients.length})</h5>
                      <div className="space-y-2">
                        {selectedMealAvailability.missingIngredients.map((ingredient, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <span className="text-red-600 text-lg">✗</span>
                              <div>
                                <span className="font-medium text-gray-900">{ingredient.name}</span>
                                <span className="text-gray-600 ml-2">({ingredient.amount} {ingredient.unit})</span>
                              </div>
                            </div>
                            <span className="text-red-600 text-sm font-medium">Not in inventory</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedMealAvailability.totalIngredients === 0 && (
                    <div className="text-center py-6 bg-gray-50 rounded-lg">
                      <p className="text-gray-600">No ingredients found for this recipe.</p>
                      <p className="text-sm text-gray-500 mt-1">Try editing the recipe to add ingredients.</p>
                    </div>
                  )}

                  {selectedMealAvailability.missingIngredients?.length > 0 && (
                    <button onClick={handleQuickAddMissing} className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg flex items-center justify-center gap-2">
                      🛒 Add {selectedMealAvailability.missingIngredients.length} Missing Ingredients to Shopping List
                    </button>
                  )}

                  {selectedMealAvailability.matchPercentage === 100 && (
                    <div className="text-center py-4 bg-green-100 rounded-lg">
                      <p className="text-green-800 font-medium text-lg">🎉 You have everything you need!</p>
                      <p className="text-green-700 text-sm mt-1">All ingredients are available in your inventory.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}