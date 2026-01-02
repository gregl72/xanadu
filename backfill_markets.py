"""Backfill market field for articles that have location but no market."""

import os
from dotenv import load_dotenv
from supabase import create_client
from markets import get_market

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Backfill articles table
    print("Backfilling articles table...")
    result = supabase.table("articles").select("id, location").is_("market", "null").not_.is_("location", "null").execute()
    articles = result.data
    print(f"Found {len(articles)} articles to update")

    for article in articles:
        market = get_market(article["location"])
        supabase.table("articles").update({"market": market}).eq("id", article["id"]).execute()
        print(f"  {article['location']} -> {market}")

    # Set At Large for articles with null location
    print("\nSetting At Large for articles with null location...")
    supabase.table("articles").update({"market": "At Large"}).is_("market", "null").execute()

    # Backfill first_party_articles table
    print("\nBackfilling first_party_articles table...")
    result = supabase.table("first_party_articles").select("id, location").is_("market", "null").not_.is_("location", "null").execute()
    articles = result.data
    print(f"Found {len(articles)} first party articles to update")

    for article in articles:
        market = get_market(article["location"])
        supabase.table("first_party_articles").update({"market": market}).eq("id", article["id"]).execute()
        print(f"  {article['location']} -> {market}")

    # Set At Large for first party articles with null location
    print("\nSetting At Large for first party articles with null location...")
    supabase.table("first_party_articles").update({"market": "At Large"}).is_("market", "null").execute()

    print("\nDone!")


if __name__ == "__main__":
    main()
