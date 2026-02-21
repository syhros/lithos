-- Import rules: type mappings, description rules, transfer rules
-- Run this in your Supabase SQL editor

create table if not exists public.import_type_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  bank_code   text not null,
  maps_to     text not null,
  created_at  timestamptz default now()
);

create table if not exists public.import_merchant_rules (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  contains            text not null,
  match_description   boolean default true,
  match_type          boolean default false,
  match_amount        boolean default false,
  set_description     text,
  set_category        text,
  set_type            text,
  set_account_id      text,
  set_account_to_id   text,
  set_notes           text,
  sort_order          integer default 0,
  created_at          timestamptz default now()
);

create table if not exists public.import_transfer_rules (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade not null,
  label                 text,
  from_desc_contains    text not null,
  to_desc_contains      text not null,
  tolerance_days        integer default 2,
  sort_order            integer default 0,
  created_at            timestamptz default now()
);

-- RLS
alter table public.import_type_rules     enable row level security;
alter table public.import_merchant_rules  enable row level security;
alter table public.import_transfer_rules  enable row level security;

create policy "Users manage own type rules"
  on public.import_type_rules for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own merchant rules"
  on public.import_merchant_rules for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own transfer rules"
  on public.import_transfer_rules for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
