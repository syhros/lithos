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
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols") || url.searchParams.get("symbol");
    const from = url.searchParams.get("from") ?? "2023-01-01";

    if (!symbolsParam) {
      return new Response(JSON.stringify({ error: "Missing symbols parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const symbols = symbolsParam.split(",").map(s => s.trim());

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const result: Record<string, Array<{ date: string; close: number }>> = {};
    const period1 = Math.floor(new Date(from).getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);

    for (const symbol of symbols) {
      const { data: cached, error: cacheErr } = await supabase
        .from("price_history_cache")
        .select("date, close")
        .eq("symbol", symbol)
        .order("date", { ascending: true });

      if (!cacheErr && cached && cached.length > 0) {
        result[symbol] = cached;
        continue;
      }

      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;

      const res = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; finance-app/1.0)" },
      });

      if (!res.ok) {
        result[symbol] = [];
        continue;
      }

      const json = await res.json();
      const chartResult = json?.chart?.result?.[0];
      const timestamps: number[] = chartResult?.timestamp ?? [];
      const closes: number[] = chartResult?.indicators?.quote?.[0]?.close ?? [];

      const symbolData = timestamps
        .map((ts, i) => ({
          date: new Date(ts * 1000).toISOString().split("T")[0],
          close: closes[i],
        }))
        .filter(r => r.close != null);

      result[symbol] = symbolData;

      if (symbolData.length > 0) {
        const rows = symbolData.map(r => ({ symbol, date: r.date, close: r.close }));
        supabase
          .from("price_history_cache")
          .upsert(rows, { onConflict: "symbol,date" })
          .then(({ error }) => {
            if (error) console.error("Cache write error:", error.message);
          });
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=86400, stale-while-revalidate",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch history" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
