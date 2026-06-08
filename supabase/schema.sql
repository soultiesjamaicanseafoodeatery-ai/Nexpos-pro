-- Run this in your Supabase SQL editor to set up online bookings

create table if not exists outside_orders (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null    default now(),
  customer_name  text        not null,
  customer_phone text        not null,
  vehicle_plate  text        not null,
  vehicle_make   text        not null default '',
  vehicle_model  text        not null default '',
  vehicle_color  text        not null default '',
  service_name   text        not null,
  service_price  numeric     not null,
  addons         jsonb       not null default '[]',
  addons_total   numeric     not null default 0,
  total          numeric     not null,
  notes          text        not null default '',
  status         text        not null default 'pending'
                   check (status in ('pending','accepted','rejected')),
  bay            text
);

-- Enable realtime
alter publication supabase_realtime add table outside_orders;

-- RLS
alter table outside_orders enable row level security;

create policy "public_select" on outside_orders for select using (true);
create policy "public_insert" on outside_orders for insert with check (true);
create policy "public_update" on outside_orders for update using (true);
