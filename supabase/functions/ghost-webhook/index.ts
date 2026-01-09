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
  "Newton": { lat: 38.0467, lon: -97.3453 },
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

interface Topic {
  title: string;
  location: string;
  is_local: boolean;
  bullet: string;
  priority: number;
}

async function analyzeArticle(title: string, content: string, defaultCity: string): Promise<Topic[]> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.log("No ANTHROPIC_API_KEY, skipping analysis");
    return [{ title, location: defaultCity, is_local: true, bullet: "", priority: 3 }];
  }

  const client = new Anthropic({ apiKey: anthropicKey });
  const text = content.slice(0, 6000); // More content for multi-topic detection

  const prompt = `Analyze this article from a Kansas local news source.

Title: ${title}
Content: ${text}

If this article contains MULTIPLE distinct news topics (like a roundup, brief, or compilation), split them into separate entries. If it's a single-topic article, return one entry.

Return ONLY valid JSON (no markdown, no explanation):
{
  "topics": [
    {
      "title": "Specific topic title",
      "location": "City name in Kansas",
      "is_local": true,
      "bullet": "1-2 sentence punchy summary of this specific topic",
      "priority": 3
    }
  ]
}

Priority scale: 5=breaking/major, 4=important, 3=regular news, 2=minor, 1=routine/filler
Set is_local to false only if the topic is NOT about Kansas.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const response = (message.content[0] as { text: string }).text.trim();
    console.log("Claude response:", response);

    // Parse JSON response
    const parsed = JSON.parse(response);
    if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
      // Validate and sanitize each topic
      // Ghost articles get minimum priority 4
      return parsed.topics.map((t: Partial<Topic>) => ({
        title: t.title || title,
        location: t.location || defaultCity,
        is_local: t.is_local !== false,
        bullet: t.bullet || "",
        priority: (t.priority && t.priority >= 1 && t.priority <= 5) ? Math.max(t.priority, 4) : 4,
      }));
    }

    // Fallback if parsing fails - Ghost articles default to priority 4
    return [{ title, location: defaultCity, is_local: true, bullet: "", priority: 4 }];
  } catch (error) {
    console.error("Claude analysis error:", error);
    return [{ title, location: defaultCity, is_local: true, bullet: "", priority: 4 }];
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("=== WEBHOOK REQUEST ===");

  try {
    // Verify webhook secret
    const webhookSecret = Deno.env.get("GHOST_WEBHOOK_SECRET");
    const reqUrl = new URL(req.url);
    const providedSecret = reqUrl.searchParams.get("secret");

    if (webhookSecret && providedSecret !== webhookSecret) {
      console.error("Invalid webhook secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    // Ghost may send in different formats
    const post = payload?.post?.current || payload?.post || payload;
    if (!post) {
      return new Response(JSON.stringify({ status: "ignored", reason: "no post data" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip posts with excluded tags (briefs link to standalone articles, obit/jail not needed)
    const EXCLUDED_TAGS = ['brief', 'obit', 'jail'];
    const tags = post.tags || [];
    const hasExcludedTag = tags.some((tag: { slug?: string; name?: string }) => {
      const slug = tag.slug?.toLowerCase() || '';
      const name = tag.name?.toLowerCase().replace('#', '') || '';
      return EXCLUDED_TAGS.includes(slug) || EXCLUDED_TAGS.includes(name);
    });
    if (hasExcludedTag) {
      console.log("Skipping post with excluded tag:", post.title);
      return new Response(JSON.stringify({ status: "skipped", reason: "excluded tag" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = post.title;
    const url = post.url;
    const content = post.html || post.plaintext || "";
    const publishedAt = post.published_at;

    if (!title || !url) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Processing article:", title);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Ghost source
    const { data: source, error: sourceError } = await supabase
      .from("first_party_sources")
      .select("id, city")
      .eq("name", "Ghost Blog")
      .single();

    if (sourceError || !source) {
      console.error("Ghost source not found:", sourceError);
      return new Response(JSON.stringify({ error: "Ghost source not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Analyze article - may return multiple topics
    const topics = await analyzeArticle(title, content, source.city || "Kansas");
    console.log(`Found ${topics.length} topic(s)`);

    // Insert each topic as separate row
    const insertedArticles = [];
    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      // Use fragment to make URL unique for multiple topics
      const topicUrl = topics.length > 1 ? `${url}?topic=${i + 1}` : url;

      // Calculate market from location
      const market = await getMarket(topic.location);
      console.log(`Location: ${topic.location} -> Market: ${market}`);

      const { data: article, error: insertError } = await supabase
        .from("first_party_articles")
        .upsert({
          source_id: source.id,
          title: topic.title,
          url: topicUrl,
          content: topics.length > 1 ? `[Part of: ${title}]` : content,
          published_at: publishedAt,
          fetched_at: new Date().toISOString(),
          is_accessible: true,
          location: topic.location,
          is_local: topic.is_local,
          bullet: topic.bullet,
          priority: topic.priority,
          market: market,
        }, {
          onConflict: "url",
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`Failed to insert topic ${i + 1}:`, insertError);
      } else {
        console.log(`Saved topic ${i + 1}:`, topic.title, topic.location, "->", market, "P" + topic.priority);
        insertedArticles.push({ id: article.id, title: topic.title, location: topic.location, market: market });
      }
    }

    return new Response(JSON.stringify({
      status: "success",
      original_title: title,
      topics_found: topics.length,
      articles: insertedArticles,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
