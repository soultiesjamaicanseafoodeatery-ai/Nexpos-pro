// Canonical payment-method vocabulary and helpers, used everywhere a
// transaction's payment method needs to be interpreted — checkout (drawer
// decisions), My Shift, staff_shifts snapshots, EOD/Z-report, and the
// Reports page. Nothing else should re-implement this logic ad hoc.
//
// Historical data written before this file existed may contain raw values
// outside this vocabulary (e.g. Car Wash's old 'card'/'mixed' labels, or
// 'Gift Card'/'Tab' display-cased labels). Those are handled by ALIASES
// below for the ones we can map unambiguously; anything else — including
// genuinely new/unexpected values — is surfaced as 'unknown' rather than
// silently folded into Cash.

export type PayMethod = 'cash' | 'debit' | 'credit' | 'gift' | 'house' | 'split' | 'unknown'
export type PayBucket = 'cash' | 'debit' | 'credit' | 'gift' | 'house' | 'unknown'

export interface PaymentComponent {
  method: string
  amount: number
}

const ALIASES: Record<string, PayMethod> = {
  cash: 'cash',
  debit: 'debit',
  credit: 'credit',
  gift: 'gift',
  gift_card: 'gift',
  'gift card': 'gift',
  house: 'house',
  tab: 'house',
  'house account': 'house',
  split: 'split',
}

// Normalizes any raw payment-method string into the canonical vocabulary.
// Never silently maps an unrecognized value to 'cash' — logs a warning and
// returns 'unknown' instead, so reporting can surface it rather than hide it.
export function normalizePayMethod(raw: string | undefined | null): PayMethod {
  const key = (raw ?? '').trim().toLowerCase()
  if (key in ALIASES) return ALIASES[key]
  if (raw) console.warn(`[payments] unrecognized payment method "${raw}" — reporting as unknown, not cash`)
  return 'unknown'
}

// Breaks a transaction's payment down into canonical dollar buckets — the
// amount actually RETAINED as revenue, not the gross amount handed over.
// Prefers the itemized `payments` array (present on every split payment)
// over the single top-level `pay` string, which only describes one method.
//
// `changeDue`: on a split that over-tenders cash for change (e.g. total
// J$1,000, customer hands over J$1,500 cash, J$500 change), `payments`
// records the gross J$1,500 handed over — because that's what actually
// happened at the counter and is what the receipt should show — but
// revenue/reporting must count only the J$1,000 retained. Passing the
// transaction's `changeDue` here nets that amount out of the cash bucket
// (never out of a card/gift/house bucket — change is always given from the
// cash drawer). A plain (non-split) cash sale never needs this: its
// fallback branch already uses `total`, which excludes tender/change by
// construction.
export function getPaymentBreakdown(
  pay: string,
  total: number,
  payments?: PaymentComponent[] | null,
  changeDue?: number | null
): Record<PayBucket, number> {
  const out: Record<PayBucket, number> = { cash: 0, debit: 0, credit: 0, gift: 0, house: 0, unknown: 0 }
  const bucketOf = (raw: string): PayBucket => {
    const m = normalizePayMethod(raw)
    return m === 'split' ? 'unknown' : m // a single component should never itself be "split"
  }
  if (payments && payments.length > 0) {
    for (const p of payments) out[bucketOf(p.method)] += p.amount
    if (changeDue && changeDue > 0) out.cash = Math.max(0, out.cash - changeDue)
    return out
  }
  out[bucketOf(pay)] += total
  return out
}

// Merges multiple breakdowns (e.g. summing across a day's transactions).
export function mergeBreakdowns(breakdowns: Record<PayBucket, number>[]): Record<PayBucket, number> {
  const out: Record<PayBucket, number> = { cash: 0, debit: 0, credit: 0, gift: 0, house: 0, unknown: 0 }
  for (const b of breakdowns) (Object.keys(out) as PayBucket[]).forEach(k => { out[k] += b[k] })
  return out
}

// The single rule for whether a completed payment should kick the cash
// drawer: true iff there's a cash component greater than zero, whether the
// payment was pure cash or a split that includes cash. Debit/credit/gift/
// house-only payments never open the drawer.
export function shouldOpenDrawer(pay: string, payments?: PaymentComponent[] | null): boolean {
  if (payments && payments.length > 0) {
    return payments.some(p => normalizePayMethod(p.method) === 'cash' && p.amount > 0)
  }
  return normalizePayMethod(pay) === 'cash'
}
