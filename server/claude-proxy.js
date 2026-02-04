import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// CLAUDE API PROXY
// ============================================
app.post('/api/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Claude API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MEALDB API PROXY (to avoid CORS issues)
// ============================================
const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';

// Search recipes by name
app.get('/api/mealdb/search', async (req, res) => {
  try {
    const { s } = req.query;
    const response = await fetch(`${MEALDB_BASE}/search.php?s=${encodeURIComponent(s || '')}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB search error:', error);
    res.status(500).json({ error: error.message, meals: null });
  }
});

// Lookup recipe by ID
app.get('/api/mealdb/lookup', async (req, res) => {
  try {
    const { i } = req.query;
    const response = await fetch(`${MEALDB_BASE}/lookup.php?i=${i}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB lookup error:', error);
    res.status(500).json({ error: error.message, meals: null });
  }
});

// Filter recipes by ingredient
app.get('/api/mealdb/filter', async (req, res) => {
  try {
    const { i } = req.query;
    const response = await fetch(`${MEALDB_BASE}/filter.php?i=${encodeURIComponent(i || '')}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB filter error:', error);
    res.status(500).json({ error: error.message, meals: null });
  }
});

// Get all categories
app.get('/api/mealdb/categories', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/categories.php`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB categories error:', error);
    res.status(500).json({ error: error.message, categories: null });
  }
});

// Get random recipe
app.get('/api/mealdb/random', async (req, res) => {
  try {
    const response = await fetch(`${MEALDB_BASE}/random.php`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB random error:', error);
    res.status(500).json({ error: error.message, meals: null });
  }
});

// List all meals by first letter
app.get('/api/mealdb/list', async (req, res) => {
  try {
    const { f } = req.query;
    const response = await fetch(`${MEALDB_BASE}/search.php?f=${f || 'a'}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB list error:', error);
    res.status(500).json({ error: error.message, meals: null });
  }
});

// Filter by category
app.get('/api/mealdb/filter/category', async (req, res) => {
  try {
    const { c } = req.query;
    const response = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(c || '')}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB filter category error:', error);
    res.status(500).json({ error: error.message, meals: null });
  }
});

// Filter by area/cuisine
app.get('/api/mealdb/filter/area', async (req, res) => {
  try {
    const { a } = req.query;
    const response = await fetch(`${MEALDB_BASE}/filter.php?a=${encodeURIComponent(a || '')}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MealDB filter area error:', error);
    res.status(500).json({ error: error.message, meals: null });
  }
});

// ============================================
// USDA API PROXY (if needed)
// ============================================
app.get('/api/usda/search', async (req, res) => {
  try {
    const { query } = req.query;
    const apiKey = process.env.USDA_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'USDA API key not configured' });
    }

    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=5`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('USDA API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: ['claude', 'mealdb', 'usda']
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`📡 Available endpoints:`);
  console.log(`   - POST /api/claude (Claude AI)`);
  console.log(`   - GET  /api/mealdb/search?s=name (Search recipes)`);
  console.log(`   - GET  /api/mealdb/lookup?i=id (Get recipe by ID)`);
  console.log(`   - GET  /api/mealdb/filter?i=ingredient (Filter by ingredient)`);
  console.log(`   - GET  /api/mealdb/categories (Get categories)`);
  console.log(`   - GET  /api/mealdb/random (Random recipe)`);
  console.log(`   - GET  /api/usda/search?query=food (USDA nutrition)`);
  console.log(`   - GET  /health (Health check)`);
});