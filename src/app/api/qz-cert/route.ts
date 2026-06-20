export const dynamic = 'force-dynamic'

export async function GET() {
  const cert = (process.env.QZ_CERT ?? '').replace(/\\\\n/g, '\\n')
  if (!cert) return new Response('', { status: 204 })
  return new Response(cert, {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' },
  })
}
