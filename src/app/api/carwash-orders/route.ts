import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const SB = () => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

export async function GET() {
  // Return today's orders (midnight local time to now)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const from = today.toISOString()

  const res = await fetch(
    `${SUPA_URL}/rest/v1/carwash_orders?created_at=gte.${encodeURIComponent(from)}&order=created_at.asc`,
    { headers: SB() }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Sequential ticket number — resets to CW-0001 each day automatically
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const lastRes = await fetch(
    `${SUPA_URL}/rest/v1/carwash_orders?select=ticket_no&created_at=gte.${encodeURIComponent(dayStart.toISOString())}&order=created_at.desc&limit=1`,
    { headers: SB() }
  )
  const lastData = await lastRes.json()
  let nextNum = 1
  if (Array.isArray(lastData) && lastData.length > 0) {
    const match = String(lastData[0].ticket_no).match(/\d+$/)
    if (match) nextNum = parseInt(match[0], 10) + 1
  }
  const ticket_no = `CW-${String(nextNum).padStart(4, '0')}`

  const row = {
    id:            `CWO-${Date.now()}`,
    ticket_no,
    customer_name: body.customerName ?? '',
    phone:         body.phone ?? '',
    vehicle_type:  body.vehicleType ?? 'Car',
    plate:         body.plate ?? '',
    service_id:    body.serviceId ?? '',
    service_name:  body.serviceName ?? '',
    service_price: Number(body.servicePrice ?? 0),
    addons:        body.addons ?? [],
    addons_total:  Number(body.addonsTotal ?? 0),
    notes:         body.notes ?? '',
    status:        'completed',
    payment_method:body.paymentMethod ?? 'cash',
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
  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { ...rest }
  if (rest.status === 'completed') {
    patch.completed_at = new Date().toISOString()
  }

  const res = await fetch(
    `${SUPA_URL}/rest/v1/carwash_orders?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: SB(), body: JSON.stringify(patch) }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}
