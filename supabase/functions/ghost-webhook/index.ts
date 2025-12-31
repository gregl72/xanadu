import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return parsed.topics.map((t: Partial<Topic>) => ({
        title: t.title || title,
        location: t.location || defaultCity,
        is_local: t.is_local !== false,
        bullet: t.bullet || "",
        priority: (t.priority && t.priority >= 1 && t.priority <= 5) ? t.priority : 3,
      }));
    }

    // Fallback if parsing fails
    return [{ title, location: defaultCity, is_local: true, bullet: "", priority: 3 }];
  } catch (error) {
    console.error("Claude analysis error:", error);
    return [{ title, location: defaultCity, is_local: true, bullet: "", priority: 3 }];
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
      const topicUrl = topics.length > 1 ? `${url}#topic-${i + 1}` : url;

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
        }, {
          onConflict: "url",
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`Failed to insert topic ${i + 1}:`, insertError);
      } else {
        console.log(`Saved topic ${i + 1}:`, topic.title, topic.location, "P" + topic.priority);
        insertedArticles.push({ id: article.id, title: topic.title, location: topic.location });
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
