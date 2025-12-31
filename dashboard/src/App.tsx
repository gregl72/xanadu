import { useState, useEffect } from 'react';
import { getSession, signOut } from './lib/cognito';
import { WEATHER_CITIES } from './lib/markets';
import { useArticles, useWeather } from './hooks/useSupabase';
import { Login } from './components/Login';
import { MarketFilter } from './components/MarketFilter';
import { TimeFilter } from './components/TimeFilter';
import { ArticleList } from './components/ArticleList';
import { WeatherCard } from './components/WeatherCard';
import './App.css';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [market, setMarket] = useState('All');
  const [hours, setHours] = useState(24);

  const { articles, loading, error, refetch } = useArticles(
    market === 'All' ? null : market,
    hours
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
        <button className="logout-button" onClick={handleLogout}>
          Sign Out
        </button>
      </header>

      <div className="filters">
        <MarketFilter selected={market} onChange={setMarket} />
        <TimeFilter selected={hours} onChange={setHours} />
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
    </div>
  );
}

export default App;
