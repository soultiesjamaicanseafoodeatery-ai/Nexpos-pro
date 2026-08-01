import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from './session'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')
const SB = () => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
})

export interface AuthedStaff {
  id: string
  name: string
  role: string
  active: boolean
  pin_hash: string | null
}

// Reads the session cookie and verifies its signature/expiry only — does not
// touch Supabase. Cheap, used when a route just needs "is someone logged in".
export function getSessionStaffId(req: NextRequest): string | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = verifySessionToken(token)
  return session?.staffId ?? null
}

// Fetches the CURRENT staff record live from Supabase for the session's staffId —
// role/active/allowed_modules are never trusted from the token itself, so a role
// change or deactivation takes effect on the very next request, not after the
// old session expires.
export async function getAuthedStaff(req: NextRequest): Promise<AuthedStaff | null> {
  const staffId = getSessionStaffId(req)
  if (!staffId) return null
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&select=id,name,role,active,pin_hash&limit=1`,
      { headers: SB() }
    )
    if (!res.ok) return null
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || !row.active) return null
    return row as AuthedStaff
  } catch { return null }
}

const UNAUTHORIZED = () => NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
const FORBIDDEN     = () => NextResponse.json({ error: 'Not authorized' }, { status: 403 })

// Any logged-in, active staff member — no role restriction. Use for ordinary
// POS operations (ringing sales, holding car wash tickets, reading the catalog).
export async function requireStaff(req: NextRequest): Promise<AuthedStaff | NextResponse> {
  const staff = await getAuthedStaff(req)
  if (!staff) return UNAUTHORIZED()
  return staff
}

// Logged-in staff whose CURRENT role (fetched live, not from the token) is in
// `roles`. Use for admin/manager-only actions (staff management, menu/pricing edits).
export async function requireRole(req: NextRequest, roles: string[]): Promise<AuthedStaff | NextResponse> {
  const staff = await getAuthedStaff(req)
  if (!staff) return UNAUTHORIZED()
  if (!roles.includes(staff.role)) return FORBIDDEN()
  return staff
}

export function isErrorResponse(x: AuthedStaff | NextResponse): x is NextResponse {
  return x instanceof NextResponse
}
