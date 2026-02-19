/*
  # Create transactions table

  1. New Tables
    - `transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `account_id` (uuid, foreign key to accounts)
      - `date` (timestamp)
      - `description` (text)
      - `amount` (decimal)
      - `type` (income, expense, investing, debt_payment, transfer)
      - `category` (text)
      - `symbol` (text, nullable, for investments)
      - `quantity` (decimal, nullable, for investments)
      - `price` (decimal, nullable, for investments)
      - `currency` (text, nullable)
      - `debt_id` (uuid, nullable, for debt payments)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `transactions` table
    - Add policy for users to read/write their own transactions
*/

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date timestamptz NOT NULL,
  description text NOT NULL,
  amount decimal(15, 2) NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'investing', 'debt_payment', 'transfer')),
  category text NOT NULL,
  symbol text,
  quantity decimal(10, 4),
  price decimal(15, 2),
  currency text,
  debt_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON transactions(account_id);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
CREATE INDEX IF NOT EXISTS transactions_type_idx ON transactions(type);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
