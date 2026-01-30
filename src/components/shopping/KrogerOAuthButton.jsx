import { useState, useEffect } from 'react';
import { krogerOAuthService } from '../../services/krogerOAuth';
import { authService } from '../../services/auth';

export default function KrogerOAuthButton({ onConnectionChange }) {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    // Check for OAuth return
    const oauthResult = krogerOAuthService.checkOAuthReturn();
    
    if (oauthResult.success) {
      setIsConnected(true);
      if (onConnectionChange) {
        onConnectionChange(true);
      }
    } else if (oauthResult.error) {
      alert('Failed to connect to Kroger. Please try again.');
    }
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const connected = await krogerOAuthService.isConnected(currentUser.id);
        setIsConnected(connected);
        if (onConnectionChange) {
          onConnectionChange(connected);
        }
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!user) {
      alert('Please log in first');
      return;
    }

    try {
      setLoading(true);
      await krogerOAuthService.connect(user.id);
      // Will redirect to Kroger login
    } catch (error) {
      alert(error.message);
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect from Kroger?')) {
      return;
    }

    try {
      setLoading(true);
      await krogerOAuthService.disconnect(user.id);
      setIsConnected(false);
      if (onConnectionChange) {
        onConnectionChange(false);
      }
      alert('Disconnected from Kroger');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !isConnected) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
        <span className="text-sm text-gray-600">Checking connection...</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="inline-flex items-center gap-3 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-lg">✓</span>
          <span className="text-sm font-medium text-green-700">Connected to Kroger</span>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="text-xs text-gray-600 hover:text-gray-800 underline"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      Connect to Kroger
    </button>
  );
}