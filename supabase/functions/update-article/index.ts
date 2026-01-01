import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateRequest {
  id: number;
  table: "articles" | "first_party_articles";
  changes: {
    priority?: number;
    market?: string;
    bullet?: string;
  };
  user_email?: string;
}

interface MarketAction {
  id: number;
  table: "articles" | "first_party_articles";
  action: "add" | "remove";
  market: string;
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

    const body = await req.json();

    // Handle market add/remove actions
    if (body.action === "add" || body.action === "remove") {
      const { id, table, action, market, user_email } = body as MarketAction;

      if (!id || !table || !market) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "add") {
        // Add market to article_markets
        const { error: insertError } = await supabase
          .from("article_markets")
          .upsert({
            article_id: id,
            table_name: table,
            market: market,
          }, {
            onConflict: "article_id,table_name,market",
          });

        if (insertError) {
          console.error("Insert error:", insertError);
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Log the change
        await supabase.from("article_edits").insert({
          article_id: id,
          table_name: table,
          field_name: "additional_market",
          old_value: null,
          new_value: market,
          edited_by: user_email,
        });

        console.log(`Added market ${market} to ${table} ${id}`);

      } else if (action === "remove") {
        // Remove market from article_markets
        const { error: deleteError } = await supabase
          .from("article_markets")
          .delete()
          .eq("article_id", id)
          .eq("table_name", table)
          .eq("market", market);

        if (deleteError) {
          console.error("Delete error:", deleteError);
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Log the change
        await supabase.from("article_edits").insert({
          article_id: id,
          table_name: table,
          field_name: "additional_market",
          old_value: market,
          new_value: null,
          edited_by: user_email,
        });

        console.log(`Removed market ${market} from ${table} ${id}`);
      }

      // Fetch updated markets
      const { data: markets } = await supabase
        .from("article_markets")
        .select("market")
        .eq("article_id", id)
        .eq("table_name", table);

      return new Response(JSON.stringify({
        success: true,
        markets: markets?.map(m => m.market) || [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle regular field updates
    const { id, table, changes, user_email } = body as UpdateRequest;

    if (!id || !table) {
      return new Response(JSON.stringify({ error: "Missing id or table" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (table !== "articles" && table !== "first_party_articles") {
      return new Response(JSON.stringify({ error: "Invalid table" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!changes || Object.keys(changes).length === 0) {
      return new Response(JSON.stringify({ error: "No changes provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Updating ${table} id=${id}:`, changes);

    // Fetch current values for logging
    const { data: current, error: fetchError } = await supabase
      .from(table)
      .select("priority, market, bullet")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      console.error("Article not found:", fetchError);
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log each changed field
    const edits = [];
    for (const [field, newValue] of Object.entries(changes)) {
      const oldValue = current[field as keyof typeof current];
      if (oldValue !== newValue) {
        edits.push({
          article_id: id,
          table_name: table,
          field_name: field,
          old_value: oldValue?.toString() || null,
          new_value: newValue?.toString() || null,
          edited_by: user_email,
        });
      }
    }

    if (edits.length > 0) {
      const { error: logError } = await supabase
        .from("article_edits")
        .insert(edits);

      if (logError) {
        console.error("Failed to log edits:", logError);
      }
    }

    // Update article
    const { data: updated, error: updateError } = await supabase
      .from(table)
      .update(changes)
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

    console.log("Updated article:", updated.id);

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
