/*
  # Add open price column to price_history_cache

  The original table only stored `close`. The backfill edge function now fetches
  and writes both open and close so the daily % change badge can compute
  intraday movement as (livePrice - todayOpen) / todayOpen.

  Changes:
    1. Add `open` column (numeric, nullable — some days Yahoo returns null open)
    2. Relax `close` from NOT NULL → nullable for the same reason
    3. Add a service-role UPDATE policy so upsert can overwrite existing rows
       with the new open value
*/

-- 1. Add open column (nullable numeric, matches the close type)
ALTER TABLE price_history_cache
  ADD COLUMN IF NOT EXISTS open numeric;

-- 2. Relax close constraint so rows with null close don't fail on upsert
--    (Yahoo occasionally returns null for the most recent partial trading day)
ALTER TABLE price_history_cache
  ALTER COLUMN close DROP NOT NULL;

-- 3. Allow service role to UPDATE existing rows (needed for upsert to write open
--    into rows that were previously inserted with close only)
CREATE POLICY IF NOT EXISTS "Service role can update price history"
  ON price_history_cache
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
