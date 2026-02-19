/*
  # Create bills table

  1. New Tables
    - `bills`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `name` (text)
      - `amount` (decimal)
      - `due_date` (text, can be day of month or day name)
      - `is_paid` (boolean)
      - `auto_pay` (boolean)
      - `category` (text)
      - `is_recurring` (boolean)
      - `frequency` (weekly, monthly, yearly, nullable)
      - `recurring_end_date` (date, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `bills` table
    - Add policy for users to read/write their own bills
*/

CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount decimal(15, 2) NOT NULL,
  due_date text NOT NULL,
  is_paid boolean DEFAULT false,
  auto_pay boolean DEFAULT false,
  category text NOT NULL,
  is_recurring boolean DEFAULT false,
  frequency text CHECK (frequency IS NULL OR frequency IN ('weekly', 'monthly', 'yearly')),
  recurring_end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bills_user_id_idx ON bills(user_id);
CREATE INDEX IF NOT EXISTS bills_due_date_idx ON bills(due_date);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bills"
  ON bills FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bills"
  ON bills FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bills"
  ON bills FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bills"
  ON bills FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
