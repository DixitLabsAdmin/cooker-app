// MealDB Service - Uses proxy to avoid CORS issues
const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'http://localhost:3001';
const MEALDB_BASE_URL = `${PROXY_URL}/api/mealdb`;

export const mealDbService = {
  /**
   * Extract core ingredient from product name
   * "Kroger® Beef Shaved Steak" -> "beef"
   * "Simple Truth® Natural Boneless & Skinless Fresh Chicken Breast" -> "chicken"
   */
  extractCoreIngredient(productName) {
    // Remove brand names and common prefixes
    let cleaned = productName
      .toLowerCase()
      .replace(/kroger®?/gi, '')
      .replace(/simple truth®?/gi, '')
      .replace(/private selection®?/gi, '')
      .replace(/\b(organic|natural|fresh|frozen|usda|choice|angus|boneless|skinless)\b/gi, '')
      .replace(/[®™©]/g, '')
      .trim();

    // Common ingredient mappings
    const ingredientMap = {
      'beef': ['beef', 'steak', 'ground beef', 'chuck', 'ribeye', 'sirloin'],
      'chicken': ['chicken', 'drumstick', 'breast', 'thigh', 'wings'],
      'pork': ['pork', 'bacon', 'ham', 'sausage'],
      'fish': ['fish', 'salmon', 'tuna', 'cod', 'tilapia'],
      'shrimp': ['shrimp', 'prawns'],
      'potato': ['potato', 'potatoes'],
      'tomato': ['tomato', 'tomatoes'],
      'onion': ['onion', 'onions'],
      'carrot': ['carrot', 'carrots'],
      'celery': ['celery'],
      'garlic': ['garlic'],
      'cheese': ['cheese', 'cheddar', 'mozzarella', 'parmesan'],
      'milk': ['milk', 'dairy'],
      'egg': ['egg', 'eggs'],
      'rice': ['rice'],
      'pasta': ['pasta', 'spaghetti', 'penne', 'macaroni']
    };

    // Find matching core ingredient
    for (const [core, variations] of Object.entries(ingredientMap)) {
      if (variations.some(v => cleaned.includes(v))) {
        return core;
      }
    }

    // Extract first meaningful word if no match found
    const words = cleaned.split(/\s+/).filter(w => w.length > 2);
    return words[0] || productName;
  },

  /**
   * Search recipes by ingredient
   */
  async searchByIngredient(ingredient) {
    try {
      const coreIngredient = this.extractCoreIngredient(ingredient);
      console.log(`🔍 Searching: "${ingredient}" -> "${coreIngredient}"`);
      
      const response = await fetch(
        `${MEALDB_BASE_URL}/filter?i=${encodeURIComponent(coreIngredient)}`
      );
      
      if (!response.ok) {
        throw new Error(`MealDB API error: ${response.status}`);
      }

      const data = await response.json();
      return data.meals || [];
    } catch (error) {
      console.error('Error searching MealDB by ingredient:', error);
      return [];
    }
  },

  /**
   * Get full recipe details by ID
   */
  async getRecipeById(mealId) {
    try {
      const response = await fetch(
        `${MEALDB_BASE_URL}/lookup?i=${mealId}`
      );
      
      if (!response.ok) {
        throw new Error(`MealDB API error: ${response.status}`);
      }

      const data = await response.json();
      return data.meals?.[0] || null;
    } catch (error) {
      console.error('Error fetching recipe details:', error);
      return null;
    }
  },

  /**
   * Find recipes matching multiple inventory items
   */
  async findRecipesByInventory(inventoryItems) {
    try {
      console.log('🔍 Searching recipes for inventory items:', inventoryItems.map(i => i.name));
      
      // Extract unique core ingredients
      const coreIngredients = [...new Set(
        inventoryItems.map(item => this.extractCoreIngredient(item.name))
      )];
      
      console.log('🎯 Core ingredients:', coreIngredients);
      
      // Search for recipes with core ingredients (limit to 8)
      const recipePromises = coreIngredients.slice(0, 8).map(ingredient => 
        this.searchByIngredient(ingredient)
      );
      
      const results = await Promise.all(recipePromises);
      
      // Flatten and deduplicate recipes
      const allRecipes = results.flat();
      const uniqueRecipes = Array.from(
        new Map(allRecipes.map(recipe => [recipe.idMeal, recipe])).values()
      );
      
      console.log(`📚 Found ${uniqueRecipes.length} unique recipes`);
      
      // Get full details for each recipe - use Promise.allSettled to handle API failures gracefully
      const recipeDetailsPromises = uniqueRecipes.map(recipe => 
        this.getRecipeById(recipe.idMeal)
      );
      
      const recipeResults = await Promise.allSettled(recipeDetailsPromises);
      
      // Filter out failed requests and extract successful recipes
      const recipesWithDetails = recipeResults
        .filter(result => result.status === 'fulfilled' && result.value)
        .map((result, index) => ({
          ...uniqueRecipes[index],
          fullDetails: result.value
        }));

      // Log failures for debugging
      const failures = recipeResults.filter(result => result.status === 'rejected' || !result.value);
      if (failures.length > 0) {
        console.warn(`⚠️ ${failures.length} recipes failed to load from MealDB API (likely 500 errors)`);
      }
      
      console.log(`✅ Successfully loaded ${recipesWithDetails.length} recipes with full details`);
      
      // Calculate match percentage based on actual ingredients
      const recipesWithScores = recipesWithDetails.map(recipe => {
        const recipeIngredients = this.parseRecipeIngredients(recipe.fullDetails);
        let matchCount = 0;
        const matchedIngredients = [];
        const missingIngredients = [];
        
        // Check how many recipe ingredients user has in inventory
        recipeIngredients.forEach(recipeIng => {
          const hasIngredient = inventoryItems.some(invItem => {
            const invCore = this.extractCoreIngredient(invItem.name);
            const recCore = this.extractCoreIngredient(recipeIng.name);
            return invCore === recCore || 
                   invCore.includes(recCore) || 
                   recCore.includes(invCore);
          });
          
          if (hasIngredient) {
            matchCount++;
            matchedIngredients.push(recipeIng);
          } else {
            missingIngredients.push(recipeIng);
          }
        });
        
        const matchPercentage = Math.round((matchCount / recipeIngredients.length) * 100);
        
        return {
          ...recipe,
          matchCount,
          totalIngredients: recipeIngredients.length,
          matchPercentage,
          ingredients: recipeIngredients,
          matchedIngredients,
          missingIngredients
        };
      });
      
      // Filter recipes with at least 30% match and sort by percentage
      const filteredRecipes = recipesWithScores
        .filter(r => r.matchPercentage >= 30)
        .sort((a, b) => b.matchPercentage - a.matchPercentage);
      
      console.log(`✅ Found ${filteredRecipes.length} matching recipes (30%+ match)`);
      return filteredRecipes.slice(0, 10); // Top 10
    } catch (error) {
      console.error('Error finding recipes by inventory:', error);
      return [];
    }
  },

  /**
   * Search recipes by name
   */
  async searchByName(query) {
    try {
      const response = await fetch(
        `${MEALDB_BASE_URL}/search?s=${encodeURIComponent(query)}`
      );
      
      if (!response.ok) {
        throw new Error(`MealDB API error: ${response.status}`);
      }

      const data = await response.json();
      return data.meals || [];
    } catch (error) {
      console.error('Error searching MealDB by name:', error);
      return [];
    }
  },

  /**
   * Get all categories
   */
  async getCategories() {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      return data.categories || [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  },

  /**
   * Get random recipe
   */
  async getRandomRecipe() {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/random`);
      if (!response.ok) throw new Error('Failed to fetch random recipe');
      const data = await response.json();
      return data.meals?.[0] || null;
    } catch (error) {
      console.error('Error fetching random recipe:', error);
      return null;
    }
  },

  /**
   * Parse recipe ingredients and measurements
   */
  parseRecipeIngredients(recipe) {
    const ingredients = [];
    
    for (let i = 1; i <= 20; i++) {
      const ingredient = recipe[`strIngredient${i}`];
      const measure = recipe[`strMeasure${i}`];
      
      if (ingredient && ingredient.trim()) {
        ingredients.push({
          name: ingredient.trim(),
          measure: measure?.trim() || ''
        });
      }
    }
    
    return ingredients;
  },

  /**
   * Format recipe for display
   */
  formatRecipe(recipe) {
    return {
      id: recipe.idMeal,
      name: recipe.strMeal,
      category: recipe.strCategory,
      area: recipe.strArea,
      instructions: recipe.strInstructions,
      thumbnail: recipe.strMealThumb,
      tags: recipe.strTags?.split(',') || [],
      youtube: recipe.strYoutube,
      ingredients: this.parseRecipeIngredients(recipe),
      source: recipe.strSource
    };
  }
};