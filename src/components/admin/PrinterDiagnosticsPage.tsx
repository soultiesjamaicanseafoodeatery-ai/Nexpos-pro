'use client'

import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { qzConnect, qzIsConnected } from '@/lib/utils/qzTray'

interface DiagResult {
  ts: string
  label: string
  raw: unknown
  error?: { name?: string; message: string; stack?: string }
  duration?: number
}

function getWindowQZ(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { qz?: Record<string, unknown> }
  return w.qz ?? null
}

function errObj(e: unknown): { name?: string; message: string; stack?: string } {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack }
  return { message: String(e) }
}

async function safeCall(fn: () => Promise<unknown>): Promise<unknown> {
  try { return await fn() } catch (e) { return { ERROR: e instanceof Error ? e.message : String(e) } }
}

export default function PrinterDiagnosticsPage() {
  const { state } = useApp()
  const { biz } = state

  const [connecting, setConnecting] = useState(false)
  const [results, setResults] = useState<DiagResult[]>([])

  const nowTs = () =>
    new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const addResult = (r: DiagResult) => setResults(prev => [r, ...prev])

  const handleConnect = async () => {
    setConnecting(true)
    const t0 = Date.now()
    try {
      const ok = await qzConnect()
      addResult({ ts: nowTs(), label: 'Connect QZ', raw: { success: ok, isActive: qzIsConnected() }, duration: Date.now() - t0 })
    } catch (e) {
      addResult({ ts: nowTs(), label: 'Connect QZ', raw: null, error: errObj(e), duration: Date.now() - t0 })
    }
    setConnecting(false)
  }

  const handleRefreshPrinters = async () => {
    const t0 = Date.now()
    const qz = getWindowQZ()
    if (!qz) {
      addResult({ ts: nowTs(), label: 'Refresh Printers', raw: null, error: { message: 'window.qz is null — QZ Tray script not loaded. Click Connect QZ first.' } })
      return
    }
    const ws = qz['websocket'] as { isActive?: () => boolean } | undefined
    if (!ws?.isActive?.()) {
      addResult({ ts: nowTs(), label: 'Refresh Printers', raw: null, error: { message: 'WebSocket not active — QZ Tray not connected. Click Connect QZ first.' } })
      return
    }
    try {
      const printers = qz['printers'] as { find?: (q?: string) => Promise<string | string[]> } | undefined
      if (typeof printers?.find !== 'function') throw new Error('qz.printers.find is not a function')
      const result = await printers.find()
      const list: string[] = Array.isArray(result) ? result : (result ? [result] : [])
      addResult({
        ts: nowTs(), label: 'Refresh Printers',
        raw: { returnType: typeof result, isArray: Array.isArray(result), count: list.length, printers: list },
        duration: Date.now() - t0,
      })
    } catch (e) {
      addResult({ ts: nowTs(), label: 'Refresh Printers', raw: null, error: errObj(e), duration: Date.now() - t0 })
    }
  }

  const handleTestEnumeration = async () => {
    const t0 = Date.now()
    const qz = getWindowQZ()
    if (!qz) {
      addResult({ ts: nowTs(), label: 'Test Enumeration', raw: null, error: { message: 'window.qz is null. Click Connect QZ first.' } })
      return
    }

    const qzPrinters = qz['printers'] as Record<string, unknown> | undefined
    const findFn = qzPrinters?.['find']
    const detailsFn = qzPrinters?.['details']
    const ws = qz['websocket'] as { isActive?: () => boolean } | undefined

    const [r1, r2, r3] = await Promise.all([
      safeCall(async () => {
        if (typeof findFn !== 'function') throw new Error('qz.printers.find is not a function')
        return (findFn as () => Promise<unknown>)()
      }),
      safeCall(async () => {
        if (typeof findFn !== 'function') throw new Error('qz.printers.find is not a function')
        return (findFn as (q: string) => Promise<unknown>)('')
      }),
      safeCall(async () => {
        if (typeof detailsFn !== 'function') throw new Error('qz.printers.details() does not exist on this QZ version')
        return (detailsFn as () => Promise<unknown>)()
      }),
    ])

    addResult({
      ts: nowTs(), label: 'Test Enumeration',
      raw: {
        'find()':             r1,
        "find('')":           r2,
        'printers.details()': r3,
        'window.qz keys':     Object.keys(qz),
        'printers keys':      qzPrinters ? Object.keys(qzPrinters) : null,
        'websocket active':   ws?.isActive?.() ?? false,
        'user agent':         typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      duration: Date.now() - t0,
    })
  }

  const connected = qzIsConnected()
  const qzLoaded  = typeof window !== 'undefined' && !!(window as unknown as { qz?: unknown }).qz

  const rows: [string, string, string, boolean][] = [
    ['QZ Connection Status',      connected ? 'Connected' : 'Disconnected',           connected ? 'var(--grn,#22c55e)' : 'var(--red,#ef4444)', false],
    ['window.qz present',         qzLoaded  ? 'Yes — script loaded' : 'No — not loaded', qzLoaded ? 'var(--grn,#22c55e)' : 'var(--red,#ef4444)', false],
    ['Configured Receipt Printer', biz.printers?.receipt || '(not set)',               'var(--txt)', true],
    ['Configured Kitchen Printer', biz.printers?.kitchen || '(not set)',               'var(--txt)', true],
    ['Configured Bar Printer',     biz.printers?.bar     || '(not set)',               'var(--txt)', true],
    ['Print Width',                `${biz.printers?.width ?? 80}mm`,                  'var(--txt)', false],
  ]

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Printer Diagnostics</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 24 }}>Raw QZ Tray probe — no filtering or name modification applied</div>

        {/* Status */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 12 }}>Current State</div>
          {rows.map(([label, value, color, mono]) => (
            <div key={label} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--bdr)', alignItems: 'flex-start' }}>
              <div style={{ width: 210, flexShrink: 0, fontSize: 12, color: 'var(--txt3)', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 12, color, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={handleConnect} disabled={connecting} style={{ padding: '10px 20px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: connecting ? 'not-allowed' : 'pointer', opacity: connecting ? .6 : 1 }}>
            {connecting ? 'Connecting...' : 'Connect QZ'}
          </button>
          <button onClick={handleRefreshPrinters} style={{ padding: '10px 20px', borderRadius: 'var(--r)', background: 'var(--grn)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Refresh Printers
          </button>
          <button onClick={handleTestEnumeration} style={{ padding: '10px 20px', borderRadius: 'var(--r)', background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Test Enumeration
          </button>
        </div>

        {/* Results */}
        {results.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--txt3)', fontSize: 13, background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)' }}>
            Click a button above to run diagnostics. Results appear here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map((r, i) => (
              <div key={i} style={{ background: 'var(--bg2)', border: `1px solid ${r.error ? 'var(--red,#ef4444)' : 'var(--bdr)'}`, borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: r.error ? 'rgba(239,68,68,.08)' : 'var(--surf2)', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.error ? 'var(--red,#ef4444)' : 'var(--grn,#22c55e)' }}>
                    {r.error ? 'FAIL' : 'OK'} — {r.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{r.ts}{r.duration !== undefined ? ` · ${r.duration}ms` : ''}</span>
                </div>
                {r.error && (
                  <div style={{ padding: 16, borderBottom: '1px solid var(--bdr)', background: 'rgba(239,68,68,.04)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--red,#ef4444)', marginBottom: 6 }}>
                      {r.error.name ? `${r.error.name}: ` : ''}{r.error.message}
                    </div>
                    {r.error.stack && (
                      <pre style={{ fontSize: 10, color: 'var(--txt3)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: 'monospace', lineHeight: 1.5 }}>
                        {r.error.stack}
                      </pre>
                    )}
                  </div>
                )}
                <pre style={{ margin: 0, padding: 16, fontSize: 11, color: 'var(--txt2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', lineHeight: 1.6 }}>
                  {JSON.stringify(r.raw, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
