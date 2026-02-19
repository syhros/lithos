import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const symbols = url.searchParams.get("symbols");

    if (!symbols) {
      return new Response(JSON.stringify({ error: "Missing symbols parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const symbolList = symbols.split(",").map(s => s.trim()).filter(Boolean);
    const result: Record<string, any> = {};

    await Promise.all(
      symbolList.map(async (symbol) => {
        try {
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
          const res = await fetch(yahooUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; finance-app/1.0)",
            },
          });

          if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);

          const json = await res.json();
          const meta = json?.chart?.result?.[0]?.meta;

          if (meta) {
            const price = meta.regularMarketPrice ?? meta.previousClose ?? 0;
            const prevClose = meta.previousClose ?? price;
            const change = price - prevClose;
            const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

            result[symbol] = {
              price,
              change,
              changePercent,
              currency: meta.currency ?? "USD",
            };
          }
        } catch (e) {
          console.error(`Failed to fetch ${symbol}:`, e);
        }
      })
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300, stale-while-revalidate",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
