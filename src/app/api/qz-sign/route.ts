export const dynamic = 'force-dynamic'

import { createSign, createPrivateKey } from 'crypto'
import { NextResponse } from 'next/server'

function normalizePem(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').trim()

  if (!pem.startsWith('-----BEGIN')) {
    // Stored without PEM headers — wrap as PKCS#8 private key
    const b64 = pem.replace(/\s+/g, '')
    const lines = (b64.match(/.{1,64}/g) ?? []).join('\n')
    return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`
  }

  // Reconstruct with proper 64-char line breaks (handles single-line PEM)
  const m = pem.match(/-----BEGIN ([^-]+)-----\s*([\s\S]+?)\s*-----END \1-----/)
  if (m) {
    const type = m[1]
    const b64 = m[2].replace(/\s+/g, '')
    const lines = (b64.match(/.{1,64}/g) ?? []).join('\n')
    return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----\n`
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
    console.error('[qz-sign]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}