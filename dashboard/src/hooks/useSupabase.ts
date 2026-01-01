import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Article, Weather } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function useArticles(market: string | null, showDiscarded: boolean, showUsed: boolean = false) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build queries based on showDiscarded and showUsed flags
      let newsQuery = supabase
        .from('articles')
        .select('id, title, bullet, location, market, priority, url, content, published_at, fetched_at, discarded, used')
        .eq('is_local', true)
        .eq('is_accessible', true);

      let firstPartyQuery = supabase
        .from('first_party_articles')
        .select('id, title, bullet, location, market, priority, url, content, published_at, fetched_at, discarded, used')
        .eq('is_local', true)
        .eq('is_accessible', true);

      // Filter by discarded status
      if (showDiscarded) {
        newsQuery = newsQuery.eq('discarded', true);
        firstPartyQuery = firstPartyQuery.eq('discarded', true);
      } else {
        newsQuery = newsQuery.or('discarded.is.null,discarded.eq.false');
        firstPartyQuery = firstPartyQuery.or('discarded.is.null,discarded.eq.false');
      }

      // Filter by used status
      if (showUsed) {
        newsQuery = newsQuery.eq('used', true);
        firstPartyQuery = firstPartyQuery.eq('used', true);
      } else {
        newsQuery = newsQuery.or('used.is.null,used.eq.false');
        firstPartyQuery = firstPartyQuery.or('used.is.null,used.eq.false');
      }

      // Fetch from both articles and first_party_articles
      const [newsResult, firstPartyResult, marketsResult] = await Promise.all([
        newsQuery
          .order('priority', { ascending: false })
          .order('published_at', { ascending: false }),
        firstPartyQuery
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

      // For non-discarded view: filter priority 1/2 to only last 24h
      if (!showDiscarded) {
        combined = combined.filter(a => {
          const priority = a.priority || 3;
          // Priority 3/4/5: show all
          if (priority >= 3) return true;
          // Priority 1/2: only show if fetched within 24h
          const fetchedAt = new Date(a.fetched_at).getTime();
          const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
          return fetchedAt >= twentyFourHoursAgo;
        });
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
  }, [market, showDiscarded, showUsed]);

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
  changes: { priority?: number; market?: string; bullet?: string; discarded?: boolean; used?: boolean },
  userEmail?: string
): Promise<Article> {
  const table = isFirstParty ? 'first_party_articles' : 'articles';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/update-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ id, table }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to process article');
  }

  return response.json();
}

export async function discardArticle(
  id: number,
  isFirstParty: boolean,
  discard: boolean,
  userEmail?: string
): Promise<Article> {
  return updateArticle(id, isFirstParty, { discarded: discard }, userEmail);
}

export async function publishArticle(
  id: number,
  isFirstParty: boolean,
  publish: boolean,
  userEmail?: string
): Promise<Article> {
  return updateArticle(id, isFirstParty, { used: publish }, userEmail);
}

export interface CreateArticleData {
  title?: string;
  url?: string;
  content?: string;
  bullet?: string;
  priority?: number;
  market?: string;
  location?: string;
  is_first_party: boolean;
  user_email?: string;
}

export async function createArticle(data: CreateArticleData): Promise<Article> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to create article');
  }

  return response.json();
}

export interface ProcessedArticle {
  title: string;
  content: string;
  bullet: string;
  priority: number;
  location: string;
  market: string;
  is_local: boolean;
}

export async function processArticleUrl(url: string): Promise<ProcessedArticle> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-article-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to process URL');
  }

  return response.json();
}
