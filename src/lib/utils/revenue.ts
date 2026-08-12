// Single source of truth for "how much revenue did we make" anywhere in the
// app — Dashboard/My Shift/Active Shift/Close Shift/EOD/Transactions/Reports/
// Targets all call into this instead of each hand-rolling its own
// filter/reduce over `state.transactions`. See the Revenue Calculation
// Architecture Audit this centralizes.
//
// Two responsibilities, kept separate on purpose:
//   1. filterTransactionsByScope — decides WHICH transactions count (the
//      date/shift/range window).
//   2. calculateRevenue          — decides HOW those transactions add up
//      (gross/net/refunds/payment split/GCT/gratuity/service charge/
//      discounts/voids), given a set already selected by step 1.
//
// Refund handling (the "choose ONE definition" requirement): revenue is
// always reported NET of refunds. `grossSales` and `refundTotal` are still
// returned individually for screens that want to show them, but `netSales`
// is the one figure every "Revenue"/"Total Sales" label in the app should
// display. Payment-method buckets (cash/debit/credit/gift/house) exclude
// refunded transactions entirely, since that money was returned to the
// customer and is no longer revenue in any bucket.
//
// Void handling: voided transactions never contribute to gross, net, GCT,
// gratuity, service charge, discounts, or payment buckets — they represent
// no completed sale. They are surfaced only via `voidCount`/`voidTotal`.

import type { Transaction, CartItem } from '@/types'
import { parseTs, jamaicaDateKey, isSameBusinessDay, jamaicaDayStart } from './businessDate'
import { getPaymentBreakdown, mergeBreakdowns } from './payments'

export type RevenueScope =
  | { type: 'all' }
  | { type: 'calendarDay'; date?: string } // Jamaica business-day key (YYYY-MM-DD); defaults to today
  | { type: 'range'; start: Date | null; end: Date | null }
  | {
      type: 'shift'
      shiftStart: string
      // When true (default), the lower bound is max(shiftStart, start of today's
      // Jamaica business day) — a shift left open overnight only ever reports
      // today's revenue as its primary figure, never a previous business day's.
      // Pass false only for an explicitly-labeled "Since Shift Started"
      // informational stat — never for a headline "Revenue" figure.
      capToBusinessDay?: boolean
    }

export interface RevenueTotals {
  transactionCount: number
  subtotal: number
  grossSales: number
  refundTotal: number
  refundCount: number
  netSales: number
  cash: number
  debit: number
  credit: number
  card: number // debit + credit
  gift: number
  house: number
  unknown: number
  gct: number
  gratuity: number
  serviceCharge: number
  discounts: number
  voidCount: number
  voidTotal: number
}

const EMPTY_TOTALS: RevenueTotals = {
  transactionCount: 0,
  subtotal: 0,
  grossSales: 0, refundTotal: 0, refundCount: 0, netSales: 0,
  cash: 0, debit: 0, credit: 0, card: 0, gift: 0, house: 0, unknown: 0,
  gct: 0, gratuity: 0, serviceCharge: 0, discounts: 0,
  voidCount: 0, voidTotal: 0,
}

/** Selects which transactions are "in scope" for a revenue calculation. Does not sum anything. */
export function filterTransactionsByScope(txs: Transaction[], scope: RevenueScope): Transaction[] {
  switch (scope.type) {
    case 'all':
      return txs
    case 'calendarDay': {
      const dateKey = scope.date ?? jamaicaDateKey()
      return txs.filter(t => isSameBusinessDay(t.ts, dateKey))
    }
    case 'range': {
      return txs.filter(t => {
        const ms = parseTs(t.ts)
        if (isNaN(ms)) return false
        if (scope.start && ms < scope.start.getTime()) return false
        if (scope.end && ms > scope.end.getTime()) return false
        return true
      })
    }
    case 'shift': {
      const shiftStartMs = new Date(scope.shiftStart).getTime()
      const cap = scope.capToBusinessDay !== false
      const lowerBoundMs = cap ? Math.max(shiftStartMs, jamaicaDayStart().getTime()) : shiftStartMs
      return txs.filter(t => {
        const ms = parseTs(t.ts)
        if (isNaN(ms)) return false
        return ms >= lowerBoundMs
      })
    }
  }
}

/**
 * Aggregates an already-scoped transaction set into every revenue figure the
 * app needs. Pass the scoped set including voided/refunded transactions —
 * this function does its own void/refund splitting so void/refund stats stay
 * accurate.
 */
