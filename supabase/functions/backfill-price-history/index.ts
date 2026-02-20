import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

// Fetch daily closes from Yahoo Finance for a specific window.
// period1 / period2 are Unix timestamps.
const fetchYearChunk = async (
  symbol: string,
  period1: number,
  period2: number
): Promise<Array<{ date: string; close: number }>> => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${symbol}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp || [];
  const closes: number[] = result.indicators?.quote?.[0]?.close || [];

  const rows: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || isNaN(close)) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().substring(0, 10);
    rows.push({ date, close: parseFloat(close.toFixed(6)) });
  }
  return rows;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const urlObj = new URL(req.url);

    let symbols: string[] = [];
    let fromDate: string = "";
    let toDate: string = "";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      symbols = (body.symbols || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      fromDate = body.from || "";
      toDate = body.to || "";
    } else {
      symbols = (urlObj.searchParams.get("symbols") || "").split(",").map(s => s.trim()).filter(Boolean);
      fromDate = urlObj.searchParams.get("from") || "";
      toDate = urlObj.searchParams.get("to") || "";
    }

    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing symbols parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // from: required (first tx date). to: optional, defaults to now.
    // Both must be plain YYYY-MM-DD for reliable parsing.
    const fromMs = fromDate
      ? new Date(fromDate).getTime()
      : Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;

    const toMs = toDate
      ? new Date(toDate).getTime()
      : Date.now();

    const summary: Record<string, { rows: number; error?: string }> = {};

    for (const symbol of symbols) {
      let totalRows = 0;
      let hadError: string | undefined;

      try {
        const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
        let chunkStart = fromMs;

        while (chunkStart < toMs) {
          const chunkEnd = Math.min(chunkStart + ONE_YEAR_MS, toMs);
          const period1 = Math.floor(chunkStart / 1000);
          const period2 = Math.floor(chunkEnd / 1000);

          let rows: Array<{ date: string; close: number }> = [];
          let attempt = 0;

          while (attempt < 3) {
            try {
              rows = await fetchYearChunk(symbol, period1, period2);
              break;
            } catch (e: any) {
              if (e.message === "RATE_LIMITED") {
                console.warn(`Rate limited on ${symbol}, waiting 2s...`);
                await sleep(2000);
                attempt++;
              } else {
                throw e;
              }
            }
          }

          if (rows.length > 0) {
            const BATCH = 500;
            for (let i = 0; i < rows.length; i += BATCH) {
              const batch = rows.slice(i, i + BATCH).map(r => ({
                symbol,
                date: r.date,
                close: r.close,
                fetched_at: new Date().toISOString(),
              }));

              const { error } = await supabase
                .from("price_history_cache")
                .upsert(batch, { onConflict: "symbol,date", ignoreDuplicates: true });

              if (error) {
                console.error(`Upsert error for ${symbol}:`, error.message);
                hadError = error.message;
              } else {
                totalRows += batch.length;
              }
            }
          }

          chunkStart = chunkEnd;
          await sleep(200);
        }
      } catch (e: any) {
        console.error(`Failed to backfill ${symbol}:`, e.message);
        hadError = e.message;
      }

      summary[symbol] = { rows: totalRows, ...(hadError ? { error: hadError } : {}) };
      await sleep(500);
    }

    return new Response(
      JSON.stringify({ ok: true, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Backfill error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
