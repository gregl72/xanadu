import { useState, useEffect } from 'react';
import { getSession, signOut } from './lib/cognito';
import { WEATHER_CITIES } from './lib/markets';
import { useArticles, useWeather, publishArticle } from './hooks/useSupabase';
import { getUserEmail } from './lib/cognito';
import { Login } from './components/Login';
import { MarketFilter } from './components/MarketFilter';
import { ArticleList } from './components/ArticleList';
import { WeatherCard } from './components/WeatherCard';
import { AddArticleForm } from './components/AddArticleForm';
import { PublishedSection } from './components/PublishedSection';
import { PublicationStatus } from './components/PublicationStatus';
import type { Article } from './lib/supabase';
import './App.css';

type View = 'articles' | 'status';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('articles');
  const [market, setMarket] = useState('All');
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [showUsed, setShowUsed] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [publishedArticles, setPublishedArticles] = useState<Article[]>([]);

  const { articles, loading, error, refetch } = useArticles(
    market === 'All' ? null : market,
    showDiscarded,
    showUsed
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

  function handlePublish(article: Article) {
    // Add to published section (avoid duplicates)
    setPublishedArticles(prev => {
      const key = `${article.is_first_party ? 'fp' : 'news'}-${article.id}`;
      const exists = prev.some(a => `${a.is_first_party ? 'fp' : 'news'}-${a.id}` === key);
      if (exists) return prev;
      return [...prev, article];
    });
  }

  async function handleUnpublish(article: Article) {
    // Weather items have negative IDs and don't need database updates
    if (article.id < 0) {
      setPublishedArticles(prev =>
        prev.filter(a => a.id !== article.id)
      );
      return;
    }

    try {
      const email = getUserEmail();
      await publishArticle(article.id, article.is_first_party || false, false, email || undefined);
      // Remove from published section
      setPublishedArticles(prev =>
        prev.filter(a => !(a.id === article.id && a.is_first_party === article.is_first_party))
      );
      refetch();
    } catch (err) {
      alert('Failed to unpublish: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }

  function handlePublishWeather(bullet: string) {
    // Strip leading bullet point characters if present
    const cleanBullet = bullet.replace(/^[\u2022\u2023\u25E6\u2043\u2219•\-\*]\s*/, '');
    // Create a fake article for weather (negative ID to distinguish)
    const weatherArticle: Article = {
      id: -Date.now(),
      title: 'Weather',
      bullet: cleanBullet,
      url: '',
      location: null,
      market: null,
      priority: null,
      content: null,
      published_at: null,
      fetched_at: new Date().toISOString(),
    };
    setPublishedArticles(prev => [...prev, weatherArticle]);
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
          {view === 'articles' && (
            <button className="add-article-button" onClick={() => setShowAddForm(true)}>
              + Add Article
            </button>
          )}
          <button className="logout-button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      <div className="view-toggle">
        <button
          className={`view-button ${view === 'articles' ? 'active' : ''}`}
          onClick={() => setView('articles')}
        >
          Articles
        </button>
        <button
          className={`view-button ${view === 'status' ? 'active' : ''}`}
          onClick={() => setView('status')}
        >
          Status
        </button>
      </div>

      {view === 'status' ? (
        <PublicationStatus />
      ) : (
        <>
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
            <label className="show-discarded-toggle">
              <input
                type="checkbox"
                checked={showUsed}
                onChange={(e) => setShowUsed(e.target.checked)}
              />
              Show Used
            </label>
          </div>

          <PublishedSection
            articles={publishedArticles}
            onRemove={handleUnpublish}
          />

          {selectedWeather && (
            <WeatherCard weather={selectedWeather} onPublish={handlePublishWeather} />
          )}

          <div className="stats">
            {articles.length} article{articles.length !== 1 ? 's' : ''} found
          </div>

          <ArticleList
            articles={articles}
            loading={loading}
            error={error}
            onUpdate={refetch}
            onPublish={!showUsed && !showDiscarded ? handlePublish : undefined}
          />

          {showAddForm && (
            <AddArticleForm
              onClose={() => setShowAddForm(false)}
              onCreated={refetch}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