export function calculateRevenue(scopedTxs: Transaction[]): RevenueTotals {
  if (scopedTxs.length === 0) return { ...EMPTY_TOTALS }

  const voided = scopedTxs.filter(t => t.voided)
  const active = scopedTxs.filter(t => !t.voided)
  const refunded = active.filter(t => t.refunded)

  const subtotal = active.reduce((s, t) => s + (t.sub ?? t.total), 0)
  const grossSales = active.reduce((s, t) => s + t.total, 0)
  const refundTotal = refunded.reduce((s, t) => s + (t.refundAmount ?? t.total), 0)
  const netSales = grossSales - refundTotal

  const breakdown = mergeBreakdowns(
    active.filter(t => !t.refunded).map(t => getPaymentBreakdown(t.pay, t.total, t.payments, t.changeDue))
  )

  const gct           = active.reduce((s, t) => s + (t.gct ?? t.tax ?? 0), 0)
  const gratuity       = active.reduce((s, t) => s + (t.gratuity ?? 0), 0)
  const serviceCharge  = active.reduce((s, t) => s + (t.serviceCharge ?? 0), 0)
  const discounts      = active.reduce((s, t) => s + (t.disc ?? 0), 0)
  const voidTotal       = voided.reduce((s, t) => s + (t.total ?? 0), 0)

  return {
    transactionCount: active.length,
    subtotal,
    grossSales, refundTotal, refundCount: refunded.length, netSales,
    cash: breakdown.cash, debit: breakdown.debit, credit: breakdown.credit,
    card: breakdown.debit + breakdown.credit,
    gift: breakdown.gift, house: breakdown.house, unknown: breakdown.unknown,
    gct, gratuity, serviceCharge, discounts,
    voidCount: voided.length, voidTotal,
  }
}

/** Convenience: filter + aggregate in one call. */
export function calculateRevenueForScope(txs: Transaction[], scope: RevenueScope): RevenueTotals {
  return calculateRevenue(filterTransactionsByScope(txs, scope))
}

/** Groups an already-scoped transaction set by module (restaurant/bar/carwash/mixed) and aggregates each group. */
export function groupRevenueByModule(scopedTxs: Transaction[]): Record<string, RevenueTotals> {
  const byMod: Record<string, Transaction[]> = {}
  for (const t of scopedTxs) {
    const key = t.mod ?? 'unknown'
    ;(byMod[key] ??= []).push(t)
  }
  const out: Record<string, RevenueTotals> = {}
  for (const [mod, txs] of Object.entries(byMod)) out[mod] = calculateRevenue(txs)
  return out
}

// ── Module-revenue attribution (item-level split for mixed transactions) ──────
//
// groupRevenueByModule() above (and every hand-rolled equivalent that existed
// before it — CloseShiftWizard.tsx's modMap, ReportsPage.tsx's ad-hoc byMod)
// groups strictly by the transaction-level `mod` field. That field describes
// the whole transaction, not its contents, so a `mixed` transaction (one
// whose cart spanned more than one module) either gets dumped wholesale into
// one module, silently excluded, or left in an unused 'mixed' bucket,
// depending on which screen you're looking at. groupRevenueByModuleSplit()
// below is the fix: it looks at each transaction's ACTIVE items and
// attributes revenue to the module those items actually belong to.
//
// Deliberately excluded from every module bucket here, not by oversight:
//   - GCT / service charge / gratuity / surcharge — these are transaction-
//     level charges (tax.ts's calcCart() only ever applies them to the
//     restaurant-item portion of a cart, and always as one whole-transaction
//     amount). Folding them into a per-module "sales" figure would conflate
//     sales with tax collected. They remain visible only in the
//     transaction/shift-level totals calculateRevenue() already returns.
//   - Per-module refund attribution — Transaction.refundAmount is a single
//     flat number with no item/module-level source, so a refunded mixed
//     transaction still contributes its gross item revenue to every module
//     it touches (matching how calculateRevenue() already includes refunded
//     transactions in grossSales); the refund itself is only ever subtracted
//     at the overall/transaction level, never guessed at per module.
//   - Per-module payment-method breakdown — a single payment covers the
//     whole transaction, not a per-item share of it, so cash/card/gift/house
//     figures for a mixed transaction's module split are not fabricated here.

/**
 * Revenue for one active (non-voided) cart item — base price plus its addons
 * and priced side-details, times quantity. This is exactly the formula
 * calcCart() (tax.ts) already uses to build a cart's own `sub` — reused
 * here, not reinvented, so a transaction whose active items collapse to a
 * single module always splits to a value identical to what calcCart()
 * already produced for it. `flavour`/`size`/`sides` are display-only labels
 * with no price of their own and are intentionally not added again here.
 */
function activeItemRevenue(ci: CartItem): number {
  const addonsTotal = ci.addons.reduce((s, a) => s + a.price, 0)
  const sidesTotal = (ci.sideDetails ?? []).reduce((s, sd) => s + sd.price, 0)
  return (ci.price + addonsTotal + sidesTotal) * ci.qty
}

/**
 * Splits one transaction's sales revenue across the modules its active items
 * actually belong to. Returns a module -> amount map; an empty object means
 * this transaction contributes $0 to every module (fully voided, or no item
 * data and no usable `mod`).
 */
