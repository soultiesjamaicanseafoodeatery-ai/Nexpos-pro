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

// A small number of historical transactions (recovered after a June 2026 data-loss
// incident) carry their original display-format timestamp instead of an ISO string —
// e.g. "06/27 06:41 PM", with no year. `new Date(...)` cannot parse this reliably (it
// falls back to year 2001 in this engine), which silently hid those transactions from
// any date-scoped view (My Shift, Reports' date-range filter). CloseShiftWizard.tsx
// already had its own defensive handling for this exact format; this is the same
// logic, centralized here so every caller in this file — and anything else that needs
// to parse a transaction timestamp — gets it for free instead of duplicating it.
const LEGACY_TS_RE = /^(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i

function toMs(ts: string | number | Date): number {
  if (ts instanceof Date) return ts.getTime()
  if (typeof ts === 'number') return ts
  // Guard the regex match to actual strings — `ts` can arrive as null/undefined/other
  // at runtime despite the declared type (malformed data, a missing field, etc.), and
  // calling .match() on a non-string throws instead of the graceful NaN/epoch-0 that
  // `new Date(...)` below already produces for those. Never let a bad timestamp crash
  // the POS.
  if (typeof ts === 'string') {
    const m = ts.match(LEGACY_TS_RE)
    if (m) {
      const mon = parseInt(m[1], 10) - 1
      const day = parseInt(m[2], 10)
      let hr = parseInt(m[3], 10)
      const min = parseInt(m[4], 10)
      if (m[5].toUpperCase() === 'PM' && hr !== 12) hr += 12
      if (m[5].toUpperCase() === 'AM' && hr === 12) hr = 0
      // Legacy strings carry Jamaica local time with no year or timezone marker.
      // Assume the current year (these are all recent records) and convert Jamaica
      // local time to UTC by adding the 5-hour offset — same approach already used
      // by CloseShiftWizard.tsx for this exact format.
      return Date.UTC(new Date().getFullYear(), mon, day, hr + 5, min)
    }
  }
  return new Date(ts).getTime()
}

/**
 * Parses any transaction timestamp — ISO or the legacy "MM/DD HH:MM AM/PM" format —
 * into a millisecond epoch. Use this instead of `new Date(ts).getTime()` anywhere a
 * transaction's `ts` field needs to be compared or ordered, so legacy-format rows are
 * never silently mis-dated.
 */
export function parseTs(ts: string | number | Date): number {
  return toMs(ts)
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Human-readable Jamaica date/time for display (e.g. "Jul 5, 2026, 7:05 PM").
 * Uses the same offset math as jamaicaDateKey instead of the viewing device's
 * timezone, so it reads correctly regardless of where staff/owner are logged in from.
 */
export function jamaicaDateTimeString(ts: string | number | Date): string {
  const d = new Date(toMs(ts) - JAMAICA_OFFSET_MS)
  const month = MONTHS[d.getUTCMonth()]
  const day = d.getUTCDate()
  const year = d.getUTCFullYear()
  let hours = d.getUTCHours()
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${month} ${day}, ${year}, ${hours}:${minutes} ${ampm}`
}
