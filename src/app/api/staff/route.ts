export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')

const SB = () => ({
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
})

export async function GET() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/staff?select=id,name,ini,role,pin_hash,color,allowed_modules,active,staff_id,created_at&order=created_at.asc`,
    { headers: SB() }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const row = {
    id: randomUUID(),
    name: body.name,
    ini: body.ini,
    role: body.role ?? 'cashier',
    pin_hash: body.pin_hash,
    color: body.color ?? '#4f8ef7',
    allowed_modules: body.allowed_modules ?? ['restaurant'],
    active: body.active ?? true,
    staff_id: body.staff_id ?? null,
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/staff`, {
    method: 'POST', headers: SB(), body: JSON.stringify(row),
  })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...patch } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const check = await fetch(
    `${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}&select=id`,
    { headers: SB() }
  )
  const existing = await check.json()

  if (Array.isArray(existing) && existing.length > 0) {
    const res = await fetch(`${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: SB(), body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
    return NextResponse.json(data)
  } else {
    if (!patch.pin_hash) return NextResponse.json({ error: 'PIN is required to save this staff member to Supabase' }, { status: 400 })
    const res = await fetch(`${SUPA_URL}/rest/v1/staff`, {
      method: 'POST', headers: SB(), body: JSON.stringify({ id, ...patch }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
    return NextResponse.json(data, { status: 201 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const res = await fetch(`${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: SB(),
  })
  if (!res.ok) return NextResponse.json({ error: await res.json() }, { status: res.status })
  return new NextResponse(null, { status: 204 })
}