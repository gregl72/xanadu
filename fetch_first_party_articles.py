"""Fetch articles from first party RSS feeds."""

import os
from datetime import datetime, timezone

import feedparser
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_article_content(url: str) -> str | None:
    """Fetch and extract article content from URL."""
    try:
        response = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.text, "html.parser")

        # Remove script and style elements
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.decompose()

        # Try common article containers
        article = soup.find("article") or soup.find("main") or soup.find("div", class_="content")

        if article:
            text = article.get_text(separator=" ", strip=True)
        else:
            text = soup.get_text(separator=" ", strip=True)

        # Clean up whitespace
        text = " ".join(text.split())
        return text[:5000] if text else None

    except Exception:
        return None


def parse_date(entry) -> datetime | None:
    """Parse publication date from feed entry."""
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
    if hasattr(entry, "updated_parsed") and entry.updated_parsed:
        return datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
    return None


def main():
    """Fetch articles from all first party RSS feeds."""
    supabase = get_supabase()

    # Get all sources with RSS URLs
    print("Fetching first party sources...")
    result = supabase.table("first_party_sources").select("id, name, city, rss_url").execute()
    sources = result.data
    print(f"Found {len(sources)} sources\n")

    total_new = 0

    for source in sources:
        source_id = source["id"]
        name = source["name"]
        city = source["city"]
        rss_url = source["rss_url"]

        # Skip Ghost Blog - uses webhook instead of RSS
        if name == "Ghost Blog":
            print(f"Skipping {name} (uses webhook)")
            continue

        print(f"{name} ({city})...", end=" ")

        try:
            feed = feedparser.parse(rss_url)
            entries = feed.entries[:20]  # Limit to 20 most recent

            new_count = 0
            for entry in entries:
                url = entry.get("link", "")
                title = entry.get("title", "")

                if not url or not title:
                    continue

                # Check if already exists
                existing = supabase.table("first_party_articles").select("id").eq("url", url).execute()
                if existing.data:
                    continue

                # Fetch content
                content = fetch_article_content(url)
                published_at = parse_date(entry)

                # Insert article
                article = {
                    "source_id": source_id,
                    "title": title,
                    "url": url,
                    "content": content,
                    "published_at": published_at.isoformat() if published_at else None,
                }

                supabase.table("first_party_articles").insert(article).execute()
                new_count += 1

            print(f"{new_count} new")
            total_new += new_count

        except Exception as e:
            print(f"Error: {e}")

    print(f"\nDone! {total_new} new articles fetched.")


if __name__ == "__main__":
    main()
