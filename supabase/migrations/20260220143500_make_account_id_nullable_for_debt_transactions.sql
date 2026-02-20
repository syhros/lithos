/*
  # Make account_id nullable on transactions

  The transactions table currently requires account_id to be NOT NULL.
  Debt-linked transactions (expense/income on a debt account, or the debt-side
  row of a debt_payment) store the debt's UUID in the debt_id column instead
  of account_id. This migration:

  1. Drops the existing NOT NULL + FK constraint on account_id.
  2. Re-adds account_id as a nullable FK (so debt-side rows can set it to NULL).
  3. Adds a CHECK constraint ensuring at least one of account_id or debt_id is
     always populated — every transaction must belong to something.
  4. Adds a FK constraint on debt_id referencing the debts table.
*/

-- Step 1: Drop the old NOT NULL foreign key constraint on account_id.
-- The FK was created implicitly by the column definition; we need to find and
-- drop the constraint by name. In Postgres the auto-named constraint is
-- transactions_account_id_fkey.
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_account_id_fkey;

-- Step 2: Allow account_id to be NULL.
ALTER TABLE transactions
  ALTER COLUMN account_id DROP NOT NULL;

-- Step 3: Re-add the FK on account_id (nullable, still cascades on delete).
ALTER TABLE transactions
  ADD CONSTRAINT transactions_account_id_fkey
    FOREIGN KEY (account_id)
    REFERENCES accounts(id)
    ON DELETE CASCADE;

-- Step 4: Add FK on debt_id referencing the debts table (if not already present).
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_debt_id_fkey;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_debt_id_fkey
    FOREIGN KEY (debt_id)
    REFERENCES debts(id)
    ON DELETE CASCADE;

-- Step 5: Ensure every transaction is tied to at least one of account_id or debt_id.
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_account_or_debt_required;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_account_or_debt_required
    CHECK (account_id IS NOT NULL OR debt_id IS NOT NULL);
