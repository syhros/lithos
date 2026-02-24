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

const fetchYearChunk = async (
  symbol: string,
  period1: number,
  period2: number
): Promise<Array<{ date: string; open: number | null; close: number }>> => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${symbol}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp || [];
  const quoteObj = result.indicators?.quote?.[0];

  // --- DEBUG: log exactly what Yahoo returned for this chunk ---
  console.log(`[DEBUG] ${symbol} period1=${period1} period2=${period2}`);
  console.log(`[DEBUG] timestamps.length=${timestamps.length}`);
  console.log(`[DEBUG] quote keys=${JSON.stringify(Object.keys(quoteObj || {}))}`);
  const rawOpens = quoteObj?.open;
  const rawCloses = quoteObj?.close;
  console.log(`[DEBUG] opens type=${typeof rawOpens}, isArray=${Array.isArray(rawOpens)}, length=${Array.isArray(rawOpens) ? rawOpens.length : 'n/a'}`);
  console.log(`[DEBUG] closes type=${typeof rawCloses}, isArray=${Array.isArray(rawCloses)}, length=${Array.isArray(rawCloses) ? rawCloses.length : 'n/a'}`);
  // log first 3 pairs so we can see actual values
  if (Array.isArray(rawOpens) && Array.isArray(rawCloses)) {
    for (let i = 0; i < Math.min(3, timestamps.length); i++) {
      const date = new Date(timestamps[i] * 1000).toISOString().substring(0, 10);
      console.log(`[DEBUG] row ${i}: date=${date} open=${rawOpens[i]} close=${rawCloses[i]}`);
    }
  }
  // --- END DEBUG ---

  const closes: (number | null)[] = rawCloses || [];
  const opens: (number | null)[] = rawOpens || [];

  const rows: Array<{ date: string; open: number | null; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || isNaN(close)) continue;
    const open = opens[i];
    const date = new Date(timestamps[i] * 1000).toISOString().substring(0, 10);
    rows.push({
      date,
      open: open != null && !isNaN(open) ? parseFloat(open.toFixed(6)) : null,
      close: parseFloat(close.toFixed(6)),
    });
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

    const fromMs = fromDate
      ? new Date(fromDate).getTime()
      : Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;

    const toMs = toDate
      ? new Date(toDate).getTime()
      : Date.now();

    const summary: Record<string, { rows: number; error?: string; debug?: any }> = {};

    for (const symbol of symbols) {
      let totalRows = 0;
      let hadError: string | undefined;
      let debugInfo: any = {};

      try {
        const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
        let chunkStart = fromMs;

        while (chunkStart < toMs) {
          const chunkEnd = Math.min(chunkStart + ONE_YEAR_MS, toMs);
          const period1 = Math.floor(chunkStart / 1000);
          const period2 = Math.floor(chunkEnd / 1000);

          let rows: Array<{ date: string; open: number | null; close: number }> = [];
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

          // Debug: check first row open value before upsert
          if (rows.length > 0) {
            debugInfo.firstRow = rows[0];
            debugInfo.sampleOpenValues = rows.slice(0, 5).map(r => ({ date: r.date, open: r.open, close: r.close }));
            console.log(`[DEBUG] ${symbol} first row before upsert:`, JSON.stringify(rows[0]));

            const BATCH = 500;
            for (let i = 0; i < rows.length; i += BATCH) {
              const batch = rows.slice(i, i + BATCH).map(r => ({
                symbol,
                date: r.date,
                open: r.open,
                close: r.close,
                fetched_at: new Date().toISOString(),
              }));

              console.log(`[DEBUG] ${symbol} upsert batch[0]:`, JSON.stringify(batch[0]));

              const { error, data: upsertData } = await supabase
                .from("price_history_cache")
                .upsert(batch, { onConflict: "symbol,date", ignoreDuplicates: false })
                .select('symbol, date, open, close')
                .limit(1);

              console.log(`[DEBUG] ${symbol} upsert result row[0]:`, JSON.stringify(upsertData?.[0]));

              if (error) {
                console.error(`Upsert error for ${symbol}:`, error.message);
                debugInfo.upsertError = error.message;
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

      summary[symbol] = { rows: totalRows, ...(hadError ? { error: hadError } : {}), debug: debugInfo };
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
