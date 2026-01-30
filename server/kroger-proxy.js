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

app.listen(PORT, () => {
  console.log(`🚀 Kroger proxy server running on port ${PORT}`);
  console.log(`✅ CORS enabled for:`, allowedOrigins);
});