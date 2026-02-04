import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { shoppingAssistantService } from '../services/shoppingAssistant';
import { mealDbService } from '../services/mealDb';
import { usdaService } from '../services/usda';

export default function AIAssistant() {
  const [userInput, setUserInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [inventory, setInventory] = useState([]);
  const [ingredientAvailability, setIngredientAvailability] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([
    {
      role: 'assistant',
      message: "Hi! I'm your AI cooking assistant. I can help you manage your shopping list, inventory, and meal planning. Try asking me to:",
      suggestions: [
        "Add items to your shopping list",
        "Remove items from shopping list",
        "Check what's in your inventory",
        "Find items that are expiring soon",
        "Suggest meals based on my inventory"
      ]
    }
  ]);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id);

      if (!error && data) {
        setInventory(data);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
    }
  };

  const checkIngredientInInventory = (ingredientName) => {
    const ingName = ingredientName.toLowerCase().trim();
    
    const match = inventory.find(invItem => {
      const invName = invItem.name.toLowerCase().trim();
      return invName.includes(ingName) || ingName.includes(invName);
    });

    return {
      isAvailable: !!match,
      inventoryItem: match || null,
      inventoryAmount: match?.amount || 0,
      inventoryUnit: match?.unit || ''
    };
  };

  const calculateIngredientAvailability = (ingredients) => {
    return ingredients.map(ing => {
      const availability = checkIngredientInInventory(ing.name);
      return {
        ...ing,
        ...availability
      };
    });
  };

  const handleSubmit = async () => {
    if (!userInput.trim()) return;

    const userMessage = userInput.trim();
    setUserInput('');
    
    setConversationHistory(prev => [...prev, {
      role: 'user',
      message: userMessage
    }]);

    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const parsed = await shoppingAssistantService.processCommand(userMessage);
      console.log('📋 Parsed command:', parsed);

      let assistantResponse = null;

      if (parsed.action === 'add') {
        const results = await shoppingAssistantService.addItemsToShoppingList(
          parsed.items,
          supabase,
          user.id
        );

        assistantResponse = {
          role: 'assistant',
          message: `✅ I've added ${results.added.length} items to your shopping list!`,
          details: results.added.map(r => ({
            text: r.name,
            subtext: r.hasNutrition ? 'With nutrition data' : 'Added successfully'
          })),
          success: true
        };

        if (results.enriched > 0) {
          assistantResponse.footer = `🔬 ${results.enriched} items enriched with nutrition data`;
        }

        if (results.failed.length > 0) {
          assistantResponse.warning = `⚠️ Failed to add: ${results.failed.map(f => f.name).join(', ')}`;
        }

      } else if (parsed.action === 'remove') {
        const results = await shoppingAssistantService.removeItemsFromShoppingList(
          parsed.items,
          supabase,
          user.id
        );

        if (results.removed.length > 0) {
          assistantResponse = {
            role: 'assistant',
            message: `✅ I've removed ${results.removed.length} items from your shopping list`,
            details: results.removed.map(r => ({
              text: r.name,
              subtext: `${r.count} item${r.count > 1 ? 's' : ''} removed`
            })),
            success: true
          };
        }

        if (results.notFound.length > 0) {
          if (results.removed.length === 0) {
            assistantResponse = {
              role: 'assistant',
              message: `❌ I couldn't find those items in your shopping list`,
              details: results.notFound.map(name => ({
                text: name,
                subtext: 'Not in shopping list'
              })),
              success: false
            };
          } else {
            assistantResponse.warning = `⚠️ Couldn't find: ${results.notFound.join(', ')}`;
          }
        }

      } else if (parsed.action === 'check_inventory' || parsed.action === 'inventory') {
        const { data: inventoryItems, error } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;
        setInventory(inventoryItems || []);

        if (inventoryItems.length === 0) {
          assistantResponse = {
            role: 'assistant',
            message: "📦 Your inventory is empty. Items you purchase from your shopping list will appear here.",
            success: false
          };
        } else {
          const displayLimit = 10;
          const hasMore = inventoryItems.length > displayLimit;
          
          assistantResponse = {
            role: 'assistant',
            message: `📦 You have ${inventoryItems.length} items in your inventory`,
            details: inventoryItems.slice(0, displayLimit).map(item => ({
              text: item.name,
              subtext: `${item.amount} ${item.unit}`
            })),
            success: true,
            expandable: hasMore,
            expandText: `...and ${inventoryItems.length - displayLimit} more items`,
            allItems: inventoryItems
          };
        }

      } else if (parsed.action === 'suggest_meals' || parsed.action === 'recipes') {
        const { data: inventoryItems, error } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;
        setInventory(inventoryItems || []);

        if (inventoryItems.length === 0) {
          assistantResponse = {
            role: 'assistant',
            message: "📦 Your inventory is empty. Add some items first, then I can suggest recipes!",
            success: false
          };
        } else {
          console.log('🍳 Searching for recipes based on inventory...');
          const recipes = await mealDbService.findRecipesByInventory(inventoryItems);

          if (recipes.length === 0) {
            assistantResponse = {
              role: 'assistant',
              message: "😔 I couldn't find any recipes matching your inventory. Try adding more common ingredients!",
              success: false
            };
          } else {
            assistantResponse = {
              role: 'assistant',
              message: `🍳 I found ${recipes.length} recipes you can make! (Sorted by match %)`,
              details: recipes.map(recipe => ({
                text: recipe.strMeal,
                subtext: `${recipe.matchPercentage}% match • ${recipe.strCategory} • ${recipe.strArea} • ${recipe.matchCount}/${recipe.totalIngredients} ingredients`,
                image: recipe.strMealThumb,
                id: recipe.idMeal,
                matchPercentage: recipe.matchPercentage,
                recipeData: recipe
              })),
              success: true,
              isRecipes: true
            };
          }
        }

      } else if (parsed.action === 'expiring') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: oldItems, error } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('user_id', user.id)
          .lt('created_at', sevenDaysAgo.toISOString());

        if (error) throw error;

        if (oldItems.length === 0) {
          assistantResponse = {
            role: 'assistant',
            message: "✅ Great news! You don't have any old items in your inventory.",
            success: true
          };
        } else {
          assistantResponse = {
            role: 'assistant',
            message: `⚠️ You have ${oldItems.length} items that are 7+ days old`,
            details: oldItems.map(item => {
              const days = Math.floor((Date.now() - new Date(item.created_at)) / (1000 * 60 * 60 * 24));
              return {
                text: item.name,
                subtext: `${days} days old`
              };
            }),
            success: false
          };
        }

      } else {
        assistantResponse = {
          role: 'assistant',
          message: "I'm not sure what you'd like me to do. Try asking me to:",
          suggestions: [
            "add chicken and milk to shopping list",
            "remove eggs from shopping list",
            "what's in my inventory?",
            "what items are expiring soon?"
          ],
          success: false
        };
      }

      setConversationHistory(prev => [...prev, assistantResponse]);

    } catch (error) {
      console.error('❌ Assistant error:', error);
      setConversationHistory(prev => [...prev, {
        role: 'assistant',
        message: `❌ Sorry, I encountered an error: ${error.message}`,
        success: false
      }]);
    } finally {
      setProcessing(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setUserInput(suggestion);
  };

  const handleRecipeClick = async (recipeData) => {
    console.log('🍳 Loading recipe details:', recipeData.strMeal);
    await loadInventory();
    const ingredientsWithAvailability = calculateIngredientAvailability(recipeData.ingredients || []);
    setIngredientAvailability(ingredientsWithAvailability);
    setSelectedRecipe(recipeData);
    setShowRecipeModal(true);
  };

  const handleExpandInventory = (allItems) => {
    setConversationHistory(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg.expandable) {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMsg,
            details: allItems.map(item => ({
              text: item.name,
              subtext: `${item.amount} ${item.unit}`
            })),
            expandable: false,
            expandText: null
          }
        ];
      }
      return prev;
    });
  };

  const determineMealType = (category, recipeName) => {
    const categoryLower = (category || '').toLowerCase();
    const nameLower = (recipeName || '').toLowerCase();
    
    if (categoryLower.includes('breakfast') || 
        nameLower.includes('breakfast') ||
        nameLower.includes('pancake') ||
        nameLower.includes('waffle') ||
        nameLower.includes('omelette') ||
        nameLower.includes('omelet') ||
        nameLower.includes('eggs benedict') ||
        nameLower.includes('french toast') ||
        nameLower.includes('cereal') ||
        nameLower.includes('porridge') ||
        nameLower.includes('oatmeal')) {
      return 'breakfast';
    }
    
    if (categoryLower.includes('dessert') || 
        categoryLower.includes('snack') ||
        categoryLower.includes('starter') ||
        categoryLower.includes('side') ||
        nameLower.includes('cookie') ||
        nameLower.includes('cake') ||
        nameLower.includes('brownie') ||
        nameLower.includes('pudding') ||
        nameLower.includes('ice cream') ||
        nameLower.includes('chips') ||
        nameLower.includes('dip')) {
      return 'snack';
    }
    
    if (nameLower.includes('sandwich') ||
        nameLower.includes('salad') ||
        nameLower.includes('soup') ||
        nameLower.includes('wrap') ||
        nameLower.includes('burger')) {
      return 'lunch';
    }
    
    return 'dinner';
  };

  // Improved nutrition lookup with better error handling
  const enrichIngredientsWithNutrition = async (ingredients) => {
    console.log('🔬 Starting nutrition lookup for', ingredients.length, 'ingredients...');
    const enrichedIngredients = [];
    
    for (let i = 0; i < ingredients.length; i++) {
      const ingredient = ingredients[i];
      setSaveProgress(`Looking up nutrition: ${ingredient.name} (${i + 1}/${ingredients.length})`);
      
      try {
        console.log(`🔍 Searching USDA for: ${ingredient.name}`);
        const usdaResults = await usdaService.searchFoods(ingredient.name, 1);
        
        if (usdaResults && usdaResults.length > 0) {
          const usdaFood = usdaResults[0];
          const enriched = {
            ...ingredient,
            calories: Math.round(usdaFood.calories || 0),
            protein: Math.round(usdaFood.protein || 0),
            carbs: Math.round(usdaFood.carbs || 0),
            fat: Math.round(usdaFood.fat || 0)
          };
          enrichedIngredients.push(enriched);
          console.log(`✅ USDA match for ${ingredient.name}: ${enriched.calories} cal, ${enriched.protein}g protein`);
        } else {
          console.log(`⚠️ No USDA results for ${ingredient.name}`);
          enrichedIngredients.push({
            ...ingredient,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0
          });
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`❌ Error looking up ${ingredient.name}:`, error);
        enrichedIngredients.push({
          ...ingredient,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        });
      }
    }
    
    return enrichedIngredients;
  };

  const handleSaveRecipe = async () => {
    if (!selectedRecipe || !selectedRecipe.fullDetails) {
      alert('Recipe details not available');
      return;
    }

    setSavingRecipe(true);
    setSaveProgress('Starting save...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const recipe = selectedRecipe.fullDetails;
      const rawIngredients = selectedRecipe.ingredients || [];

      console.log('📝 Saving recipe:', recipe.strMeal);
      console.log('📋 Raw ingredients:', rawIngredients.length);

      // Enrich ingredients with nutrition
      setSaveProgress('Looking up nutrition data...');
      const enrichedIngredients = await enrichIngredientsWithNutrition(rawIngredients);

      // Calculate totals
      const totalCalories = enrichedIngredients.reduce((sum, ing) => sum + (ing.calories || 0), 0);
      const totalProtein = enrichedIngredients.reduce((sum, ing) => sum + (ing.protein || 0), 0);
      const totalCarbs = enrichedIngredients.reduce((sum, ing) => sum + (ing.carbs || 0), 0);
      const totalFat = enrichedIngredients.reduce((sum, ing) => sum + (ing.fat || 0), 0);

      console.log(`📊 Nutrition totals - Cal: ${totalCalories}, Protein: ${totalProtein}g, Carbs: ${totalCarbs}g, Fat: ${totalFat}g`);

      const mealType = determineMealType(recipe.strCategory, recipe.strMeal);

      setSaveProgress('Saving recipe to database...');
      
      const recipeData = {
        user_id: user.id,
        name: recipe.strMeal,
        description: `${recipe.strCategory} • ${recipe.strArea} cuisine`,
        instructions: recipe.strInstructions,
        cuisine: recipe.strArea,
        difficulty: 'Medium',
        cooking_time: 30,
        servings: 4,
        image_url: recipe.strMealThumb,
        total_calories: totalCalories,
        total_protein: totalProtein,
        total_carbs: totalCarbs,
        total_fat: totalFat,
        external_id: recipe.idMeal,
        external_source: 'mealdb',
        is_favorite: false,
        is_active: true,
        meal_type: mealType
      };

      const { data: savedRecipe, error: recipeError } = await supabase
        .from('recipes')
        .insert(recipeData)
        .select()
        .maybeSingle();

      if (recipeError) {
        console.error('Recipe save error:', recipeError);
        throw recipeError;
      }

      console.log('✅ Recipe saved with ID:', savedRecipe.id);

      // Save ingredients - WITHOUT serving_size and serving_unit columns
      if (enrichedIngredients.length > 0) {
        setSaveProgress(`Saving ${enrichedIngredients.length} ingredients...`);
        
        const ingredientsData = enrichedIngredients.map((ing, index) => {
          // Parse amount from measure string
          const amountMatch = (ing.measure || '').match(/[\d.\/]+/);
          let amount = 1;
          if (amountMatch) {
            if (amountMatch[0].includes('/')) {
              const [num, denom] = amountMatch[0].split('/');
              amount = parseFloat(num) / parseFloat(denom);
            } else {
              amount = parseFloat(amountMatch[0]) || 1;
            }
          }

          return {
            recipe_id: savedRecipe.id,
            name: ing.name,
            amount: amount,
            unit: ing.measure || 'item',
            calories: ing.calories || 0,
            protein: ing.protein || 0,
            carbs: ing.carbs || 0,
            fat: ing.fat || 0,
            order_index: index
          };
        });

        console.log('💾 Inserting ingredients:', ingredientsData);

        const { data: savedIngredients, error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsData)
          .select();

        if (ingredientsError) {
          console.error('❌ Ingredients save error:', ingredientsError);
          alert(`⚠️ Recipe saved but ingredients failed: ${ingredientsError.message}`);
        } else {
          console.log(`✅ Saved ${savedIngredients?.length || 0} ingredients`);
        }
      }

      const availableCount = ingredientAvailability.filter(i => i.isAvailable).length;
      const totalCount = ingredientAvailability.length;

      alert(`✅ "${recipe.strMeal}" saved to your Recipes!\n\n📊 Nutrition: ${totalCalories} cal, ${totalProtein}g protein\n📦 Ingredients: ${availableCount}/${totalCount} in inventory\n🍽️ Meal type: ${mealType}`);
      
      setShowRecipeModal(false);
      setSelectedRecipe(null);
      setIngredientAvailability([]);
      setSaveProgress('');

    } catch (error) {
      console.error('❌ Error saving recipe:', error);
      alert(`Failed to save recipe: ${error.message}`);
    } finally {
      setSavingRecipe(false);
      setSaveProgress('');
    }
  };

  const getMatchPercentage = () => {
    if (ingredientAvailability.length === 0) return 0;
    const available = ingredientAvailability.filter(i => i.isAvailable).length;
    return Math.round((available / ingredientAvailability.length) * 100);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full mb-4">
          <span className="text-4xl">🤖</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Cooking Assistant</h1>
        <p className="text-gray-600">
          Powered by Claude • Manage your kitchen with natural language
        </p>
      </div>

      {/* Conversation History */}
      <div className="bg-white rounded-xl shadow-lg p-6 min-h-[500px] max-h-[600px] overflow-y-auto">
        <div className="space-y-6">
          {conversationHistory.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.success === true
                    ? 'bg-green-50 border-2 border-green-200'
                    : msg.success === false
                    ? 'bg-orange-50 border-2 border-orange-200'
                    : 'bg-gray-50 border-2 border-gray-200'
                }`}
              >
                <p className={`font-medium ${msg.role === 'user' ? 'text-white' : 'text-gray-900'}`}>
                  {msg.message}
                </p>

                {msg.details && msg.details.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {msg.details.map((detail, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        {detail.image ? (
                          <button
                            onClick={() => detail.recipeData && handleRecipeClick(detail.recipeData)}
                            className="flex items-center gap-3 w-full hover:bg-gray-50 rounded-lg p-2 transition-colors text-left"
                          >
                            <img 
                              src={detail.image} 
                              alt={detail.text}
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-900 font-medium">{detail.text}</span>
                                {detail.matchPercentage && (
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                    detail.matchPercentage >= 70 ? 'bg-green-100 text-green-700' :
                                    detail.matchPercentage >= 50 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>
                                    {detail.matchPercentage}% match
                                  </span>
                                )}
                              </div>
                              {detail.subtext && (
                                <span className="text-gray-600 text-sm block truncate">{detail.subtext}</span>
                              )}
                            </div>
                            <span className="text-gray-400 flex-shrink-0">→</span>
                          </button>
                        ) : (
                          <>
                            <span className="text-green-600 font-bold">•</span>
                            <div className="flex-1">
                              <span className="text-gray-900 font-medium">{detail.text}</span>
                              {detail.subtext && (
                                <span className="text-gray-600 text-sm ml-2">({detail.subtext})</span>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="block w-full text-left px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-700"
                      >
                        💡 {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                {msg.footer && (
                  <p className="mt-2 text-sm text-blue-600">{msg.footer}</p>
                )}

                {msg.expandable && msg.expandText && msg.allItems && (
                  <button
                    onClick={() => handleExpandInventory(msg.allItems)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium underline"
                  >
                    {msg.expandText}
                  </button>
                )}

                {msg.warning && (
                  <p className="mt-2 text-sm text-orange-600">{msg.warning}</p>
                )}
              </div>
            </div>
          ))}

          {processing && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                  <span className="text-gray-600">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !processing && handleSubmit()}
            placeholder='Try: "add chicken, milk, and eggs to shopping list"'
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
            disabled={processing}
          />
          <button
            onClick={handleSubmit}
            disabled={processing || !userInput.trim()}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {processing ? '⏳' : '🚀'} Send
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-sm text-gray-600">Quick actions:</span>
          <button
            onClick={() => setUserInput("add chicken and milk")}
            className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm hover:bg-purple-200 transition-colors"
          >
            ➕ Add items
          </button>
          <button
            onClick={() => setUserInput("what's in my inventory?")}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors"
          >
            📦 Check inventory
          </button>
          <button
            onClick={() => setUserInput("what items are expiring soon?")}
            className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm hover:bg-orange-200 transition-colors"
          >
            ⚠️ Expiring items
          </button>
          <button
            onClick={() => setUserInput("suggest meals based on my inventory")}
            className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm hover:bg-purple-200 transition-colors"
          >
            🍳 Suggest recipes
          </button>
          <button
            onClick={() => setUserInput("remove milk")}
            className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm hover:bg-red-200 transition-colors"
          >
            ➖ Remove items
          </button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border-2 border-purple-200">
          <div className="text-2xl mb-2">🛒</div>
          <h3 className="font-semibold text-gray-900 mb-1">Shopping List</h3>
          <p className="text-sm text-gray-600">Add or remove items with natural language</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border-2 border-green-200">
          <div className="text-2xl mb-2">📦</div>
          <h3 className="font-semibold text-gray-900 mb-1">Inventory</h3>
          <p className="text-sm text-gray-600">Check what you have and track freshness</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg p-4 border-2 border-orange-200">
          <div className="text-2xl mb-2">🍳</div>
          <h3 className="font-semibold text-gray-900 mb-1">Meal Ideas</h3>
          <p className="text-sm text-gray-600">Get recipe suggestions based on what you have</p>
        </div>
      </div>

      {/* Recipe Detail Modal */}
      {showRecipeModal && selectedRecipe && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{selectedRecipe.fullDetails.strMeal}</h2>
              <button
                onClick={() => {
                  setShowRecipeModal(false);
                  setSelectedRecipe(null);
                  setIngredientAvailability([]);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <img
                  src={selectedRecipe.fullDetails.strMealThumb}
                  alt={selectedRecipe.fullDetails.strMeal}
                  className="w-full rounded-lg object-cover"
                />
                <div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      {selectedRecipe.fullDetails.strCategory}
                    </span>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {selectedRecipe.fullDetails.strArea}
                    </span>
                    {selectedRecipe.matchPercentage && (
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        selectedRecipe.matchPercentage >= 70 ? 'bg-green-100 text-green-700' :
                        selectedRecipe.matchPercentage >= 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {selectedRecipe.matchPercentage}% Ingredient Match
                      </span>
                    )}
                  </div>

                  {/* Inventory Match Summary */}
                  {ingredientAvailability.length > 0 && (
                    <div className={`mb-4 p-3 rounded-lg ${
                      getMatchPercentage() >= 70 ? 'bg-green-50 border border-green-200' :
                      getMatchPercentage() >= 50 ? 'bg-yellow-50 border border-yellow-200' :
                      'bg-red-50 border border-red-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">
                          {getMatchPercentage() >= 70 ? '🟢' : getMatchPercentage() >= 50 ? '🟡' : '🔴'}
                        </span>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {ingredientAvailability.filter(i => i.isAvailable).length} of {ingredientAvailability.length} ingredients in your inventory
                          </p>
                          <p className="text-sm text-gray-600">
                            {getMatchPercentage()}% match
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ingredients with Availability */}
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Ingredients</h3>
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {ingredientAvailability.map((ing, idx) => (
                      <li key={idx} className={`flex items-start gap-2 text-sm p-2 rounded-lg ${
                        ing.isAvailable ? 'bg-green-50' : 'bg-red-50'
                      }`}>
                        <span className={ing.isAvailable ? 'text-green-600' : 'text-red-500'}>
                          {ing.isAvailable ? '✓' : '✗'}
                        </span>
                        <div className="flex-1">
                          <span className="text-gray-700">
                            <span className="font-medium">{ing.measure}</span> {ing.name}
                          </span>
                          {ing.isAvailable && ing.inventoryItem && (
                            <span className="text-green-600 text-xs block">
                              ({ing.inventoryAmount} {ing.inventoryUnit} in stock)
                            </span>
                          )}
                          {!ing.isAvailable && (
                            <span className="text-red-500 text-xs block">
                              Not in inventory
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Instructions</h3>
                <div className="prose prose-sm max-w-none">
                  {selectedRecipe.fullDetails.strInstructions.split('\n').map((paragraph, idx) => (
                    paragraph.trim() && (
                      <p key={idx} className="text-gray-700 mb-3">
                        {paragraph}
                      </p>
                    )
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleSaveRecipe}
                  disabled={savingRecipe}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingRecipe ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {saveProgress || 'Saving...'}
                    </>
                  ) : (
                    <>
                      💾 Save to My Recipes
                    </>
                  )}
                </button>

                {selectedRecipe.fullDetails.strYoutube && (
                  <a
                    href={selectedRecipe.fullDetails.strYoutube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    📺 Watch on YouTube
                  </a>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> When you save this recipe, we'll look up nutrition data for each ingredient and save all {ingredientAvailability.length} ingredients to your recipe.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}