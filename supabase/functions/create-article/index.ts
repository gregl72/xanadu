import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateRequest {
  title?: string;
  url?: string;
  content?: string;
  bullet?: string;
  priority?: number;
  market?: string;
  location?: string;
  is_first_party: boolean;
  user_email?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: CreateRequest = await req.json();

    const { title, url, content, bullet, priority, market, location, is_first_party, user_email } = body;

    // Determine mode: URL mode requires title+url, Manual mode requires bullet+market
    const isUrlMode = !!url;

    if (isUrlMode) {
      if (!title || !url) {
        return new Response(JSON.stringify({ error: "Title and URL are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Manual mode
      if (!bullet || !market) {
        return new Response(JSON.stringify({ error: "Bullet and Market are required for manual entry" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate placeholders for manual mode
    const timestamp = Date.now();
    const finalTitle = title || bullet?.slice(0, 100) || `Manual Entry ${timestamp}`;
    const finalUrl = url || `manual-entry-${timestamp}`;

    const table = is_first_party ? "first_party_articles" : "articles";

    console.log(`Creating article in ${table}: ${finalTitle}`);

    // Build article record
    const articleData = {
      title: finalTitle,
      url: finalUrl,
      content: content || null,
      bullet: bullet || null,
      priority: priority || 3,
      market: market || null,
      location: location || null,
      is_local: true,
      is_accessible: true,
      fetched_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    };

    // Insert article
    const { data: created, error: insertError } = await supabase
      .from(table)
      .insert(articleData)
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      // Check for duplicate URL
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ error: "Article with this URL already exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log creation
    await supabase.from("article_edits").insert({
      article_id: created.id,
      table_name: table,
      field_name: "created",
      old_value: null,
      new_value: finalTitle,
      edited_by: user_email,
    });

    console.log("Created article:", created.id, created.title);

    return new Response(JSON.stringify(created), {
      status: 201,
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
