import axios from 'axios';
import { usdaService } from './usda';

// Use local proxy server instead of calling Kroger API directly
const PROXY_BASE_URL = 'http://localhost:3001/api/kroger';

class KrogerService {
  /**
   * Search Kroger locations by ZIP code
   */
  async searchByZipCode(zipCode, radiusMiles = 10, limit = 10) {
    try {
      const response = await axios.get(`${PROXY_BASE_URL}/locations`, {
        params: {
          zipCode: zipCode,
          radiusMiles: radiusMiles,
          limit: limit,
        },
      });

      return response.data.data || [];
    } catch (error) {
      console.error('Kroger Locations Search Error:', error);
      
      if (error.response?.status === 401) {
        throw new Error('Kroger session expired. Please try again.');
      }

      if (error.code === 'ERR_NETWORK') {
        throw new Error('Cannot connect to Kroger API. Make sure the proxy server is running on port 3001.');
      }
      
      throw new Error('Failed to search Kroger locations. Please try again.');
    }
  }

  /**
   * Search Kroger products via proxy
   */
  async searchProducts(query, locationId = null, limit = 25) {
    try {
      const params = {
        term: query,
        limit: limit,
      };

      if (locationId) {
        params.locationId = locationId;
      }

      const response = await axios.get(`${PROXY_BASE_URL}/products`, {
        params: params,
      });

      // Enrich with nutrition (Kroger first, USDA fills gaps)
      const enrichedProducts = await this.enrichWithNutrition(response.data.data);

      return enrichedProducts;
    } catch (error) {
      console.error('Kroger Search Error:', error);
      
      if (error.response?.status === 401) {
        throw new Error('Kroger session expired. Please try again.');
      }

      if (error.code === 'ERR_NETWORK') {
        throw new Error('Cannot connect to Kroger API. Make sure the proxy server is running on port 3001.');
      }
      
      throw new Error('Failed to search Kroger products. Please try again.');
    }
  }

  /**
   * Extract and parse Kroger nutrition data
   */
  parseKrogerNutrition(krogerProduct) {
    const nutrition = krogerProduct.items?.[0]?.nutrition?.nutritionLabel;
    
    if (!nutrition) {
      return null;
    }

    // Parse values like "8g" or "150" to numbers
    const parseValue = (value) => {
      if (!value) return 0;
      if (typeof value === 'number') return value;
      const match = value.toString().match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };

    return {
      servingSize: nutrition.servingSize || null,
      calories: parseValue(nutrition.calories),
      protein: parseValue(nutrition.protein),
      totalCarbohydrate: parseValue(nutrition.totalCarbohydrate),
      totalFat: parseValue(nutrition.totalFat),
      saturatedFat: parseValue(nutrition.saturatedFat),
      transFat: parseValue(nutrition.transFat),
      cholesterol: parseValue(nutrition.cholesterol),
      sodium: parseValue(nutrition.sodium),
      dietaryFiber: parseValue(nutrition.dietaryFiber),
      sugars: parseValue(nutrition.sugars),
      addedSugars: parseValue(nutrition.addedSugars),
    };
  }

  /**
   * Smart USDA matching - tries multiple strategies
   */
  async findBestUSDAMatch(krogerProduct) {
    // Strategy 1: Full product name
    let results = await usdaService.searchFoods(krogerProduct.description, 5);
    
    if (results.length > 0) {
      // Prefer brand match if available
      if (krogerProduct.brand) {
        const brandMatch = results.find(r => 
          r.brandName?.toLowerCase().includes(krogerProduct.brand.toLowerCase())
        );
        if (brandMatch) return brandMatch;
      }
      return results[0];
    }

    // Strategy 2: Remove brand name, search generic
    if (krogerProduct.brand) {
      const generic = krogerProduct.description
        .replace(new RegExp(krogerProduct.brand, 'gi'), '')
        .trim();
      
      results = await usdaService.searchFoods(generic, 5);
      if (results.length > 0) return results[0];
    }

    // Strategy 3: Extract core food item
    // Remove common modifiers like "Simple Truth", "Organic", "Natural", etc.
    const coreFood = krogerProduct.description
      .toLowerCase()
      .replace(/\b(simple truth|kroger|organic|natural|fresh|boneless|skinless|family pack|big deal)\b/gi, '')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 3)
      .join(' ');
    
    if (coreFood) {
      results = await usdaService.searchFoods(coreFood, 5);
      if (results.length > 0) return results[0];
    }

