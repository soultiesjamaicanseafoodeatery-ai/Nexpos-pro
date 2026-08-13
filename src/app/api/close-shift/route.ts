export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, isErrorResponse } from '@/lib/utils/serverAuth'
import { verifyPinAuthToken } from '@/lib/utils/session'
import { jamaicaDateKey } from '@/lib/utils/businessDate'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')
const SB = () => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

interface CloseShiftBody {
  shiftId: string
  pinAuthToken: string
  openingFloat: number
  countedCash: number
  cashVariance: number | null
  varianceNote: string
  wasOverridden: boolean
  revenue: number
  txCount: number
  snapshot: Record<string, unknown>
}

// Closing a shift is the single most sensitive write in the app — it produces
// the permanent, otherwise-immutable EOD record (see eod_snapshots' RLS
// policy, which allows anon INSERT but never UPDATE/DELETE). RLS alone can't
// stop a client from closing a shift it has no business closing, since the
// app uses one shared anon key per restaurant, not per-user row isolation —
// so that check has to happen here, server-side, against the live staff table.
//
// Two identities matter and are deliberately checked differently, matching
// the wizard's existing UX (unchanged by this route):
//   1. `requireStaff` — whoever is logged into THIS terminal must at least be
//      an active staff member (same baseline every other route requires).
//   2. `pinAuthToken` — cryptographic proof that a manager/admin PIN was
//      verified inside the Close Shift wizard itself, moments ago (via
//      /api/auth/verify-pin, already a separate, still-intact step) — often a
//      DIFFERENT person than #1, by design: a staff terminal gets walked over
//      and authorized by a manager without a full logout/login. The staffId
//      this authorizes comes ONLY from inside the token, never from a
//      caller-supplied field — a client cannot claim to be a different
//      manager just by changing a request body value; only a real PIN entry
//      produces a token that verifies. This route additionally re-confirms
//      that staffId is still a real, active admin/manager, live, so a role
//      change mid-window (or after the token was issued) takes effect
//      immediately rather than trusting a role baked into the token.
export async function POST(req: NextRequest) {
  const staff = await requireStaff(req)
  if (isErrorResponse(staff)) return staff

  const body = (await req.json()) as CloseShiftBody
  if (!body.shiftId || !body.pinAuthToken) {
    return NextResponse.json({ error: 'shiftId and pinAuthToken are required' }, { status: 400 })
  }

  const pinAuth = verifyPinAuthToken(body.pinAuthToken)
  if (!pinAuth) {
    return NextResponse.json({ error: 'PIN authorization is missing or has expired — please re-enter your PIN.' }, { status: 401 })
  }

  const authRes = await fetch(
    `${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(pinAuth.staffId)}&select=id,name,role,active&limit=1`,
    { headers: SB() }
  )
  const authRows = authRes.ok ? await authRes.json() : []
  const authorizedStaff = Array.isArray(authRows) ? authRows[0] : null
  if (!authorizedStaff || !authorizedStaff.active || !['admin', 'manager'].includes(authorizedStaff.role)) {
    return NextResponse.json({ error: 'The PIN-verified user is not an active admin/manager' }, { status: 403 })
  }
  const closedBy = authorizedStaff.name as string
  const closedAt = new Date().toISOString()

  // Conditional update, same guard the client used to run directly — only
  // succeeds if this shift is still 'open' at the moment of the write, so a
  // second device racing to close the same shift gets a clean "already
  // closed" response instead of a duplicate/conflicting closure.
  const updRes = await fetch(
    `${SUPA_URL}/rest/v1/business_shifts?id=eq.${encodeURIComponent(body.shiftId)}&status=eq.open`,
    {
      method: 'PATCH',
      headers: SB(),
      body: JSON.stringify({
        status: 'closed', closed_at: closedAt, closed_by: closedBy,
        opening_float: body.openingFloat, counted_cash: body.countedCash,
        cash_variance: body.cashVariance ?? 0, variance_note: body.varianceNote,
        was_overridden: body.wasOverridden, revenue: body.revenue, tx_count: body.txCount,
        is_formal_close: true,
      }),
    }
  )
  if (!updRes.ok) {
    return NextResponse.json({ error: 'Could not reach the database to close this shift.' }, { status: 502 })
  }
  const updRows = await updRes.json()
  if (!Array.isArray(updRows) || updRows.length === 0) {
    return NextResponse.json({ error: 'already_closed' }, { status: 409 })
  }

  // Permanent day snapshot — same best-effort semantics as before: the shift
  // is already correctly closed above regardless of whether this succeeds.
  let snapshotSaved = true
  try {
    const snapRes = await fetch(`${SUPA_URL}/rest/v1/eod_snapshots`, {
      method: 'POST',
      headers: SB(),
      body: JSON.stringify({
        id: body.shiftId,
        business_date: jamaicaDateKey(closedAt),
        shift_id: body.shiftId,
        closed_by: closedBy,
        closed_at: closedAt,
        data: body.snapshot,
      }),
    })
    snapshotSaved = snapRes.ok
  } catch {
    snapshotSaved = false
  }

  return NextResponse.json({ ok: true, closedAt, closedBy, snapshotSaved })
}
