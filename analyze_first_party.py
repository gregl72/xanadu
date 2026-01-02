"""Analyze first party articles with Claude - location, bullet, priority."""

import os
import time

import anthropic
from dotenv import load_dotenv
from supabase import create_client

from markets import get_market

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Paywall indicators
PAYWALL_INDICATORS = [
    "paywall", "subscription required", "unable to access",
    "authorization", "sign in to read", "premium content",
    "subscribers only", "login to continue", "access denied",
]


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def check_accessibility(content: str) -> bool:
    """Check if content is accessible (not paywalled)."""
    if not content:
        return False
    text = content.lower()
    for indicator in PAYWALL_INDICATORS:
        if indicator in text:
            return False
    return True


def analyze_article(client: anthropic.Anthropic, title: str, content: str, source_city: str) -> dict:
    """Use Claude to analyze article - location, bullet, priority."""
    text = content[:3000] if content else title

    prompt = f"""Analyze this article from a local organization in {source_city}, Kansas.

Title: {title}
Content: {text}

Respond in this EXACT format (no other text):
LOCATION: [city/town name, or "{source_city}" if about that city]
IS_LOCAL: [TRUE if about {source_city} or nearby, FALSE otherwise]
BULLET: [1-2 sentence punchy summary]
PRIORITY: [1-5 rating: 5=major announcement/event, 4=important community info, 3=regular update, 2=minor news, 1=routine/filler]"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )

        response = message.content[0].text.strip()
        result = {
            "location": source_city,
            "is_local": True,
            "bullet": None,
            "priority": 3,
        }

        for line in response.split("\n"):
            if line.startswith("LOCATION:"):
                loc = line.replace("LOCATION:", "").strip()
                if loc.lower() != "unknown":
                    result["location"] = loc
            elif line.startswith("IS_LOCAL:"):
                result["is_local"] = "TRUE" in line.upper()
            elif line.startswith("BULLET:"):
                result["bullet"] = line.replace("BULLET:", "").strip()
            elif line.startswith("PRIORITY:"):
                try:
                    p = int(line.replace("PRIORITY:", "").strip()[0])
                    if 1 <= p <= 5:
                        result["priority"] = p
                except (ValueError, IndexError):
                    pass

        return result

    except Exception as e:
        print(f"    Error: {e}")
        return {"location": source_city, "is_local": True, "bullet": None, "priority": 3}


def main():
    """Analyze all unprocessed first party articles."""
    supabase = get_supabase()
    client = anthropic.Anthropic()

    # Get articles without bullet (unprocessed)
    print("Fetching first party articles to analyze...")
    result = supabase.table("first_party_articles").select(
        "id, title, content, source_id, first_party_sources(city)"
    ).is_("bullet", "null").limit(200).execute()

    articles = result.data
    print(f"Found {len(articles)} articles to analyze\n")

    for i, article in enumerate(articles):
        title = article["title"]
        content = article.get("content", "")
        source_city = article["first_party_sources"]["city"] if article.get("first_party_sources") else "Unknown"

        print(f"[{i+1}/{len(articles)}] {title[:50]}...")

        # Check accessibility
        is_accessible = check_accessibility(content)

        # Analyze with Claude
        analysis = analyze_article(client, title, content, source_city)

        # Calculate market from location
        market = get_market(analysis["location"])

        print(f"    {analysis['location']} -> {market} | P{analysis['priority']} | {'✓' if is_accessible else '✗'}")

        # Update database
        supabase.table("first_party_articles").update({
            "location": analysis["location"],
            "is_local": analysis["is_local"],
            "bullet": analysis["bullet"],
            "priority": analysis["priority"],
            "is_accessible": is_accessible,
            "market": market,
        }).eq("id", article["id"]).execute()

        time.sleep(0.3)

    print("\nDone!")


if __name__ == "__main__":
    main()
