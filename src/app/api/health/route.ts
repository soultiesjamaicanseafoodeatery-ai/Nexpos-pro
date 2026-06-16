import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  const pub_url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const pub_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Test Supabase connection if we have credentials
  let supabaseStatus = 'not tested'
  const effectiveUrl = url || pub_url
  const effectiveKey = key || pub_key
  if (effectiveUrl && effectiveKey) {
    try {
      const r = await fetch(`${effectiveUrl}/rest/v1/menu_items?select=id&limit=1`, {
        headers: { apikey: effectiveKey, Authorization: `Bearer ${effectiveKey}` }
      })
      supabaseStatus = r.ok ? `ok (${r.status})` : `error (${r.status})`
    } catch (e) {
      supabaseStatus = `fetch error: ${String(e)}`
    }
  }

  return NextResponse.json({
    SUPABASE_URL: url ? 'set' : 'missing',
    SUPABASE_ANON_KEY: key ? 'set' : 'missing',
    NEXT_PUBLIC_SUPABASE_URL: pub_url ? 'set' : 'missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: pub_key ? 'set' : 'missing',
    effectiveUrl: effectiveUrl ? effectiveUrl.substring(0, 30) + '...' : 'none',
    supabaseStatus,
  })
}
