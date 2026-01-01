import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Article, Weather } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function useArticles(market: string | null, hours: number) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    try {
      // Fetch from both articles and first_party_articles
      const [newsResult, firstPartyResult, marketsResult] = await Promise.all([
        supabase
          .from('articles')
          .select('id, title, bullet, location, market, priority, url, content, published_at, fetched_at')
          .eq('is_local', true)
          .eq('is_accessible', true)
          .gte('fetched_at', since)
          .order('priority', { ascending: false })
          .order('published_at', { ascending: false }),
        supabase
          .from('first_party_articles')
          .select('id, title, bullet, location, market, priority, url, content, published_at, fetched_at')
          .eq('is_local', true)
          .eq('is_accessible', true)
          .gte('fetched_at', since)
          .order('priority', { ascending: false })
          .order('published_at', { ascending: false }),
        supabase
          .from('article_markets')
          .select('article_id, table_name, market'),
      ]);

      if (newsResult.error) throw newsResult.error;
      if (firstPartyResult.error) throw firstPartyResult.error;

      // Build a map of additional markets
      const additionalMarketsMap = new Map<string, string[]>();
      if (marketsResult.data) {
        for (const m of marketsResult.data) {
          const key = `${m.table_name}-${m.article_id}`;
          if (!additionalMarketsMap.has(key)) {
            additionalMarketsMap.set(key, []);
          }
          additionalMarketsMap.get(key)!.push(m.market);
        }
      }

      // Combine and mark first party
      const news = (newsResult.data || []).map(a => ({
        ...a,
        is_first_party: false,
        additional_markets: additionalMarketsMap.get(`articles-${a.id}`) || [],
      }));
      const firstParty = (firstPartyResult.data || []).map(a => ({
        ...a,
        is_first_party: true,
        additional_markets: additionalMarketsMap.get(`first_party_articles-${a.id}`) || [],
      }));

      let combined = [...news, ...firstParty];

      // Filter by market if selected (check both primary market and additional markets)
      if (market && market !== 'All') {
        combined = combined.filter(a =>
          a.market === market ||
          a.additional_markets?.includes(market) ||
          (market === 'At Large' && !a.market)
        );
      }

      // Sort by priority desc, then published_at desc
      combined.sort((a, b) => {
        const pDiff = (b.priority || 3) - (a.priority || 3);
        if (pDiff !== 0) return pDiff;
        return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
      });

      setArticles(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch articles');
    } finally {
      setLoading(false);
    }
  }, [market, hours]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return { articles, loading, error, refetch: fetchArticles };
}

export function useWeather() {
  const [weather, setWeather] = useState<Weather[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWeather() {
      const { data, error } = await supabase
        .from('weather')
        .select('city, current_temp, bullet')
        .order('city');

      if (!error && data) {
        setWeather(data);
      }
      setLoading(false);
    }
    fetchWeather();
  }, []);

  return { weather, loading };
}

export async function updateArticleBullet(
  id: number,
  bullet: string,
  isFirstParty: boolean
): Promise<void> {
  const table = isFirstParty ? 'first_party_articles' : 'articles';
  const { error } = await supabase
    .from(table)
    .update({ bullet })
    .eq('id', id);

  if (error) throw error;
}

export async function updateArticle(
  id: number,
  isFirstParty: boolean,
  changes: { priority?: number; market?: string; bullet?: string },
  userEmail?: string
): Promise<Article> {
  const table = isFirstParty ? 'first_party_articles' : 'articles';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/update-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, table, changes, user_email: userEmail }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to update article');
  }

  return response.json();
}

export async function addArticleMarket(
  id: number,
  isFirstParty: boolean,
  market: string,
  userEmail?: string
): Promise<string[]> {
  const table = isFirstParty ? 'first_party_articles' : 'articles';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/update-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, table, action: 'add', market, user_email: userEmail }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to add market');
  }

  const result = await response.json();
  return result.markets;
}

export async function removeArticleMarket(
  id: number,
  isFirstParty: boolean,
  market: string,
  userEmail?: string
): Promise<string[]> {
  const table = isFirstParty ? 'first_party_articles' : 'articles';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/update-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, table, action: 'remove', market, user_email: userEmail }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to remove market');
  }

  const result = await response.json();
  return result.markets;
}

export async function processArticle(
  id: number,
  isFirstParty: boolean
): Promise<Article> {
  const table = isFirstParty ? 'first_party_articles' : 'articles';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, table }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to process article');
  }

  return response.json();
}
