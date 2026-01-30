import axios from 'axios';

const PROXY_BASE_URL = 'http://localhost:3001/api/kroger';

class KrogerOAuthService {
  /**
   * Check if user is connected to Kroger
   */
  async isConnected(userId) {
    try {
      const response = await axios.get(`${PROXY_BASE_URL}/oauth/status`, {
        params: { userId },
      });
      return response.data.isConnected;
    } catch (error) {
      console.error('Error checking OAuth status:', error);
      return false;
    }
  }

  /**
   * Initialize OAuth flow - redirects user to Kroger login
   */
  async connect(userId) {
    try {
      // Get authorization URL from backend
      const response = await axios.get(`${PROXY_BASE_URL}/oauth/init`, {
        params: { userId },
      });

      const { authUrl } = response.data;

      // Redirect user to Kroger authorization page
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initializing OAuth:', error);
      throw new Error('Failed to connect to Kroger. Please try again.');
    }
  }

  /**
   * Disconnect from Kroger (revoke tokens)
   */
  async disconnect(userId) {
    try {
      await axios.post(`${PROXY_BASE_URL}/oauth/disconnect`, {
        userId,
      });
      return true;
    } catch (error) {
      console.error('Error disconnecting:', error);
      throw new Error('Failed to disconnect from Kroger.');
    }
  }

  /**
   * Check if we just returned from OAuth (look for query params)
   */
  checkOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('kroger_connected');
    const error = params.get('error');

    // Clean URL
    if (connected || error) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return {
      success: connected === 'true',
      error: error,
    };
  }
}

export const krogerOAuthService = new KrogerOAuthService();