/*
  # Create price_history_cache table

  1. New Tables
    - `price_history_cache`
      - `id` (uuid, primary key)
      - `symbol` (text) — ticker symbol e.g. TSLA
      - `date` (date) — the trading date
      - `close` (numeric) — closing price
      - `fetched_at` (timestamptz) — when this row was inserted

  2. Constraints
    - Unique on (symbol, date) so we never store duplicates

  3. Security
    - RLS enabled
    - Anon/authenticated read access (public market data — no privacy concern)
    - No direct write from client; only server-side API route inserts
    - Service role insert/upsert policy

  4. Notes
    - This table acts as a long-lived cache for Yahoo Finance historical responses
    - Rows never change (historical prices are immutable), so we only INSERT, never UPDATE
    - The frontend reads from this table before calling the API route, avoiding redundant requests
*/

CREATE TABLE IF NOT EXISTS price_history_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  date date NOT NULL,
  close numeric NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  CONSTRAINT price_history_cache_symbol_date_key UNIQUE (symbol, date)
);

ALTER TABLE price_history_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read price history"
  ON price_history_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can insert price history"
  ON price_history_cache
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_price_history_symbol_date
  ON price_history_cache (symbol, date DESC);
