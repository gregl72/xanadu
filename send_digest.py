"""Send nightly email digest of local news articles."""

import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv
from supabase import create_client

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


def format_html_email(articles, weather):
    """Format articles as HTML email."""
    today = datetime.now().strftime("%B %d, %Y")

    priority_labels = {
        5: ("🔴", "BREAKING"),
        4: ("🟠", "IMPORTANT"),
        3: ("🟡", "LOCAL NEWS"),
        2: ("🟢", "MINOR"),
        1: ("⚪", "LOW PRIORITY"),
    }

    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }}
            h1 {{ color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 10px; }}
            .weather-section {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 25px; }}
            .weather-title {{ font-size: 16px; font-weight: bold; margin-bottom: 15px; }}
            .weather-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }}
            .weather-city {{ background: rgba(255,255,255,0.15); padding: 10px; border-radius: 8px; font-size: 13px; }}
            .weather-city-name {{ font-weight: bold; }}
            .weather-temp {{ font-size: 18px; }}
            .weather-details {{ font-size: 11px; opacity: 0.9; }}
            .priority-section {{ margin: 20px 0; }}
            .priority-header {{ font-size: 14px; font-weight: bold; color: #666; margin-bottom: 10px; }}
            .article {{ background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #ccc; }}
            .article.p5 {{ border-left-color: #dc3545; }}
            .article.p4 {{ border-left-color: #fd7e14; }}
            .article.p3 {{ border-left-color: #ffc107; }}
            .article.p2 {{ border-left-color: #28a745; }}
            .article.p1 {{ border-left-color: #6c757d; }}
            .location {{ font-size: 12px; color: #666; margin-bottom: 5px; }}
            .title {{ font-size: 16px; font-weight: bold; margin-bottom: 8px; }}
            .title a {{ color: #1a1a1a; text-decoration: none; }}
            .title a:hover {{ text-decoration: underline; }}
            .bullet {{ font-size: 14px; color: #444; line-height: 1.5; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; }}
        </style>
    </head>
    <body>
        <h1>📰 Kansas Local News Digest</h1>
        <p style="color: #666;">{today} • {len(articles)} new articles</p>
    """

    # Weather section
    if weather:
        html += """
        <div class="weather-section">
            <div class="weather-title">🌤️ Kansas Weather</div>
            <div class="weather-grid">
        """
        for w in weather:
            city = w.get("city", "")
            temp = w.get("current_temp", "")
            conditions = w.get("current_conditions", "")
            high = w.get("forecast_high", "")
            low = w.get("forecast_low", "")
            precip = w.get("precip_chance")

            temp_str = f"{temp}°F" if temp else "N/A"
            hl_str = f"H:{high}° L:{low}°" if high and low else ""
            precip_str = f" | {precip}% precip" if precip else ""

            html += f"""
                <div class="weather-city">
                    <div class="weather-city-name">{city}</div>
                    <div class="weather-temp">{temp_str}</div>
                    <div class="weather-details">{conditions}</div>
                    <div class="weather-details">{hl_str}{precip_str}</div>
                </div>
            """
        html += """
            </div>
        </div>
        """

    if not articles:
        html += "<p>No new articles in the past 24 hours.</p>"
    else:
        # Group by priority
        by_priority = {}
        for article in articles:
            p = article.get("priority") or 3
            if p not in by_priority:
                by_priority[p] = []
            by_priority[p].append(article)

        for priority in sorted(by_priority.keys(), reverse=True):
            emoji, label = priority_labels.get(priority, ("⚪", "OTHER"))
            html += f"""
            <div class="priority-section">
                <div class="priority-header">{emoji} {label}</div>
            """

            for article in by_priority[priority]:
                location = article.get("location") or "Kansas"
                title = article.get("title", "Untitled")
                bullet = article.get("bullet") or "No summary available."
                url = article.get("url", "#")
                published = article.get("published_at", "")
                if published:
                    published = datetime.fromisoformat(published.replace("Z", "+00:00")).strftime("%b %d")
                else:
                    published = ""

                html += f"""
                <div class="article p{priority}">
                    <div class="location">📍 {location}{f' • {published}' if published else ''}</div>
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


def format_plain_text(articles, weather):
    """Format articles as plain text fallback."""
    today = datetime.now().strftime("%B %d, %Y")
    text = f"Kansas Local News Digest - {today}\n"
    text += f"{len(articles)} new articles\n"
    text += "=" * 50 + "\n\n"

    # Weather section
    if weather:
        text += "🌤️ KANSAS WEATHER\n"
        text += "-" * 30 + "\n"
        for w in weather:
            city = w.get("city", "")
            temp = w.get("current_temp", "")
            conditions = w.get("current_conditions", "")
            high = w.get("forecast_high", "")
            low = w.get("forecast_low", "")
            text += f"{city}: {temp}°F - {conditions} (H:{high}° L:{low}°)\n"
        text += "\n" + "=" * 50 + "\n\n"

    if not articles:
        text += "No new articles in the past 24 hours.\n"
    else:
        current_priority = None
        for article in articles:
            p = article.get("priority") or 3
            if p != current_priority:
                current_priority = p
                text += f"\n--- PRIORITY {p} ---\n\n"

            location = article.get("location") or "Kansas"
            title = article.get("title", "Untitled")
            bullet = article.get("bullet") or "No summary available."
            published = article.get("published_at", "")
            if published:
                published = datetime.fromisoformat(published.replace("Z", "+00:00")).strftime("%b %d")
            else:
                published = ""

            text += f"📍 {location}{f' • {published}' if published else ''}\n"
            text += f"{title}\n"
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

    print("Fetching recent articles...")
    articles = get_recent_articles(supabase)
    print(f"Found {len(articles)} articles from the past 24 hours")

    if not articles and not weather:
        print("No content to send.")
        return

    print("Formatting email...")
    html_content = format_html_email(articles, weather)
    plain_content = format_plain_text(articles, weather)

    print(f"Sending digest to {DIGEST_RECIPIENT}...")
    if send_email(html_content, plain_content, len(articles)):
        print("Email sent successfully!")
    else:
        print("Failed to send email.")


if __name__ == "__main__":
    main()
