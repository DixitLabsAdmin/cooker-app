const USDA_API_KEY = import.meta.env.VITE_USDA_API_KEY;
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

// In-memory cache for USDA nutrition data
const nutritionCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Background processing queue
const processingQueue = new Set();

/**
 * Map USDA food categories to shopping list categories
 */
function mapToShoppingCategory(usdaCategory, itemName = '') {
  if (!usdaCategory && !itemName) return 'Other';
  
  const category = (usdaCategory || '').toLowerCase();
  const name = itemName.toLowerCase();
  
  // USDA Category Mappings
  const categoryMap = {
    // Produce
    'Produce': ['vegetables and vegetable products', 'fruits and fruit juices', 'vegetable', 'fruit'],
    
    // Meat & Seafood
    'Meat & Seafood': [
      'beef products', 'pork products', 'lamb, veal, and game products',
      'poultry products', 'sausages and luncheon meats',
      'finfish and shellfish products', 'seafood'
    ],
    
    // Dairy
    'Dairy': ['dairy and egg products', 'milk', 'cheese', 'yogurt', 'cream'],
    
    // Bakery
    'Bakery': ['baked products', 'bread', 'cake', 'pastry', 'cookie', 'muffin', 'bagel'],
    
    // Pantry
    'Pantry': [
      'cereal grains and pasta', 'legumes and legume products',
      'nut and seed products', 'spices and herbs',
      'soups, sauces, and gravies', 'fats and oils',
      'rice', 'pasta', 'beans', 'lentils', 'flour', 'oil', 'sauce', 'condiment'
    ],
    
    // Frozen
    'Frozen': ['frozen', 'ice cream'],
    
    // Beverages
    'Beverages': ['beverages', 'juice', 'soda', 'coffee', 'tea', 'water', 'drink'],
    
    // Snacks
    'Snacks': [
      'snacks', 'sweets', 'candy', 'chocolate', 'chips', 'popcorn',
      'crackers', 'pretzels', 'nuts'
    ]
  };
  
  // Check USDA category first
  for (const [shoppingCat, patterns] of Object.entries(categoryMap)) {
    if (patterns.some(pattern => category.includes(pattern))) {
      return shoppingCat;
    }
  }
  
  // Fallback: Check item name for keywords
  for (const [shoppingCat, patterns] of Object.entries(categoryMap)) {
    if (patterns.some(pattern => name.includes(pattern))) {
      return shoppingCat;
    }
  }
  
  // Additional name-based detection
  if (name.match(/chicken|beef|pork|fish|salmon|tuna|shrimp|turkey|steak|meat/)) {
    return 'Meat & Seafood';
  }
  if (name.match(/apple|banana|orange|berry|grape|melon|peach|pear|lettuce|tomato|carrot|onion|potato|pepper|broccoli|spinach/)) {
    return 'Produce';
  }
  if (name.match(/milk|cheese|yogurt|butter|egg/)) {
    return 'Dairy';
  }
  if (name.match(/bread|roll|bun|tortilla|croissant/)) {
    return 'Bakery';
  }
  
  return 'Other';
}

/**
 * Check if item is likely food (not cleaning supplies, etc.)
 */
function isFood(name) {
  const nameLower = name.toLowerCase();
  
  // Non-food categories that should NEVER have nutrition
  const nonFoodPatterns = [
    /clean|cleaner|detergent|soap|bleach|disinfect|wipe|sponge|scrub|polish|spray/,
    /lysol|clorox|ajax|tide|dawn|mr\. clean|windex|fantastik|swede.*clean/,
    /paper towel|trash bag|aluminum foil|plastic wrap|ziplock|tissue|toilet paper/,
    /diaper|pacifier|bottle|lotion|shampoo|conditioner|toothpaste|deodorant/,
    /dog food|cat food|pet|kitty litter|bird seed/,
    /battery|light bulb|tape|glue|pen|pencil|marker/
  ];
  
  return !nonFoodPatterns.some(pattern => pattern.test(nameLower));
}

