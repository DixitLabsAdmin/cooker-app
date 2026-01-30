import { supabase } from './supabase';

export const mealScheduleService = {
  // Get meals for a specific week
  async getWeekSchedule(startDate, endDate) {
    const { data, error } = await supabase
      .from('meal_schedule')
      .select(`
        *,
        recipes (
          id,
          name,
          description,
          total_calories,
          total_protein,
          total_carbs,
          total_fat,
          cooking_time,
          difficulty,
          cuisine
        )
      `)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;
    return data;
  },

  // Add meal to schedule
  async scheduleMeal(mealData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('meal_schedule')
      .insert({
        user_id: user.id,
        ...mealData,
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Update scheduled meal
  async updateScheduledMeal(id, updates) {
    const { data, error } = await supabase
      .from('meal_schedule')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Delete scheduled meal
  async deleteScheduledMeal(id) {
    const { error } = await supabase
      .from('meal_schedule')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  // Get week nutrition summary
  async getWeekNutritionSummary(startDate, endDate) {
    const meals = await this.getWeekSchedule(startDate, endDate);
    
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    meals.forEach(meal => {
      if (meal.recipes) {
        const servings = meal.servings || 1;
        totalCalories += (meal.recipes.total_calories || 0) * servings;
        totalProtein += (meal.recipes.total_protein || 0) * servings;
        totalCarbs += (meal.recipes.total_carbs || 0) * servings;
        totalFat += (meal.recipes.total_fat || 0) * servings;
      }
    });

    const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;

    return {
      total: {
        calories: Math.round(totalCalories),
        protein: Math.round(totalProtein),
        carbs: Math.round(totalCarbs),
        fat: Math.round(totalFat),
      },
      daily: {
        calories: Math.round(totalCalories / days),
        protein: Math.round(totalProtein / days),
        carbs: Math.round(totalCarbs / days),
        fat: Math.round(totalFat / days),
      },
      totalMeals: meals.length,
    };
  },

  // Generate shopping list from meal plan
  async generateShoppingList(startDate, endDate) {
    const meals = await this.getWeekSchedule(startDate, endDate);
    
    // Get all recipe ingredients
    const recipeIds = meals
      .filter(m => m.recipe_id)
      .map(m => m.recipe_id);

    if (recipeIds.length === 0) {
      return [];
    }

    const { data: ingredients, error } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .in('recipe_id', recipeIds);

    if (error) throw error;

    // Aggregate ingredients
    const aggregated = {};
    
    ingredients.forEach(ing => {
      const key = ing.name.toLowerCase();
      if (!aggregated[key]) {
        aggregated[key] = {
          name: ing.name,
          amount: 0,
          unit: ing.unit,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        };
      }
      aggregated[key].amount += ing.amount || 0;
      aggregated[key].calories += ing.calories || 0;
      aggregated[key].protein += ing.protein || 0;
      aggregated[key].carbs += ing.carbs || 0;
      aggregated[key].fat += ing.fat || 0;
    });

    return Object.values(aggregated);
  },
  // Mark meal as completed/consumed
  async completeMeal(id) {
  const { data, error } = await supabase
    .from('meal_schedule')
    .update({ 
      is_completed: true,
      completed_at: new Date().toISOString() // Add timestamp
    })
    .eq('id', id)
    .select(`
      *,
      recipes (
        id,
        name,
        total_calories,
        total_protein,
        total_carbs,
        total_fat
      )
    `)
    .maybeSingle();

  if (error) throw error;
  return data;
},

  // Get nutrition summary for consumed meals
 async getConsumedMealsSummary(days = 7) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('meal_schedule')
    .select(`
      *,
      recipes (
        id,
        name,
        description,
        total_calories,
        total_protein,
        total_carbs,
        total_fat,
        cuisine,
        difficulty
      )
    `)
    .eq('is_completed', true)
    .gte('scheduled_date', startDate.toISOString().split('T')[0])
    .lte('scheduled_date', endDate.toISOString().split('T')[0])
    .order('scheduled_date', { ascending: false });

  if (error) {
    console.error('Error fetching consumed meals:', error);
    throw error;
  }

  // Calculate totals
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  const validMeals = data.filter(meal => meal.recipes); // Only count meals with recipe data

  validMeals.forEach(meal => {
    const servings = meal.servings || 1;
    totalCalories += (meal.recipes.total_calories || 0) * servings;
    totalProtein += (meal.recipes.total_protein || 0) * servings;
    totalCarbs += (meal.recipes.total_carbs || 0) * servings;
    totalFat += (meal.recipes.total_fat || 0) * servings;
  });

  return {
    meals: validMeals,
    summary: {
      totalMeals: validMeals.length,
      days: days,
      total: {
        calories: Math.round(totalCalories),
        protein: Math.round(totalProtein),
        carbs: Math.round(totalCarbs),
        fat: Math.round(totalFat),
      },
      daily: {
        calories: Math.round(totalCalories / days),
        protein: Math.round(totalProtein / days),
        carbs: Math.round(totalCarbs / days),
        fat: Math.round(totalFat / days),
      },
    },
  };
},

  // Get daily breakdown
  async getDailyBreakdown(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('meal_schedule')
      .select(`
        *,
        recipes (
          total_calories,
          total_protein,
          total_carbs,
          total_fat
        )
      `)
      .eq('is_completed', true)
      .gte('scheduled_date', startDate.toISOString().split('T')[0])
      .lte('scheduled_date', endDate.toISOString().split('T')[0])
      .order('scheduled_date', { ascending: true });

    if (error) throw error;

    // Group by date
    const byDate = {};
    data.forEach(meal => {
      const date = meal.scheduled_date;
      if (!byDate[date]) {
        byDate[date] = {
          date,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          meals: 0,
        };
      }
      if (meal.recipes) {
        const servings = meal.servings || 1;
        byDate[date].calories += (meal.recipes.total_calories || 0) * servings;
        byDate[date].protein += (meal.recipes.total_protein || 0) * servings;
        byDate[date].carbs += (meal.recipes.total_carbs || 0) * servings;
        byDate[date].fat += (meal.recipes.total_fat || 0) * servings;
        byDate[date].meals += 1;
      }
    });

    return Object.values(byDate).map(day => ({
      ...day,
      calories: Math.round(day.calories),
      protein: Math.round(day.protein),
      carbs: Math.round(day.carbs),
      fat: Math.round(day.fat),
    }));
  },
};