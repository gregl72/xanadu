import { useState, useEffect } from 'react';
import { getSession, signOut } from './lib/cognito';
import { WEATHER_CITIES } from './lib/markets';
import { useArticles, useWeather } from './hooks/useSupabase';
import { Login } from './components/Login';
import { MarketFilter } from './components/MarketFilter';
import { ArticleList } from './components/ArticleList';
import { WeatherCard } from './components/WeatherCard';
import { AddArticleForm } from './components/AddArticleForm';
import './App.css';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [market, setMarket] = useState('All');
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const { articles, loading, error, refetch } = useArticles(
    market === 'All' ? null : market,
    showDiscarded
  );
  const { weather } = useWeather();

  // Check if user is already logged in
  useEffect(() => {
    getSession().then((session) => {
      setAuthenticated(!!session);
    });
  }, []);

  // Get weather for selected market
  const selectedWeather = market !== 'All'
    ? weather.find(w => w.city === WEATHER_CITIES[market])
    : null;

  function handleLogout() {
    signOut();
    setAuthenticated(false);
  }

  // Show loading while checking auth
  if (authenticated === null) {
    return <div className="loading">Loading...</div>;
  }

  // Show login if not authenticated
  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Xanadu Admin</h1>
        <div className="header-actions">
          <button className="add-article-button" onClick={() => setShowAddForm(true)}>
            + Add Article
          </button>
          <button className="logout-button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      <div className="filters">
        <MarketFilter selected={market} onChange={setMarket} />
        <label className="show-discarded-toggle">
          <input
            type="checkbox"
            checked={showDiscarded}
            onChange={(e) => setShowDiscarded(e.target.checked)}
          />
          Show Discarded
        </label>
      </div>

      {selectedWeather && (
        <WeatherCard weather={selectedWeather} />
      )}

      <div className="stats">
        {articles.length} article{articles.length !== 1 ? 's' : ''} found
      </div>

      <ArticleList
        articles={articles}
        loading={loading}
        error={error}
        onUpdate={refetch}
      />

      {showAddForm && (
        <AddArticleForm
          onClose={() => setShowAddForm(false)}
          onCreated={refetch}
        />
      )}
    </div>
  );
}

export default App;
