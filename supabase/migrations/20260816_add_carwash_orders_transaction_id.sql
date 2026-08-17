-- Adds a nullable link from a Car Wash order back to the parent transaction
-- that paid for it, for mixed Bar + Car Wash sales rung up through
-- POSPage.tsx's two checkout paths (paying an existing open ticket, and a
-- direct-cart quick sale). Neither of those wrote any linkage before this
-- migration — the only way to correlate a mixed transaction with its Car
-- Wash record was matching created_at timestamps by hand (see Phase 1K
-- investigation). This closes that gap; it does not change how any existing
-- feature reads carwash_orders.
--
-- Nullable, additive, no backfill:
--   - Every existing carwash_orders row (dedicated Car Wash sales, and any
--     mixed sale recorded before this migration) keeps transaction_id = NULL
--     and remains fully valid — nothing reads this column as required.
--   - The dedicated Car Wash screen (CarWashPayment.tsx) has no parent
--     transaction to link to and continues to omit it, exactly as before.
--   - Only POSPage.tsx's two mixed-checkout paths populate it going forward,
--     from the transaction id they already have in scope at POST time.
--
-- transactions.id is bigint (confirmed via schema introspection before
-- writing this migration) — matched here exactly, not guessed.
--
-- ON DELETE SET NULL rather than CASCADE/RESTRICT: transactions are an
-- append-only, never-deleted record in this app's architecture, so this
-- path should never actually fire in practice — it's a defensive default
-- only, chosen so a hypothetical future transaction deletion could never be
-- blocked by, or silently destroy, an otherwise-valid Car Wash record.
ALTER TABLE public.carwash_orders
  ADD COLUMN transaction_id bigint NULL
    REFERENCES public.transactions (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.carwash_orders.transaction_id IS
  'Parent transaction for a Car Wash item sold as part of a mixed Bar + Car Wash sale (POSPage.tsx). NULL for dedicated Car Wash sales (CarWashPayment.tsx) and for any row recorded before this column existed. Traceability only — never read by ticket numbering, Sales Summary, or EOD''s incomplete-wash check.';
