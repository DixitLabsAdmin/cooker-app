import { useState, useEffect } from 'react';
import { mealScheduleService } from '../../services/mealSchedule';
import { recipeService } from '../../services/recipes';
import { shoppingListService } from '../../services/shoppingList';
import { calendarService } from '../../services/calendarService';
import { calendarToShoppingListService } from '../../services/calendarToShoppingList'; // NEW

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

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];

  useEffect(() => {
    loadWeekData();
  }, [currentWeekStart]);

  // Get start of week (Monday)
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
  }

  // Get date for specific day of week
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

      // Organize schedule by date and meal type
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

  const handleAddMeal = (dayIndex, mealType) => {
    setSelectedSlot({
      date: getDateForDay(dayIndex),
      mealType: mealType,
    });
    setShowRecipeModal(true);
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
      loadWeekData();
    } catch (err) {
      alert('Error scheduling meal: ' + err.message);
    }
  };

  const handleRemoveMeal = async (mealId) => {
    if (!window.confirm('Remove this meal from your schedule?')) {
      return;
    }

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

  // NEW: Add single meal to shopping list
  const handleAddMealToShoppingList = async (mealId, mealName, event) => {
    event.stopPropagation(); // Prevent other click events
    
    if (!window.confirm(`Add all ingredients from "${mealName}" to shopping list?`)) {
      return;
    }

    try {
      const result = await calendarToShoppingListService.addMealToShoppingList(mealId);
      
      let message = `✅ Added ${result.addedCount} ingredients to shopping list!`;
      
      if (result.failedCount > 0) {
        message += `\n\n⚠️ Could not add: ${result.failedItems.join(', ')}`;
      }
      
      alert(message);
    } catch (error) {
      console.error('Error adding to shopping list:', error);
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

      // Add to shopping list
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

  const handleViewAvailability = (date, mealType) => {
    const key = `${date}_${mealType}`;
    const availability = availabilityMap[key];
    
    if (availability) {
      setSelectedMealAvailability(availability);
      setShowAvailabilityModal(true);
    }
  };

  const handleQuickAddMissing = async () => {
    if (!selectedMealAvailability || !selectedMealAvailability.missingIngredients) {
      return;
    }

    try {
      const meal = schedule[selectedMealAvailability.recipe?.scheduled_date]?.[selectedMealAvailability.recipe?.meal_type];
      const itemsAdded = await calendarService.quickAddMissingIngredients(
        selectedMealAvailability.missingIngredients,
        meal?.scheduled_date || new Date().toISOString().split('T')[0]
      );

      alert(`Added ${itemsAdded.length} missing ingredients to your shopping list!`);
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
    
    if (!availability) {
      return calendarService.getAvailabilityColor('unknown');
    }
    
    return calendarService.getAvailabilityColor(availability.status);
  };

  if (loading && !weekSummary) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading calendar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Meal Calendar</h2>
          <p className="text-sm text-gray-600 mt-1">
            Plan your week of meals • Color-coded for ingredient availability
          </p>
        </div>
        <button
          onClick={handleGenerateShoppingList}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          📋 Generate Shopping List
        </button>
      </div>

      {/* Availability Legend */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-2 text-sm">Ingredient Availability Legend:</h3>
        <div className="flex gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span>🟢</span>
            <span className="text-gray-600">All available</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🟡</span>
            <span className="text-gray-600">Some missing</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🔴</span>
            <span className="text-gray-600">Most missing</span>
          </div>
          <div className="flex items-center gap-2">
            <span>⚪</span>
            <span className="text-gray-600">Unknown</span>
          </div>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex justify-between items-center bg-white rounded-lg shadow p-4">
        <button
          onClick={handlePreviousWeek}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          ← Previous Week
        </button>
        <div className="text-center">
          <p className="text-lg font-semibold">
            {currentWeekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {' - '}
            {new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={handleNextWeek}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Next Week →
        </button>
      </div>

      {/* Week Summary */}
      {weekSummary && weekSummary.totalMeals > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3">Week Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Total Meals</p>
              <p className="text-xl font-bold text-gray-900">{weekSummary.totalMeals}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Daily Avg Calories</p>
              <p className="text-xl font-bold text-green-900">{weekSummary.daily.calories}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Daily Avg Protein</p>
              <p className="text-xl font-bold text-blue-900">{weekSummary.daily.protein}g</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Daily Avg Carbs</p>
              <p className="text-xl font-bold text-yellow-900">{weekSummary.daily.carbs}g</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Daily Avg Fat</p>
              <p className="text-xl font-bold text-red-900">{weekSummary.daily.fat}g</p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-32">
                Meal Type
              </th>
              {daysOfWeek.map((day, index) => (
                <th key={day} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 min-w-[180px]">
                  <div>{day}</div>
                  <div className="text-xs font-normal text-gray-500">
                    {formatDate(getDateForDay(index))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mealTypes.map((mealType) => (
              <tr key={mealType} className="border-b hover:bg-gray-50">
                <td className="px-4 py-4 font-medium text-gray-700 capitalize bg-gray-50">
                  {mealType}
                </td>
                {daysOfWeek.map((day, dayIndex) => {
                  const date = getDateForDay(dayIndex);
                  const meal = schedule[date]?.[mealType];
                  const availabilityInfo = getMealAvailabilityInfo(date, mealType);

                  return (
                    <td key={`${date}-${mealType}`} className="px-2 py-2 align-top">
                      {meal ? (
                        <div className={`border-2 rounded p-2 min-h-[80px] ${
                          meal.is_completed 
                            ? 'bg-gray-100 border-gray-300' 
                            : `${availabilityInfo.bg} ${availabilityInfo.border}`
                        }`}>
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-start gap-1 flex-1">
                              {!meal.is_completed && (
                                <span className="text-sm" title={availabilityInfo.text}>
                                  {availabilityInfo.indicator}
                                </span>
                              )}
                              <p className={`text-sm font-medium line-clamp-2 ${
                                meal.is_completed ? 'text-gray-500 line-through' : 'text-gray-900'
                              }`}>
                                {meal.recipes?.name || 'Unknown Recipe'}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveMeal(meal.id)}
                              className="text-red-600 hover:text-red-800 ml-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
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
                              {/* NEW: Add to Shopping List Button */}
                              <button
                                onClick={(e) => handleAddMealToShoppingList(meal.id, meal.recipes?.name, e)}
                                className="w-full px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
                                title="Add ingredients to shopping list"
                              >
                                <span>📋</span>
                                Add to List
                              </button>
                              <button
                                onClick={() => handleViewAvailability(date, mealType)}
                                className="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                              >
                                📊 Check Availability
                              </button>
                              <button
                                onClick={() => handleMarkConsumed(meal.id)}
                                className="w-full px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                              >
                                ✓ Mark Consumed
                              </button>
                            </div>
                          )}
                          {meal.is_completed && (
                            <div className="mt-2 text-center">
                              <span className="text-xs text-gray-500">✓ Consumed</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddMeal(dayIndex, mealType)}
                          className="w-full min-h-[80px] border-2 border-dashed border-gray-300 rounded hover:border-green-500 hover:bg-green-50 transition-colors flex items-center justify-center text-gray-400 hover:text-green-600"
                        >
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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Select a Recipe</h3>
            
            <div className="space-y-2 mb-4">
              {recipes.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No recipes available. Create some recipes first!
                </p>
              ) : (
                recipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    onClick={() => handleSelectRecipe(recipe)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 cursor-pointer transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{recipe.name}</h4>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {recipe.description}
                        </p>
                        <div className="flex gap-2 mt-2 text-xs">
                          {recipe.cuisine && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                              {recipe.cuisine}
                            </span>
                          )}
                          {recipe.difficulty && (
                            <span className={`px-2 py-1 rounded ${
                              recipe.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                              recipe.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {recipe.difficulty}
                            </span>
                          )}
                          {recipe.cooking_time && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                              ⏱️ {recipe.cooking_time} min
                            </span>
                          )}
                        </div>
                      </div>
                      {recipe.total_calories && (
                        <div className="ml-4 text-right">
                          <p className="text-lg font-bold text-gray-900">
                            {Math.round(recipe.total_calories)}
                          </p>
                          <p className="text-xs text-gray-500">calories</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => {
                setShowRecipeModal(false);
                setSelectedSlot(null);
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ingredient Availability Modal */}
      {showAvailabilityModal && selectedMealAvailability && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold">Ingredient Availability</h3>
              <button
                onClick={() => {
                  setShowAvailabilityModal(false);
                  setSelectedMealAvailability(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedMealAvailability.recipe && (
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">
                  {selectedMealAvailability.recipe.name}
                </h4>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">
                    {calendarService.getAvailabilityColor(selectedMealAvailability.status).indicator}
                  </span>
                  <span className="text-sm text-gray-600">
                    {calendarService.getAvailabilityColor(selectedMealAvailability.status).text}
                  </span>
                </div>
                {selectedMealAvailability.availabilityPercentage !== undefined && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Availability</span>
                      <span>{Math.round(selectedMealAvailability.availabilityPercentage)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          selectedMealAvailability.availabilityPercentage >= 90 ? 'bg-green-500' :
                          selectedMealAvailability.availabilityPercentage >= 50 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${selectedMealAvailability.availabilityPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Note about MealDB API integration */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Detailed ingredient checking will be available once MealDB API integration is complete. 
                Currently showing placeholder availability status.
              </p>
            </div>

            {selectedMealAvailability.missingIngredients && selectedMealAvailability.missingIngredients.length > 0 ? (
              <>
                <div className="mb-4">
                  <h5 className="font-semibold text-sm mb-2">Missing Ingredients:</h5>
                  <ul className="space-y-1">
                    {selectedMealAvailability.missingIngredients.map((ingredient, idx) => (
                      <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-red-500">•</span>
                        <span>{ingredient.name} ({ingredient.amount} {ingredient.unit})</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={handleQuickAddMissing}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  ➕ Quick Add to Shopping List
                </button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-600">
                  {selectedMealAvailability.status === 'available' 
                    ? '✓ All ingredients are available!' 
                    : 'Ingredient details will be available after MealDB API integration.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}