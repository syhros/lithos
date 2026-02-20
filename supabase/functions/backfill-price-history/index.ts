import { createClient } from "npm:@supabase/supabase-js@2.97.0";
import { QueryHistorical } from "npm:yahoo-finance2@2.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BackfillRequest {
  symbol: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { symbol }: BackfillRequest = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: "Missing symbol parameter" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
      const historical = await QueryHistorical.historical(symbol, {
        period1: new Date("1980-01-01"),
        period2: new Date(),
      });

      if (!historical || historical.length === 0) {
        return new Response(
          JSON.stringify({ error: "No historical data found", symbol }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const records = historical.map((item: any) => ({
        symbol,
        date: item.date.toISOString().split("T")[0],
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        adj_close: item.adjClose,
      }));

      const { error } = await supabase
        .from("price_history_cache")
        .upsert(records, { onConflict: "symbol,date" });

      if (error) {
        console.error("Database upsert error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to store price history", details: error }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          symbol,
          recordsInserted: records.length,
          dateRange: {
            from: records[0].date,
            to: records[records.length - 1].date,
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (yahooError) {
      console.error("Yahoo Finance error:", yahooError);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch from Yahoo Finance",
          symbol,
          details: yahooError instanceof Error ? yahooError.message : String(yahooError),
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
