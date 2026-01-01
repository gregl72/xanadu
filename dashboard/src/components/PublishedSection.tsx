import type { Article } from '../lib/supabase';

interface PublishedSectionProps {
  articles: Article[];
  onRemove: (article: Article) => void;
}

export function PublishedSection({ articles, onRemove }: PublishedSectionProps) {
  if (articles.length === 0) {
    return null;
  }

  // Generate markdown text
  const markdownLines = articles.map(article => {
    const bullet = article.bullet || article.title || 'Untitled';
    const url = article.url;

    // Skip link for manual entries without real URL
    if (!url || url.startsWith('manual-entry-')) {
      return `- ${bullet}`;
    }

    return `- ${bullet} [→](${url})`;
  });

  const markdownText = markdownLines.join('\n');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdownText);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = markdownText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  return (
    <div className="published-section">
      <div className="published-header">
        <h3>Published ({articles.length})</h3>
        <button className="copy-button" onClick={handleCopy}>
          Copy text
        </button>
      </div>

      <div className="published-preview">
        {articles.map(article => {
          const bullet = article.bullet || article.title || 'Untitled';
          const url = article.url;
          const hasLink = url && !url.startsWith('manual-entry-');

          return (
            <div key={`${article.is_first_party ? 'fp' : 'news'}-${article.id}`} className="published-item">
              <span className="published-text">
                - {bullet}
                {hasLink && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="published-link">
                    →
                  </a>
                )}
              </span>
              <button
                className="remove-published-btn"
                onClick={() => onRemove(article)}
                title="Remove from published"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
