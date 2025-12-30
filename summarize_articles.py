"""Generate punchy bullet summaries for local articles using Claude."""

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


def generate_bullet(client: anthropic.Anthropic, title: str, content: str) -> str:
    """Generate a punchy 1-2 sentence bullet summary."""

    text = content[:3000] if content else title

    prompt = f"""Distill this local news article into a single punchy bullet point. Max 2 sentences. Be direct and informative.

Title: {title}
Content: {text}

Respond with ONLY the bullet point, no prefix or formatting."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception as e:
        print(f"    Error: {e}")
        return None


def main():
    """Generate bullet summaries for local articles."""
    supabase = get_supabase()
    client = anthropic.Anthropic()

    # Get local articles without bullet summary
    print("Fetching local articles to summarize...")
    result = supabase.table("articles").select(
        "id, title, content"
    ).eq("is_local", True).is_("bullet", "null").execute()

    articles = result.data
    print(f"Found {len(articles)} articles to summarize\n")

    for i, article in enumerate(articles):
        title = article["title"]
        content = article.get("content", "")

        print(f"[{i+1}/{len(articles)}] {title[:50]}...")

        bullet = generate_bullet(client, title, content)

        if bullet:
            print(f"    → {bullet[:80]}...")

            # Update database
            supabase.table("articles").update({
                "bullet": bullet
            }).eq("id", article["id"]).execute()

        # Rate limit
        time.sleep(0.3)

    print("\nDone!")


if __name__ == "__main__":
    main()
