import { supabase } from './supabase';

/**
 * Calendar Service - Smart meal availability checking
 * Checks ingredient availability and provides color-coded warnings
 */

class CalendarService {
  /**
   * Check ingredient availability for a scheduled meal
   * Returns availability status and missing ingredients
   */
  async checkMealAvailability(recipeId, scheduledDate, servings = 1) {
    try {
      // Use the recipe service's ingredient availability checker
      const { recipeService } = await import('./recipes');
      const availability = await recipeService.checkIngredientsAvailability(recipeId);
      
      // Calculate status based on availability
      const totalIngredients = availability.ingredients.length;
      const availableCount = availability.ingredients.filter(i => i.isAvailable).length;
      
      let status = 'unknown';
      let availabilityPercentage = 0;
      
      if (totalIngredients > 0) {
        availabilityPercentage = (availableCount / totalIngredients) * 100;
        
        if (availabilityPercentage >= 90) {
          status = 'available';
        } else if (availabilityPercentage >= 50) {
          status = 'partial';
        } else {
          status = 'unavailable';
        }
      }

      return {
        status,
        availabilityPercentage,
        missingIngredients: availability.missingIngredients,
        availableIngredients: availability.ingredients.filter(i => i.isAvailable),
        spoilingIngredients: availability.spoilingIngredients,
        allIngredients: availability.ingredients,
        servings: servings
      };
    } catch (error) {
      console.error('Error checking meal availability:', error);
      return {
        status: 'unknown',
        availabilityPercentage: 0,
        missingIngredients: [],
        availableIngredients: [],
        error: error.message
      };
    }
  }

  /**
   * Check availability for all meals in a week
   * Returns a map of date+mealType -> availability info
   */
  async checkWeekAvailability(weekStart, weekEnd) {
    try {
      // Get all scheduled meals for the week
      const { data: scheduledMeals, error } = await supabase
        .from('meal_schedule')
        .select(`
          *,
          recipes (*)
        `)
        .gte('scheduled_date', weekStart)
        .lte('scheduled_date', weekEnd)
        .order('scheduled_date');

      if (error) throw error;

      // Check availability for each meal
      const availabilityMap = {};
      
      for (const meal of scheduledMeals) {
        const key = `${meal.scheduled_date}_${meal.meal_type}`;
        const availability = await this.checkMealAvailability(
          meal.recipe_id,
          meal.scheduled_date,
          meal.servings
        );
        availabilityMap[key] = availability;
      }

      return availabilityMap;
    } catch (error) {
      console.error('Error checking week availability:', error);
      return {};
    }
  }

  /**
   * Get color class based on availability status
   */
  getAvailabilityColor(status) {
    switch (status) {
      case 'available':
        return {
          border: 'border-green-400',
          bg: 'bg-green-50',
          indicator: '🟢',
          text: 'All ingredients available'
        };
      case 'partial':
        return {
          border: 'border-yellow-400',
          bg: 'bg-yellow-50',
          indicator: '🟡',
          text: 'Some ingredients missing'
        };
      case 'unavailable':
        return {
          border: 'border-red-400',
          bg: 'bg-red-50',
          indicator: '🔴',
          text: 'Most ingredients missing'
        };
      default:
        return {
          border: 'border-gray-300',
          bg: 'bg-gray-50',
          indicator: '⚪',
          text: 'Availability unknown'
        };
    }
  }

  /**
   * Get suggested alternative meals based on available ingredients
   * TODO: Implement once MealDB API is integrated
   */
  async getSuggestedAlternatives(missingIngredients) {
    try {
      // This will search for recipes that use available ingredients
      // For now, return empty array
      return [];
    } catch (error) {
      console.error('Error getting suggested alternatives:', error);
      return [];
    }
  }

  /**
   * Generate quick-add shopping list for missing ingredients
   */
  async quickAddMissingIngredients(missingIngredients, scheduledDate) {
    try {
      const itemsAdded = [];

      for (const ingredient of missingIngredients) {
        const { data, error } = await supabase
          .from('shopping_list')
          .insert({
            name: ingredient.name,
            amount: ingredient.amount,
            unit: ingredient.unit,
            category: ingredient.category || 'Other',
            notes: `Needed for ${scheduledDate}`,
            is_purchased: false
          })
          .select()
          .maybeSingle();

        if (error) {
          console.error('Error adding ingredient:', error);
        } else {
          itemsAdded.push(data);
        }
      }

      return itemsAdded;
    } catch (error) {
      console.error('Error quick-adding ingredients:', error);
      return [];
    }
  }

  /**
   * Calculate availability percentage based on available vs total ingredients
   */
  calculateAvailabilityPercentage(availableCount, totalCount) {
    if (totalCount === 0) return 0;
    const percentage = (availableCount / totalCount) * 100;
    
    // Determine status based on percentage
    if (percentage >= 90) return { percentage, status: 'available' };
    if (percentage >= 50) return { percentage, status: 'partial' };
    return { percentage, status: 'unavailable' };
  }

  /**
   * Check if ingredient is in inventory
   * TODO: Implement actual inventory checking
   */
  async checkIngredientInInventory(ingredientName, requiredAmount, unit) {
    try {
      // Search inventory for matching ingredient
      const { data: inventoryItems, error } = await supabase
        .from('inventory')
        .select('*')
        .ilike('name', `%${ingredientName}%`);

      if (error) throw error;

      if (!inventoryItems || inventoryItems.length === 0) {
        return { available: false, amountAvailable: 0 };
      }

      // Calculate total available amount
      let totalAvailable = 0;
      for (const item of inventoryItems) {
        // TODO: Implement unit conversion logic
        totalAvailable += item.amount;
      }

      return {
        available: totalAvailable >= requiredAmount,
        amountAvailable: totalAvailable,
        shortfall: Math.max(0, requiredAmount - totalAvailable)
      };
    } catch (error) {
      console.error('Error checking inventory:', error);
      return { available: false, amountAvailable: 0 };
    }
  }
}

export const calendarService = new CalendarService();