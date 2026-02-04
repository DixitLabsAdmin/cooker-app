import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Kroger API Configuration
const KROGER_CLIENT_ID = process.env.KROGER_CLIENT_ID;
const KROGER_CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET;
const KROGER_API_BASE = 'https://api.kroger.com/v1';

// CORS Configuration - handle both with and without trailing slash
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];

// Add frontend URL from environment (with and without trailing slash)
if (process.env.FRONTEND_URL) {
  const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, ''); // Remove trailing slash
  allowedOrigins.push(frontendUrl);
  allowedOrigins.push(frontendUrl + '/'); // Also allow with trailing slash
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) return callback(null, true);
    
    // Check if origin matches (with or without trailing slash)
    const originWithoutSlash = origin.replace(/\/$/, '');
    const isAllowed = allowedOrigins.some(allowed => {
      const allowedWithoutSlash = allowed.replace(/\/$/, '');
      return originWithoutSlash === allowedWithoutSlash;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('⚠️ Blocked origin:', origin);
      console.log('✅ Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Token management
let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const credentials = Buffer.from(`${KROGER_CLIENT_ID}:${KROGER_CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post(
      'https://api.kroger.com/v1/connect/oauth2/token',
      'grant_type=client_credentials&scope=product.compact',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 min early
    
    console.log('✅ Got new Kroger access token');
    return accessToken;
  } catch (error) {
    console.error('❌ Failed to get Kroger token:', error.response?.data || error.message);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Kroger proxy server is running',
    allowedOrigins: allowedOrigins
  });
});

// Search products
app.get('/api/kroger/products', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { term, locationId, limit = 25 } = req.query;

    const params = {
      'filter.term': term,
      'filter.limit': limit
    };

    if (locationId) {
      params['filter.locationId'] = locationId;
    }

    const response = await axios.get(`${KROGER_API_BASE}/products`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: params
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Server error:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to search products',
      details: error.response?.data || { error: error.message }
    });
  }
});

// Get product by UPC
app.get('/api/kroger/products/:upc', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { upc } = req.params;
    const { locationId } = req.query;

    const params = locationId ? { 'filter.locationId': locationId } : {};

    const response = await axios.get(`${KROGER_API_BASE}/products/${upc}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: params
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Server error:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to get product',
      details: error.response?.data || { error: error.message }
    });
  }
});

// Search locations
app.get('/api/kroger/locations', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { zipCode, lat, lon, radiusMiles = 10, limit = 10 } = req.query;

    const params = {
      'filter.radiusInMiles': radiusMiles,
      'filter.limit': limit
    };

    if (zipCode) {
      params['filter.zipCode.near'] = zipCode;
    } else if (lat && lon) {
      params['filter.lat.near'] = lat;
      params['filter.lon.near'] = lon;
    } else {
      return res.status(400).json({ error: 'zipCode or lat/lon required' });
    }

    const response = await axios.get(`${KROGER_API_BASE}/locations`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: params
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Server error:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to search locations',
      details: error.response?.data || { error: error.message }
    });
  }
});

// Get specific location
app.get('/api/kroger/locations/:locationId', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { locationId } = req.params;

    const response = await axios.get(`${KROGER_API_BASE}/locations/${locationId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Server error:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to get location',
      details: error.response?.data || { error: error.message }
    });
  }
});
// Claude API proxy
app.post('/api/claude/messages', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
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
    console.log(`🔍 MealDB search request for: "${s}"`);
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
    console.log(`🔍 MealDB lookup request for ID: "${i}"`);
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
    console.log(`🔍 MealDB filter request for ingredient: "${i}"`);
    
    const url = `${MEALDB_BASE}/filter.php?i=${encodeURIComponent(i || '')}`;
    console.log(`📡 Fetching: ${url}`);
    
    const response = await fetch(url);
    console.log(`📥 MealDB response status: ${response.status}`);
    
    const data = await response.json();
    console.log(`📦 MealDB returned ${data.meals?.length || 0} meals`);
    
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
app.listen(PORT, () => {
  console.log(`🚀 Kroger proxy server running on port ${PORT}`);
  console.log(`✅ CORS enabled for:`, allowedOrigins);
});