export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')

const headers = {
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

const ALLOWED_ORIGINS = (process.env.NEXT_PUBLIC_APP_URL ?? '').split(',').map(o => o.trim()).filter(Boolean)

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? ''
  if (!origin) return false
  if (process.env.NODE_ENV === 'development') return true
  if (ALLOWED_ORIGINS.length === 0) {
    const host = req.headers.get('host') ?? ''
    return origin.includes(host)
  }
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
}

export async function GET(request: NextRequest) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const res = await fetch(
    `${SUPA_URL}/rest/v1/staff?select=id,name,ini,role,color,allowed_modules,active,staff_id,created_at&order=created_at.asc`,
    { headers }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    method: 'POST',
    headers,
    body: JSON.stringify(row),
  })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!isAllowedOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { id, ...patch } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const check = await fetch(
    `${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}&select=id`,
    { headers }
  )
  const existing = await check.json()

  if (Array.isArray(existing) && existing.length > 0) {
    const res = await fetch(`${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
    return NextResponse.json(data)
  } else {
    if (!patch.pin_hash) return NextResponse.json({ error: 'PIN is required to save this staff member to Supabase' }, { status: 400 })
    const row = { id, ...patch }
    const res = await fetch(`${SUPA_URL}/rest/v1/staff`, {
      method: 'POST',
      headers,
      body: JSON.stringify(row),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
    return NextResponse.json(data, { status: 201 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAllowedOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const res = await fetch(`${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const data = await res.json()
    return NextResponse.json({ error: data }, { status: res.status })
  }
  return new NextResponse(null, { status: 204 })
}
