"""Scrape articles from sources without RSS feeds."""

import json
import os
import re
import time
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
REQUEST_DELAY = 0.5  # Seconds between requests to be respectful


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_page(url: str, delay: bool = True) -> BeautifulSoup | None:
    """Fetch a page and return BeautifulSoup object."""
    if delay:
        time.sleep(REQUEST_DELAY)
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code == 200:
            return BeautifulSoup(response.text, "html.parser")
    except Exception as e:
        print(f"    Error fetching {url}: {e}")
    return None


def fetch_raw(url: str, delay: bool = True) -> str | None:
    """Fetch a page and return raw HTML text."""
    if delay:
        time.sleep(REQUEST_DELAY)
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code == 200:
            return response.text
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

def scrape_post_site(source: dict) -> list[dict]:
    """Scrape articles from Post-based CMS sites (Little Apple Post, Hutch Post, etc.)."""
    # Get base URL from source
    base_url = source.get("website_url", "").rstrip("/")
    if not base_url:
        scrape_url = source.get("rss_url", "").replace("scrape:", "")
        base_url = scrape_url.rstrip("/")

    articles = []

    print(f"  Fetching homepage...")
    soup = fetch_page(base_url, delay=False)
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


def scrape_arc_site(source: dict) -> list[dict]:
    """Scrape articles from Arc Publishing sites (KWCH, WIBW)."""
    scrape_url = source.get("rss_url", "").replace("scrape:", "")
    base_url = scrape_url.rstrip("/")

    # Determine the actual domain for building full URLs
    if "kwch.com" in base_url:
        domain = "https://www.kwch.com"
    elif "wibw.com" in base_url:
        domain = "https://www.wibw.com"
    else:
        domain = base_url

    articles = []

    print(f"  Fetching news page...")
    html = fetch_raw(base_url, delay=False)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")

    # Find article links - Arc sites use /YYYY/MM/DD/slug/ pattern
    article_links = set()
    for link in soup.find_all("a", href=True):
        href = link["href"]
        # Match /2026/01/02/article-slug/ pattern
        if re.match(r"^/?(\d{4}/\d{2}/\d{2}/[\w-]+)", href):
            full_url = urljoin(domain + "/", href.lstrip("/"))
            article_links.add(full_url)

    print(f"  Found {len(article_links)} article links")

    for url in article_links:
        print(f"    Scraping: {url[:70]}...")

        html = fetch_raw(url)
        if not html:
            continue

        # Try to extract Arc JSON data
        title = None
        published_at = None
        content = None

        # Look for Fusion/Arc data in script tags
        fusion_match = re.search(r'Fusion\.globalContent\s*=\s*({.*?});', html, re.DOTALL)
        if fusion_match:
            try:
                data = json.loads(fusion_match.group(1))
                title = data.get("headlines", {}).get("basic", "")
                display_date = data.get("display_date", "")
                if display_date:
                    # Parse ISO date
                    try:
                        published_at = datetime.fromisoformat(display_date.replace("Z", "+00:00"))
                    except ValueError:
                        pass
                # Get description as content summary
                content = data.get("description", {}).get("basic", "")
            except json.JSONDecodeError:
                pass

        # Fallback to HTML parsing
        if not title:
            page = BeautifulSoup(html, "html.parser")
            h1 = page.find("h1")
            if h1:
                title = h1.get_text(strip=True)
            if not title:
                og_title = page.find("meta", property="og:title")
                if og_title:
                    title = og_title.get("content", "").strip()

        if not title:
            continue

        if not content:
            page = BeautifulSoup(html, "html.parser")
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


def scrape_kscbnews(source: dict) -> list[dict]:
    """Scrape articles from KSCB News (WordPress site)."""
    base_url = "https://www.kscbnews.net"
    articles = []

    print(f"  Fetching homepage...")
    soup = fetch_page(base_url, delay=False)
    if not soup:
        return []

    # Find article links - look for links in main content area
    article_links = set()
    # KSCB uses article listings with links
    for link in soup.find_all("a", href=True):
        href = link["href"]
        # Skip common non-article paths
        if any(skip in href for skip in ["/category/", "/tag/", "/author/", "/page/", "#", "wp-content"]):
            continue
        # Match article URLs (kscbnews.net/article-slug/)
        if href.startswith(base_url) or href.startswith("/"):
            full_url = urljoin(base_url, href)
            # Filter to likely article URLs (has slug after domain)
            path = full_url.replace(base_url, "").strip("/")
            if path and "/" not in path and len(path) > 5:
                article_links.add(full_url)

    print(f"  Found {len(article_links)} article links")

    for url in list(article_links)[:30]:  # Limit to avoid excessive scraping
        print(f"    Scraping: {url[:60]}...")

        page = fetch_page(url)
        if not page:
            continue

        # Extract title
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
        # Try time tag
        time_tag = page.find("time")
        if time_tag:
            date_str = time_tag.get("datetime") or time_tag.get_text()
            published_at = parse_date_string(date_str)
        # Try meta tag
        if not published_at:
            meta_date = page.find("meta", property="article:published_time")
            if meta_date:
                try:
                    published_at = datetime.fromisoformat(meta_date.get("content", "").replace("Z", "+00:00"))
                except ValueError:
                    pass
        # Try common date patterns in text
        if not published_at:
            text = page.get_text()
            # Match "January 2, 2026" pattern
            match = re.search(r"(\w+\s+\d{1,2},?\s+\d{4})", text)
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
    # Post-based CMS sites
    "littleapplepost.com": scrape_post_site,
    "hutchpost.com": scrape_post_site,
    "salinapost.com": scrape_post_site,
    "hayspost.com": scrape_post_site,
    "greatbendpost.com": scrape_post_site,
    # Arc Publishing sites
    "kwch.com": scrape_arc_site,
    "wibw.com": scrape_arc_site,
    # WordPress sites
    "kscbnews.net": scrape_kscbnews,
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
