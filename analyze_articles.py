"""Analyze articles with Claude to extract location and determine if local."""

import os
import time

import anthropic
from dotenv import load_dotenv
from supabase import create_client

from markets import get_market

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def analyze_article(client: anthropic.Anthropic, title: str, content: str, source_city: str) -> tuple[str | None, bool]:
    """Use Claude to extract location and determine if article is local."""

    # Use title if no content
    text = content[:2000] if content else title

    prompt = f"""Analyze this news article and extract the primary location it's about.

Article title: {title}
Article content: {text}

The source newspaper is from: {source_city}, Kansas

Respond in this exact format (no other text):
LOCATION: [city/town name, or "Unknown" if unclear]
IS_LOCAL: [TRUE if the article is about {source_city} or nearby towns in the same county, FALSE otherwise]

Examples:
- An article about a city council meeting in {source_city} → IS_LOCAL: TRUE
- An article about state politics in Topeka (if source is not Topeka) → IS_LOCAL: FALSE
- An article about a local high school sports team → IS_LOCAL: TRUE
- An article about national news → IS_LOCAL: FALSE"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )

        response = message.content[0].text.strip()

        # Parse response
        location = None
        is_local = False

        for line in response.split("\n"):
            if line.startswith("LOCATION:"):
                location = line.replace("LOCATION:", "").strip()
                if location.lower() == "unknown":
                    location = None
            elif line.startswith("IS_LOCAL:"):
                is_local = "TRUE" in line.upper()

        return location, is_local

    except Exception as e:
        print(f"    Error: {e}")
        return None, False


def main():
    """Analyze all articles without location data."""
    supabase = get_supabase()
    client = anthropic.Anthropic()

    # Get articles without location, with their source info
    print("Fetching articles to analyze...")
    result = supabase.table("articles").select(
        "id, title, content, source_id, sources(city)"
    ).is_("location", "null").limit(500).execute()

    articles = result.data
    print(f"Found {len(articles)} articles to analyze\n")

    for i, article in enumerate(articles):
        title = article["title"]
        content = article.get("content", "")
        source_city = article["sources"]["city"] if article.get("sources") else "Unknown"

        print(f"[{i+1}/{len(articles)}] {title[:60]}...")

        location, is_local = analyze_article(client, title, content, source_city)

        # Calculate market from location
        market = get_market(location) if location else "At Large"

        print(f"    Location: {location} -> Market: {market}, Local: {is_local}")

        # Update database
        supabase.table("articles").update({
            "location": location,
            "is_local": is_local,
            "market": market,
        }).eq("id", article["id"]).execute()

        # Rate limit (avoid hitting API limits)
        time.sleep(0.5)

    print("\nDone!")

    # Summary
    local_count = supabase.table("articles").select("id", count="exact").eq("is_local", True).execute()
    print(f"Total local articles: {local_count.count}")


if __name__ == "__main__":
    main()
