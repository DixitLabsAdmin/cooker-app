// MealDB Premium API v2 Service
// API Key: 65232507

const MEALDB_API_KEY = '65232507';
const MEALDB_BASE_URL = `https://www.themealdb.com/api/json/v2/${MEALDB_API_KEY}`;

export const mealDBService = {
  /**
   * SEARCH & FILTER ENDPOINTS
   */

  // Search meals by name
  async searchByName(query) {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/search.php?s=${encodeURIComponent(query)}`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB search error:', error);
      return [];
    }
  },

  // Search by first letter
  async searchByFirstLetter(letter) {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/search.php?f=${letter}`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB search by letter error:', error);
      return [];
    }
  },

  // Get meal by ID
  async getMealById(id) {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/lookup.php?i=${id}`);
      const data = await response.json();
      return data.meals ? this.formatMeal(data.meals[0]) : null;
    } catch (error) {
      console.error('MealDB get by ID error:', error);
      return null;
    }
  },

  // Get random meal
  async getRandomMeal() {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/random.php`);
      const data = await response.json();
      return data.meals ? this.formatMeal(data.meals[0]) : null;
    } catch (error) {
      console.error('MealDB random meal error:', error);
      return null;
    }
  },

  // Get multiple random meals (Premium feature)
  async getRandomMeals(count = 10) {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/randomselection.php`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB random meals error:', error);
      return [];
    }
  },

  // Get latest meals (Premium feature)
  async getLatestMeals() {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/latest.php`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB latest meals error:', error);
      return [];
    }
  },

  /**
   * CATEGORY ENDPOINTS
   */

  // List all categories
  async listCategories() {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/categories.php`);
      const data = await response.json();
      return data.categories || [];
    } catch (error) {
      console.error('MealDB categories error:', error);
      return [];
    }
  },

  // Filter by category
  async filterByCategory(category) {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/filter.php?c=${encodeURIComponent(category)}`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB filter by category error:', error);
      return [];
    }
  },

  /**
   * AREA (CUISINE) ENDPOINTS
   */

  // List all areas/cuisines
  async listAreas() {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/list.php?a=list`);
      const data = await response.json();
      return data.meals || [];
    } catch (error) {
      console.error('MealDB areas error:', error);
      return [];
    }
  },

  // Filter by area/cuisine
  async filterByArea(area) {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/filter.php?a=${encodeURIComponent(area)}`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB filter by area error:', error);
      return [];
    }
  },

  /**
   * INGREDIENT ENDPOINTS
   */

  // List all ingredients
  async listIngredients() {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/list.php?i=list`);
      const data = await response.json();
      return data.meals || [];
    } catch (error) {
      console.error('MealDB ingredients error:', error);
      return [];
    }
  },

  // Filter by main ingredient
  async filterByIngredient(ingredient) {
    try {
      const response = await fetch(`${MEALDB_BASE_URL}/filter.php?i=${encodeURIComponent(ingredient)}`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB filter by ingredient error:', error);
      return [];
    }
  },

  /**
   * MULTI-INGREDIENT FILTER (Premium feature)
   */
  async filterByMultipleIngredients(ingredients) {
    try {
      const ingredientList = ingredients.join(',');
      const response = await fetch(`${MEALDB_BASE_URL}/filter.php?i=${encodeURIComponent(ingredientList)}`);
      const data = await response.json();
      return this.formatMeals(data.meals || []);
    } catch (error) {
      console.error('MealDB multi-ingredient filter error:', error);
      return [];
    }
  },

  /**
   * HELPER METHODS
   */

  // Format single meal
  formatMeal(meal) {
    if (!meal) return null;

    // Extract ingredients and measurements
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
      const ingredient = meal[`strIngredient${i}`];
      const measure = meal[`strMeasure${i}`];
      
      if (ingredient && ingredient.trim()) {
        ingredients.push({
          name: ingredient.trim(),
          measure: measure ? measure.trim() : '',
        });
      }
    }

    return {
      id: meal.idMeal,
      name: meal.strMeal,
      category: meal.strCategory,
      area: meal.strArea,
      instructions: meal.strInstructions,
      thumbnail: meal.strMealThumb,
      tags: meal.strTags ? meal.strTags.split(',').map(t => t.trim()) : [],
      youtube: meal.strYoutube,
      ingredients: ingredients,
      source: meal.strSource,
      imageSource: meal.strImageSource,
      creativeCommonsConfirmed: meal.strCreativeCommonsConfirmed,
      dateModified: meal.dateModified,
    };
  },

  // Format multiple meals
  formatMeals(meals) {
    if (!meals || !Array.isArray(meals)) return [];
    return meals.map(meal => this.formatMeal(meal)).filter(Boolean);
  },

  /**
   * UTILITY METHODS
   */

  // Get ingredient image URL
  getIngredientImageUrl(ingredientName, size = 'medium') {
    // Sizes: small, medium, large
    const sizeMap = {
      small: 'small',
      medium: 'medium',
      large: '', // default
    };
    const sizePath = sizeMap[size] || 'medium';
    return `https://www.themealdb.com/images/ingredients/${encodeURIComponent(ingredientName)}-${sizePath}.png`;
  },

  // Get category image URL
  getCategoryImageUrl(categoryName) {
    return `https://www.themealdb.com/images/category/${encodeURIComponent(categoryName)}.png`;
  },

  /**
   * ADVANCED SEARCH (Premium features)
   */

  // Search with multiple filters
  async advancedSearch({ name, category, area, ingredient }) {
    try {
      let results = [];

      // Start with most specific filter
      if (name) {
        results = await this.searchByName(name);
      } else if (ingredient) {
        results = await this.filterByIngredient(ingredient);
      } else if (category) {
        results = await this.filterByCategory(category);
      } else if (area) {
        results = await this.filterByArea(area);
      }

      // Apply additional filters client-side
      if (results.length > 0) {
        if (category && !name) {
          results = results.filter(m => m.category === category);
        }
        if (area && !name) {
          results = results.filter(m => m.area === area);
        }
      }

      return results;
    } catch (error) {
      console.error('MealDB advanced search error:', error);
      return [];
    }
  },

  /**
   * RECIPE IMPORT TO LOCAL DATABASE
   */

  // Convert MealDB recipe to app format
  convertToAppRecipe(mealDBRecipe) {
    // Parse ingredients into structured format
    const ingredients = mealDBRecipe.ingredients.map(ing => {
      // Try to parse measure into amount and unit
      const measureParts = this.parseMeasure(ing.measure);
      
      return {
        name: ing.name,
        amount: measureParts.amount,
        unit: measureParts.unit,
      };
    });

    // Calculate estimated nutrition (you can enhance this with USDA lookup)
    const nutrition = this.estimateNutrition(ingredients);

    return {
      name: mealDBRecipe.name,
      description: `${mealDBRecipe.category} dish from ${mealDBRecipe.area}`,
      cuisine: mealDBRecipe.area,
      category: mealDBRecipe.category,
      difficulty: 'Medium', // Default, can be customized
      cooking_time: this.estimateCookingTime(mealDBRecipe.instructions),
      servings: 4, // Default, can be customized
      instructions: mealDBRecipe.instructions,
      ingredients: ingredients,
      total_calories: nutrition.calories,
      total_protein: nutrition.protein,
      total_carbs: nutrition.carbs,
      total_fat: nutrition.fat,
      source: 'MealDB',
      source_id: mealDBRecipe.id,
      source_url: mealDBRecipe.source,
      image_url: mealDBRecipe.thumbnail,
      video_url: mealDBRecipe.youtube,
      tags: mealDBRecipe.tags,
    };
  },

  // Parse measurement string into amount and unit
  parseMeasure(measureStr) {
    if (!measureStr || !measureStr.trim()) {
      return { amount: 1, unit: 'item' };
    }

    const measure = measureStr.trim();
    
    // Try to extract number
    const numberMatch = measure.match(/^([\d.\/\s]+)/);
    let amount = 1;
    let unit = measure;

    if (numberMatch) {
      const numStr = numberMatch[1].trim();
      
      // Handle fractions like "1/2"
      if (numStr.includes('/')) {
        const parts = numStr.split('/').map(p => parseFloat(p.trim()));
        amount = parts[0] / parts[1];
      } else {
        amount = parseFloat(numStr) || 1;
      }

      // Extract unit (everything after the number)
      unit = measure.replace(numberMatch[0], '').trim();
    }

    // Normalize units
    unit = this.normalizeUnit(unit || 'item');

    return { amount, unit };
  },

  // Normalize unit names
  normalizeUnit(unit) {
    const unitMap = {
      'tsp': 'tsp',
      'teaspoon': 'tsp',
      'teaspoons': 'tsp',
      'tbsp': 'tbsp',
      'tablespoon': 'tbsp',
      'tablespoons': 'tbsp',
      'cup': 'cup',
      'cups': 'cup',
      'ml': 'ml',
      'g': 'g',
      'gram': 'g',
      'grams': 'g',
      'kg': 'kg',
      'oz': 'oz',
      'ounce': 'oz',
      'ounces': 'oz',
      'lb': 'lb',
      'pound': 'lb',
      'pounds': 'lb',
      'l': 'l',
      'liter': 'l',
      'liters': 'l',
    };

    const lowerUnit = unit.toLowerCase();
    return unitMap[lowerUnit] || unit;
  },

  // Estimate cooking time from instructions
  estimateCookingTime(instructions) {
    if (!instructions) return 30;

    // Look for time mentions in instructions
    const timeMatches = instructions.match(/(\d+)\s*(minute|minutes|min|hour|hours|hr)/gi);
    
    if (timeMatches && timeMatches.length > 0) {
      let totalMinutes = 0;
      
      timeMatches.forEach(match => {
        const num = parseInt(match);
        if (match.toLowerCase().includes('hour') || match.toLowerCase().includes('hr')) {
          totalMinutes += num * 60;
        } else {
          totalMinutes += num;
        }
      });

      return totalMinutes > 0 ? totalMinutes : 30;
    }

    // Default based on instruction length
    const wordCount = instructions.split(' ').length;
    if (wordCount < 100) return 15;
    if (wordCount < 200) return 30;
    if (wordCount < 300) return 45;
    return 60;
  },

  // Estimate nutrition (basic - can be enhanced with USDA lookup)
  estimateNutrition(ingredients) {
    // This is a very basic estimation
    // For accurate nutrition, you should look up each ingredient in USDA database
    return {
      calories: 400, // Default estimate
      protein: 25,
      carbs: 40,
      fat: 15,
    };
  },
};

export default mealDBService;