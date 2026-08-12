-- Dedicated, atomic Car Wash ticket-number counter — replaces the
-- non-atomic "SELECT latest ticket_no today, parse, +1" pattern in
-- src/app/api/carwash-orders/route.ts, which has a real TOCTOU race window
-- between two concurrent POST requests.
--
-- Intentionally a SEPARATE table/function from order_number_counter /
-- increment_order_counter (the main Restaurant/Bar order-number counter,
-- see 20260805_add_order_number_counter.sql). Car Wash ticket numbers must
-- never share a pool with, or be capable of consuming, main order numbers —
-- this migration does not touch order_number_counter or
-- increment_order_counter in any way.
--
-- Purely additive: one new table, one new function, nothing existing is
-- altered. Rollback: `drop function increment_carwash_counter; drop table
-- carwash_ticket_counter;` — the counter holds nothing but a running count
-- that's reconstructible from scratch.

create table if not exists carwash_ticket_counter (
  business_date text primary key,
  count integer not null default 0
);

alter table carwash_ticket_counter enable row level security;

-- Same permissive-anon approach already used for order_number_counter and
-- other shared-counter/audit tables in this project — this app uses one
-- shared anon key per restaurant, not per-user row isolation.
create policy pos_anon_all on carwash_ticket_counter
  for all to anon using (true) with check (true);

-- Atomic increment-and-return, identical pattern to increment_order_counter.
-- The INSERT ... ON CONFLICT DO UPDATE ... RETURNING is a single statement,
-- so Postgres guarantees two concurrent callers can never be handed the
-- same "next" value for the same business_date.
create or replace function increment_carwash_counter(p_date text)
returns integer
language plpgsql
as $$
declare
  next_count integer;
begin
  insert into carwash_ticket_counter (business_date, count)
  values (p_date, 1)
  on conflict (business_date) do update set count = carwash_ticket_counter.count + 1
  returning count into next_count;
  return next_count;
end;
$$;
