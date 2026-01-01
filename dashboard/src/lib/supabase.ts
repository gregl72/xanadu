import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Article {
  id: number;
  title: string;
  bullet: string | null;
  location: string | null;
  market: string | null;
  priority: number | null;
  url: string;
  content: string | null;
  published_at: string | null;
  fetched_at: string;
  is_first_party?: boolean;
  additional_markets?: string[];
}

export interface Weather {
  city: string;
  current_temp: number | null;
  bullet: string | null;
}
