import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Kansas city coordinates
const CITY_COORDS: Record<string, [number, number]> = {
  "Abilene": [38.9172, -97.2139],
  "Arkansas City": [37.0620, -97.0384],
  "Dodge City": [37.7528, -100.0171],
  "Emporia": [38.4039, -96.1817],
  "Garden City": [37.9717, -100.8727],
  "Great Bend": [38.3645, -98.7648],
  "Hays": [38.8794, -99.3268],
  "Hutchinson": [38.0608, -97.9298],
  "Junction City": [39.0286, -96.8314],
  "Lawrence": [38.9717, -95.2353],
  "Liberal": [37.0431, -100.9212],
  "Manhattan": [39.1836, -96.5717],
  "McPherson": [38.3706, -97.6642],
  "Newton": [38.0467, -97.3453],
  "Pittsburg": [37.4109, -94.7049],
  "Salina": [38.8403, -97.6114],
  "Topeka": [39.0473, -95.6752],
  "Wellington": [37.2653, -97.3717],
};

const NWS_HEADERS = {
  "User-Agent": "(Xanadu News Aggregator, greg.loving@gmail.com)",
  "Accept": "application/geo+json",
};

interface WeatherData {
  city: string;
  current_temp: number | null;
  current_conditions: string | null;
  forecast_high: number | null;
  forecast_low: number | null;
  forecast_conditions: string | null;
  precip_chance: number | null;
  detailed_forecast: string | null;
  temperature_trend: string | null;
  bullet?: string;
}

async function getNwsGridpoint(lat: number, lon: number): Promise<{ forecast: string; forecastHourly: string } | null> {
  const url = `https://api.weather.gov/points/${lat},${lon}`;
  try {
    const response = await fetch(url, { headers: NWS_HEADERS });
    if (response.ok) {
      const data = await response.json();
      return data.properties;
    }
    return null;
  } catch (e) {
    console.error(`Error getting gridpoint: ${e}`);
    return null;
  }
}

async function getForecast(forecastUrl: string): Promise<any[] | null> {
  try {
    const response = await fetch(forecastUrl, { headers: NWS_HEADERS });
    if (response.ok) {
      const data = await response.json();
      return data.properties.periods;
    }
    return null;
  } catch (e) {
    console.error(`Error getting forecast: ${e}`);
    return null;
  }
}

async function getHourlyForecast(hourlyUrl: string): Promise<any[] | null> {
  try {
    const response = await fetch(hourlyUrl, { headers: NWS_HEADERS });
    if (response.ok) {
      const data = await response.json();
      return data.properties.periods;
    }
    return null;
  } catch (e) {
    console.error(`Error getting hourly: ${e}`);
    return null;
  }
}

function parseWeatherData(forecastPeriods: any[], hourlyPeriods: any[] | null): Omit<WeatherData, 'city'> {
  const weather: Omit<WeatherData, 'city'> = {
    current_temp: null,
    current_conditions: null,
    forecast_high: null,
    forecast_low: null,
    forecast_conditions: null,
    precip_chance: null,
    detailed_forecast: null,
    temperature_trend: null,
  };

  // Current conditions from hourly (first period)
  if (hourlyPeriods && hourlyPeriods.length > 0) {
    const current = hourlyPeriods[0];
    weather.current_temp = current.temperature;
    weather.current_conditions = current.shortForecast;
  }

  // Today's forecast from daily periods
  if (forecastPeriods && forecastPeriods.length > 0) {
    const today = forecastPeriods[0];
    weather.forecast_conditions = today.shortForecast;
    weather.detailed_forecast = today.detailedForecast;
    weather.temperature_trend = today.temperatureTrend;

    // Get precip chance
    const precip = today.probabilityOfPrecipitation;
    if (precip && precip.value !== null) {
      weather.precip_chance = precip.value;
    }

    // Determine high/low based on isDaytime
    if (today.isDaytime) {
      weather.forecast_high = today.temperature;
      if (forecastPeriods.length > 1) {
        weather.forecast_low = forecastPeriods[1].temperature;
      }
    } else {
      weather.forecast_low = today.temperature;
      if (forecastPeriods.length > 1) {
        weather.forecast_high = forecastPeriods[1].temperature;
      }
    }
  }

  return weather;
}

async function generateWeatherBullet(client: Anthropic, city: string, weather: Omit<WeatherData, 'city'>): Promise<string | null> {
  const prompt = `Write a brief weather forecast for ${city}, Kansas for today.

High: ${weather.forecast_high}°F
Low: ${weather.forecast_low}°F
Conditions: ${weather.forecast_conditions}
Precipitation chance: ${weather.precip_chance || 0}%
Detailed forecast: ${weather.detailed_forecast}

Respond with ONLY a single sentence forecast, no prefix. Be concise and conversational, like a local morning weather report. Focus on what to expect today.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });
    return (message.content[0] as { text: string }).text.trim();
  } catch (e) {
    console.error(`Claude error: ${e}`);
    return null;
  }
}

async function fetchCityWeather(city: string, lat: number, lon: number): Promise<WeatherData | null> {
  const gridpoint = await getNwsGridpoint(lat, lon);
  if (!gridpoint) return null;

  const forecastUrl = gridpoint.forecast;
  const hourlyUrl = gridpoint.forecastHourly;

  if (!forecastUrl) return null;

  const forecastPeriods = await getForecast(forecastUrl);
  const hourlyPeriods = hourlyUrl ? await getHourlyForecast(hourlyUrl) : null;

  if (!forecastPeriods) return null;

  const weather = parseWeatherData(forecastPeriods, hourlyPeriods);
  return { city, ...weather };
}

// Add delay helper for rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    const reqUrl = new URL(req.url);
    if (!reqUrl.searchParams.has("run")) {
      return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  console.log("=== FETCH WEATHER START ===");

  try {
    // Optional: Verify secret for manual triggers
    const webhookSecret = Deno.env.get("WEATHER_WEBHOOK_SECRET");
    if (webhookSecret) {
      const reqUrl = new URL(req.url);
      const providedSecret = reqUrl.searchParams.get("secret");
      if (providedSecret !== webhookSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const claude = new Anthropic({ apiKey: anthropicKey });

    const results: { city: string; status: string; temp?: number }[] = [];
    const cities = Object.entries(CITY_COORDS);

    console.log(`Fetching weather for ${cities.length} cities...`);

    for (const [city, [lat, lon]] of cities) {
      console.log(`${city}...`);

      const weather = await fetchCityWeather(city, lat, lon);

      if (weather) {
        console.log(`  ${weather.current_temp}°F, ${weather.current_conditions}`);

        // Generate bullet with Claude
        const bullet = await generateWeatherBullet(claude, city, weather);
        if (bullet) {
          weather.bullet = bullet;
          console.log(`  → ${bullet}`);
        }

        // Upsert to database
        const { error } = await supabase
          .from("weather")
          .upsert(weather, { onConflict: "city" });

        if (error) {
          console.error(`  DB error: ${error.message}`);
          results.push({ city, status: "db_error" });
        } else {
          results.push({ city, status: "success", temp: weather.current_temp ?? undefined });
        }
      } else {
        console.log(`  Failed`);
        results.push({ city, status: "failed" });
      }

      // Rate limit NWS API + Claude
      await delay(500);
    }

    console.log("=== FETCH WEATHER COMPLETE ===");

    const successCount = results.filter(r => r.status === "success").length;

    return new Response(JSON.stringify({
      status: "complete",
      timestamp: new Date().toISOString(),
      cities_updated: successCount,
      total_cities: cities.length,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Weather fetch error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
