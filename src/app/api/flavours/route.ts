import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SB = () => ({
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
})

export async function GET() {
  const res = await fetch(`${SUPA_URL}/rest/v1/flavours?select=*&order=name.asc`, { headers: SB() })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(
    (data as Record<string, unknown>[]).map(r => ({ ...r, active: r.active ?? true }))
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const row = { id: body.id ?? `FLV-${Date.now()}`, name: body.name, description: body.description ?? '', active: body.active ?? true }
  const res = await fetch(`${SUPA_URL}/rest/v1/flavours`, { method: 'POST', headers: SB(), body: JSON.stringify(row) })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...patch } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const res = await fetch(`${SUPA_URL}/rest/v1/flavours?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: SB(), body: JSON.stringify(patch) })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: res.status })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const res = await fetch(`${SUPA_URL}/rest/v1/flavours?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: SB() })
  if (!res.ok) return NextResponse.json({ error: await res.json() }, { status: res.status })
  return new NextResponse(null, { status: 204 })
}
