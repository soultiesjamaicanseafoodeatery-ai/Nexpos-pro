import { createHmac, timingSafeEqual } from 'crypto'

// Server-only signed session token — deliberately dependency-free (Node's built-in
// `crypto`, same module already used by /api/qz-sign) rather than adding a JWT
// library for a single-field payload. Format: base64url(json).base64url(hmac-sha256).
// The token carries only `staffId` + expiry — never a role, never PIN/pin_hash —
// so a route that needs to authorize an action re-fetches the staff record live
// from Supabase by that id, and a permission change takes effect immediately
// instead of waiting for an old token to expire.

export const SESSION_COOKIE = 'nexpos_session'
const SESSION_TTL_SECONDS = 12 * 60 * 60 // 12h — long enough to cover a full shift without forcing mid-shift re-logins

interface SessionPayload {
  staffId: string
  iat: number
  exp: number
}

function b64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  return secret
}

function sign(data: string): string {
  return b64url(createHmac('sha256', getSecret()).update(data).digest())
}

export function createSessionToken(staffId: string): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = { staffId, iat: now, exp: now + SESSION_TTL_SECONDS }
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token: string | undefined | null): { staffId: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  let expectedSig: string
  try { expectedSig = sign(body) } catch { return null }
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as SessionPayload
    if (typeof payload.staffId !== 'string' || typeof payload.exp !== 'number') return null
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null
    return { staffId: payload.staffId }
  } catch { return null }
}

// Short-lived PIN-authorization proof — deliberately separate from the login
// session token above (different purpose, different lifetime, never stored as
// a cookie). Issued by /api/auth/verify-pin on a successful match, required by
// any route performing a sensitive manager-authorized action (Close Shift,
// Historical Recovery). The `purpose` field stops a valid login session token
// (or any other token this module might sign in future) from being replayed
// here even though both share the same HMAC secret. Reusing a TTL constant
// as the default (not a hardcoded body) lets tests construct an
// already-expired token directly, with no need to fake the clock or wait out
// a real window.
//
// Three durations, not a client-chosen one: /api/auth/verify-pin picks
// between these based on a small, server-controlled `context` enum it
// validates itself — the caller can never request an arbitrary lifetime.
//
// PIN_AUTH_TTL_SECONDS (5 min) remains the default for quick, single-action
// authorizations that happen immediately after the PIN is entered — No-Sale
// (open the drawer) and Payroll's self-re-auth for a time correction. Both
// are genuinely one-step actions; a short window is the right, deliberate
// choice for them and is NOT changed here.
//
// CLOSE_SHIFT_PIN_AUTH_TTL_SECONDS (20 min) exists because Close Shift is
// NOT a one-step action — it's a multi-screen wizard (system validation →
// cash count → payments → gratuity → sales → exceptions → employees →
// print → confirm) that a real, careful EOD count can take longer than 5
// minutes to get through. A real Production incident (2026-08-12) proved
// this: the token expired mid-wizard, and the confirm screen's "End of Day
// Close" button failed with a confusing client-side message instead of a
// clear explanation. This uses the exact same reasoning already applied to
// Historical Recovery below (also a multi-step, review-heavy flow) rather
// than inventing a new number.
export const PIN_AUTH_TTL_SECONDS = 5 * 60 // 5 minutes — No-Sale / Payroll's window, unchanged
export const CLOSE_SHIFT_PIN_AUTH_TTL_SECONDS = 20 * 60 // 20 minutes — Close Shift's multi-step wizard window
export const PIN_AUTH_RECOVERY_TTL_SECONDS = 20 * 60 // 20 minutes — Historical Recovery's window only

interface PinAuthPayload {
  staffId: string
  purpose: 'pin_auth'
  iat: number
  exp: number
}

export function createPinAuthToken(staffId: string, ttlSeconds: number = PIN_AUTH_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: PinAuthPayload = { staffId, purpose: 'pin_auth', iat: now, exp: now + ttlSeconds }
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${body}.${sign(body)}`
}

// Returns the staffId the PIN was verified for, or null if the token is
// missing, malformed, signed with the wrong secret, not a pin_auth token, or
// expired. Callers must still re-fetch that staffId's role live from Supabase
// before authorizing anything — this only proves "a PIN was correctly entered
// for this staffId recently," never a role, exactly like the login session
// token's own design.
export function verifyPinAuthToken(token: string | undefined | null): { staffId: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  let expectedSig: string
  try { expectedSig = sign(body) } catch { return null }
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as PinAuthPayload
    if (payload.purpose !== 'pin_auth') return null
    if (typeof payload.staffId !== 'string' || typeof payload.exp !== 'number') return null
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null
    return { staffId: payload.staffId }
  } catch { return null }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // true on Vercel (Preview + Production both build with NODE_ENV=production), false under `next dev`
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
}
