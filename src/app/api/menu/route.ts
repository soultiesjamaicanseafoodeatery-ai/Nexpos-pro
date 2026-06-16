import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_ANON_KEY!
const SB = () => ({
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
})

export async function GET() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/menu_items?select=*&order=name.asc`,
    { headers: SB() }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  // Normalise is_available â†’ active so the POS doesn't need to know the column name
  const normalised = (data as Record<string, unknown>[]).map(r => ({
    ...r,
    active: r.is_available ?? r.active ?? true,
  }))
  return NextResponse.json(normalised)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const row = {
    id: body.id ?? `ITEM-${Date.now()}`,
    name: body.name,
    description: body.description ?? '',
    price: Number(body.price ?? 0),
    category: body.category ?? '',
    emoji: body.emoji ?? 'ðŸ½ï¸',
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
  const body = await req.json()
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
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const res = await fetch(
    `${SUPA_URL}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: SB() }
  )
  if (!res.ok) return NextResponse.json({ error: await res.json() }, { status: res.status })
  return new NextResponse(null, { status: 204 })
}

