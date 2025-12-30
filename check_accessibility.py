"""Check if article content is accessible (not behind paywall)."""

import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Paywall indicators to search for in content/bullets
PAYWALL_INDICATORS = [
    "paywall",
    "subscription required",
    "unable to access",
    "authorization",
    "sign in to read",
    "premium content",
    "subscribers only",
    "login to continue",
    "access denied",
    "content not available",
]


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def check_for_paywall(bullet: str, content: str) -> bool:
    """Check if article appears to be behind a paywall.

    Returns True if content is ACCESSIBLE (no paywall detected).
    """
    text_to_check = f"{bullet or ''} {content or ''}".lower()

    for indicator in PAYWALL_INDICATORS:
        if indicator in text_to_check:
            return False  # Paywall detected, not accessible

    return True  # No paywall indicators, accessible


def main():
    """Check accessibility for local articles."""
    supabase = get_supabase()

    # Get local articles without is_accessible set
    print("Fetching local articles to check...")
    result = supabase.table("articles").select(
        "id, title, bullet, content"
    ).eq("is_local", True).is_("is_accessible", "null").execute()

    articles = result.data
    print(f"Found {len(articles)} articles to check\n")

    accessible_count = 0
    paywalled_count = 0

    for i, article in enumerate(articles):
        title = article["title"]
        bullet = article.get("bullet", "")
        content = article.get("content", "")

        is_accessible = check_for_paywall(bullet, content)

        if is_accessible:
            accessible_count += 1
        else:
            paywalled_count += 1
            print(f"[PAYWALLED] {title[:60]}...")

        # Update database
        supabase.table("articles").update({
            "is_accessible": is_accessible
        }).eq("id", article["id"]).execute()

    print(f"\nDone!")
    print(f"Accessible: {accessible_count}")
    print(f"Paywalled: {paywalled_count}")


if __name__ == "__main__":
    main()
