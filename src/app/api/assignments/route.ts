import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')
const SB = () => ({
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
})

// Returns { [item_id]: { flavour_ids, side_ids, addon_ids, sizes } }
export async function GET() {
  const [flvRes, sideRes, addonRes, sizeRes] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/item_flavours?select=item_id,flavour_id`, { headers: SB() }),
    fetch(`${SUPA_URL}/rest/v1/item_sides?select=item_id,side_id`, { headers: SB() }),
    fetch(`${SUPA_URL}/rest/v1/item_addons?select=item_id,addon_id`, { headers: SB() }),
    fetch(`${SUPA_URL}/rest/v1/item_sizes?select=item_id,size_id,price`, { headers: SB() }),
  ])

  const [flvs, sides, addons, sizes] = await Promise.all([
    flvRes.ok ? flvRes.json() : [],
    sideRes.ok ? sideRes.json() : [],
    addonRes.ok ? addonRes.json() : [],
    sizeRes.ok ? sizeRes.json() : [],
  ])

  const map: Record<string, { flavour_ids: string[]; side_ids: string[]; addon_ids: string[]; sizes: { size_id: string; price: number }[] }> = {}

  const ensure = (id: string) => {
    if (!map[id]) map[id] = { flavour_ids: [], side_ids: [], addon_ids: [], sizes: [] }
  }

  for (const r of (flvs as { item_id: string; flavour_id: string }[])) { ensure(r.item_id); map[r.item_id].flavour_ids.push(r.flavour_id) }
  for (const r of (sides as { item_id: string; side_id: string }[])) { ensure(r.item_id); map[r.item_id].side_ids.push(r.side_id) }
  for (const r of (addons as { item_id: string; addon_id: string }[])) { ensure(r.item_id); map[r.item_id].addon_ids.push(r.addon_id) }
  for (const r of (sizes as { item_id: string; size_id: string; price: number }[])) { ensure(r.item_id); map[r.item_id].sizes.push({ size_id: r.size_id, price: r.price }) }

  return NextResponse.json(map)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { item_id, flavour_ids = [], side_ids = [], addon_ids = [], sizes = [] } = body
  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  // Delete existing then re-insert
  await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/item_flavours?item_id=eq.${item_id}`, { method: 'DELETE', headers: SB() }),
    fetch(`${SUPA_URL}/rest/v1/item_sides?item_id=eq.${item_id}`, { method: 'DELETE', headers: SB() }),
    fetch(`${SUPA_URL}/rest/v1/item_addons?item_id=eq.${item_id}`, { method: 'DELETE', headers: SB() }),
    fetch(`${SUPA_URL}/rest/v1/item_sizes?item_id=eq.${item_id}`, { method: 'DELETE', headers: SB() }),
  ])

  const inserts: Promise<Response>[] = []
  if (flavour_ids.length) inserts.push(fetch(`${SUPA_URL}/rest/v1/item_flavours`, { method: 'POST', headers: SB(), body: JSON.stringify(flavour_ids.map((f: string) => ({ item_id, flavour_id: f }))) }))
  if (side_ids.length)    inserts.push(fetch(`${SUPA_URL}/rest/v1/item_sides`,    { method: 'POST', headers: SB(), body: JSON.stringify(side_ids.map((s: string) => ({ item_id, side_id: s }))) }))
  if (addon_ids.length)   inserts.push(fetch(`${SUPA_URL}/rest/v1/item_addons`,   { method: 'POST', headers: SB(), body: JSON.stringify(addon_ids.map((a: string) => ({ item_id, addon_id: a }))) }))
  if (sizes.length)       inserts.push(fetch(`${SUPA_URL}/rest/v1/item_sizes`,    { method: 'POST', headers: SB(), body: JSON.stringify(sizes.map((s: { size_id: string; price: number }) => ({ item_id, size_id: s.size_id, price: s.price }))) }))
  await Promise.all(inserts)

  return NextResponse.json({ ok: true })
}

