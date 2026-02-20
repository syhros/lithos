
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { symbol, from } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  const period1 = (typeof from === 'string' && from) ? from : '1900-01-01';

  try {
    // 1. Check Supabase cache first
    const { data: cached, error: cacheErr } = await supabase
      .from('price_history_cache')
      .select('date, close')
      .eq('symbol', symbol)
      .gte('date', period1)
      .order('date', { ascending: true })
      .limit(-1);

    if (!cacheErr && cached && cached.length > 50) {
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // 2. Cache miss — fetch from Yahoo Finance
    const history = await yahooFinance.historical(symbol, {
      period1,
      interval: '1d',
    }) as any[];

    const result = history.map((row: any) => ({
      date: row.date.toISOString().split('T')[0],
      close: row.close
    }));

    // 3. Write to Supabase cache asynchronously (don't block the response)
    if (result.length > 0) {
      const rows = result.map(r => ({ symbol, date: r.date, close: r.close }));
      supabase
        .from('price_history_cache')
        .upsert(rows, { onConflict: 'symbol,date' })
        .then(({ error }) => {
          if (error) console.error('Cache write error:', error.message);
        });
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
}
