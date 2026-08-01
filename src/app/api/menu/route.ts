import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireRole, isErrorResponse } from '@/lib/utils/serverAuth'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')
const SB = () => ({
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
})

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req)
  if (isErrorResponse(auth)) return auth
  const res = await fetch(
    `${SUPA_URL}/rest/v1/menu_items?select=*&order=name.asc`,
    { headers: SB() }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  // Normalise is_available → active so the POS doesn't need to know the column name
  const normalised = (data as Record<string, unknown>[]).map(r => ({
    ...r,
    active: r.is_available ?? r.active ?? true,
  }))
  return NextResponse.json(normalised)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if (isErrorResponse(auth)) return auth
  const body = await req.json()
  const row = {
    id: body.id ?? `ITEM-${Date.now()}`,
    name: body.name,
    description: body.description ?? '',
    price: Number(body.price ?? 0),
    category: body.category ?? '',
    emoji: body.emoji ?? '',
    is_available: body.active ?? true,
    module: body.module ?? 'restaurant',
    route: body.route ?? '',
    image_url: body.image_url ?? '',
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/menu_items`, {
    method: 'POST',
    headers: SB(),
    body: JSON.stringify(row),
  })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if (isErrorResponse(auth)) return auth
  const body = await req.json()

  // Bulk category rename — every menu_items row in this module currently tagged
  // with the old category name gets moved to the new one in a single PATCH,
  // matching the PostgREST filter Supabase already exposes. Without this, only
  // the local/seed category list was ever renamed — live items (this table)
  // silently kept the old category, so both names showed up afterward.
  if (body.renameCategory) {
    const { module: mod, from, to } = body.renameCategory
    if (!mod || !from || !to) return NextResponse.json({ error: 'module, from, and to are required' }, { status: 400 })
    const res = await fetch(
      `${SUPA_URL}/rest/v1/menu_items?module=eq.${encodeURIComponent(mod)}&category=eq.${encodeURIComponent(from)}`,
      { method: 'PATCH', headers: SB(), body: JSON.stringify({ category: to }) }
    )
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
    return NextResponse.json(data)
  }

  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = { ...rest }
  if ('active' in patch) { patch.is_available = patch.active; delete patch.active }
  const res = await fetch(
    `${SUPA_URL}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: SB(), body: JSON.stringify(patch) }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if (isErrorResponse(auth)) return auth
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const res = await fetch(
    `${SUPA_URL}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: SB() }
  )
  if (!res.ok) return NextResponse.json({ error: await res.json() }, { status: res.status })
  return new NextResponse(null, { status: 204 })
}

