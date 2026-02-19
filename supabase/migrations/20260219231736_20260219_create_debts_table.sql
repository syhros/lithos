/*
  # Create debts table

  1. New Tables
    - `debts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `name` (text)
      - `type` (credit_card, loan)
      - `credit_limit` (decimal, credit limit or loan amount)
      - `apr` (decimal, annual percentage rate)
      - `min_payment_type` (fixed, percentage)
      - `min_payment_value` (decimal)
      - `starting_value` (decimal, initial balance)
      - `promo_apr` (decimal, nullable)
      - `promo_end_date` (date, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `debts` table
    - Add policy for users to read/write their own debts
*/

CREATE TABLE IF NOT EXISTS debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('credit_card', 'loan')),
  credit_limit decimal(15, 2) NOT NULL,
  apr decimal(5, 3) NOT NULL,
  min_payment_type text NOT NULL CHECK (min_payment_type IN ('fixed', 'percentage')),
  min_payment_value decimal(10, 2) NOT NULL,
  starting_value decimal(15, 2) NOT NULL,
  promo_apr decimal(5, 3),
  promo_end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debts_user_id_idx ON debts(user_id);
CREATE INDEX IF NOT EXISTS debts_type_idx ON debts(type);

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own debts"
  ON debts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own debts"
  ON debts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own debts"
  ON debts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own debts"
  ON debts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
