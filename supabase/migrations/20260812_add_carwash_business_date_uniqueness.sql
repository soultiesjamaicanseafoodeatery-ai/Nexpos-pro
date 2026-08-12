-- Adds a business_date column to carwash_orders and enforces
-- UNIQUE(business_date, ticket_no) for rows created going forward, without
-- touching any existing row.
--
-- carwash_orders currently has no stored business date (only derivable from
-- created_at at query time). This column is populated only by new inserts
-- once src/app/api/carwash-orders/route.ts is updated to call
-- increment_carwash_counter(); every existing row is left with
-- business_date = NULL and is NEVER backfilled.
--
-- Why this is safe against historical data: PostgreSQL's UNIQUE constraints
-- (standard SQL behavior, not project-specific) never treat two NULLs as
-- equal, so any number of rows with business_date IS NULL can coexist
-- under this index regardless of their ticket_no — including the three
-- known historical duplicate pairs (2026-06-27 CW-0001, 2026-06-28 CW-0002,
-- 2026-06-30 CW-0001) and the legacy CW-80838 row from 2026-06-18, predating
-- the sequential numbering scheme. None of those rows are modified,
-- renamed, or backfilled by this migration. This was empirically verified
-- (not assumed) against a real Postgres engine before this migration was
-- written — see the Phase 1G concurrency/uniqueness test harness.
--
-- Purely additive. Rollback: `drop index carwash_orders_business_date_ticket_no_key;
-- alter table carwash_orders drop column business_date;` — never touches
-- row data either direction.

alter table carwash_orders add column if not exists business_date text null;

create unique index if not exists carwash_orders_business_date_ticket_no_key
  on carwash_orders (business_date, ticket_no);
