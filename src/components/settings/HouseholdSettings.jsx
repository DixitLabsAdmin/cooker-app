import { useState, useEffect } from 'react';
import { userPreferencesService } from '../../services/userPreferences';
import { householdScalingService } from '../../services/householdScaling';

export default function HouseholdSettings() {
  const [householdSize, setHouseholdSize] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const prefs = await userPreferencesService.getPreferences();
      setHouseholdSize(prefs.household_size);
    } catch (err) {
      // If no preferences exist, they'll be created with default value of 1
      console.error('Error loading preferences:', err);
      setHouseholdSize(1);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await userPreferencesService.updateHouseholdSize(householdSize);
      
      // Clear the household scaling cache so changes take effect immediately
      householdScalingService.clearCache();
      
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-6"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">Household Settings</h3>
        <p className="text-sm text-gray-600">
          Configure how many people you're cooking for. All recipes, servings, and nutrition will be automatically scaled.
        </p>
      </div>
      
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-green-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">
              ✅ Household size updated to {householdSize} {householdSize === 1 ? 'person' : 'people'}!
            </span>
          </div>
          <p className="text-sm text-green-700 mt-1 ml-7">
            All recipes and meal plans will now be automatically scaled.
          </p>
        </div>
      )}
      
      <div className="space-y-6">
        {/* Household Size Slider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            How many people are you cooking for?
          </label>
          
          <div className="flex items-center gap-6">
            {/* Slider */}
            <input
              type="range"
              min="1"
              max="10"
              value={householdSize}
              onChange={(e) => setHouseholdSize(parseInt(e.target.value))}
              className="flex-1 h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
            />
            
            {/* Number Display */}
            <div className="flex flex-col items-center justify-center w-24 h-24 bg-green-50 border-2 border-green-600 rounded-lg">
              <span className="text-4xl font-bold text-green-600">
                {householdSize}
              </span>
              <span className="text-xs text-green-700 mt-1">
                {householdSize === 1 ? 'person' : 'people'}
              </span>
            </div>
          </div>

          {/* Scale Markers */}
          <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
            <span>8</span>
            <span>9</span>
            <span>10</span>
          </div>
        </div>

        {/* Preview/Impact */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            What this affects:
          </h4>
          <ul className="space-y-1 text-sm text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✓</span>
              <span><strong>Recipe servings:</strong> A recipe for 4 becomes {4 * householdSize} servings</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✓</span>
              <span><strong>Ingredient amounts:</strong> Automatically scaled for {householdSize} {householdSize === 1 ? 'person' : 'people'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✓</span>
              <span><strong>Nutrition totals:</strong> Macros adjusted for household size</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✓</span>
              <span><strong>Meal planning:</strong> Calendar meals planned for {householdSize} {householdSize === 1 ? 'person' : 'people'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600 font-bold">✓</span>
              <span><strong>Shopping lists:</strong> Missing ingredients scaled appropriately</span>
            </li>
          </ul>
        </div>

        {/* Example */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-700 mb-2">
            <strong>Example:</strong> If a recipe calls for:
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white p-3 rounded border">
              <p className="text-gray-500 mb-1">Original (1 person):</p>
              <p className="font-mono">• 200g chicken breast</p>
              <p className="font-mono">• 100g rice</p>
              <p className="font-mono">• 450 calories</p>
            </div>
            <div className="bg-green-50 p-3 rounded border border-green-300">
              <p className="text-green-700 mb-1">Scaled ({householdSize} {householdSize === 1 ? 'person' : 'people'}):</p>
              <p className="font-mono text-green-900">• {200 * householdSize}g chicken breast</p>
              <p className="font-mono text-green-900">• {100 * householdSize}g rice</p>
              <p className="font-mono text-green-900">• {450 * householdSize} calories</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium text-lg"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
          ) : (
            'Save Household Size'
          )}
        </button>

        {/* Additional Info */}
        <div className="text-xs text-gray-500 text-center">
          <p>💡 Tip: You can change this anytime from your settings.</p>
          <p className="mt-1">Changes take effect immediately for all future meals and recipes.</p>
        </div>
      </div>
    </div>
  );
}