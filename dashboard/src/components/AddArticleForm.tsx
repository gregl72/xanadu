import { useState } from 'react';
import { createArticle, processArticleUrl } from '../hooks/useSupabase';
import { MARKETS } from '../lib/markets';
import { getUserEmail } from '../lib/cognito';

interface AddArticleFormProps {
  onClose: () => void;
  onCreated: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 5, label: 'BREAKING' },
  { value: 4, label: 'IMPORTANT' },
  { value: 3, label: 'NEWS' },
  { value: 2, label: 'MINOR' },
  { value: 1, label: 'LOW' },
];

type Mode = 'url' | 'manual';

export function AddArticleForm({ onClose, onCreated }: AddArticleFormProps) {
  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [bullet, setBullet] = useState('');
  const [priority, setPriority] = useState(3);
  const [market, setMarket] = useState('');
  const [location, setLocation] = useState('');
  const [isFirstParty, setIsFirstParty] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleProcessUrl() {
    if (!url) {
      setError('Please enter a URL');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const result = await processArticleUrl(url);
      setTitle(result.title || '');
      setContent(result.content || '');
      setBullet(result.bullet || '');
      setPriority(result.priority || 3);
      setLocation(result.location || '');
      setMarket(result.market || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process URL');
    } finally {
      setProcessing(false);
    }
  }

  async function handleCreate() {
    if (mode === 'url') {
      if (!title) {
        setError('Title is required');
        return;
      }
      if (!url) {
        setError('URL is required');
        return;
      }
    } else {
      // Manual mode
      if (!bullet) {
        setError('Bullet summary is required');
        return;
      }
      if (!market) {
        setError('Market is required');
        return;
      }
    }

    setCreating(true);
    setError('');

    try {
      const email = getUserEmail();
      await createArticle({
        title: mode === 'url' ? title : undefined,
        url: mode === 'url' ? url : undefined,
        content: mode === 'url' ? (content || undefined) : undefined,
        bullet: bullet || undefined,
        priority,
        market: market || undefined,
        location: mode === 'url' ? (location || undefined) : undefined,
        is_first_party: isFirstParty,
        user_email: email || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create article');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Article</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="mode-toggle">
          <button
            className={`mode-button ${mode === 'url' ? 'active' : ''}`}
            onClick={() => setMode('url')}
          >
            From URL
          </button>
          <button
            className={`mode-button ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Manual Entry
          </button>
        </div>

        {error && <div className="form-error">{error}</div>}

        {mode === 'url' && (
          <div className="form-group">
            <label>URL</label>
          <div className="url-row">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
            />
            <button
              className="process-url-button"
              onClick={handleProcessUrl}
              disabled={processing || !url}
            >
              {processing ? 'Processing...' : 'Process with AI'}
            </button>
          </div>
          </div>
        )}

        {mode === 'url' && (
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
            />
          </div>
        )}

        <div className="form-group">
          <label>Bullet Summary {mode === 'manual' ? '*' : ''}</label>
          <textarea
            value={bullet}
            onChange={(e) => setBullet(e.target.value)}
            placeholder="1-2 sentence summary"
            rows={2}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Market {mode === 'manual' ? '*' : ''}</label>
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option value="">Select market...</option>
              {MARKETS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {mode === 'url' && (
            <div className="form-group">
              <label>Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City name"
              />
            </div>
          )}
        </div>

        {mode === 'url' && (
          <div className="form-group">
            <label>Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Full article content (optional)"
              rows={4}
            />
          </div>
        )}

        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={isFirstParty}
              onChange={(e) => setIsFirstParty(e.target.checked)}
            />
            First Party (Official)
          </label>
        </div>

        <div className="form-actions">
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="create-button"
            onClick={handleCreate}
            disabled={creating || (mode === 'url' ? (!title || !url) : (!bullet || !market))}
          >
            {creating ? 'Creating...' : 'Create Article'}
          </button>
        </div>
      </div>
    </div>
  );
}
