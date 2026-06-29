-- Run this in your Supabase SQL Editor to create the staff_shifts table.
-- Stores a record for each completed employee shift, used for payroll and reporting.

create table if not exists staff_shifts (
  id               uuid        default gen_random_uuid() primary key,
  staff_id         text        not null,
  staff_name       text        not null,
  clock_in_at      timestamptz not null,
  clock_out_at     timestamptz not null,
  break_minutes    int         not null default 30,
  payroll_type     text        not null default 'hourly',  -- 'hourly' | 'salary'
  net_worked_minutes int       not null default 0,
  transaction_count  int       not null default 0,
  total_revenue    numeric     not null default 0,
  payment_breakdown  jsonb,
  order_breakdown    jsonb,
  notes            text,
  created_at       timestamptz default now()
);

-- Allow the anon key to insert (matches the transactions / held_orders pattern)
alter table staff_shifts enable row level security;

create policy "allow anon insert" on staff_shifts
  for insert with check (true);

create policy "allow anon select" on staff_shifts
  for select using (true);
