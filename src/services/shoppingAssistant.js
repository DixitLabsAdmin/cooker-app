import { krogerService } from './kroger';
import { usdaService } from './usda';

// Use local proxy to avoid CORS issues
const CLAUDE_PROXY_URL = import.meta.env.VITE_CLAUDE_PROXY_URL || 'http://localhost:3002';

export const shoppingAssistantService = {
  /**
   * Process natural language command using Claude
   */
  async processCommand(userInput) {
    try {
      console.log('🤖 Processing command:', userInput);
      console.log('🔗 Using proxy:', CLAUDE_PROXY_URL);

      const response = await fetch(`${CLAUDE_PROXY_URL}/api/claude/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `You are a shopping list assistant. Parse the following user command and extract the action and items.

User command: "${userInput}"

Respond with ONLY valid JSON (no markdown, no backticks, no explanations):
{
  "action": "add" | "remove" | "check_inventory" | "inventory" | "expiring" | "suggest_meals" | "recipes" | "unknown",
  "items": [{"name": "item name", "amount": null, "unit": null}],
  "confidence": "high"
}

Action types:
- "add" = adding items to shopping list
- "remove" = removing items from shopping list
- "check_inventory" or "inventory" = checking what's in inventory
- "expiring" = checking for old/expiring items
- "suggest_meals" or "recipes" = suggest recipes based on inventory
- "unknown" = command not understood

Examples:
"add chicken" → {"action": "add", "items": [{"name": "chicken", "amount": null, "unit": null}], "confidence": "high"}
"remove milk" → {"action": "remove", "items": [{"name": "milk", "amount": null, "unit": null}], "confidence": "high"}
"what's in my inventory?" → {"action": "inventory", "items": [], "confidence": "high"}
"what items are expiring soon?" → {"action": "expiring", "items": [], "confidence": "high"}
"suggest meals based on inventory" → {"action": "suggest_meals", "items": [], "confidence": "high"}
"what can I cook?" → {"action": "suggest_meals", "items": [], "confidence": "high"}
"show me recipes" → {"action": "suggest_meals", "items": [], "confidence": "high"}`
          }]
        })
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('📦 Full response:', data);
      
      const responseText = data.content[0].text.trim();
      console.log('📝 Response text:', responseText);
      
      // Remove any markdown formatting if present
      let cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      console.log('🧹 Cleaned response:', cleanedResponse);
      
      // Parse the JSON response
      const parsed = JSON.parse(cleanedResponse);
      console.log('✅ Parsed command:', parsed);
      
      return parsed;
    } catch (error) {
      console.error('❌ Error processing command:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      
      return {
        action: 'unknown',
        items: [],
        confidence: 'low',
        error: error.message,
        details: 'Check browser console for more information'
      };
    }
  },

  /**
   * Add items to shopping list with Kroger/USDA enrichment
   */
  async addItemsToShoppingList(items, supabase, userId) {
    const results = {
      added: [],
      failed: [],
      enriched: 0
    };

    for (const item of items) {
      try {
        console.log(`➕ Adding: ${item.name}`);
        
        // Check if this is actually food
        const itemIsFood = this.isFood(item.name);
        if (!itemIsFood) {
          console.log(`⚠️ "${item.name}" detected as non-food, skipping nutrition lookup`);
        }
        
        // Search Kroger first for best data (only for food items)
        let nutritionData = null;
        let category = 'Other';
        let price = null;
        let brandName = null;

        if (itemIsFood) {
          try {
            const krogerResults = await krogerService.searchProducts(item.name, null, 1);
            if (krogerResults && krogerResults.length > 0) {
              const product = krogerResults[0];
              nutritionData = {
                calories: product.calories || 0,
                protein: product.protein || 0,
                carbs: product.carbs || 0,
                fat: product.fat || 0,
                servingSize: product.servingSize || 100,
                servingUnit: product.servingUnit || 'g'
              };
              category = product.category || 'Other';
              price = product.price;
              brandName = product.brandName;
              console.log(`✅ Kroger: ${product.name} - ${product.calories} cal`);
            }
          } catch (err) {
            console.log('⚠️ Kroger search failed, trying USDA...');
          }

          // If no nutrition from Kroger, try USDA (only for food)
          if (!nutritionData || nutritionData.calories === 0) {
            try {
              const usdaResults = await usdaService.searchFoods(item.name, 1);
              if (usdaResults && usdaResults.length > 0) {
                const usdaFood = usdaResults[0];
                nutritionData = {
                  calories: usdaFood.calories || 0,
                  protein: usdaFood.protein || 0,
                  carbs: usdaFood.carbs || 0,
                  fat: usdaFood.fat || 0,
                  servingSize: usdaFood.servingSize || 100,
                  servingUnit: usdaFood.servingUnit || 'g'
                };
                console.log(`✅ USDA: ${usdaFood.name} - ${usdaFood.calories} cal`);
                results.enriched++;
              }
            } catch (err) {
              console.log('⚠️ USDA search failed');
            }
          } else {
            results.enriched++;
          }
        }

        // Smart category detection if needed
        if (category === 'Other') {
          category = this.categorizeIngredient(item.name);
        }

        // Insert into database
        const { data, error } = await supabase
          .from('shopping_list_items')
          .insert({
            user_id: userId,
            name: item.name,
            amount: item.amount || 1,
            unit: item.unit || 'item',
            category: category,
            is_purchased: false,
            brand_name: brandName,
            calories: nutritionData?.calories || 0,
            protein: nutritionData?.protein || 0,
            carbs: nutritionData?.carbs || 0,
            fat: nutritionData?.fat || 0,
            serving_size: nutritionData?.servingSize || 100,
            serving_unit: nutritionData?.servingUnit || 'g',
            price: price
          })
          .select()
          .single();

        if (error) throw error;

        results.added.push({
          name: item.name,
          data: data,
          hasNutrition: nutritionData && nutritionData.calories > 0
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`❌ Failed to add ${item.name}:`, error);
        results.failed.push({
          name: item.name,
          error: error.message
        });
      }
    }

    return results;
  },

  /**
   * Remove items from shopping list
   */
  async removeItemsFromShoppingList(items, supabase, userId) {
    const results = {
      removed: [],
      notFound: []
    };

    for (const item of items) {
      try {
        // Search for matching items (case-insensitive)
        const { data: existingItems, error: searchError } = await supabase
          .from('shopping_list_items')
          .select('*')
          .eq('user_id', userId)
          .ilike('name', `%${item.name}%`);

        if (searchError) throw searchError;

        if (existingItems && existingItems.length > 0) {
          // Delete all matching items
          const { error: deleteError } = await supabase
            .from('shopping_list_items')
            .delete()
            .in('id', existingItems.map(i => i.id));

          if (deleteError) throw deleteError;

          results.removed.push({
            name: item.name,
            count: existingItems.length
          });
        } else {
          results.notFound.push(item.name);
        }
      } catch (error) {
        console.error(`❌ Failed to remove ${item.name}:`, error);
        results.notFound.push(item.name);
      }
    }

    return results;
  },

  /**
   * Smart category detection
   */
  categorizeIngredient(name) {
    const nameLower = name.toLowerCase();
    
    // FIRST: Check for non-food items (these should NEVER get nutrition data)
    if (/clean|cleaner|detergent|soap|bleach|disinfect|wipe|sponge|scrub|polish|spray|lysol|clorox|ajax|tide|dawn|paper towel|trash bag|aluminum foil|plastic wrap|ziplock/.test(nameLower)) {
      return 'Cleaning & Household';
    }
    
    // Baby/personal care products (non-food)
    if (/diaper|wipe|formula|baby food|pacifier|bottle|lotion|shampoo|conditioner|toothpaste|deodorant|tissue|toilet paper/.test(nameLower)) {
      return 'Baby & Personal Care';
    }
    
    // Pet products (non-food for humans)
    if (/dog food|cat food|pet|kitty litter|bird seed/.test(nameLower)) {
      return 'Pet Supplies';
    }
    
    // FOOD CATEGORIES BELOW
    
    // Bakery - improved matching to avoid "baby" confusion
    if (/\bbakery\b|^pizza|bread|bun|roll|bagel|croissant|muffin|donut|cake|pastry|pie|cookie|brownie|cupcake|flour|yeast|tortilla/.test(nameLower)) {
      return 'Bakery';
    }
    
    // Produce
    if (/tomato|lettuce|onion|garlic|pepper|carrot|celery|potato|spinach|kale|broccoli|cauliflower|cucumber|zucchini|squash|apple|banana|orange|lemon|lime|berry|fruit|vegetable|avocado|mushroom|ginger|herbs?|parsley|cilantro|basil/.test(nameLower)) {
      return 'Produce';
    }
    
    // Meat & Seafood
    if (/chicken|beef|pork|turkey|lamb|fish|salmon|tuna|shrimp|meat|steak|ground|breast|thigh|wing|bacon|sausage|ham/.test(nameLower)) {
      return 'Meat & Seafood';
    }
    
    // Dairy
    if (/milk|cheese|butter|cream|yogurt|dairy|egg|parmesan|cheddar|mozzarella/.test(nameLower)) {
      return 'Dairy';
    }
    
    // Pantry
    if (/oil|vinegar|salt|pepper|spice|sugar|rice|pasta|noodle|sauce|can|jar|stock|broth|soy sauce|honey|mustard|mayo|ketchup|olive oil|vegetable oil/.test(nameLower)) {
      return 'Pantry';
    }
    
    // Frozen
    if (/frozen|ice/.test(nameLower)) {
      return 'Frozen';
    }
    
    // Beverages
    if (/juice|soda|water|coffee|tea|drink|beverage|wine|beer/.test(nameLower)) {
      return 'Beverages';
    }
    
    // Snacks
    if (/chip|cracker|cookie|candy|snack|popcorn|nuts?/.test(nameLower)) {
      return 'Snacks';
    }
    
    return 'Other';
  },
  
  /**
   * Check if item is food (should have nutrition data)
   */
  isFood(name) {
    const nameLower = name.toLowerCase();
    
    // Non-food categories that should NEVER have nutrition
    const nonFoodPatterns = [
      /clean|cleaner|detergent|soap|bleach|disinfect|wipe|sponge|scrub|polish|spray/,
      /lysol|clorox|ajax|tide|dawn|mr\. clean|windex|fantastik/,
      /paper towel|trash bag|aluminum foil|plastic wrap|ziplock|tissue|toilet paper/,
      /diaper|pacifier|bottle|lotion|shampoo|conditioner|toothpaste|deodorant/,
      /dog food|cat food|pet|kitty litter|bird seed/,
      /battery|light bulb|tape|glue|pen|pencil|marker/
    ];
    
    return !nonFoodPatterns.some(pattern => pattern.test(nameLower));
  }
};