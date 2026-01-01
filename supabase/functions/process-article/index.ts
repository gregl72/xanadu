import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Market anchor coordinates
const MARKETS: Record<string, { lat: number; lon: number }> = {
  "Ark Valley": { lat: 37.0619, lon: -97.0386 },
  "Pittsburg": { lat: 37.4109, lon: -94.7049 },
  "Liberal": { lat: 37.0431, lon: -100.9212 },
  "Garden City": { lat: 37.9717, lon: -100.8727 },
  "Dodge City": { lat: 37.7528, lon: -100.0171 },
  "Great Bend": { lat: 38.3645, lon: -98.7648 },
  "McPherson": { lat: 38.3706, lon: -97.6642 },
  "Salina": { lat: 38.8403, lon: -97.6114 },
  "Hutchinson": { lat: 38.0608, lon: -97.9298 },
  "Abilene": { lat: 38.9172, lon: -97.2139 },
  "Junction City": { lat: 39.0286, lon: -96.8314 },
  "Manhattan": { lat: 39.1836, lon: -96.5717 },
  "Topeka": { lat: 39.0473, lon: -95.6752 },
  "Lawrence": { lat: 38.9717, lon: -95.2353 },
  "Hays": { lat: 38.8792, lon: -99.3268 },
  "Emporia": { lat: 38.4039, lon: -96.1817 },
};

// Cities that map directly to "At Large"
const AT_LARGE_CITIES = ["kansas city", "wichita", "overland park", "olathe"];

// Haversine formula to calculate distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Geocode location using Nominatim
async function geocodeLocation(location: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const query = encodeURIComponent(`${location}, Kansas, USA`);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      {
        headers: {
          "User-Agent": "XanaduNewsApp/1.0",
        },
      }
    );

    if (!response.ok) {
      console.error("Geocoding failed:", response.status);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

// Determine market from location
async function getMarket(location: string): Promise<string> {
  const locationLower = location.toLowerCase();

  // Check if it's a large city that maps to At Large
  if (AT_LARGE_CITIES.some(city => locationLower.includes(city))) {
    return "At Large";
  }

  // Check if location matches a market name directly
  for (const marketName of Object.keys(MARKETS)) {
    if (marketName.toLowerCase() === locationLower) {
      return marketName;
    }
  }

  // Geocode and find nearest market
  const coords = await geocodeLocation(location);
  if (!coords) {
    return "At Large";
  }

  let nearestMarket = "At Large";
  let nearestDistance = Infinity;

  for (const [marketName, marketCoords] of Object.entries(MARKETS)) {
    const distance = haversineDistance(coords.lat, coords.lon, marketCoords.lat, marketCoords.lon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestMarket = marketName;
    }
  }

  // Only assign to market if within 30 miles
  return nearestDistance <= 30 ? nearestMarket : "At Large";
}

// Analyze article with Claude
async function analyzeArticle(title: string, content: string): Promise<{
  location: string;
  is_local: boolean;
  bullet: string;
  priority: number;
}> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.log("No ANTHROPIC_API_KEY");
    return { location: "Kansas", is_local: true, bullet: "", priority: 3 };
  }

  const client = new Anthropic({ apiKey: anthropicKey });
  const text = content.slice(0, 4000);

  const prompt = `Analyze this Kansas local news article.

Title: ${title}
Content: ${text}

Return ONLY valid JSON (no markdown, no explanation):
{
  "location": "City name in Kansas where this news is happening",
  "is_local": true,
  "bullet": "1-2 sentence punchy summary",
  "priority": 3
}

Priority scale: 5=breaking/major, 4=important, 3=regular news, 2=minor, 1=routine/filler
Set is_local to false only if NOT about Kansas.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const response = (message.content[0] as { text: string }).text.trim();
    console.log("Claude response:", response);

    const parsed = JSON.parse(response);
    return {
      location: parsed.location || "Kansas",
      is_local: parsed.is_local !== false,
      bullet: parsed.bullet || "",
      priority: (parsed.priority >= 1 && parsed.priority <= 5) ? parsed.priority : 3,
    };
  } catch (error) {
    console.error("Claude analysis error:", error);
    return { location: "Kansas", is_local: true, bullet: "", priority: 3 };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { id, table } = await req.json();

    if (!id || !table) {
      return new Response(JSON.stringify({ error: "Missing id or table" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate table name
    if (table !== "articles" && table !== "first_party_articles") {
      return new Response(JSON.stringify({ error: "Invalid table" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${table} id=${id}`);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch article
    const { data: article, error: fetchError } = await supabase
      .from(table)
      .select("id, title, content, url")
      .eq("id", id)
      .single();

    if (fetchError || !article) {
      console.error("Article not found:", fetchError);
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Analyze with Claude
    const analysis = await analyzeArticle(article.title, article.content || "");
    console.log("Analysis:", analysis);

    // Get market from location
    const market = await getMarket(analysis.location);
    console.log(`Location: ${analysis.location} -> Market: ${market}`);

    // Update article
    const { data: updated, error: updateError } = await supabase
      .from(table)
      .update({
        location: analysis.location,
        is_local: analysis.is_local,
        bullet: analysis.bullet,
        priority: analysis.priority,
        market: market,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Update failed:", updateError);
      return new Response(JSON.stringify({ error: "Update failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Updated article:", updated.id, updated.title);

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
