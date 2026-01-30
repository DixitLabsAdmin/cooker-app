import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Allow multiple origins for dev, preview, and production
const allowedOrigins = [
  'http://localhost:3000',      // Vite dev server
  'http://localhost:4173',      // Vite preview
  'http://localhost:5173',      // Alternative Vite port
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ Blocked origin:', origin);
      console.log('✅ Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Kroger API credentials
const CLIENT_ID = process.env.KROGER_CLIENT_ID || process.env.VITE_KROGER_CLIENT_ID;
const CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET || process.env.VITE_KROGER_CLIENT_SECRET;
const BASE_URL = 'https://api.kroger.com/v1';

// Token management
let accessToken = null;
let tokenExpiry = null;

// Get or refresh access token
async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post(
      'https://api.kroger.com/v1/connect/oauth2/token',
      'grant_type=client_credentials&scope=product.compact',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
    
    console.log('✅ Got new Kroger access token');
    return accessToken;
  } catch (error) {
    console.error('❌ Error getting access token:', error.response?.data || error.message);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Kroger proxy server is running',
    allowedOrigins: allowedOrigins.filter(o => o)
  });
});

// Search locations by ZIP code
app.get('/api/kroger/locations', async (req, res) => {
  try {
    const { zipCode, radiusMiles = 10, limit = 10 } = req.query;
    
    if (!zipCode) {
      return res.status(400).json({ error: 'zipCode is required' });
    }

    const token = await getAccessToken();
    
    const response = await axios.get(`${BASE_URL}/locations`, {
      params: {
        'filter.zipCode.near': zipCode,
        'filter.radiusInMiles': radiusMiles,
        'filter.limit': limit,
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Locations search error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to search locations',
      details: error.response?.data || error.message,
    });
  }
});

// Search products
app.get('/api/kroger/products', async (req, res) => {
  try {
    const { term, locationId, limit = 10 } = req.query;
    
    if (!term) {
      return res.status(400).json({ error: 'term is required' });
    }

    const token = await getAccessToken();
    
    const params = {
      'filter.term': term,
      'filter.limit': limit,
    };
    
    if (locationId) {
      params['filter.locationId'] = locationId;
    }

    const response = await axios.get(`${BASE_URL}/products`, {
      params,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Product search error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to search products',
      details: error.response?.data || error.message,
    });
  }
});

// Get product by ID
app.get('/api/kroger/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { locationId } = req.query;

    const token = await getAccessToken();
    
    const params = locationId ? { 'filter.locationId': locationId } : {};

    const response = await axios.get(`${BASE_URL}/products/${productId}`, {
      params,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Product detail error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to get product',
      details: error.response?.data || error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Kroger proxy server running on http://localhost:${PORT}`);
  console.log(`✅ Allowed origins:`, allowedOrigins.filter(o => o));
  
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('⚠️  WARNING: KROGER_CLIENT_ID or KROGER_CLIENT_SECRET not set!');
  }
});