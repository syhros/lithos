/*
  # Add unique constraint to exchange_rates table

  Adds a unique constraint on (from_currency, to_currency) so the edge function
  can upsert without duplicating rows.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exchange_rates_pair_unique'
  ) THEN
    ALTER TABLE exchange_rates
      ADD CONSTRAINT exchange_rates_pair_unique UNIQUE (from_currency, to_currency);
  END IF;
END $$;
