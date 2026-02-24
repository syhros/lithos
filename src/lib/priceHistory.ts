/**
 * Reads the closing price for a given date from a historicalPrices entry.
 *
 * historicalPrices[symbol][dateStr] can be either:
 *   - a plain number (legacy flat format)  →  used directly as the close price
 *   - an object { open: number | null, close: number | null }  (current format)
 *
 * Returns null if no entry exists or close is not populated.
 */
export function getCloseForDate(
  hist: Record<string, number | { open: number | null; close: number | null }>,
  dateStr: string
): number | null {
  const entry = hist[dateStr];
  if (entry === undefined || entry === null) return null;
  if (typeof entry === 'number') return entry;
  return entry.close ?? null;
}
