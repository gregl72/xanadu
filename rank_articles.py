"""Rank local articles by newsworthiness using Claude."""

import os
import time

import anthropic
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def rank_article(client: anthropic.Anthropic, title: str, bullet: str, content: str) -> int:
    """Use Claude to rank article newsworthiness 1-5."""

    text = content[:2000] if content else title

    prompt = f"""Rate this local news article's newsworthiness to a local audience on a scale of 1-5.

Title: {title}
Summary: {bullet or 'N/A'}
Content: {text}

Rating scale:
5 = Major breaking local news, emergencies, significant policy changes affecting the community
4 = Important community events, notable local achievements, significant local developments
3 = Regular local news, city council meetings, routine announcements
2 = Minor events, routine updates, low-impact stories
1 = Filler content, very low local relevance, obituaries, event listings

Respond with ONLY a single number (1, 2, 3, 4, or 5)."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        response = message.content[0].text.strip()
        # Extract just the number
        for char in response:
            if char in "12345":
                return int(char)
        return 3  # Default to middle if parsing fails
    except Exception as e:
        print(f"    Error: {e}")
        return 3


def main():
    """Rank accessible local articles by newsworthiness."""
    supabase = get_supabase()
    client = anthropic.Anthropic()

    # Get accessible local articles without priority
    print("Fetching articles to rank...")
    result = supabase.table("articles").select(
        "id, title, bullet, content"
    ).eq("is_local", True).eq("is_accessible", True).is_("priority", "null").execute()

    articles = result.data
    print(f"Found {len(articles)} articles to rank\n")

    priority_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}

    for i, article in enumerate(articles):
        title = article["title"]
        bullet = article.get("bullet", "")
        content = article.get("content", "")

        print(f"[{i+1}/{len(articles)}] {title[:50]}...")

        priority = rank_article(client, title, bullet, content)
        priority_counts[priority] += 1

        print(f"    Priority: {priority}")

        # Update database
        supabase.table("articles").update({
            "priority": priority
        }).eq("id", article["id"]).execute()

        # Rate limit
        time.sleep(0.3)

    print("\nDone!")
    print("\nPriority distribution:")
    for p in range(5, 0, -1):
        print(f"  {p}: {priority_counts[p]} articles")


if __name__ == "__main__":
    main()
