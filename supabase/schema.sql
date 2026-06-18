-- Run this in your Supabase SQL editor to set up all NexPOS Pro tables

-- ─── Car Wash Services ────────────────────────────────────────────────────────

create table if not exists carwash_services (
  id           text        primary key,
  name         text        not null,
  description  text        not null default '',
  price        numeric     not null default 0,
  vehicle_type text        not null default '',
  is_available boolean     not null default true,
  created_at   timestamptz not null default now()
);

alter table carwash_services disable row level security;
grant all on carwash_services to anon, authenticated;

-- ─── Car Wash Add-ons ─────────────────────────────────────────────────────────

create table if not exists carwash_addons (
  id                 text        primary key,
  name               text        not null,
  description        text        not null default '',
  price              numeric     not null default 0,
  vehicle_type       text        not null default '',
  estimated_minutes  integer     not null default 0,
  is_available       boolean     not null default true,
  created_at         timestamptz not null default now()
);

alter table carwash_addons disable row level security;
grant all on carwash_addons to anon, authenticated;

-- ─── Car Wash Orders (Queue) ──────────────────────────────────────────────────

create table if not exists carwash_orders (
  id             text        primary key,
  ticket_no      text        not null,
  customer_name  text        not null default '',
  phone          text        not null default '',
  vehicle_type   text        not null default 'Car',
  plate          text        not null,
  service_id     text        not null default '',
  service_name   text        not null,
  service_price  numeric     not null default 0,
  addons         jsonb       not null default '[]',
  addons_total   numeric     not null default 0,
  notes          text        not null default '',
  status         text        not null default 'waiting'
                   check (status in ('waiting','in_progress','ready','completed')),
  payment_method text        not null default 'cash',
  total          numeric     not null default 0,
  employee_name  text        not null default '',
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

alter table carwash_orders disable row level security;
grant all on carwash_orders to anon, authenticated;

-- ─── Outside (Online) Bookings ────────────────────────────────────────────────

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
