
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { symbol, range } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Missing symbol parameter' });
  }

  // Default to 1 year if not specified
  const queryOptions = {
    period1: '2023-01-01', // Dynamic date handling would happen here in a real app
    interval: '1d' as const,
  };

  try {
    const history = await yahooFinance.historical(symbol, queryOptions) as any[];
    
    // Minify payload
    const result = history.map((row: any) => ({
      date: row.date.toISOString().split('T')[0],
      close: row.close
    }));

    // Cache for 1 day
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
}
