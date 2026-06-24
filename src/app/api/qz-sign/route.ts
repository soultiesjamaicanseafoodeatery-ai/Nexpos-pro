export const dynamic = 'force-dynamic'

import { createSign } from 'crypto'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { data } = await req.json()
    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    const privateKey = process.env.QZ_PRIVATE_KEY
    if (!privateKey) {
      return NextResponse.json({ error: 'QZ_PRIVATE_KEY not configured in Vercel env vars' }, { status: 503 })
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