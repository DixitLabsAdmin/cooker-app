import { supabase } from './supabase';
import { usdaService } from './usda';
import { shoppingListService } from './shoppingList';

export const calendarToShoppingListService = {
  /**
   * Add all ingredients from a calendar meal to shopping list
   */
  async addMealToShoppingList(mealId) {
    try {
      // Get meal details
      const { data: meal, error: mealError } = await supabase
        .from('meal_schedule')
        .select('*, recipes(*)')
        .eq('id', mealId)
        .maybeSingle();

      if (mealError) throw mealError;

      if (!meal || !meal.recipes) {
        throw new Error('Meal or recipe not found');
      }

      // Get recipe ingredients separately
      const { data: ingredients, error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', meal.recipes.id);

      if (ingredientsError) throw ingredientsError;
      
      if (!ingredients || ingredients.length === 0) {
        throw new Error('No ingredients found for this meal');
      }

      // Look up nutrition for each ingredient
      const enrichedIngredients = await this.enrichIngredientsWithNutrition(ingredients);

      // Add to shopping list
      const results = await this.addIngredientsToShoppingList(enrichedIngredients);

      return {
        success: true,
        addedCount: results.successCount,
        failedCount: results.failedCount,
        failedItems: results.failedItems,
      };
    } catch (error) {
      console.error('Error adding meal to shopping list:', error);
      throw error;
    }
  },

  /**
   * Enrich ingredients with USDA nutrition data
   */
  async enrichIngredientsWithNutrition(ingredients) {
    const enriched = [];

    for (const ingredient of ingredients) {
      try {
        // Search USDA for this ingredient
        const usdaResults = await usdaService.searchFoods(ingredient.name, 5);
        
        let nutrition = {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        };

        if (usdaResults.length > 0) {
          // Use first result (best match)
          const bestMatch = usdaResults[0];
          
          // Scale nutrition based on amount
          const scaleFactor = this.calculateScaleFactor(
            ingredient.amount,
            ingredient.unit,
            bestMatch.servingSize,
            bestMatch.servingUnit
          );

          nutrition = {
            calories: (bestMatch.calories * scaleFactor) || 0,
            protein: (bestMatch.protein * scaleFactor) || 0,
            carbs: (bestMatch.carbs * scaleFactor) || 0,
            fat: (bestMatch.fat * scaleFactor) || 0,
          };

          console.log(`✅ Found nutrition for: ${ingredient.name}`);
        } else {
          console.warn(`⚠️ No USDA match for: ${ingredient.name}`);
        }

        enriched.push({
          ...ingredient,
          ...nutrition,
          hasNutrition: usdaResults.length > 0,
        });
      } catch (error) {
        console.error(`Error enriching ${ingredient.name}:`, error);
        // Add without nutrition
        enriched.push({
          ...ingredient,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          hasNutrition: false,
        });
      }
    }

    return enriched;
  },

  /**
   * Calculate scale factor for nutrition
   */
  calculateScaleFactor(amount, unit, servingSize, servingUnit) {
    // Convert to grams for comparison
    const ingredientGrams = this.convertToGrams(amount, unit);
    const servingGrams = this.convertToGrams(servingSize, servingUnit);

    if (servingGrams === 0) return 1;

    return ingredientGrams / servingGrams;
  },

  /**
   * Convert amount to grams for scaling
   */
  convertToGrams(amount, unit) {
    const lowerUnit = unit?.toLowerCase() || 'g';

    // Weight units
    if (lowerUnit === 'g' || lowerUnit === 'grams') return amount;
    if (lowerUnit === 'kg' || lowerUnit === 'kilograms') return amount * 1000;
    if (lowerUnit === 'oz' || lowerUnit === 'ounces') return amount * 28.35;
    if (lowerUnit === 'lb' || lowerUnit === 'pounds') return amount * 453.59;

    // Volume units (approximate to grams for liquids)
    if (lowerUnit === 'ml' || lowerUnit === 'milliliters') return amount;
    if (lowerUnit === 'l' || lowerUnit === 'liters') return amount * 1000;
    if (lowerUnit === 'cup' || lowerUnit === 'cups') return amount * 240;
    if (lowerUnit === 'tbsp' || lowerUnit === 'tablespoon') return amount * 15;
    if (lowerUnit === 'tsp' || lowerUnit === 'teaspoon') return amount * 5;

    // Item units (approximate)
    if (lowerUnit === 'item' || lowerUnit === 'items') return amount * 100;

    // Default
    return amount;
  },

  /**
   * Add enriched ingredients to shopping list
   */
  async addIngredientsToShoppingList(ingredients) {
    let successCount = 0;
    let failedCount = 0;
    const failedItems = [];

    for (const ingredient of ingredients) {
      try {
        const shoppingItem = {
          name: ingredient.name,
          category: this.guessCategory(ingredient.name),
          is_packaged: false,
          is_purchased: false,
          amount: parseFloat(ingredient.amount) || 0,
          unit: ingredient.unit || 'item',
          calories: parseFloat(ingredient.calories) || 0,
          protein: parseFloat(ingredient.protein) || 0,
          carbs: parseFloat(ingredient.carbs) || 0,
          fat: parseFloat(ingredient.fat) || 0,
          usda_food_id: null,
          serving_size: parseFloat(ingredient.amount) || 0,
          serving_unit: ingredient.unit || 'item',
          notes: 'From meal plan',
          is_archived: false,
          brand_name: null
        };

        await shoppingListService.addItem(shoppingItem);
        successCount++;
        console.log(`✅ Added ${ingredient.name} to shopping list`);
      } catch (error) {
        console.error(`Failed to add ${ingredient.name}:`, error);
        console.error('Error details:', error.message);
        failedCount++;
        failedItems.push(ingredient.name);
      }
    }

    return { successCount, failedCount, failedItems };
  },

  /**
   * Guess category based on ingredient name
   */
  guessCategory(name) {
    const lower = name.toLowerCase();

    if (/(chicken|beef|pork|turkey|meat)/i.test(lower)) return 'Meat';
    if (/(fish|salmon|tuna|shrimp)/i.test(lower)) return 'Seafood';
    if (/(milk|cheese|yogurt|butter|cream)/i.test(lower)) return 'Dairy';
    if (/(bread|rice|pasta|flour|oats)/i.test(lower)) return 'Grains';
    if (/(apple|banana|orange|berry|fruit)/i.test(lower)) return 'Produce';
    if (/(lettuce|tomato|carrot|vegetable|onion|pepper)/i.test(lower)) return 'Produce';
    if (/(can|canned)/i.test(lower)) return 'Canned';
    if (/(frozen)/i.test(lower)) return 'Frozen';

    return 'Other';
  },
};