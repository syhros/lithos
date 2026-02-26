-- User-specific price history table for manual price imports.
-- Each user can upload their own open/close prices for custom tickers
-- (e.g. pension funds, private instruments) that are not available via Yahoo Finance.
-- These rows are isolated per user via RLS and take precedence over
-- the shared price_history_cache when historicalPrices are assembled in the frontend.

create table if not exists public.user_price_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  date        date not null,
  open        numeric(18, 6),
  close       numeric(18, 6) not null,
  fetched_at  timestamptz not null default now(),
  constraint user_price_history_user_symbol_date unique (user_id, symbol, date)
);

-- Indexes for the primary query pattern: fetch all rows for a user + symbol
create index if not exists user_price_history_user_symbol_idx
  on public.user_price_history (user_id, symbol, date asc);

-- Enable Row-Level Security
alter table public.user_price_history enable row level security;

-- Users can only see their own rows
create policy "Users can read own price history"
  on public.user_price_history
  for select
  using (auth.uid() = user_id);

-- Users can insert their own rows
create policy "Users can insert own price history"
  on public.user_price_history
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own rows
create policy "Users can update own price history"
  on public.user_price_history
  for update
  using (auth.uid() = user_id);

-- Users can delete their own rows
create policy "Users can delete own price history"
  on public.user_price_history
  for delete
  using (auth.uid() = user_id);
