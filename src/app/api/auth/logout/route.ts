export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/utils/session'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}
