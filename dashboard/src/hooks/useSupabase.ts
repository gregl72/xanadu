import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Article, Weather } from '../lib/supabase';

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
      const [newsResult, firstPartyResult] = await Promise.all([
        supabase
          .from('articles')
          .select('id, title, bullet, location, priority, url, published_at, fetched_at')
          .eq('is_local', true)
          .eq('is_accessible', true)
          .gte('fetched_at', since)
          .order('priority', { ascending: false })
          .order('published_at', { ascending: false }),
        supabase
          .from('first_party_articles')
          .select('id, title, bullet, location, priority, url, published_at, fetched_at')
          .eq('is_local', true)
          .eq('is_accessible', true)
          .gte('fetched_at', since)
          .order('priority', { ascending: false })
          .order('published_at', { ascending: false }),
      ]);

      if (newsResult.error) throw newsResult.error;
      if (firstPartyResult.error) throw firstPartyResult.error;

      // Combine and mark first party
      const news = (newsResult.data || []).map(a => ({ ...a, is_first_party: false }));
      const firstParty = (firstPartyResult.data || []).map(a => ({ ...a, is_first_party: true }));

      let combined = [...news, ...firstParty];

      // Filter by market if selected
      if (market && market !== 'All') {
        combined = combined.filter(a => a.location === market ||
          // Also check if location maps to this market (simplified matching)
          (market === 'At Large' && !a.location));
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