export const usdaService = {
  /**
   * Search for foods in USDA database
   */
  async searchFoods(query, limit = 5) {
    try {
      // Skip non-food items
      if (!isFood(query)) {
        console.log('⚠️ Skipping USDA lookup for non-food item:', query);
        return [];
      }
      
      // Check cache first
      const cacheKey = `search_${query.toLowerCase()}_${limit}`;
      const cached = nutritionCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log('✅ USDA cache hit:', query);
        return cached.data;
      }

      const response = await fetch(
        `${USDA_BASE_URL}/foods/search?query=${encodeURIComponent(query)}&pageSize=${limit}&api_key=${USDA_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status}`);
      }

      const data = await response.json();

      const foods = data.foods?.map(food => ({
        id: food.fdcId,
        name: food.description,
        brandName: food.brandName || food.brandOwner,
        category: food.foodCategory,
        shoppingCategory: mapToShoppingCategory(food.foodCategory, food.description),
        calories: this.extractNutrient(food.foodNutrients, 'Energy', 1008) || 0,
        protein: this.extractNutrient(food.foodNutrients, 'Protein', 1003) || 0,
        carbs: this.extractNutrient(food.foodNutrients, 'Carbohydrate', 1005) || 0,
        fat: this.extractNutrient(food.foodNutrients, 'Total lipid (fat)', 1004) || 0,
        servingSize: food.servingSize || 100,
        servingUnit: food.servingSizeUnit || 'g',
        dataType: food.dataType,
        score: food.score
      })) || [];

      // Cache the result
      nutritionCache.set(cacheKey, {
        data: foods,
        timestamp: Date.now()
      });

      return foods;
    } catch (error) {
      console.error('Error searching USDA:', error);
      return [];
    }
  },

  /**
   * Get detailed food information by FDC ID
   */
  async getFoodDetails(fdcId) {
    try {
      // Check cache first
      const cacheKey = `details_${fdcId}`;
      const cached = nutritionCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log('✅ USDA details cache hit:', fdcId);
        return cached.data;
      }

      const response = await fetch(
        `${USDA_BASE_URL}/food/${fdcId}?api_key=${USDA_API_KEY}`
      );

      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status}`);
      }

      const food = await response.json();

      const details = {
        id: food.fdcId,
        name: food.description,
        brandName: food.brandName || food.brandOwner,
        category: food.foodCategory,
        shoppingCategory: mapToShoppingCategory(food.foodCategory, food.description),
        calories: this.extractNutrient(food.foodNutrients, 'Energy', 1008) || 0,
        protein: this.extractNutrient(food.foodNutrients, 'Protein', 1003) || 0,
        carbs: this.extractNutrient(food.foodNutrients, 'Carbohydrate', 1005) || 0,
        fat: this.extractNutrient(food.foodNutrients, 'Total lipid (fat)', 1004) || 0,
        fiber: this.extractNutrient(food.foodNutrients, 'Fiber', 1079) || 0,
        sugar: this.extractNutrient(food.foodNutrients, 'Sugars', 2000) || 0,
        sodium: this.extractNutrient(food.foodNutrients, 'Sodium', 1093) || 0,
        servingSize: food.servingSize || 100,
        servingUnit: food.servingSizeUnit || 'g',
        ingredients: food.ingredients,
        allNutrients: food.foodNutrients
      };

      // Cache the result
      nutritionCache.set(cacheKey, {
        data: details,
        timestamp: Date.now()
      });

      return details;
    } catch (error) {
      console.error('Error fetching food details:', error);
      return null;
    }
  },

  /**
   * Extract nutrient value from USDA nutrient array
   */
  extractNutrient(nutrients, name, nutrientId) {
    if (!nutrients || !Array.isArray(nutrients)) return 0;

    const nutrient = nutrients.find(n => 
      n.nutrientName === name || n.nutrientId === nutrientId
    );

    return nutrient ? Math.round(nutrient.value * 10) / 10 : 0;
  },

  /**
   * Background enrichment for shopping list items
   * This runs asynchronously and doesn't block the UI
   */
  async enrichItemInBackground(itemId, itemName, onComplete) {
    // Prevent duplicate processing
    if (processingQueue.has(itemId)) {
      console.log('⏭️ Already processing:', itemName);
      return;
    }

    processingQueue.add(itemId);
    console.log('🔄 Background enriching:', itemName);

    try {
      const foods = await this.searchFoods(itemName, 1);
      
      if (foods && foods.length > 0) {
        const food = foods[0];
        const nutritionData = {
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          servingSize: food.servingSize,
          servingUnit: food.servingUnit,
          category: food.shoppingCategory
        };

        console.log('✅ Background enrichment complete:', itemName, nutritionData);
        
        if (onComplete) {
          await onComplete(itemId, nutritionData);
        }
      }
    } catch (error) {
      console.error('❌ Background enrichment failed:', itemName, error);
    } finally {
      processingQueue.delete(itemId);
    }
  },

  /**
   * Batch enrich multiple items in background
   */
  async batchEnrichInBackground(items, onItemComplete) {
    console.log(`🔄 Starting batch enrichment for ${items.length} items`);
    
    const promises = items.map((item, index) => 
      new Promise(resolve => {
        // Stagger requests to avoid rate limiting
        setTimeout(async () => {
          await this.enrichItemInBackground(item.id, item.name, async (itemId, nutritionData) => {
            if (onItemComplete) {
              await onItemComplete(itemId, nutritionData);
            }
            resolve();
          });
        }, index * 300); // 300ms between requests
      })
    );

    await Promise.all(promises);
    console.log('✅ Batch enrichment complete');
  },

  /**
   * Quick nutrition lookup with fallback
   * Tries cache first, then makes API call
   * Now includes category detection
   */
  async quickNutritionLookup(itemName) {
    try {
      // Try cache first for instant results
      const cacheKey = `search_${itemName.toLowerCase()}_1`;
      const cached = nutritionCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        const food = cached.data[0];
        if (food) {
          return {
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            servingSize: food.servingSize,
            servingUnit: food.servingUnit,
            category: food.shoppingCategory,
            source: 'cache'
          };
        }
      }

      // Not in cache, make API call
      const foods = await this.searchFoods(itemName, 1);
      if (foods && foods.length > 0) {
        const food = foods[0];
        return {
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          servingSize: food.servingSize,
          servingUnit: food.servingUnit,
          category: food.shoppingCategory,
          source: 'api'
        };
      }

      // No USDA data found, still try to determine category from name
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        servingSize: 100,
        servingUnit: 'g',
        category: mapToShoppingCategory('', itemName),
        source: 'fallback'
      };
    } catch (error) {
      console.error('Quick nutrition lookup failed:', error);
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        servingSize: 100,
        servingUnit: 'g',
        category: mapToShoppingCategory('', itemName),
        source: 'error'
      };
    }
  },

  /**
   * Get shopping category for an item (exposed helper function)
   */
  getShoppingCategory(usdaCategory, itemName) {
    return mapToShoppingCategory(usdaCategory, itemName);
  },

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    nutritionCache.clear();
    console.log('🗑️ USDA cache cleared');
  },

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: nutritionCache.size,
      items: Array.from(nutritionCache.keys())
    };
  }
};