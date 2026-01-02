"""Scrape articles from sources without RSS feeds."""

import os
import re
from datetime import datetime, timezone
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

from markets import get_market

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; XanaduBot/1.0)"}


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_page(url: str) -> BeautifulSoup | None:
    """Fetch a page and return BeautifulSoup object."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code == 200:
            return BeautifulSoup(response.text, "html.parser")
    except Exception as e:
        print(f"    Error fetching {url}: {e}")
    return None


def extract_content(soup: BeautifulSoup) -> str | None:
    """Extract article content from page."""
    # Remove noise elements
    for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
        element.decompose()

    # Try common article containers
    article = soup.find("article") or soup.find("main") or soup.find("div", class_="content")

    if article:
        text = article.get_text(separator=" ", strip=True)
    else:
        text = soup.get_text(separator=" ", strip=True)

    # Clean up whitespace
    text = " ".join(text.split())
    return text[:10000] if text else None


def parse_date_string(date_str: str) -> datetime | None:
    """Parse various date string formats."""
    if not date_str:
        return None

    # Try common formats
    formats = [
        "%b %d, %Y",       # Jan 02, 2026
        "%B %d, %Y",       # January 02, 2026
        "%Y-%m-%d",        # 2026-01-02
        "%m/%d/%Y",        # 01/02/2026
    ]

    # Clean up date string
    date_str = date_str.strip()
    date_str = re.sub(r"Posted\s*", "", date_str, flags=re.IGNORECASE)

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


# ============ Site-Specific Scrapers ============

def scrape_littleapplepost(source: dict) -> list[dict]:
    """Scrape articles from Little Apple Post (Manhattan, KS)."""
    base_url = "https://littleapplepost.com"
    articles = []

    print(f"  Fetching homepage...")
    soup = fetch_page(base_url)
    if not soup:
        return []

    # Find all article links (/posts/UUID pattern)
    article_links = set()
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "/posts/" in href:
            full_url = urljoin(base_url, href)
            article_links.add(full_url)

    print(f"  Found {len(article_links)} article links")

    for url in article_links:
        print(f"    Scraping: {url[:60]}...")

        page = fetch_page(url)
        if not page:
            continue

        # Extract title (try h1 first, then og:title)
        title = None
        h1 = page.find("h1")
        if h1:
            title = h1.get_text(strip=True)
        if not title:
            og_title = page.find("meta", property="og:title")
            if og_title:
                title = og_title.get("content", "").strip()

        if not title:
            continue

        # Extract published date
        published_at = None
        # Try meta tag first
        time_tag = page.find("time")
        if time_tag:
            date_str = time_tag.get("datetime") or time_tag.get_text()
            published_at = parse_date_string(date_str)
        if not published_at:
            # Try finding "Posted" text
            text = page.get_text()
            match = re.search(r"Posted\s+(\w+\s+\d+,?\s+\d{4})", text)
            if match:
                published_at = parse_date_string(match.group(1))

        # Extract content
        content = extract_content(page)

        # Use source city as default location/market
        location = source.get("city", "Kansas")
        market = get_market(location)

        articles.append({
            "source_id": source["id"],
            "title": title,
            "url": url,
            "content": content,
            "published_at": published_at.isoformat() if published_at else None,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "location": location,
            "market": market,
            "is_local": True,
            "is_accessible": True,
        })

    return articles


# ============ Scraper Registry ============

SCRAPERS = {
    "littleapplepost.com": scrape_littleapplepost,
}


def get_scraper_for_url(url: str):
    """Get the appropriate scraper function for a URL."""
    for domain, scraper in SCRAPERS.items():
        if domain in url:
            return scraper
    return None


# ============ Main ============

def main():
    """Scrape articles from all scrape-type sources."""
    supabase = get_supabase()

    # Get sources with scrape: prefix in rss_url
    print("Fetching scrape sources...")
    result = supabase.table("sources").select("*").like("rss_url", "scrape:%").execute()
    sources = result.data

    if not sources:
        print("No scrape sources found")
        return

    print(f"Found {len(sources)} scrape sources\n")

    total_new = 0

    for source in sources:
        print(f"Scraping: {source['name']} ({source['city']})")

        # Get base URL from rss_url (strip "scrape:" prefix)
        scrape_url = source["rss_url"].replace("scrape:", "")

        # Find appropriate scraper
        scraper = get_scraper_for_url(scrape_url)
        if not scraper:
            print(f"  No scraper found for {scrape_url}")
            continue

        # Scrape articles
        articles = scraper(source)
        print(f"  Scraped {len(articles)} articles")

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
