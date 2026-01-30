import axios from 'axios';

const USDA_API_KEY = import.meta.env.VITE_USDA_API_KEY;
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

if (!USDA_API_KEY) {
  console.warn('⚠️ USDA API key not found. Please add VITE_USDA_API_KEY to .env file');
}

export const usdaService = {
  // Search foods
  async searchFoods(query, pageSize = 25) {
    try {
      const response = await axios.get(`${USDA_BASE_URL}/foods/search`, {
        params: {
          api_key: USDA_API_KEY,
          query: query,
          pageSize: pageSize,
          // Remove or simplify the dataType parameter
        },
      });

      // Transform the response to a simpler format
      return response.data.foods.map(food => ({
        fdcId: food.fdcId,
        name: food.description,
        brandName: food.brandName || null,
        dataType: food.dataType,
        servingSize: food.servingSize || 100,
        servingUnit: food.servingSizeUnit || 'g',
        // Extract nutrition info
        calories: this.getNutrient(food, 1008), // Energy
        protein: this.getNutrient(food, 1003), // Protein
        carbs: this.getNutrient(food, 1005), // Carbohydrates
        fat: this.getNutrient(food, 1004), // Total lipid (fat)
        fiber: this.getNutrient(food, 1079), // Fiber
        sugar: this.getNutrient(food, 2000), // Sugars
        sodium: this.getNutrient(food, 1093), // Sodium
      }));
    } catch (error) {
      console.error('USDA API Error:', error);
      if (error.response?.status === 403) {
        throw new Error('Invalid API key. Please check your USDA API key in .env file');
      } else if (error.response?.status === 400) {
        throw new Error('Invalid search request. Try a simpler search term.');
      } else if (error.response?.status === 500) {
        throw new Error('USDA API is temporarily unavailable. Please try again in a few minutes.');
      }
      throw new Error('Failed to search foods. Please try again.');
    }
  },

  // Get detailed food info
  async getFoodDetails(fdcId) {
    try {
      const response = await axios.get(`${USDA_BASE_URL}/food/${fdcId}`, {
        params: {
          api_key: USDA_API_KEY,
        },
      });

      return response.data;
    } catch (error) {
      console.error('USDA API Error:', error);
      throw new Error('Failed to get food details');
    }
  },

  // Helper to extract nutrient value
  getNutrient(food, nutrientId) {
    const nutrient = food.foodNutrients?.find(
      n => n.nutrientId === nutrientId || n.nutrientNumber === String(nutrientId)
    );
    return nutrient?.value || 0;
  },

  // Calculate nutrition for custom amount
  calculateNutrition(foodData, amount) {
    const baseAmount = foodData.servingSize || 100;
    const factor = amount / baseAmount;

    return {
      calories: (foodData.calories * factor).toFixed(1),
      protein: (foodData.protein * factor).toFixed(1),
      carbs: (foodData.carbs * factor).toFixed(1),
      fat: (foodData.fat * factor).toFixed(1),
    };
  },

  // Common food categories
  categories: [
    'Produce',
    'Meat & Seafood',
    'Dairy & Eggs',
    'Bakery',
    'Pantry',
    'Frozen',
    'Beverages',
    'Snacks',
    'Other',
  ],
};