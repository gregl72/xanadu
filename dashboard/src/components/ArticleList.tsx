import type { Article } from '../lib/supabase';
import { ArticleCard } from './ArticleCard';

interface ArticleListProps {
  articles: Article[];
  loading: boolean;
  error: string | null;
  onUpdate: () => void;
  onPublish?: (article: Article) => void;
}

export function ArticleList({ articles, loading, error, onUpdate, onPublish }: ArticleListProps) {
  if (loading) {
    return <div className="loading">Loading articles...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (articles.length === 0) {
    return <div className="empty">No articles found for this filter.</div>;
  }

  return (
    <div className="article-list">
      {articles.map((article) => (
        <ArticleCard
          key={`${article.is_first_party ? 'fp' : 'news'}-${article.id}`}
          article={article}
          onUpdate={onUpdate}
          onPublish={onPublish}
        />
      ))}
    </div>
  );
}
