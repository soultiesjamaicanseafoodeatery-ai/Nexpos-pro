import { NextRequest, NextResponse } from 'next/server'
import { jamaicaDayStart, jamaicaDateKey } from '@/lib/utils/businessDate'
import { requireStaff, isErrorResponse } from '@/lib/utils/serverAuth'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')

const SB = () => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (isErrorResponse(auth)) return auth
  const from = jamaicaDayStart().toISOString()

  const res = await fetch(
    `${SUPA_URL}/rest/v1/carwash_orders?created_at=gte.${encodeURIComponent(from)}&order=created_at.asc`,
    { headers: SB() }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req)
  if (isErrorResponse(auth)) return auth
  const body = await req.json()

  // Atomic, concurrency-safe ticket number via the dedicated Car Wash
  // counter RPC (increment_carwash_counter, see
  // supabase/migrations/20260812_add_carwash_ticket_counter.sql) — replaces
  // the previous non-atomic "SELECT latest ticket, parse, +1" pattern,
  // which had a real race window between two concurrent requests. This
  // counter is entirely separate from the main order-number counter
  // (increment_order_counter): Car Wash numbering can never consume, or be
  // consumed by, Restaurant/Bar order numbers. Fails closed — if the RPC
  // can't be reached, no ticket is guessed locally and no order is created,
  // so a duplicate ticket number can never be produced by this path.
  const business_date = jamaicaDateKey()
  let counterRes: Response
  try {
    counterRes = await fetch(`${SUPA_URL}/rest/v1/rpc/increment_carwash_counter`, {
      method: 'POST',
      headers: SB(),
      body: JSON.stringify({ p_date: business_date }),
    })
  } catch {
    // Network/transport failure reaching the counter RPC (as opposed to the
    // RPC responding with a non-OK status, handled below) — same fail-closed
    // outcome, normalized to the same 502 contract instead of letting the
    // exception propagate into a bare framework 500.
    return NextResponse.json({ error: { message: 'Car Wash ticket counter unreachable' } }, { status: 502 })
  }
  if (!counterRes.ok) {
    const err = await counterRes.json().catch(() => ({}))
    return NextResponse.json({ error: err }, { status: 502 })
  }
  const nextNum = await counterRes.json()
  const ticket_no = `CW-${String(nextNum).padStart(4, '0')}`

  const svcs: Array<{ id?: string; name: string; price: number; qty?: number }> =
    Array.isArray(body.services) ? body.services : []
  const serviceNames = svcs
    .map(s => ((s.qty ?? 1) > 1 ? `${s.name} ×${s.qty}` : s.name))
    .join(', ')
  const servicePrice = svcs.reduce((sum, s) => sum + Number(s.price) * (s.qty ?? 1), 0)

  // Default stays 'completed' (dedicated Car Wash module: wash happens, then payment).
  // Callers can pass status: 'waiting' when the wash hasn't happened yet
  // (e.g. a car wash item bundled into a restaurant order, paid up front).
  const status = body.status === 'waiting' ? 'waiting' : 'completed'

  const row = {
    id:            `CWO-${Date.now()}`,
    ticket_no,
    business_date,
    customer_name: body.customerName ?? '',
    phone:         body.phone ?? '',
    vehicle_type:  body.vehicleType ?? 'Car',
    plate:         body.plate ?? '',
    service_id:    svcs[0]?.id ?? '',
    service_name:  serviceNames,
    service_price: servicePrice,
    addons:        body.addons ?? [],
    addons_total:  Number(body.addonsTotal ?? 0),
    notes:         body.notes ?? '',
    status,
    completed_at:  status === 'completed' ? new Date().toISOString() : null,
    payment_method: body.paymentMethod ?? 'cash',
    total:         Number(body.total ?? 0),
    employee_name: body.employeeName ?? '',
  }

  const res = await fetch(`${SUPA_URL}/rest/v1/carwash_orders`, {
    method: 'POST',
    headers: SB(),
    body: JSON.stringify(row),
  })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(Array.isArray(data) ? data[0] : data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff(req)
  if (isErrorResponse(auth)) return auth
  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { ...rest }
  if (rest.status === 'completed') patch.completed_at = new Date().toISOString()

  const res = await fetch(
    `${SUPA_URL}/rest/v1/carwash_orders?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: SB(), body: JSON.stringify(patch) }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}