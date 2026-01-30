import { useState, useEffect } from 'react';
import { mealScheduleService } from '../../services/mealSchedule';

export default function NutritionReport() {
  const [timePeriod, setTimePeriod] = useState(7); // 1, 3, 5, or 7 days
  const [summary, setSummary] = useState(null);
  const [dailyBreakdown, setDailyBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [timePeriod]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryData, breakdownData] = await Promise.all([
        mealScheduleService.getConsumedMealsSummary(timePeriod),
        mealScheduleService.getDailyBreakdown(timePeriod),
      ]);
      setSummary(summaryData);
      setDailyBreakdown(breakdownData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getMealTypeEmoji = (mealType) => {
    const emojis = {
      breakfast: '🌅',
      lunch: '🌞',
      dinner: '🌙',
      snack: '🍎',
    };
    return emojis[mealType] || '🍽️';
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Nutrition Report</h2>
        <p className="text-sm text-gray-600 mt-1">
          Track your consumed meals and nutrition
        </p>
      </div>

      {/* Time Period Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium mb-2">Time Period</label>
        <div className="grid grid-cols-4 gap-2">
          {[1, 3, 5, 7].map((days) => (
            <button
              key={days}
              onClick={() => setTimePeriod(days)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timePeriod === days
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {days === 1 ? 'Today' : `${days} Days`}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <>
          {/* Total Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">
              Summary - Last {timePeriod === 1 ? 'Day' : `${timePeriod} Days`}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Meals Consumed</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {summary.summary.totalMeals}
                </p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600">Total Calories</p>
                <p className="text-3xl font-bold text-green-900 mt-1">
                  {summary.summary.total.calories}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">Total Protein</p>
                <p className="text-3xl font-bold text-blue-900 mt-1">
                  {summary.summary.total.protein}g
                </p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-600">Total Carbs</p>
                <p className="text-3xl font-bold text-yellow-900 mt-1">
                  {summary.summary.total.carbs}g
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-red-600">Total Fat</p>
                <p className="text-3xl font-bold text-red-900 mt-1">
                  {summary.summary.total.fat}g
                </p>
              </div>
            </div>
          </div>

          {/* Daily Averages */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Daily Averages</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600">Avg Calories</p>
                <p className="text-2xl font-bold text-green-900 mt-1">
                  {summary.summary.daily.calories}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">Avg Protein</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">
                  {summary.summary.daily.protein}g
                </p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-600">Avg Carbs</p>
                <p className="text-2xl font-bold text-yellow-900 mt-1">
                  {summary.summary.daily.carbs}g
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-red-600">Avg Fat</p>
                <p className="text-2xl font-bold text-red-900 mt-1">
                  {summary.summary.daily.fat}g
                </p>
              </div>
            </div>
          </div>

          {/* Daily Breakdown Chart */}
          {dailyBreakdown.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Daily Breakdown</h3>
              <div className="space-y-3">
                {dailyBreakdown.map((day) => (
                  <div key={day.date} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {formatDate(day.date)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {day.meals} meal{day.meals !== 1 ? 's' : ''} consumed
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-green-600">
                          {day.calories} cal
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-blue-50 p-2 rounded text-center">
                        <p className="text-blue-900 font-semibold">{day.protein}g</p>
                        <p className="text-blue-600 text-xs">Protein</p>
                      </div>
                      <div className="bg-yellow-50 p-2 rounded text-center">
                        <p className="text-yellow-900 font-semibold">{day.carbs}g</p>
                        <p className="text-yellow-600 text-xs">Carbs</p>
                      </div>
                      <div className="bg-red-50 p-2 rounded text-center">
                        <p className="text-red-900 font-semibold">{day.fat}g</p>
                        <p className="text-red-600 text-xs">Fat</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consumed Meals List */}
          {summary.meals.length > 0 ? (
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Consumed Meals</h3>
              </div>
              <div className="divide-y">
                {summary.meals.map((meal) => (
                  <div key={meal.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl">
                            {getMealTypeEmoji(meal.meal_type)}
                          </span>
                          <div>
                            <p className="font-medium text-gray-900">
                              {meal.recipes?.name || 'Unknown Recipe'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {formatDate(meal.scheduled_date)} • {meal.meal_type}
                            </p>
                          </div>
                        </div>
                        {meal.recipes && (
                          <div className="ml-10 text-sm text-gray-600">
                            <p>
                              {Math.round(meal.recipes.total_calories * meal.servings)} cal •{' '}
                              P: {Math.round(meal.recipes.total_protein * meal.servings)}g •{' '}
                              C: {Math.round(meal.recipes.total_carbs * meal.servings)}g •{' '}
                              F: {Math.round(meal.recipes.total_fat * meal.servings)}g
                            </p>
                            {meal.servings > 1 && (
                              <p className="text-xs text-gray-500 mt-1">
                                {meal.servings} serving{meal.servings !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          Consumed ✓
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-gray-500 mb-4">No consumed meals in this period</p>
              <p className="text-sm text-gray-400">
                Mark meals as completed in the Meal Calendar to track your nutrition
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}