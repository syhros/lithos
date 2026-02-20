// fetch-exchange-rate is an alias for fx-rate.
// It fetches the current GBP/USD rate from Yahoo Finance
// and upserts it into the exchange_rates table.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/USD%3DX?interval=1d&range=1d`;
    const res = await fetch(yahooUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://finance.yahoo.com/",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Yahoo returned ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) {
      return new Response(JSON.stringify({ error: "No data from Yahoo" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usdGbpRate = meta.regularMarketPrice ?? meta.previousClose;
    if (!usdGbpRate || usdGbpRate <= 0) {
      return new Response(JSON.stringify({ error: "Invalid rate", rate: usdGbpRate }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gbpUsdRate = 1 / usdGbpRate;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase
      .from("exchange_rates")
      .upsert(
        { from_currency: "GBP", to_currency: "USD", rate: gbpUsdRate, updated_at: new Date().toISOString() },
        { onConflict: "from_currency,to_currency" }
      );

    return new Response(
      JSON.stringify({ from_currency: "GBP", to_currency: "USD", rate: gbpUsdRate, updated_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
