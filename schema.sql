-- Supabase SQL Schema for Xanadu RSS Aggregator
-- Run this in the Supabase SQL Editor

-- Sources table (news websites)
CREATE TABLE sources (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    website_url TEXT UNIQUE NOT NULL,
    rss_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Articles table
CREATE TABLE articles (
    id BIGSERIAL PRIMARY KEY,
    source_id BIGINT REFERENCES sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    content TEXT,
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_articles_source_id ON articles(source_id);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_sources_city ON sources(city);

-- Enable Row Level Security (optional, for API access)
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Allow public read access (adjust as needed)
CREATE POLICY "Allow public read sources" ON sources FOR SELECT USING (true);
CREATE POLICY "Allow public read articles" ON articles FOR SELECT USING (true);

-- Allow authenticated insert/update (for the fetch script)
CREATE POLICY "Allow service insert sources" ON sources FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service insert articles" ON articles FOR INSERT WITH CHECK (true);