    return null;
  }

  /**
   * Merge nutrition: Kroger values override USDA, USDA fills gaps
   */
  mergeNutritionData(krogerNutrition, usdaNutrition) {
    const merged = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      servingSize: 100,
      servingUnit: 'g',
      nutritionSource: 'none'
    };

    // Fill from USDA if available
    if (usdaNutrition) {
      merged.calories = usdaNutrition.calories || 0;
      merged.protein = usdaNutrition.protein || 0;
      merged.carbs = usdaNutrition.carbs || 0;
      merged.fat = usdaNutrition.fat || 0;
      merged.fiber = usdaNutrition.fiber || 0;
      merged.sugar = usdaNutrition.sugar || 0;
      merged.sodium = usdaNutrition.sodium || 0;
      merged.servingSize = usdaNutrition.servingSize || 100;
      merged.servingUnit = usdaNutrition.servingUnit || 'g';
      merged.nutritionSource = 'usda';
    }

    // Override with Kroger where available (takes priority)
    if (krogerNutrition) {
      if (krogerNutrition.calories > 0) {
        merged.calories = krogerNutrition.calories;
        merged.nutritionSource = usdaNutrition ? 'kroger+usda' : 'kroger';
      }
      if (krogerNutrition.protein > 0) merged.protein = krogerNutrition.protein;
      if (krogerNutrition.totalCarbohydrate > 0) merged.carbs = krogerNutrition.totalCarbohydrate;
      if (krogerNutrition.totalFat > 0) merged.fat = krogerNutrition.totalFat;
      if (krogerNutrition.dietaryFiber > 0) merged.fiber = krogerNutrition.dietaryFiber;
      if (krogerNutrition.sugars > 0) merged.sugar = krogerNutrition.sugars;
      if (krogerNutrition.sodium > 0) merged.sodium = krogerNutrition.sodium;

      // Kroger-specific data
      merged.saturatedFat = krogerNutrition.saturatedFat || 0;
      merged.transFat = krogerNutrition.transFat || 0;
      merged.cholesterol = krogerNutrition.cholesterol || 0;
      
      if (krogerNutrition.servingSize) {
        merged.servingSizeText = krogerNutrition.servingSize;
      }
      
      // If Kroger has complete macros, mark as Kroger only
      if (krogerNutrition.calories > 0 && 
          krogerNutrition.protein > 0 && 
          krogerNutrition.totalCarbohydrate > 0 && 
          krogerNutrition.totalFat > 0) {
        merged.nutritionSource = 'kroger';
      }
    }

    return merged;
  }

  /**
   * Enrich products with nutrition
   */
  async enrichWithNutrition(krogerProducts) {
    const enrichedProducts = [];

    for (const product of krogerProducts) {
      try {
        const productInfo = {
          krogerProductId: product.productId,
          upc: product.upc,
          name: product.description,
          brandName: product.brand || null,
          category: product.categories?.[0] || 'Other',
          price: this.extractPrice(product),
          priceUnit: this.extractPriceUnit(product),
          onSale: product.items?.[0]?.price?.promo > 0,
          size: product.items?.[0]?.size || null,
          images: product.images?.map(img => img.sizes?.[0]?.url).filter(Boolean) || [],
        };

        // Get Kroger nutrition
        const krogerNutrition = this.parseKrogerNutrition(product);
        
        // Get USDA nutrition (for gaps/fallback)
        let usdaNutrition = null;
        try {
          usdaNutrition = await this.findBestUSDAMatch(product);
        } catch (err) {
          console.warn(`USDA lookup failed for ${product.description}`);
        }

        // Merge (Kroger priority)
        const nutrition = this.mergeNutritionData(krogerNutrition, usdaNutrition);
        Object.assign(productInfo, nutrition);

        productInfo.hasNutrition = nutrition.nutritionSource !== 'none';
        
        if (usdaNutrition) {
          productInfo.fdcId = usdaNutrition.fdcId;
        }

        enrichedProducts.push(productInfo);
      } catch (error) {
        console.error(`Error enriching ${product.productId}:`, error);
      }
    }

    return enrichedProducts;
  }

  extractPrice(product) {
    const item = product.items?.[0];
    if (!item?.price) return null;
    return item.price.promo || item.price.regular || null;
  }

  extractPriceUnit(product) {
    const item = product.items?.[0];
    return item?.price?.unitOfMeasure || 'each';
  }

  async getProductByUPC(upc, locationId = null) {
    try {
      const params = locationId ? { locationId } : {};
      const response = await axios.get(`${PROXY_BASE_URL}/products/${upc}`, { params });

      if (response.data) {
        const enriched = await this.enrichWithNutrition([response.data]);
        return enriched[0];
      }
      return null;
    } catch (error) {
      console.error('Kroger UPC Error:', error);
      throw new Error('Failed to find product by UPC');
    }
  }

  calculateNutrition(productData, amount) {
    const baseAmount = productData.servingSize || 100;
    const factor = amount / baseAmount;

    return {
      calories: (productData.calories * factor).toFixed(1),
      protein: (productData.protein * factor).toFixed(1),
      carbs: (productData.carbs * factor).toFixed(1),
      fat: (productData.fat * factor).toFixed(1),
    };
  }
}

export const krogerService = new KrogerService();