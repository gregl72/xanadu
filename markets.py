"""Market categorization for Kansas news articles using geocoding."""

import math
import os
from functools import lru_cache

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable

# Market definitions with anchor city coordinates (lat, lon)
# Coordinates are approximate city centers
MARKETS = {
    "Ark Valley": {"lat": 37.0619, "lon": -97.0386, "weather_city": "Arkansas City"},  # Ark City
    "Pittsburg": {"lat": 37.4109, "lon": -94.7049, "weather_city": "Pittsburg"},
    "Liberal": {"lat": 37.0431, "lon": -100.9212, "weather_city": "Liberal"},
    "Garden City": {"lat": 37.9717, "lon": -100.8727, "weather_city": "Garden City"},
    "Dodge City": {"lat": 37.7528, "lon": -100.0171, "weather_city": "Dodge City"},
    "Great Bend": {"lat": 38.3645, "lon": -98.7648, "weather_city": "Great Bend"},
    "McPherson": {"lat": 38.3706, "lon": -97.6642, "weather_city": "McPherson"},
    "Salina": {"lat": 38.8403, "lon": -97.6114, "weather_city": "Salina"},
    "Hutchinson": {"lat": 38.0608, "lon": -97.9298, "weather_city": "Hutchinson"},
    "Abilene": {"lat": 38.9172, "lon": -97.2137, "weather_city": "Abilene"},
    "Junction City": {"lat": 39.0286, "lon": -96.8314, "weather_city": "Junction City"},
    "Manhattan": {"lat": 39.1836, "lon": -96.5717, "weather_city": "Manhattan"},
    "Topeka": {"lat": 39.0473, "lon": -95.6752, "weather_city": "Topeka"},
    "Lawrence": {"lat": 38.9717, "lon": -95.2353, "weather_city": "Lawrence"},
    "Hays": {"lat": 38.8794, "lon": -99.3268, "weather_city": "Hays"},
    "Emporia": {"lat": 38.4039, "lon": -96.1817, "weather_city": "Emporia"},
}

# Additional city aliases that map to markets (for common variations)
CITY_ALIASES = {
    "ark city": "Ark Valley",
    "arkansas city": "Ark Valley",
    "winfield": "Ark Valley",
    "wellington": "Ark Valley",
    "kansas city": "At Large",  # KC is in Missouri, put in At Large
    "wichita": "At Large",  # Wichita is its own metro, not in our markets
    "overland park": "At Large",
    "olathe": "At Large",
}

# Initialize geocoder
_geocoder = None


def get_geocoder():
    """Get or create geocoder instance."""
    global _geocoder
    if _geocoder is None:
        _geocoder = Nominatim(user_agent="xanadu-news-aggregator")
    return _geocoder


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in miles using Haversine formula."""
    R = 3959  # Earth's radius in miles

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


@lru_cache(maxsize=500)
def geocode_location(location: str) -> tuple[float, float] | None:
    """Geocode a location string to coordinates. Returns (lat, lon) or None."""
    if not location:
        return None

    # Add Kansas context for better geocoding
    query = f"{location}, Kansas, USA"

    try:
        geocoder = get_geocoder()
        result = geocoder.geocode(query, timeout=10)
        if result:
            return (result.latitude, result.longitude)
    except (GeocoderTimedOut, GeocoderUnavailable) as e:
        print(f"Geocoding error for {location}: {e}")
    except Exception as e:
        print(f"Unexpected geocoding error for {location}: {e}")

    return None


def get_market(location: str) -> str:
    """
    Determine the market for a given location.
    Returns market name or "At Large" if not within 30 miles of any market.
    """
    if not location:
        return "At Large"

    location_lower = location.lower().strip()

    # Check direct aliases first
    if location_lower in CITY_ALIASES:
        return CITY_ALIASES[location_lower]

    # Check if location matches a market name directly
    for market_name in MARKETS:
        if market_name.lower() == location_lower:
            return market_name

    # Try to geocode the location
    coords = geocode_location(location)
    if coords is None:
        # Fallback: check if location contains a market name
        for market_name in MARKETS:
            if market_name.lower() in location_lower:
                return market_name
        return "At Large"

    lat, lon = coords

    # Find nearest market within 30 miles
    nearest_market = None
    nearest_distance = float("inf")

    for market_name, market_data in MARKETS.items():
        distance = haversine_distance(lat, lon, market_data["lat"], market_data["lon"])
        if distance < nearest_distance:
            nearest_distance = distance
            nearest_market = market_name

    if nearest_distance <= 30:
        return nearest_market
    else:
        return "At Large"


def get_weather_city(market: str) -> str | None:
    """Get the weather city for a market."""
    if market in MARKETS:
        return MARKETS[market]["weather_city"]
    return None


def get_all_markets() -> list[str]:
    """Get list of all market names in display order."""
    return list(MARKETS.keys()) + ["At Large"]


if __name__ == "__main__":
    # Test the module
    test_locations = [
        "Manhattan",
        "Riley",
        "Ogden",
        "Winfield",
        "Wichita",
        "Topeka",
        "Some Random Town",
        "Hays",
        "Ellis",
    ]

    for loc in test_locations:
        market = get_market(loc)
        print(f"{loc} -> {market}")
