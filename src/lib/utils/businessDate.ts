// Single source of truth for "what business day is this."
//
// Jamaica is UTC-5 year-round (no DST). The server (Vercel functions) runs
// in UTC, and staff/owner devices can be in any timezone (e.g. logging in
// from Canada) — so business-day boundaries must never be derived from
// `Date.setHours(0,0,0,0)` (viewing device's local time) or a raw UTC
// calendar date. Both silently shift the boundary by hours and have caused
// real production bugs (car wash tickets misattributed to the wrong day,
// EOD reconciliation mixing in the previous day's sales).
//
// Every module that needs "today," "same day as X," or a daily-reset
// boundary should import from here instead of recomputing it locally.

const JAMAICA_OFFSET_MS = 5 * 60 * 60 * 1000

function toMs(ts: string | number | Date): number {
  return ts instanceof Date ? ts.getTime() : typeof ts === 'number' ? ts : new Date(ts).getTime()
}

/** Jamaica calendar-day key ("YYYY-MM-DD") for a timestamp. Defaults to now. */
export function jamaicaDateKey(ts: string | number | Date = new Date()): string {
  const d = new Date(toMs(ts) - JAMAICA_OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** True if two timestamps fall on the same Jamaica calendar day. */
export function isSameBusinessDay(ts: string, dateKey: string): boolean {
  try { return jamaicaDateKey(ts) === dateKey } catch { return false }
}

/** UTC instant of Jamaica midnight for the calendar day containing `ts`. Defaults to today. */
export function jamaicaDayStart(ts: string | number | Date = new Date()): Date {
  const jamaicaNow = new Date(toMs(ts) - JAMAICA_OFFSET_MS)
  return new Date(Date.UTC(jamaicaNow.getUTCFullYear(), jamaicaNow.getUTCMonth(), jamaicaNow.getUTCDate(), 5, 0, 0, 0))
}
