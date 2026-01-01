import { useState } from 'react';
import type { Article } from '../lib/supabase';
import { updateArticleBullet, processArticle } from '../hooks/useSupabase';

interface ArticleCardProps {
  article: Article;
  onUpdate: () => void;
}

const PRIORITY_LABELS: Record<number, string> = {
  5: 'BREAKING',
  4: 'IMPORTANT',
  3: 'NEWS',
  2: 'MINOR',
  1: 'LOW',
};

const PRIORITY_COLORS: Record<number, string> = {
  5: '#dc3545',
  4: '#fd7e14',
  3: '#ffc107',
  2: '#28a745',
  1: '#6c757d',
};

export function ArticleCard({ article, onUpdate }: ArticleCardProps) {
  const [bullet, setBullet] = useState(article.bullet || '');
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dirty, setDirty] = useState(false);

  const priority = article.priority || 3;
  const needsProcessing = !article.bullet || !article.location;

  async function handleSave() {
    setSaving(true);
    try {
      await updateArticleBullet(article.id, bullet, article.is_first_party || false);
      setDirty(false);
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
      onUpdate();
    } catch (err) {
      alert('Failed to process: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setProcessing(false);
    }
  }

  function handleChange(value: string) {
    setBullet(value);
    setDirty(value !== (article.bullet || ''));
  }

  const publishedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div
      className="article-card"
      style={{ borderLeftColor: PRIORITY_COLORS[priority] }}
    >
      <div className="article-header">
        <span
          className="priority-badge"
          style={{ backgroundColor: PRIORITY_COLORS[priority] }}
        >
          {PRIORITY_LABELS[priority]}
        </span>
        {publishedDate && <span className="date">{publishedDate}</span>}
        {article.is_first_party && <span className="official-badge">OFFICIAL</span>}
        {article.market && <span className="market-badge">{article.market}</span>}
        {article.location && <span className="location">{article.location}</span>}
      </div>

      <h3 className="article-title">
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
      </h3>

      <textarea
        className="bullet-input"
        value={bullet}
        onChange={(e) => handleChange(e.target.value)}
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
        {dirty && (
          <button
            className="save-button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}
