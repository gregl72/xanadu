"""Discover RSS feeds from a list of websites in Google Sheets."""

import csv
import os
import re
from io import StringIO
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GOOGLE_SHEET_CSV_URL = os.getenv("GOOGLE_SHEET_CSV_URL")

# Common RSS feed paths to check
COMMON_FEED_PATHS = [
    "/feed",
    "/feed/",
    "/rss",
    "/rss/",
    "/rss.xml",
    "/feed.xml",
    "/atom.xml",
    "/index.xml",
    "/feeds/posts/default",
    "/?feed=rss2",
]


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_google_sheet():
    """Fetch website list from Google Sheets CSV export."""
    response = requests.get(GOOGLE_SHEET_CSV_URL, timeout=30)
    response.raise_for_status()

    reader = csv.DictReader(StringIO(response.text))
    return list(reader)


def find_rss_in_html(url: str, html: str) -> str | None:
    """Find RSS feed URL in HTML link tags."""
    soup = BeautifulSoup(html, "html.parser")

    # Look for RSS/Atom link tags
    feed_types = [
        "application/rss+xml",
        "application/atom+xml",
        "application/feed+json",
        "text/xml",
    ]

    for link in soup.find_all("link", rel="alternate"):
        link_type = link.get("type", "")
        if any(ft in link_type for ft in feed_types):
            href = link.get("href")
            if href:
                return urljoin(url, href)

    return None


def check_url_is_feed(url: str) -> bool:
    """Check if a URL returns valid RSS/Atom content."""
    try:
        response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        if response.status_code != 200:
            return False

        content_type = response.headers.get("content-type", "").lower()
        content = response.text[:1000].lower()

        # Check content type or content for RSS/Atom indicators
        if any(x in content_type for x in ["xml", "rss", "atom"]):
            return True
        if "<rss" in content or "<feed" in content or "<channel>" in content:
            return True

        return False
    except Exception:
        return False


def discover_feed(website_url: str) -> str | None:
    """Try to discover RSS feed for a website."""
    # Normalize URL
    if not website_url.startswith(("http://", "https://")):
        website_url = "https://" + website_url

    parsed = urlparse(website_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    # First, try to find feed link in the homepage HTML
    try:
        response = requests.get(website_url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        if response.status_code == 200:
            feed_url = find_rss_in_html(website_url, response.text)
            if feed_url and check_url_is_feed(feed_url):
                return feed_url
    except Exception:
        pass

    # Try common feed paths
    for path in COMMON_FEED_PATHS:
        feed_url = urljoin(base_url, path)
        if check_url_is_feed(feed_url):
            return feed_url

    return None


def main():
    """Main function to discover feeds and store in Supabase."""
    print("Fetching website list from Google Sheets...")
    websites = fetch_google_sheet()
    print(f"Found {len(websites)} websites")

    supabase = get_supabase()

    for row in websites:
        city = row.get("city", "").strip()
        website_url = row.get("website_url", "").strip()
        name = row.get("name", "").strip() or urlparse(website_url).netloc

        if not website_url:
            continue

        print(f"\nProcessing: {name} ({city})")
        print(f"  URL: {website_url}")

        # Check if already in database
        existing = supabase.table("sources").select("id").eq("website_url", website_url).execute()
        if existing.data:
            print("  Already in database, skipping...")
            continue

        # Discover RSS feed
        rss_url = discover_feed(website_url)

        if rss_url:
            print(f"  Found RSS: {rss_url}")
        else:
            print("  No RSS feed found")

        # Insert into database
        supabase.table("sources").insert({
            "name": name,
            "city": city,
            "website_url": website_url,
            "rss_url": rss_url,
        }).execute()

        print("  Saved to database")

    print("\nDone!")


if __name__ == "__main__":
    main()
