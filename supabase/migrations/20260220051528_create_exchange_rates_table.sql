/*
  # Create exchange_rates table

  ## Summary
  Stores live foreign exchange rates fetched from Yahoo Finance.
  The fx-rate edge function will upsert the GBP/USD rate here every hour.
  The frontend reads from this table instead of using any static fallback.

  ## New Tables
  - `exchange_rates`
    - `pair` (text, primary key) — e.g. "GBP/USD"
    - `rate` (numeric) — USD per 1 GBP (e.g. 1.344 means $1.344 = £1)
    - `updated_at` (timestamptz) — when this rate was last fetched

  ## Security
  - RLS enabled
  - Public read access (exchange rates are not sensitive)
  - No direct write access from clients (only the service role via edge function writes)
*/

CREATE TABLE IF NOT EXISTS exchange_rates (
  pair text PRIMARY KEY,
  rate numeric(12, 6) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exchange rates"
  ON exchange_rates
  FOR SELECT
  TO anon, authenticated
  USING (true);
