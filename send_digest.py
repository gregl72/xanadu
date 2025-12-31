"""Send nightly email digest of local news articles."""

import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv
from supabase import create_client

from markets import get_market, get_weather_city, get_all_markets

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GMAIL_ADDRESS = os.getenv("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
DIGEST_RECIPIENT = os.getenv("DIGEST_RECIPIENT")


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_recent_articles(supabase):
    """Get accessible local articles from the past 24 hours."""
    yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    result = supabase.table("articles").select(
        "title, bullet, location, priority, url, published_at"
    ).eq("is_local", True).eq("is_accessible", True).gte(
        "fetched_at", yesterday
    ).order("priority", desc=True).order("published_at", desc=True).execute()

    return result.data


def get_weather(supabase):
    """Get current weather for all cities."""
    result = supabase.table("weather").select("*").order("city").execute()
    return result.data


def get_first_party_articles(supabase):
    """Get accessible first party articles from the past 24 hours."""
    yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    result = supabase.table("first_party_articles").select(
        "title, bullet, location, priority, url, published_at"
    ).eq("is_local", True).eq("is_accessible", True).gte(
        "fetched_at", yesterday
    ).order("priority", desc=True).order("published_at", desc=True).execute()

    return result.data


def format_html_email(articles, weather, first_party_articles=None):
    """Format articles as HTML email, grouped by city."""
    today = datetime.now().strftime("%B %d, %Y")

    # Create weather lookup by city
    weather_by_city = {w.get("city"): w for w in weather} if weather else {}

    # Merge news and first party articles, marking first party
    all_articles = []
    for a in articles:
        a["is_first_party"] = False
        all_articles.append(a)
    for a in (first_party_articles or []):
        a["is_first_party"] = True
        all_articles.append(a)

    # Group articles by market (using geocoding)
    by_market = {}
    for article in all_articles:
        raw_location = article.get("location") or "Unknown"
        market = get_market(raw_location)
        if market not in by_market:
            by_market[market] = []
        by_market[market].append(article)

    # Sort articles within each market by priority (desc)
    for market in by_market:
        by_market[market].sort(key=lambda a: a.get("priority") or 3, reverse=True)

    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }}
            h1 {{ color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 10px; }}
            .city-section {{ margin: 25px 0; }}
            .city-header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; }}
            .city-name {{ font-size: 18px; font-weight: bold; }}
            .city-weather {{ font-size: 14px; text-align: right; }}
            .city-temp {{ font-size: 20px; font-weight: bold; }}
            .article {{ background: #f9f9f9; padding: 15px; margin: 0; border-left: 4px solid #ccc; border-bottom: 1px solid #eee; }}
            .article:last-child {{ border-radius: 0 0 10px 10px; }}
            .article.p5 {{ border-left-color: #dc3545; }}
            .article.p4 {{ border-left-color: #fd7e14; }}
            .article.p3 {{ border-left-color: #ffc107; }}
            .article.p2 {{ border-left-color: #28a745; }}
            .article.p1 {{ border-left-color: #6c757d; }}
            .priority-badge {{ font-size: 10px; color: #666; margin-bottom: 5px; }}
            .title {{ font-size: 15px; font-weight: bold; margin-bottom: 6px; }}
            .title a {{ color: #1a1a1a; text-decoration: none; }}
            .title a:hover {{ text-decoration: underline; }}
            .bullet {{ font-size: 13px; color: #444; line-height: 1.4; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; }}
        </style>
    </head>
    <body>
        <h1>📰 Kansas Local News Digest</h1>
        <p style="color: #666;">{today} • {len(articles)} new articles</p>
    """

    if not all_articles:
        html += "<p>No new articles in the past 24 hours.</p>"
    else:
        # Sort markets in defined order (At Large last)
        market_order = get_all_markets()
        sorted_markets = sorted(by_market.keys(), key=lambda m: market_order.index(m) if m in market_order else 999)

        for market in sorted_markets:
            market_articles = by_market[market]
            # Get weather using market's weather city
            weather_city = get_weather_city(market)
            w = weather_by_city.get(weather_city) if weather_city else None

            # Market header with weather
            weather_html = ""
            if w:
                temp = w.get("current_temp", "")
                bullet = w.get("bullet", "")
                if bullet:
                    weather_html = f"""
                    <div class="city-weather">
                        <div class="city-temp">{temp}°F</div>
                        <div style="font-size: 12px; max-width: 200px;">{bullet}</div>
                    </div>
                    """
                else:
                    conditions = w.get("current_conditions", "")
                    high = w.get("forecast_high", "")
                    low = w.get("forecast_low", "")
                    weather_html = f"""
                    <div class="city-weather">
                        <div class="city-temp">{temp}°F</div>
                        <div>{conditions}</div>
                        <div>H:{high}° L:{low}°</div>
                    </div>
                    """

            html += f"""
            <div class="city-section">
                <div class="city-header">
                    <div class="city-name">📍 {market}</div>
                    {weather_html}
                </div>
            """

            priority_labels = {5: "🔴 BREAKING", 4: "🟠 IMPORTANT", 3: "🟡 NEWS", 2: "🟢 MINOR", 1: "⚪ LOW"}

            for article in market_articles:
                title = article.get("title", "Untitled")
                bullet = article.get("bullet") or "No summary available."
                url = article.get("url", "#")
                priority = article.get("priority") or 3
                plabel = priority_labels.get(priority, "")
                published = article.get("published_at", "")
                is_first_party = article.get("is_first_party", False)
                if published:
                    published = datetime.fromisoformat(published.replace("Z", "+00:00")).strftime("%b %d")
                else:
                    published = ""

                fp_badge = '<span style="background:#17a2b8;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:5px;">OFFICIAL</span>' if is_first_party else ''

                html += f"""
                <div class="article p{priority}">
                    <div class="priority-badge">{plabel}{f' • {published}' if published else ''}{fp_badge}</div>
                    <div class="title"><a href="{url}">{title}</a></div>
                    <div class="bullet">{bullet}</div>
                </div>
                """

            html += "</div>"

    html += """
        <div class="footer">
            Generated by Xanadu News Aggregator
        </div>
    </body>
    </html>
    """

    return html


def format_plain_text(articles, weather, first_party_articles=None):
    """Format articles as plain text fallback, grouped by city."""
    today = datetime.now().strftime("%B %d, %Y")

    # Merge news and first party articles
    all_articles = []
    for a in articles:
        a["is_first_party"] = False
        all_articles.append(a)
    for a in (first_party_articles or []):
        a["is_first_party"] = True
        all_articles.append(a)

    text = f"Kansas Local News Digest - {today}\n"
    text += f"{len(all_articles)} new articles\n"
    text += "=" * 50 + "\n\n"

    # Create weather lookup by city
    weather_by_city = {w.get("city"): w for w in weather} if weather else {}

    # Group articles by market (using geocoding)
    by_market = {}
    for article in all_articles:
        raw_location = article.get("location") or "Unknown"
        market = get_market(raw_location)
        if market not in by_market:
            by_market[market] = []
        by_market[market].append(article)

    # Sort articles within each market by priority (desc)
    for market in by_market:
        by_market[market].sort(key=lambda a: a.get("priority") or 3, reverse=True)

    if not all_articles:
        text += "No new articles in the past 24 hours.\n"
    else:
        # Sort markets in defined order (At Large last)
        market_order = get_all_markets()
        sorted_markets = sorted(by_market.keys(), key=lambda m: market_order.index(m) if m in market_order else 999)

        for market in sorted_markets:
            market_articles = by_market[market]
            weather_city = get_weather_city(market)
            w = weather_by_city.get(weather_city) if weather_city else None

            text += f"\n{'=' * 40}\n"
            text += f"📍 {market}"
            if w:
                temp = w.get("current_temp", "")
                bullet = w.get("bullet", "")
                if bullet:
                    text += f" | {temp}°F\n{bullet}"
                else:
                    conditions = w.get("current_conditions", "")
                    high = w.get("forecast_high", "")
                    low = w.get("forecast_low", "")
                    text += f" | {temp}°F {conditions} (H:{high}° L:{low}°)"
            text += f"\n{'=' * 40}\n\n"

            for article in market_articles:
                title = article.get("title", "Untitled")
                bullet = article.get("bullet") or "No summary available."
                priority = article.get("priority") or 3
                plabels = {5: "🔴", 4: "🟠", 3: "🟡", 2: "🟢", 1: "⚪"}
                published = article.get("published_at", "")
                is_first_party = article.get("is_first_party", False)
                if published:
                    published = datetime.fromisoformat(published.replace("Z", "+00:00")).strftime("%b %d")
                else:
                    published = ""

                fp_tag = " [OFFICIAL]" if is_first_party else ""
                text += f"{plabels.get(priority, '')} {title}{f' ({published})' if published else ''}{fp_tag}\n"
                text += f"→ {bullet}\n\n"

    return text


def send_email(html_content, plain_content, article_count):
    """Send email via Gmail SMTP."""
    if not all([GMAIL_ADDRESS, GMAIL_APP_PASSWORD, DIGEST_RECIPIENT]):
        print("Missing email configuration. Set GMAIL_ADDRESS, GMAIL_APP_PASSWORD, DIGEST_RECIPIENT.")
        return False

    today = datetime.now().strftime("%b %d, %Y")
    subject = f"📰 Kansas Local News - {today} ({article_count} articles)"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = DIGEST_RECIPIENT

    msg.attach(MIMEText(plain_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_ADDRESS, DIGEST_RECIPIENT, msg.as_string())
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False


def main():
    """Generate and send nightly digest."""
    supabase = get_supabase()

    print("Fetching weather...")
    weather = get_weather(supabase)
    print(f"Got weather for {len(weather)} cities")

    print("Fetching recent news articles...")
    articles = get_recent_articles(supabase)
    print(f"Found {len(articles)} news articles from the past 24 hours")

    print("Fetching first party articles...")
    first_party = get_first_party_articles(supabase)
    print(f"Found {len(first_party)} first party articles from the past 24 hours")

    total_articles = len(articles) + len(first_party)
    if total_articles == 0 and not weather:
        print("No content to send.")
        return

    print("Formatting email...")
    html_content = format_html_email(articles, weather, first_party)
    plain_content = format_plain_text(articles, weather, first_party)

    print(f"Sending digest to {DIGEST_RECIPIENT}...")
    if send_email(html_content, plain_content, total_articles):
        print("Email sent successfully!")
    else:
        print("Failed to send email.")


if __name__ == "__main__":
    main()
