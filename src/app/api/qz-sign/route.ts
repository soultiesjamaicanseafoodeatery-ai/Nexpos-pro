export const dynamic = 'force-dynamic'

import { createSign, createPrivateKey } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionStaffId } from '@/lib/utils/serverAuth'

// Coarse allowlist for the app's own known domains — a secondary, defense-in-depth
// layer on top of the session check below (Origin/Referer are caller-supplied and
// spoofable by a non-browser client, but a spoofed header alone still can't produce
// a valid signed session cookie, so the two checks together are meaningfully
// stronger than either alone).
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  try {
    const host = new URL(origin).host
    if (host.endsWith('.soultiesseafoodjm.com')) return true
    if (host === 'nexpos-pro.vercel.app') return true
    if (host.endsWith('-soultiesseafood-s-projects.vercel.app')) return true
    const allowed = process.env.NEXT_PUBLIC_ALLOWED_HOST
    if (allowed && host === allowed) return true
    return false
  } catch { return false }
}

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

export async function POST(req: NextRequest) {
  try {
    // Signing format, payload, and QZ Tray behavior are unchanged below — the
    // only new behavior is rejecting callers with no valid POS session or an
    // unrecognized Origin, before any signing happens.
    if (!getSessionStaffId(req)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const origin = req.headers.get('origin') ?? req.headers.get('referer')
    if (!isAllowedOrigin(origin)) {
      return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
    }

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