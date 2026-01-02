"""Fetch articles from RSS feeds and store in Supabase."""

import os
from datetime import datetime, timezone

import feedparser
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def parse_date(entry) -> datetime | None:
    """Parse date from feed entry."""
    # Try different date fields
    for field in ["published_parsed", "updated_parsed", "created_parsed"]:
        parsed = getattr(entry, field, None)
        if parsed:
            try:
                return datetime(*parsed[:6], tzinfo=timezone.utc)
            except Exception:
                pass

    return None


def fetch_feed(source: dict) -> list[dict]:
    """Fetch and parse articles from an RSS feed."""
    rss_url = source.get("rss_url")
    if not rss_url:
        return []

    # Skip scrape sources (handled by scrape_articles.py)
    if rss_url.startswith("scrape:"):
        return []

    try:
        feed = feedparser.parse(rss_url)
    except Exception as e:
        print(f"  Error parsing feed: {e}")
        return []

    articles = []
    for entry in feed.entries:
        title = entry.get("title", "").strip()
        url = entry.get("link", "").strip()

        if not title or not url:
            continue

        # Get content/summary
        content = ""
        if hasattr(entry, "content") and entry.content:
            content = entry.content[0].get("value", "")
        elif hasattr(entry, "summary"):
            content = entry.summary or ""

        # Parse published date
        published_at = parse_date(entry)

        articles.append({
            "source_id": source["id"],
            "title": title,
            "url": url,
            "content": content[:10000] if content else None,  # Limit content size
            "published_at": published_at.isoformat() if published_at else None,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })

    return articles


def main():
    """Main function to fetch articles from all sources."""
    supabase = get_supabase()

    # Get all sources with RSS feeds
    print("Fetching sources...")
    sources = supabase.table("sources").select("*").not_.is_("rss_url", "null").execute()

    if not sources.data:
        print("No sources with RSS feeds found")
        return

    print(f"Found {len(sources.data)} sources with RSS feeds\n")

    total_new = 0

    for source in sources.data:
        print(f"Fetching: {source['name']} ({source['city']})")

        articles = fetch_feed(source)
        print(f"  Found {len(articles)} articles")

        if not articles:
            continue

        # Get existing article URLs for this source
        existing = supabase.table("articles").select("url").eq("source_id", source["id"]).execute()
        existing_urls = {a["url"] for a in existing.data}

        # Filter to new articles only
        new_articles = [a for a in articles if a["url"] not in existing_urls]
        print(f"  New articles: {len(new_articles)}")

        if new_articles:
            # Insert new articles
            supabase.table("articles").insert(new_articles).execute()
            total_new += len(new_articles)

    print(f"\nDone! Added {total_new} new articles")


if __name__ == "__main__":
    main()
