import { supabase } from './supabase';
import { mealDBService } from './mealDBService';

export const recipeService = {
  // Get all recipes
  async getAllRecipes() {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get single recipe with ingredients
  async getRecipeById(id) {
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (recipeError) throw recipeError;

    // Get ingredients from our database
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', id)
      .order('order_index', { ascending: true });

    if (ingredientsError) throw ingredientsError;

    // If no ingredients in database and recipe has external_id, fetch from MealDB
    if ((!ingredients || ingredients.length === 0) && recipe.external_id) {
      try {
        const mealDBRecipe = await mealDBService.getRecipeById(recipe.external_id);
        if (mealDBRecipe && mealDBRecipe.ingredients) {
          return { ...recipe, ingredients: mealDBRecipe.ingredients };
        }
      } catch (err) {
        console.error('Error fetching MealDB ingredients:', err);
      }
    }

    return { ...recipe, ingredients };
  },

  // Create new recipe
  async createRecipe(recipeData, ingredients) {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Insert recipe
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        ...recipeData,
        created_by: user.id,
      })
      .select()
      .maybeSingle();

    if (recipeError) throw recipeError;

    // Insert ingredients if provided
    if (ingredients && ingredients.length > 0) {
      const ingredientsToInsert = ingredients.map((ing, index) => ({
        recipe_id: recipe.id,
        ...ing,
        order_index: index,
      }));

      const { error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredientsToInsert);

      if (ingredientsError) throw ingredientsError;
    }

    return recipe;
  },

  // Update recipe
  async updateRecipe(id, recipeData, ingredients) {
    // Update recipe
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .update(recipeData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (recipeError) throw recipeError;

    // Update ingredients if provided
    if (ingredients) {
      // Delete existing ingredients
      await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', id);

      // Insert new ingredients
      if (ingredients.length > 0) {
        const ingredientsToInsert = ingredients.map((ing, index) => ({
          recipe_id: id,
          ...ing,
          order_index: index,
        }));

        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsToInsert);

        if (ingredientsError) throw ingredientsError;
      }
    }

    return recipe;
  },

  // Delete recipe
  async deleteRecipe(id) {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  // Search recipes
  async searchRecipes(searchTerm) {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,cuisine.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // ============ PACKAGE 1 NEW METHODS ============

  // Toggle favorite status
  async toggleFavorite(recipeId, isFavorite) {
    const { data, error } = await supabase
      .from('recipes')
      .update({ is_favorite: isFavorite })
      .eq('id', recipeId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Get favorite recipes
  async getFavoriteRecipes() {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (
          id,
          name,
          amount,
          unit,
          calories,
          protein,
          carbs,
          fat,
          notes
        )
      `)
      .eq('is_favorite', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  },

  // ============ PACKAGE 2 NEW METHODS ============

  // Check if ingredients are available in inventory (ENHANCED with MealDB support)
  async checkIngredientsAvailability(recipeId) {
    // Get recipe with ingredients
    const recipe = await this.getRecipeById(recipeId);
    
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      return {
        ingredients: [],
        allAvailable: true,
        missingIngredients: [],
        spoilingIngredients: [],
      };
    }

    // Get user's inventory
    const { data: inventory, error: invError } = await supabase
      .from('inventory')
      .select('name, amount, unit, created_at, brand_name');

    if (invError) throw invError;

    // Check each ingredient
    const availability = recipe.ingredients.map(ingredient => {
      // Try to find matching inventory item
      const inventoryItem = this.findInventoryMatch(inventory, ingredient.name);

      const isAvailable = inventoryItem && this.hasEnoughAmount(
        inventoryItem.amount,
        inventoryItem.unit,
        ingredient.amount,
        ingredient.unit
      );
      
      // Check if spoiling (older than 7 days)
      const daysOld = inventoryItem && inventoryItem.created_at
        ? (new Date() - new Date(inventoryItem.created_at)) / (1000 * 60 * 60 * 24)
        : 0;
      
      const isSpoiling = daysOld > 7;

      return {
        ...ingredient,
        isAvailable,
        isSpoiling,
        daysOld: Math.round(daysOld),
        inventoryAmount: inventoryItem?.amount || 0,
        inventoryUnit: inventoryItem?.unit || '',
        inventoryBrand: inventoryItem?.brand_name || null,
      };
    });

    return {
      ingredients: availability,
      allAvailable: availability.every(i => i.isAvailable),
      missingIngredients: availability.filter(i => !i.isAvailable),
      spoilingIngredients: availability.filter(i => i.isSpoiling && i.isAvailable),
    };
  },

  // Helper: Find matching inventory item (fuzzy matching)
  findInventoryMatch(inventory, ingredientName) {
    if (!inventory || !ingredientName) return null;

    const searchName = ingredientName.toLowerCase().trim();

    // Try exact match first
    let match = inventory.find(item => 
      item.name.toLowerCase().trim() === searchName
    );

    if (match) return match;

    // Try partial match (inventory name contains ingredient or vice versa)
    match = inventory.find(item => {
      const invName = item.name.toLowerCase().trim();
      return invName.includes(searchName) || searchName.includes(invName);
    });

    return match;
  },

  // Helper: Check if we have enough amount (basic unit comparison)
  hasEnoughAmount(inventoryAmount, inventoryUnit, requiredAmount, requiredUnit) {
    // If no required amount specified, assume we have enough
    if (!requiredAmount) return true;

    // Parse amounts (handle strings like "1 cup", "2 tbsp", etc.)
    const invAmount = this.parseAmount(inventoryAmount);
    const reqAmount = this.parseAmount(requiredAmount);

    // Normalize units for comparison
    const invUnitNorm = this.normalizeUnit(inventoryUnit);
    const reqUnitNorm = this.normalizeUnit(requiredUnit);

    // If same unit, direct comparison
    if (invUnitNorm === reqUnitNorm) {
      return invAmount >= reqAmount;
    }

    // If different units, try conversion (basic conversions only)
    const convertedReqAmount = this.convertUnit(reqAmount, reqUnitNorm, invUnitNorm);
    if (convertedReqAmount !== null) {
      return invAmount >= convertedReqAmount;
    }

    // If we can't convert, assume we have enough (conservative approach)
    return true;
  },

  // Helper: Parse amount from string
  parseAmount(amount) {
    if (typeof amount === 'number') return amount;
    if (!amount) return 0;

    // Extract first number from string
    const match = amount.toString().match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  },

  // Helper: Normalize unit names
  normalizeUnit(unit) {
    if (!unit) return '';
    
    const unitMap = {
      'cup': 'cup',
      'cups': 'cup',
      'c': 'cup',
      'tablespoon': 'tbsp',
      'tablespoons': 'tbsp',
      'tbsp': 'tbsp',
      'tbs': 'tbsp',
      'teaspoon': 'tsp',
      'teaspoons': 'tsp',
      'tsp': 'tsp',
      'gram': 'g',
      'grams': 'g',
      'g': 'g',
      'kilogram': 'kg',
      'kilograms': 'kg',
      'kg': 'kg',
      'ounce': 'oz',
      'ounces': 'oz',
      'oz': 'oz',
      'pound': 'lb',
      'pounds': 'lb',
      'lb': 'lb',
      'lbs': 'lb',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'ml': 'ml',
      'liter': 'l',
      'liters': 'l',
      'l': 'l',
    };

    const normalized = unit.toLowerCase().trim();
    return unitMap[normalized] || normalized;
  },

  // Helper: Basic unit conversion
  convertUnit(amount, fromUnit, toUnit) {
    // Volume conversions
    const volumeConversions = {
      'ml_to_l': 0.001,
      'l_to_ml': 1000,
      'tsp_to_tbsp': 0.333,
      'tbsp_to_tsp': 3,
      'tbsp_to_cup': 0.0625,
      'cup_to_tbsp': 16,
      'cup_to_ml': 236.588,
      'ml_to_cup': 0.00423,
    };

    // Weight conversions
    const weightConversions = {
      'g_to_kg': 0.001,
      'kg_to_g': 1000,
      'oz_to_lb': 0.0625,
      'lb_to_oz': 16,
      'g_to_oz': 0.035274,
      'oz_to_g': 28.3495,
    };

    const conversionKey = `${fromUnit}_to_${toUnit}`;
    const factor = volumeConversions[conversionKey] || weightConversions[conversionKey];

    return factor ? amount * factor : null;
  },

  // ============ MEALDB INTEGRATION ============

  // Import recipe from MealDB
  async importFromMealDB(mealDBId) {
    try {
      const mealDBRecipe = await mealDBService.getRecipeById(mealDBId);
      if (!mealDBRecipe) {
        throw new Error('Recipe not found in MealDB');
      }

      // Create recipe in our database
      const recipeData = {
        name: mealDBRecipe.name,
        description: mealDBRecipe.description,
        cuisine: mealDBRecipe.cuisine,
        difficulty: mealDBRecipe.difficulty,
        prep_time: mealDBRecipe.prep_time,
        cooking_time: mealDBRecipe.cooking_time,
        servings: mealDBRecipe.servings,
        instructions: mealDBRecipe.instructions,
        external_id: mealDBRecipe.externalId,
        external_source: 'mealdb',
        ...mealDBService.estimateNutrition(mealDBRecipe.ingredients),
      };

      const recipe = await this.createRecipe(recipeData, mealDBRecipe.ingredients);
      return recipe;
    } catch (error) {
      console.error('Error importing from MealDB:', error);
      throw error;
    }
  },

  // Search MealDB recipes
  async searchMealDB(query) {
    try {
      return await mealDBService.searchRecipes(query);
    } catch (error) {
      console.error('Error searching MealDB:', error);
      return [];
    }
  },

  // Get random MealDB recipe
  async getRandomMealDB() {
    try {
      return await mealDBService.getRandomRecipe();
    } catch (error) {
      console.error('Error getting random recipe:', error);
      return null;
    }
  },
};