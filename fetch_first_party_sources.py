"""Import first party RSS sources from Google Sheets."""

import csv
import os
from io import StringIO
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
FIRST_PARTY_SHEET_URL = os.getenv("FIRST_PARTY_SHEET_URL")


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_google_sheet():
    """Fetch first party sources from Google Sheets CSV export."""
    response = requests.get(FIRST_PARTY_SHEET_URL, timeout=30)
    response.raise_for_status()

    reader = csv.DictReader(StringIO(response.text))

    sources = []
    for row in reader:
        city = row.get("City", "").strip()
        url = row.get("url", "").strip()

        if city and url:
            # Extract name from URL domain
            parsed = urlparse(url)
            name = parsed.netloc.replace("www.", "")

            sources.append({
                "city": city,
                "rss_url": url,
                "name": name,
            })

    return sources


def main():
    """Import first party sources into database."""
    print("Fetching first party sources from Google Sheets...")
    sources = fetch_google_sheet()
    print(f"Found {len(sources)} sources")

    supabase = get_supabase()

    for source in sources:
        city = source["city"]
        rss_url = source["rss_url"]
        name = source["name"]

        # Check if already exists
        existing = supabase.table("first_party_sources").select("id").eq("rss_url", rss_url).execute()
        if existing.data:
            print(f"  {name} - already exists")
            continue

        # Insert
        supabase.table("first_party_sources").insert(source).execute()
        print(f"  {name} ({city}) - added")

    print("\nDone!")


if __name__ == "__main__":
    main()
