export const dynamic = 'force-dynamic'

import { createSign, createPrivateKey } from 'crypto'
import { NextResponse } from 'next/server'

function normalizePem(raw: string): string {
  // Convert literal \n sequences (common when pasting into Vercel dashboard)
  let pem = raw.replace(/\\n/g, '\n').trim()

  // Extract type and base64 body, then reassemble with correct line breaks
  const m = pem.match(/-----BEGIN ([^-]+)-----\s*([\s\S]+?)\s*-----END \1-----/)
  if (m) {
    const type = m[1]
    const b64 = m[2].replace(/\s+/g, '')
    const lines = (b64.match(/.{1,64}/g) ?? []).join('\n')
    pem = `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----\n`
  }

  return pem
}

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

    const pem = normalizePem(rawKey)
    const privateKey = createPrivateKey(pem)
    const sign = createSign('SHA512')
    sign.update(data)
    const signature = sign.sign(privateKey, 'base64')
    return NextResponse.json({ signature })
  } catch (e) {
    const msg = String(e)
    const rawKey = process.env.QZ_PRIVATE_KEY ?? ''
    const debug = {
      keyLength: rawKey.length,
      hasLiteralNewlines: rawKey.includes('\\n'),
      hasActualNewlines: rawKey.includes('\n'),
      startsWithDash: rawKey.trimStart().startsWith('-----'),
      firstChars: rawKey.substring(0, 27),
    }
    console.error('[qz-sign]', msg, debug)
    return NextResponse.json({ error: msg, debug }, { status: 500 })
  }
}