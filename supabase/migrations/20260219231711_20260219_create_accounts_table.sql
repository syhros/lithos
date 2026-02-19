/*
  # Create accounts table

  1. New Tables
    - `accounts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text)
      - `type` (account type: checking, savings, investment)
      - `currency` (GBP, USD, EUR)
      - `institution` (text)
      - `color` (hex color)
      - `starting_value` (decimal)
      - `interest_rate` (decimal, nullable)
      - `symbol` (text, nullable, for investment accounts)
      - `is_closed` (boolean)
      - `opened_date` (date)
      - `closed_date` (date, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `accounts` table
    - Add policy for users to read/write their own accounts
*/

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('checking', 'savings', 'investment')),
  currency text NOT NULL DEFAULT 'GBP' CHECK (currency IN ('GBP', 'USD', 'EUR')),
  institution text NOT NULL,
  color text,
  starting_value decimal(15, 2) NOT NULL,
  interest_rate decimal(5, 3),
  symbol text,
  is_closed boolean DEFAULT false,
  opened_date date NOT NULL DEFAULT CURRENT_DATE,
  closed_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS accounts_type_idx ON accounts(type);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts"
  ON accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own accounts"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
