/*
  # Update quantity column precision to 8 decimal places

  ## Summary
  The transactions table's quantity column currently stores only 4 decimal places
  (numeric(10, 4)). This is insufficient for crypto assets like ETH where values
  can be fractional (e.g. 0.00350000 ETH). This migration increases the precision
  to 8 decimal places to support these use cases.

  ## Changes
  - `transactions.quantity`: Changed from numeric(10, 4) to numeric(18, 8)
    - 18 total digits, 8 after decimal point
    - Supports up to 9,999,999,999.99999999 shares/units

  ## Notes
  - This is a non-destructive change (increasing precision only)
  - Existing data is preserved with no rounding
*/

ALTER TABLE transactions 
  ALTER COLUMN quantity TYPE numeric(18, 8);
