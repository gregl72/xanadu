import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));

  try {
    // Verify webhook secret (check query param)
    const webhookSecret = Deno.env.get("GHOST_WEBHOOK_SECRET");
    const reqUrl = new URL(req.url);
    const providedSecret = reqUrl.searchParams.get("secret");

    console.log("Expected secret:", webhookSecret);
    console.log("Provided secret:", providedSecret);

    if (webhookSecret && providedSecret !== webhookSecret) {
      console.error("Invalid webhook secret - expected:", webhookSecret, "got:", providedSecret);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    console.log("Raw webhook body:", rawBody);

    const payload = JSON.parse(rawBody);
    console.log("Parsed payload keys:", Object.keys(payload));

    // Ghost may send in different formats - try multiple
    const post = payload?.post?.current || payload?.post || payload;
    if (!post) {
      console.log("No post data in payload, might be a different event type");
      return new Response(JSON.stringify({ status: "ignored", reason: "no post data" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract post data
    const title = post.title;
    const url = post.url;
    const content = post.html || post.plaintext || "";
    const publishedAt = post.published_at;

    if (!title || !url) {
      console.error("Missing required fields: title or url");
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Ghost source_id (assumes you've added Ghost to first_party_sources)
    const { data: source, error: sourceError } = await supabase
      .from("first_party_sources")
      .select("id")
      .eq("name", "Ghost Blog")
      .single();

    if (sourceError || !source) {
      console.error("Ghost source not found in first_party_sources:", sourceError);
      return new Response(JSON.stringify({ error: "Ghost source not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert article (upsert to handle duplicates)
    const { data: article, error: insertError } = await supabase
      .from("first_party_articles")
      .upsert({
        source_id: source.id,
        title,
        url,
        content,
        published_at: publishedAt,
        fetched_at: new Date().toISOString(),
        is_accessible: true,
      }, {
        onConflict: "url",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert article:", insertError);
      return new Response(JSON.stringify({ error: "Database insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Article inserted:", article.id, title);

    return new Response(JSON.stringify({
      status: "success",
      article_id: article.id,
      title
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
