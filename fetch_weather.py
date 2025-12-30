"""Fetch weather data from NWS API for all cities."""

import os
import time

import anthropic
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Kansas city coordinates
CITY_COORDS = {
    "Abilene": (38.9172, -97.2139),
    "Arkansas City": (37.0620, -97.0384),
    "Dodge City": (37.7528, -100.0171),
    "Garden City": (37.9717, -100.8727),
    "Great Bend": (38.3645, -98.7648),
    "Hays": (38.8794, -99.3268),
    "Hutchinson": (38.0608, -97.9298),
    "Junction City": (39.0286, -96.8314),
    "Lawrence": (38.9717, -95.2353),
    "Liberal": (37.0431, -100.9212),
    "Manhattan": (39.1836, -96.5717),
    "Newton": (38.0467, -97.3453),
    "Pittsburg": (37.4109, -94.7049),
    "Salina": (38.8403, -97.6114),
    "Topeka": (39.0473, -95.6752),
    "Wellington": (37.2653, -97.3717),
}

NWS_HEADERS = {
    "User-Agent": "(Xanadu News Aggregator, greg.loving@gmail.com)",
    "Accept": "application/geo+json",
}


def get_supabase():
    """Create Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_nws_gridpoint(lat: float, lon: float) -> dict | None:
    """Get NWS grid point for coordinates."""
    url = f"https://api.weather.gov/points/{lat},{lon}"
    try:
        response = requests.get(url, headers=NWS_HEADERS, timeout=10)
        if response.status_code == 200:
            return response.json()["properties"]
        return None
    except Exception as e:
        print(f"    Error getting gridpoint: {e}")
        return None


def get_forecast(forecast_url: str) -> dict | None:
    """Get forecast from NWS."""
    try:
        response = requests.get(forecast_url, headers=NWS_HEADERS, timeout=10)
        if response.status_code == 200:
            return response.json()["properties"]["periods"]
        return None
    except Exception as e:
        print(f"    Error getting forecast: {e}")
        return None


def get_hourly_forecast(hourly_url: str) -> dict | None:
    """Get hourly forecast (current conditions) from NWS."""
    try:
        response = requests.get(hourly_url, headers=NWS_HEADERS, timeout=10)
        if response.status_code == 200:
            return response.json()["properties"]["periods"]
        return None
    except Exception as e:
        print(f"    Error getting hourly: {e}")
        return None


def parse_weather_data(forecast_periods: list, hourly_periods: list) -> dict:
    """Parse NWS data into weather record."""
    weather = {
        "current_temp": None,
        "current_conditions": None,
        "forecast_high": None,
        "forecast_low": None,
        "forecast_conditions": None,
        "precip_chance": None,
        "detailed_forecast": None,
        "temperature_trend": None,
    }

    # Current conditions from hourly (first period)
    if hourly_periods:
        current = hourly_periods[0]
        weather["current_temp"] = current.get("temperature")
        weather["current_conditions"] = current.get("shortForecast")

    # Today's forecast from daily periods
    if forecast_periods:
        today = forecast_periods[0]
        weather["forecast_conditions"] = today.get("shortForecast")
        weather["detailed_forecast"] = today.get("detailedForecast")
        weather["temperature_trend"] = today.get("temperatureTrend")

        # Get precip chance
        precip = today.get("probabilityOfPrecipitation", {})
        if precip and precip.get("value") is not None:
            weather["precip_chance"] = precip["value"]

        # Determine high/low based on isDaytime
        if today.get("isDaytime"):
            weather["forecast_high"] = today.get("temperature")
            # Look for tonight's low
            if len(forecast_periods) > 1:
                weather["forecast_low"] = forecast_periods[1].get("temperature")
        else:
            weather["forecast_low"] = today.get("temperature")
            # Look for tomorrow's high
            if len(forecast_periods) > 1:
                weather["forecast_high"] = forecast_periods[1].get("temperature")

    return weather


def generate_weather_bullet(client: anthropic.Anthropic, city: str, weather: dict) -> str:
    """Generate a punchy weather bullet using Claude."""
    prompt = f"""Summarize this weather data into a single punchy sentence for {city}, Kansas.

Current temp: {weather.get('current_temp')}°F
Conditions: {weather.get('current_conditions')}
High: {weather.get('forecast_high')}°F
Low: {weather.get('forecast_low')}°F
Precipitation chance: {weather.get('precip_chance') or 0}%
Detailed forecast: {weather.get('detailed_forecast')}
Temperature trend: {weather.get('temperature_trend') or 'steady'}

Respond with ONLY the bullet, no prefix. Be concise and conversational, like a local weather report."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception as e:
        print(f"    Claude error: {e}")
        return None


def fetch_city_weather(city: str, lat: float, lon: float) -> dict | None:
    """Fetch weather for a single city."""
    # Get grid point
    gridpoint = get_nws_gridpoint(lat, lon)
    if not gridpoint:
        return None

    forecast_url = gridpoint.get("forecast")
    hourly_url = gridpoint.get("forecastHourly")

    if not forecast_url:
        return None

    # Get forecasts
    forecast_periods = get_forecast(forecast_url)
    hourly_periods = get_hourly_forecast(hourly_url) if hourly_url else None

    if not forecast_periods:
        return None

    weather = parse_weather_data(forecast_periods, hourly_periods)
    weather["city"] = city

    return weather


def main():
    """Fetch weather for all cities."""
    supabase = get_supabase()
    claude = anthropic.Anthropic()

    print(f"Fetching weather for {len(CITY_COORDS)} cities...\n")

    for city, (lat, lon) in CITY_COORDS.items():
        print(f"{city}...", end=" ")

        weather = fetch_city_weather(city, lat, lon)

        if weather:
            print(f"{weather['current_temp']}°F, {weather['current_conditions']}")

            # Generate bullet with Claude
            bullet = generate_weather_bullet(claude, city, weather)
            if bullet:
                weather["bullet"] = bullet
                print(f"    → {bullet}")

            # Upsert to database
            supabase.table("weather").upsert(
                weather, on_conflict="city"
            ).execute()
        else:
            print("Failed")

        # Rate limit NWS API + Claude
        time.sleep(0.5)

    print("\nDone!")


if __name__ == "__main__":
    main()
