import { useState } from 'react';
import type { Article } from '../lib/supabase';
import { updateArticle, addArticleMarket, removeArticleMarket, processArticle, discardArticle, publishArticle } from '../hooks/useSupabase';
import { MARKETS } from '../lib/markets';
import { getUserEmail } from '../lib/cognito';

interface ArticleCardProps {
  article: Article;
  onUpdate: () => void;
  onPublish?: (article: Article) => void;
}

const PRIORITY_OPTIONS = [
  { value: 5, label: 'BREAKING', color: '#dc3545' },
  { value: 4, label: 'IMPORTANT', color: '#fd7e14' },
  { value: 3, label: 'NEWS', color: '#ffc107' },
  { value: 2, label: 'MINOR', color: '#28a745' },
  { value: 1, label: 'LOW', color: '#6c757d' },
];

const MARKET_OPTIONS = ['All', ...MARKETS];

export function ArticleCard({ article, onUpdate, onPublish }: ArticleCardProps) {
  const [bullet, setBullet] = useState(article.bullet || '');
  const [priority, setPriority] = useState(article.priority || 3);
  const [market, setMarket] = useState(article.market || '');
  const [additionalMarkets, setAdditionalMarkets] = useState<string[]>(article.additional_markets || []);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showAddMarket, setShowAddMarket] = useState(false);

  const priorityOption = PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[2];
  const needsProcessing = !article.bullet || !article.location;

  // Check if any field has changed
  const isDirty =
    bullet !== (article.bullet || '') ||
    priority !== (article.priority || 3) ||
    market !== (article.market || '');

  async function handleSave() {
    setSaving(true);
    try {
      const changes: { priority?: number; market?: string; bullet?: string } = {};

      if (bullet !== (article.bullet || '')) {
        changes.bullet = bullet;
      }
      if (priority !== (article.priority || 3)) {
        changes.priority = priority;
      }
      if (market !== (article.market || '')) {
        changes.market = market;
      }

      if (Object.keys(changes).length > 0) {
        const email = getUserEmail();
        await updateArticle(article.id, article.is_first_party || false, changes, email || undefined);
      }

      onUpdate();
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleProcess() {
    setProcessing(true);
    try {
      const updated = await processArticle(article.id, article.is_first_party || false);
      setBullet(updated.bullet || '');
      setPriority(updated.priority || 3);
      setMarket(updated.market || '');
      onUpdate();
    } catch (err) {
      alert('Failed to process: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setProcessing(false);
    }
  }

  async function handleAddMarket(newMarket: string) {
    if (!newMarket || additionalMarkets.includes(newMarket) || newMarket === market) {
      setShowAddMarket(false);
      return;
    }

    try {
      const email = getUserEmail();
      const updated = await addArticleMarket(article.id, article.is_first_party || false, newMarket, email || undefined);
      setAdditionalMarkets(updated);
      setShowAddMarket(false);
      onUpdate();
    } catch (err) {
      alert('Failed to add market: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }

  async function handleRemoveMarket(marketToRemove: string) {
    try {
      const email = getUserEmail();
      const updated = await removeArticleMarket(article.id, article.is_first_party || false, marketToRemove, email || undefined);
      setAdditionalMarkets(updated);
      onUpdate();
    } catch (err) {
      alert('Failed to remove market: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    try {
      const email = getUserEmail();
      const shouldDiscard = !article.discarded;
      await discardArticle(article.id, article.is_first_party || false, shouldDiscard, email || undefined);
      onUpdate();
    } catch (err) {
      alert('Failed to ' + (article.discarded ? 'restore' : 'discard') + ': ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDiscarding(false);
    }
  }

  async function handlePublish() {
    if (!onPublish) return;

    setPublishing(true);
    try {
      const email = getUserEmail();
      await publishArticle(article.id, article.is_first_party || false, true, email || undefined);
      // Pass the article with current bullet value to the published section
      onPublish({ ...article, bullet: bullet || article.bullet });
      onUpdate();
    } catch (err) {
      alert('Failed to publish: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setPublishing(false);
    }
  }

  const publishedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  // Get available markets for adding (exclude current market and already added)
  const availableMarkets = MARKET_OPTIONS.filter(
    m => m !== 'All' && m !== market && !additionalMarkets.includes(m)
  );

  return (
    <div
      className="article-card"
      style={{ borderLeftColor: priorityOption.color }}
    >
      <div className="article-header">
        <select
          className="priority-select"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          style={{ backgroundColor: priorityOption.color }}
        >
          {PRIORITY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {publishedDate && <span className="date">{publishedDate}</span>}
        {article.is_first_party && <span className="official-badge">OFFICIAL</span>}

        <select
          className="market-select"
          value={market}
          onChange={(e) => setMarket(e.target.value)}
        >
          <option value="">No Market</option>
          {MARKET_OPTIONS.filter(m => m !== 'All').map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <button
          className="add-market-btn"
          onClick={() => setShowAddMarket(!showAddMarket)}
          title="Add additional market"
        >
          +
        </button>

        {article.location && <span className="location">{article.location}</span>}
      </div>

      {/* Additional markets row */}
      {(additionalMarkets.length > 0 || showAddMarket) && (
        <div className="additional-markets">
          {additionalMarkets.map(m => (
            <span key={m} className="additional-market-badge">
              {m}
              <button
                className="remove-market-btn"
                onClick={() => handleRemoveMarket(m)}
                title="Remove market"
              >
                ×
              </button>
            </span>
          ))}
          {showAddMarket && (
            <select
              className="add-market-select"
              onChange={(e) => handleAddMarket(e.target.value)}
              defaultValue=""
              autoFocus
            >
              <option value="">Select market...</option>
              {availableMarkets.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <h3 className="article-title">
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
      </h3>

      <textarea
        className="bullet-input"
        value={bullet}
        onChange={(e) => setBullet(e.target.value)}
        placeholder="Enter bullet summary..."
        rows={3}
      />

      <div className="article-actions">
        {needsProcessing && (
          <button
            className="process-button"
            onClick={handleProcess}
            disabled={processing}
          >
            {processing ? 'Processing...' : 'Process with AI'}
          </button>
        )}
        {isDirty && (
          <button
            className="save-button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {onPublish && (
          <button
            className="publish-button"
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        )}
        <button
          className={article.discarded ? 'undo-button' : 'discard-button'}
          onClick={handleDiscard}
          disabled={discarding}
        >
          {discarding ? '...' : (article.discarded ? 'Undo' : 'Discard')}
        </button>
      </div>
    </div>
  );
}
