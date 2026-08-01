export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { hashPin } from '@/lib/utils/hash'
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/utils/session'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')
const SB = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' })

// Server-verifies the PIN the login screen already collects, then issues a
// signed httpOnly session cookie — the PIN pad UX is unchanged; only the
// verification step moves from the browser to here.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const id = body?.id
  const pin = body?.pin
  if (typeof id !== 'string' || typeof pin !== 'string' || pin.length !== 4) {
    return NextResponse.json({ error: 'id and a 4-digit pin are required' }, { status: 400 })
  }

  const res = await fetch(
    `${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}&select=id,name,ini,role,color,allowed_modules,active,staff_id,pin_hash&limit=1`,
    { headers: SB() }
  )
  const rows = res.ok ? await res.json() : []
  const row = Array.isArray(rows) ? rows[0] : null

  // Same generic error for "no such staff", "inactive", "no pin set", and
  // "wrong pin" — never tell an unauthenticated caller which one it was.
  const reject = () => NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
  if (!row || !row.active || !row.pin_hash) return reject()

  const hash = await hashPin(pin)
  if (hash.toLowerCase() !== String(row.pin_hash).toLowerCase()) return reject()

  const token = createSessionToken(row.id)
  const response = NextResponse.json({
    id: row.id,
    name: row.name,
    ini: row.ini,
    role: row.role,
    color: row.color,
    allowedModules: row.allowed_modules ?? ['restaurant'],
    active: row.active,
    staffId: row.staff_id ?? undefined,
  })
  response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
  return response
}
