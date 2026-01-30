import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn('⚠️ Anthropic API key not found. Please add VITE_ANTHROPIC_API_KEY to .env file');
}

// ⚠️ WARNING: This exposes your API key in the frontend
// For production, move this to a backend API endpoint
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true, // Only for development!
});

export const claudeService = {
  // Generate recipe suggestions based on available ingredients
  async suggestRecipes(inventoryItems, preferences = {}) {
    try {
      const ingredientsList = inventoryItems.map(item => item.name).join(', ');
      
      const prompt = `I have these ingredients in my kitchen: ${ingredientsList}.

Please suggest 10-15 creative recipes I can make. For each recipe:
1. Name of the dish
2. Brief description (1-2 sentences)
3. Difficulty level (Easy/Medium/Hard)
4. Cooking time in minutes
5. List of ingredients needed from my inventory
6. List of any missing ingredients (if any)
7. Cuisine type
8. Estimated calories per serving

${preferences.dietary ? `Dietary preference: ${preferences.dietary}` : ''}
${preferences.cuisine ? `Preferred cuisine: ${preferences.cuisine}` : ''}
${preferences.cookingTime ? `Maximum cooking time: ${preferences.cookingTime} minutes` : ''}

CRITICAL: Return ONLY a valid JSON array. No explanations, no markdown formatting, just the JSON array.

Return ONLY a JSON array with this exact structure:
[
  {
    "name": "Recipe Name",
    "description": "Brief description without quotes",
    "difficulty": "Easy",
    "cookingTime": 30,
    "cuisine": "Italian",
    "calories": 450,
    "availableIngredients": ["ingredient1", "ingredient2"],
    "missingIngredients": ["ingredient3"],
    "instructions": "Step by step cooking instructions"
  }
]

Return ONLY the JSON array, no other text. Start with [ and end with ].`;

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096, // Increased for 10-15 recipes
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const textContent = message.content[0].text;
      
      // Clean the response more thoroughly
      let cleanedText = textContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Try to parse, with better error handling
      let recipes;
      try {
        recipes = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Raw text:', textContent);
        console.error('Cleaned text:', cleanedText);
        
        // Try to extract JSON from markdown code blocks
        const jsonMatch = textContent.match(/```json\s*(\[[\s\S]*?\])\s*```/);
        if (jsonMatch) {
          try {
            recipes = JSON.parse(jsonMatch[1]);
          } catch (e) {
            throw new Error('Could not parse recipe suggestions. Please try again.');
          }
        } else {
          throw new Error('Invalid response format from AI. Please try again.');
        }
      }
      
      // Calculate match percentage for each recipe
      return recipes.map(recipe => ({
        ...recipe,
        matchPercentage: Math.round(
          (recipe.availableIngredients.length / 
          (recipe.availableIngredients.length + recipe.missingIngredients.length)) * 100
        ),
      }));
    } catch (error) {
      console.error('Claude API Error:', error);
      throw new Error('Failed to generate recipe suggestions. Please try again.');
    }
  },
};