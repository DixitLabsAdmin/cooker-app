import { userPreferencesService } from './userPreferences';

/**
 * Household Scaling Service
 * Applies household size scaling to recipes, ingredients, and nutrition
 */

class HouseholdScalingService {
  // Cache household size to avoid multiple API calls
  cachedHouseholdSize = null;
  cacheTimestamp = null;
  cacheDuration = 60000; // Cache for 1 minute

  /**
   * Get current household size (with caching)
   */
  async getHouseholdSize() {
    // Return cached value if still valid
    if (this.cachedHouseholdSize && this.cacheTimestamp && 
        (Date.now() - this.cacheTimestamp < this.cacheDuration)) {
      return this.cachedHouseholdSize;
    }

    try {
      const prefs = await userPreferencesService.getPreferences();
      this.cachedHouseholdSize = prefs.household_size || 1;
      this.cacheTimestamp = Date.now();
      return this.cachedHouseholdSize;
    } catch (error) {
      console.error('Error getting household size:', error);
      return 1; // Default to 1 person
    }
  }

  /**
   * Clear the cache (call this when household size is updated)
   */
  clearCache() {
    this.cachedHouseholdSize = null;
    this.cacheTimestamp = null;
  }

  /**
   * Scale a recipe's servings based on household size
   */
  async scaleRecipeServings(recipeServings) {
    const householdSize = await this.getHouseholdSize();
    return recipeServings * householdSize;
  }

  /**
   * Scale ingredient amounts based on household size
   */
  async scaleIngredientAmount(amount) {
    const householdSize = await this.getHouseholdSize();
    return amount * householdSize;
  }

  /**
   * Scale nutrition values based on household size
   */
  async scaleNutrition(nutrition) {
    const householdSize = await this.getHouseholdSize();
    
    return {
      calories: nutrition.calories * householdSize,
      protein: nutrition.protein * householdSize,
      carbs: nutrition.carbs * householdSize,
      fat: nutrition.fat * householdSize,
    };
  }

  /**
   * Scale entire recipe object (includes servings, ingredients, and nutrition)
   */
  async scaleRecipe(recipe) {
    const householdSize = await this.getHouseholdSize();
    
    const scaledRecipe = { ...recipe };
    
    // Scale servings
    if (recipe.servings) {
      scaledRecipe.servings = recipe.servings * householdSize;
      scaledRecipe.original_servings = recipe.servings;
    }
    
    // Scale ingredients
    if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
      scaledRecipe.ingredients = recipe.ingredients.map(ingredient => ({
        ...ingredient,
        amount: ingredient.amount * householdSize,
        original_amount: ingredient.amount,
      }));
    }
    
    // Scale nutrition
    if (recipe.total_calories) {
      scaledRecipe.total_calories = recipe.total_calories * householdSize;
      scaledRecipe.total_protein = recipe.total_protein * householdSize;
      scaledRecipe.total_carbs = recipe.total_carbs * householdSize;
      scaledRecipe.total_fat = recipe.total_fat * householdSize;
      
      scaledRecipe.original_calories = recipe.total_calories;
      scaledRecipe.original_protein = recipe.total_protein;
      scaledRecipe.original_carbs = recipe.total_carbs;
      scaledRecipe.original_fat = recipe.total_fat;
    }
    
    scaledRecipe.household_size = householdSize;
    scaledRecipe.is_scaled = householdSize > 1;
    
    return scaledRecipe;
  }

  /**
   * Scale shopping list for meal planning
   */
  async scaleShoppingList(ingredients) {
    const householdSize = await this.getHouseholdSize();
    
    return ingredients.map(ingredient => ({
      ...ingredient,
      amount: ingredient.amount * householdSize,
      original_amount: ingredient.amount,
      household_size: householdSize,
    }));
  }

  /**
   * Get scaling info for display (e.g., "Scaled for 4 people")
   */
  async getScalingInfo() {
    const householdSize = await this.getHouseholdSize();
    
    if (householdSize === 1) {
      return null; // No scaling message needed
    }
    
    return {
      size: householdSize,
      message: `Scaled for ${householdSize} people`,
      multiplier: householdSize,
    };
  }

  /**
   * Format amount with original value for display
   * Example: "400g (100g per person)"
   */
  async formatScaledAmount(amount, unit) {
    const householdSize = await this.getHouseholdSize();
    
    if (householdSize === 1) {
      return `${amount}${unit}`;
    }
    
    const perPerson = amount / householdSize;
    return `${amount}${unit} (${perPerson.toFixed(1)}${unit} per person)`;
  }
}

export const householdScalingService = new HouseholdScalingService();