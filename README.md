# Xanadu

RSS feed aggregator that collects news articles from multiple sources, organized by city.

## Setup

### 1. Create Supabase Project

1. Go to https://supabase.com and create a free project
2. In SQL Editor, run the contents of `schema.sql`
3. Get your project URL and anon key from Settings → API

### 2. Prepare Google Sheet

Create a Google Sheet with columns:
- `city` - City name (e.g., "Topeka")
- `website_url` - News website URL (e.g., "https://cjonline.com")
- `name` - (optional) Display name for the source

Then: File → Share → Publish to web → CSV format. Copy the URL.

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
GOOGLE_SHEET_CSV_URL=your-published-csv-url
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Discover RSS Feeds

```bash
python discover_feeds.py
```

This reads your Google Sheet and finds RSS feeds for each website.

### 6. Fetch Articles

```bash
python fetch_articles.py
```

This fetches new articles from all discovered RSS feeds.

## Automated Refresh

The GitHub Actions workflow runs every 4 hours. Set up secrets:

1. Go to repo Settings → Secrets and variables → Actions
2. Add `SUPABASE_URL` and `SUPABASE_KEY`

## Querying Data

In Supabase, you can query by city:

```sql
SELECT a.title, a.url, a.published_at, s.name, s.city
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE s.city = 'Topeka'
ORDER BY a.published_at DESC
LIMIT 20;
```
