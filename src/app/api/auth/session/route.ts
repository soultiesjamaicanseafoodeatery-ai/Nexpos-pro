export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionStaffId } from '@/lib/utils/serverAuth'

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^﻿/, '')
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/^﻿/, '')
const SB = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' })

// Used on app startup to ask the server whether the browser's session cookie
// (if any) is still valid — the client must never treat a cached localStorage
// currentUser as proof of authentication on its own.
export async function GET(req: NextRequest) {
  const staffId = getSessionStaffId(req)
  if (!staffId) return NextResponse.json({ authenticated: false }, { status: 401 })

  const res = await fetch(
    `${SUPA_URL}/rest/v1/staff?id=eq.${encodeURIComponent(staffId)}&select=id,name,ini,role,color,allowed_modules,active,staff_id&limit=1`,
    { headers: SB() }
  )
  const rows = res.ok ? await res.json() : []
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row || !row.active) return NextResponse.json({ authenticated: false }, { status: 401 })

  return NextResponse.json({
    authenticated: true,
    user: {
      id: row.id, name: row.name, ini: row.ini, role: row.role, color: row.color,
      allowedModules: row.allowed_modules ?? ['restaurant'], active: row.active,
      staffId: row.staff_id ?? undefined,
    },
  })
}
