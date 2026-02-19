
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { symbols } = req.query;

  if (!symbols || typeof symbols !== 'string') {
    return res.status(400).json({ error: 'Missing symbols parameter' });
  }

  const symbolList = symbols.split(',');

  try {
    const quotes = await yahooFinance.quote(symbolList) as any[];
    
    // Transform into a Map-like object for easier frontend consumption
    const result = quotes.reduce((acc: any, quote: any) => {
      acc[quote.symbol] = {
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        currency: quote.currency
      };
      return acc;
    }, {});

    // Cache for 5 minutes at the CDN edge
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(result);
  } catch (error) {
    console.error('Yahoo Finance Error:', error);
    return res.status(500).json({ error: 'Failed to fetch live data' });
  }
}