function splitTransactionByModule(tx: Transaction): Record<string, number> {
  const items = tx.items ?? []
  const activeItems = items.filter(ci => !ci.voided)

  // No item detail at all — e.g. a dedicated Car Wash module sale, which
  // never populates `items`. Fall back to the transaction's own `mod`; this
  // is the existing pure-module path and must not change.
  if (items.length === 0) {
    return tx.mod && tx.mod !== 'mixed' ? { [tx.mod]: tx.total } : {}
  }

  if (activeItems.length === 0) return {} // every item voided — contributes $0 everywhere

  const moduleSubtotals: Record<string, number> = {}
  for (const ci of activeItems) {
    moduleSubtotals[ci.module] = (moduleSubtotals[ci.module] ?? 0) + activeItemRevenue(ci)
  }

  const distinctModules = Object.keys(moduleSubtotals)
  if (distinctModules.length === 1) {
    // Only one module is actually active — either a genuinely pure
    // transaction, or a mixed-tagged cart whose other-module items were all
    // voided. Use tx.total directly: POSPage.tsx always builds tx.sub/
    // tx.total from calcCart(activeCart, ...), so tx.total already equals
    // exactly what this one module's active items produce — not an
    // approximation.
    return { [distinctModules[0]]: tx.total }
  }

  // Genuine multi-module split: allocate tx.disc proportionally by each
  // module's share of the active subtotal — the same guard and formula
  // calcCart() already uses for its restaurant/non-restaurant split,
  // generalized to however many modules are actually present.
  const totalActiveSub = distinctModules.reduce((s, m) => s + moduleSubtotals[m], 0)
  const out: Record<string, number> = {}
  for (const mod of distinctModules) {
    const discPortion = totalActiveSub > 0 ? (tx.disc ?? 0) * (moduleSubtotals[mod] / totalActiveSub) : 0
    out[mod] = moduleSubtotals[mod] - discPortion
  }
  return out
}

/**
 * The authoritative module-revenue breakdown. Every module report (EOD,
 * Reports, Targets, Historical Recovery) should call this instead of
 * grouping by transaction-level `mod` directly — see the file-level comment
 * above this section for exactly what is and isn't attributed per module.
 *
 * Pure-module transactions are fed whole into calculateRevenue() exactly as
 * groupRevenueByModule() already does, so their count/payment-breakdown/GCT/
 * gratuity/void/refund figures are unaffected by this function — only mixed
 * transactions (or a mixed-tagged transaction whose active items collapse to
 * one module) are handled differently, via splitTransactionByModule() above.
 */
export function groupRevenueByModuleSplit(scopedTxs: Transaction[]): Record<string, RevenueTotals> {
  const active = scopedTxs.filter(t => !t.voided)

  const byModuleTxs: Record<string, Transaction[]> = {}
  const byModuleExtra: Record<string, { count: number; gross: number }> = {}

  for (const tx of active) {
    const split = splitTransactionByModule(tx)
    const modules = Object.keys(split)
    if (modules.length === 0) continue

    if (modules.length === 1 && tx.mod === modules[0]) {
      // Genuinely pure transaction (tx.mod matches its one active module) —
      // let calculateRevenue() account for it fully, same as before.
      ;(byModuleTxs[modules[0]] ??= []).push(tx)
      continue
    }

    // Mixed transaction (or a mixed-tagged transaction that collapsed to one
    // active module because its other items were voided) — add its split
    // share(s) as sales-only contributions.
    for (const mod of modules) {
      if (!byModuleExtra[mod]) byModuleExtra[mod] = { count: 0, gross: 0 }
      byModuleExtra[mod].count += 1
      byModuleExtra[mod].gross += split[mod]
    }
  }

  const modulesSeen = Array.from(new Set([...Object.keys(byModuleTxs), ...Object.keys(byModuleExtra)]))
  const out: Record<string, RevenueTotals> = {}
  for (const mod of modulesSeen) {
    const base = calculateRevenue(byModuleTxs[mod] ?? [])
    const extra = byModuleExtra[mod] ?? { count: 0, gross: 0 }
    out[mod] = {
      ...base,
      transactionCount: base.transactionCount + extra.count,
      grossSales: base.grossSales + extra.gross,
      subtotal: base.subtotal + extra.gross,
      netSales: base.netSales + extra.gross,
    }
  }
  return out
}

/** Groups an already-scoped transaction set by cashier and aggregates each group. */
export function groupRevenueByCashier(scopedTxs: Transaction[]): Record<string, RevenueTotals> {
  const byCashier: Record<string, Transaction[]> = {}
  for (const t of scopedTxs) {
    const key = t.cashier ?? 'Unknown'
    ;(byCashier[key] ??= []).push(t)
  }
  const out: Record<string, RevenueTotals> = {}
  for (const [cashier, txs] of Object.entries(byCashier)) out[cashier] = calculateRevenue(txs)
  return out
}

/** Groups an already-scoped transaction set by Jamaica business-day key ("YYYY-MM-DD") and aggregates each group. */
export function groupRevenueByDate(scopedTxs: Transaction[]): Record<string, RevenueTotals> {
  const byDate: Record<string, Transaction[]> = {}
  for (const t of scopedTxs) {
    const key = jamaicaDateKey(t.ts)
    ;(byDate[key] ??= []).push(t)
  }
  const out: Record<string, RevenueTotals> = {}
  for (const [date, txs] of Object.entries(byDate)) out[date] = calculateRevenue(txs)
  return out
}
