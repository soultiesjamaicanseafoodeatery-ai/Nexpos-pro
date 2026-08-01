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

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // true on Vercel (Preview + Production both build with NODE_ENV=production), false under `next dev`
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
}
