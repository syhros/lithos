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
      const { data: cached } = await supabase
        .from("price_history_cache")
        .select("date, close")
        .eq("symbol", symbol)
        .order("date", { ascending: true })
        .limit(-1);

      let fetchFromDate = from;
      if (cached && cached.length > 0) {
        const lastCachedDate = cached[cached.length - 1].date;
        const lastDate = new Date(lastCachedDate);
        const nextDay = new Date(lastDate);
        nextDay.setDate(nextDay.getDate() + 1);
        fetchFromDate = nextDay.toISOString().split("T")[0];
      }

      const fetchPeriod1 = Math.floor(new Date(fetchFromDate).getTime() / 1000);
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${fetchPeriod1}&period2=${period2}`;

      try {
        const res = await fetch(yahooUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; finance-app/1.0)" },
        });

        if (res.ok) {
          const json = await res.json();
          const chartResult = json?.chart?.result?.[0];
          const timestamps: number[] = chartResult?.timestamp ?? [];
          const closes: number[] = chartResult?.indicators?.quote?.[0]?.close ?? [];

          const freshData = timestamps
            .map((ts, i) => ({
              date: new Date(ts * 1000).toISOString().split("T")[0],
              close: closes[i],
            }))
            .filter(r => r.close != null);

          if (freshData.length > 0) {
            const rows = freshData.map(r => ({ symbol, date: r.date, close: r.close }));
            await supabase
              .from("price_history_cache")
              .upsert(rows, { onConflict: "symbol,date" });
          }
        }
      } catch (e) {
        console.error(`Failed to fetch fresh data for ${symbol}:`, e);
      }

      const { data: allCached } = await supabase
        .from("price_history_cache")
        .select("date, close")
        .eq("symbol", symbol)
        .order("date", { ascending: true })
        .limit(-1);

      result[symbol] = allCached || [];
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
