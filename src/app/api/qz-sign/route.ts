export const dynamic = 'force-dynamic'

import { createSign, createPrivateKey } from 'crypto'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { data } = await req.json()
    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    const rawKey = process.env.QZ_PRIVATE_KEY
    if (!rawKey) {
      return NextResponse.json({ error: 'QZ_PRIVATE_KEY not configured in Vercel env vars' }, { status: 503 })
    }

    const privateKey = createPrivateKey(rawKey.replace(/\\n/g, '\n'))
    const sign = createSign('SHA512')
    sign.update(data)
    const signature = sign.sign(privateKey, 'base64')
    return NextResponse.json({ signature })
  } catch (e) {
    console.error('[qz-sign]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}