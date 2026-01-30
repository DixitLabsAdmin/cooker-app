import { useState, useEffect } from 'react';
import { authService } from './services/auth';
import LoginForm from './components/auth/LoginForm';
import SignupForm from './components/auth/SignupForm';
import RecipeList from './components/recipes/RecipeList';
import RecipeForm from './components/recipes/RecipeForm';
import RecipeDetail from './components/recipes/RecipeDetail';
import ShoppingList from './components/shopping/ShoppingList';
import Inventory from './components/inventory/Inventory';
import MealIdeas from './components/mealIdeas/MealIdeas';
import MealCalendar from './components/mealCalendar/MealCalendar';
import NutritionReport from './components/report/NutritionReport';
import HouseholdSettings from './components/settings/HouseholdSettings';
import KrogerStoreSelector from './components/settings/KrogerStoreSelector';
import { KrogerStoreProvider } from './contexts/KrogerStoreContext';
import Deals from './components/promotions/Deals';
import ContactButton from './components/common/ContactButton';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignup, setShowSignup] = useState(false);
  
  // Navigation state - CHANGED DEFAULT TO 'deals'
  const [activeTab, setActiveTab] = useState('deals');
  
  // Recipe management state
  const [currentView, setCurrentView] = useState('list');
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  useEffect(() => {
    authService.getCurrentUser().then((user) => {
      setUser(user);
      setLoading(false);
    });

    const { data: authListener } = authService.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      setCurrentView('list');
      setSelectedRecipe(null);
      setActiveTab('deals'); // Changed from 'recipes' to 'deals'
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleRecipeSuccess = () => {
    setCurrentView('list');
    setSelectedRecipe(null);
  };

  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setCurrentView('detail');
  };

  const handleEditRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setCurrentView('edit');
  };

  const handleDeleteRecipe = () => {
    setCurrentView('list');
    setSelectedRecipe(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-green-600 mb-2">🍳 Cooker</h1>
            <p className="text-gray-600">AI-Powered Meal Planning & Nutrition Tracking</p>
          </div>

          {showSignup ? (
            <>
              <SignupForm onSuccess={() => setShowSignup(false)} />
              <p className="text-center mt-4">
                Already have an account?{' '}
                <button
                  onClick={() => setShowSignup(false)}
                  className="text-green-600 hover:underline font-medium"
                >
                  Sign In
                </button>
              </p>
            </>
          ) : (
            <>
              <LoginForm onSuccess={() => {}} />
              <p className="text-center mt-4">
                Don't have an account?{' '}
                <button
                  onClick={() => setShowSignup(true)}
                  className="text-green-600 hover:underline font-medium"
                >
                  Sign Up
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Logged in - WRAPPED WITH KROGER STORE PROVIDER
  return (
    <KrogerStoreProvider>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-4 px-4 flex justify-between items-center">
            <h1 className="text-3xl font-bold text-green-600">🍳 Cooker</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Navigation Tabs - NEW ORDER, NO COUPONS/ORDERS */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="flex gap-4">
              {/* 1. Deals - FIRST */}
              <button
                onClick={() => setActiveTab('deals')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'deals'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                🔥 Deals
              </button>

              {/* 2. Shopping List */}
              <button
                onClick={() => setActiveTab('shopping')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'shopping'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Shopping List
              </button>

              {/* 3. Inventory */}
              <button
                onClick={() => setActiveTab('inventory')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'inventory'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Inventory
              </button>

              {/* 4. Meal Ideas */}
              <button
                onClick={() => setActiveTab('mealIdeas')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'mealIdeas'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Meal Ideas
              </button>

              {/* 5. Recipes */}
              <button
                onClick={() => {
                  setActiveTab('recipes');
                  setCurrentView('list');
                }}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'recipes'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Recipes
              </button>

              {/* 6. Meal Calendar */}
              <button
                onClick={() => setActiveTab('calendar')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'calendar'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Meal Calendar
              </button>

              {/* 7. Report */}
              <button
                onClick={() => setActiveTab('report')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'report'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Report
              </button>

              {/* 8. Settings */}
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === 'settings'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Settings
              </button>
            </nav>
          </div>
        </div>

        <main className="max-w-7xl mx-auto py-6 px-4">
          {/* Deals Tab - FIRST */}
          {activeTab === 'deals' && <Deals onNavigateToTab={setActiveTab} />}

          {/* Shopping List */}
          {activeTab === 'shopping' && <ShoppingList />}

          {/* Inventory */}
          {activeTab === 'inventory' && <Inventory />}

          {/* Meal Ideas */}
          {activeTab === 'mealIdeas' && <MealIdeas />}

          {/* Recipes */}
          {activeTab === 'recipes' && (
            <>
              {currentView === 'list' && (
                <RecipeList
                  onSelectRecipe={handleSelectRecipe}
                  onCreateNew={() => {
                    setSelectedRecipe(null);
                    setCurrentView('create');
                  }}
                />
              )}

              {currentView === 'create' && (
                <RecipeForm
                  onSuccess={handleRecipeSuccess}
                  onCancel={() => setCurrentView('list')}
                />
              )}

              {currentView === 'edit' && selectedRecipe && (
                <RecipeForm
                  recipe={selectedRecipe}
                  onSuccess={handleRecipeSuccess}
                  onCancel={() => setCurrentView('detail')}
                />
              )}

              {currentView === 'detail' && selectedRecipe && (
                <RecipeDetail
                  recipeId={selectedRecipe.id}
                  onEdit={handleEditRecipe}
                  onDelete={handleDeleteRecipe}
                  onBack={() => setCurrentView('list')}
                />
              )}
            </>
          )}

          {/* Meal Calendar */}
          {activeTab === 'calendar' && <MealCalendar />}

          {/* Report */}
          {activeTab === 'report' && <NutritionReport />}

          {/* Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
              
              {/* Household Settings */}
              <HouseholdSettings />
              
              {/* Kroger Store Selection */}
              <KrogerStoreSelector />
            </div>
          )}
        </main>
                {/* Contact Button */}
        <ContactButton />
      </div>
    </KrogerStoreProvider>
  );
}

export default App;