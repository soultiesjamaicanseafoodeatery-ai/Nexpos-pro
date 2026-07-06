import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')

const SB = () => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

export const dynamic = 'force-dynamic'

export async function GET() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/carwash_held?order=created_at.desc`,
    { headers: SB() }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const row = {
    id:             `CWH-${Date.now()}`,
    services:       Array.isArray(body.services) ? body.services : [],
    addons:         Array.isArray(body.addons) ? body.addons : [],
    plate:          body.plate ?? '',
    vehicle_type:   body.vehicleType ?? 'Car',
    customer_name:  body.customerName ?? '',
    phone:          body.phone ?? '',
    payment_method: body.paymentMethod ?? 'cash',
    saved_by:       body.savedBy ?? '',
  }

  const res = await fetch(`${SUPA_URL}/rest/v1/carwash_held`, {
    method: 'POST',
    headers: SB(),
    body: JSON.stringify(row),
  })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(Array.isArray(data) ? data[0] : data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const res = await fetch(
    `${SUPA_URL}/rest/v1/carwash_held?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: SB() }
  )
  if (!res.ok) {
    const data = await res.json()
    return NextResponse.json({ error: data }, { status: res.status })
  }
  return NextResponse.json({ ok: true })
}
