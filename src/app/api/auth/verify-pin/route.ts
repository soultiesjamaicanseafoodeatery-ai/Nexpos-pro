export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { hashPin } from '@/lib/utils/hash'
import { getSessionStaffId } from '@/lib/utils/serverAuth'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')
const SB = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' })

// Server-side replacement for the "type a manager PIN to authorize this" pattern
// previously done by comparing a fetched pin_hash in the browser (No-Sale, Close
// Shift manager authorization, Payroll self-re-auth for time corrections). Does
// NOT log the caller in and does NOT touch the session cookie — it only confirms
// a specific PIN belongs to a specific (or any eligible) staff record, and
// returns the minimum safe identity fields the calling UI already displays.
//
// Requires an existing valid session — some staff member must already be logged
// in at this terminal — as a base gate against anonymous PIN-guessing traffic.
export async function POST(req: NextRequest) {
  if (!getSessionStaffId(req)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = body?.id
  const pin = body?.pin
  // pool 'privileged' restricts matching to admin/manager staff, enforced here
  // server-side (re-verified against the live role, never trusted from the
  // caller) — used by No-Sale and Close Shift manager authorization.
  const pool = body?.pool === 'privileged' ? 'privileged' : 'any'
  if (typeof pin !== 'string' || pin.length !== 4) {
    return NextResponse.json({ error: 'A 4-digit pin is required' }, { status: 400 })
  }
  if (id != null && typeof id !== 'string') {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let filter = 'active=eq.true'
  if (id) filter += `&id=eq.${encodeURIComponent(id)}`
  if (pool === 'privileged') filter += `&role=in.(admin,manager)`

  const res = await fetch(
    `${SUPA_URL}/rest/v1/staff?${filter}&select=id,name,ini,role,color,allowed_modules,pin_hash`,
    { headers: SB() }
  )
  const rows: Array<{ id: string; name: string; ini: string; role: string; color: string; allowed_modules: string[]; pin_hash: string | null }> =
    res.ok ? await res.json() : []

  const hash = await hashPin(pin)
  const match = rows.find(r => r.pin_hash && hash.toLowerCase() === String(r.pin_hash).toLowerCase())
  if (!match) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })

  return NextResponse.json({
    id: match.id, name: match.name, ini: match.ini, role: match.role,
    color: match.color, allowedModules: match.allowed_modules ?? ['restaurant'],
  })
}
