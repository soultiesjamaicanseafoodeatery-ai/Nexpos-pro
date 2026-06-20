export const dynamic = 'force-dynamic'

import { createSign } from 'crypto'
import { NextResponse } from 'next/server'

const ALLOWED_ORIGINS = (process.env.NEXT_PUBLIC_APP_URL ?? '').split(',').map(o => o.trim()).filter(Boolean)

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? ''
  if (!origin) return false
  if (process.env.NODE_ENV === 'development') return true
  if (ALLOWED_ORIGINS.length === 0) {
    const host = req.headers.get('host') ?? ''
    return origin.includes(host)
  }
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const { data } = await req.json()
    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    const privateKey = process.env.QZ_PRIVATE_KEY
    if (!privateKey) {
      return NextResponse.json({ error: 'QZ_PRIVATE_KEY not configured' }, { status: 503 })
    }

    const sign = createSign('SHA512')
    sign.update(data)
    const signature = sign.sign(privateKey.replace(/\\n/g, '\n'), 'base64')
    return NextResponse.json({ signature })
  } catch (e) {
    console.error('[qz-sign]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
