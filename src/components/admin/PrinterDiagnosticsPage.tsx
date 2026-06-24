'use client'

import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { qzConnect, qzIsConnected } from '@/lib/utils/qzTray'

interface DiagResult {
  ts: string
  label: string
  raw: unknown
  error?: { message: string; stack?: string; name?: string }
  duration?: number
}

type QZInstance = {
  websocket: { isActive: () => boolean }
  printers:  { find: (q?: string) => Promise<string | string[]>; details?: () => Promise<unknown> }
}

function getRawQZ(): QZInstance | null {
  if (typeof window === 'undefined') return null
  return ((window as unknown as Record<string, unknown>).qz as QZInstance) ?? null
}

export default function PrinterDiagnosticsPage() {
  const { state } = useApp()
  const { biz } = state

  const [connecting, setConnecting] = useState(false)
  const [results, setResults] = useState<DiagResult[]>([])

  const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const add = (r: DiagResult) => setResults(prev => [r, ...prev])

  const handleConnect = async () => {
    setConnecting(true)
    const t0 = Date.now()
    try {
      const ok = await qzConnect()
      add({ ts: ts(), label: 'Connect QZ', raw: { success: ok, isActive: qzIsConnected() }, duration: Date.now() - t0 })
    } catch (e: unknown) {
      const err = e as Error
      add({ ts: ts(), label: 'Connect QZ', raw: null, error: { name: err?.name, message: err?.message, stack: err?.stack }, duration: Date.now() - t0 })
    }
    setConnecting(false)
  }

  const handleRefreshPrinters = async () => {
    const t0 = Date.now()
    const qz = getRawQZ()
    if (!qz) {
      add({ ts: ts(), label: 'Refresh Printers', raw: null, error: { message: 'window.qz is null — QZ Tray script not loaded. Click Connect QZ first.' } })
      return
    }
    if (!qz.websocket.isActive()) {
      add({ ts: ts(), label: 'Refresh Printers', raw: null, error: { message: 'WebSocket not active — QZ Tray not connected. Click Connect QZ first.' } })
      return
    }
    try {
      const result = await qz.printers.find()
      const list = Array.isArray(result) ? result : (result ? [result] : [])
      add({
        ts: ts(), label: 'Refresh Printers',
        raw: { returnType: typeof result, isArray: Array.isArray(result), count: list.length, printers: list },
        duration: Date.now() - t0,
      })
    } catch (e: unknown) {
      const err = e as Error
      add({ ts: ts(), label: 'Refresh Printers', raw: null, error: { name: err?.name, message: err?.message, stack: err?.stack }, duration: Date.now() - t0 })
    }
  }

  const handleTestEnumeration = async () => {
    const t0 = Date.now()
    const qz = getRawQZ()
    if (!qz) {
      add({ ts: ts(), label: 'Test Enumeration', raw: null, error: { message: 'window.qz is null. Click Connect QZ first.' } })
      return
    }

    const tryCall = async (fn: () => Promise<unknown>): Promise<{ ok: boolean; value?: unknown; error?: string }> => {
      try { return { ok: true, value: await fn() } } catch (e: unknown) { return { ok: false, error: (e as Error)?.message } }
    }

    const [r1, r2, r3] = await Promise.all([
      tryCall(() => qz.printers.find()),
      tryCall(() => qz.printers.find('')),
      tryCall(() => qz.printers.details
        ? qz.printers.details()
        : Promise.reject(new Error('printers.details() does not exist on this QZ version'))
      ),
    ])

    const qzObj = getRawQZ() as unknown as Record<string, unknown>
    add({
      ts: ts(), label: 'Test Enumeration',
      raw: {
        'find()':             r1.ok ? r1.value : { ERROR: r1.error },
        'find(\'\')':         r2.ok ? r2.value : { ERROR: r2.error },
        'printers.details()': r3.ok ? r3.value : { ERROR: r3.error },
        'window.qz keys':     qzObj ? Object.keys(qzObj) : null,
        'printers keys':      qzObj?.printers ? Object.keys(qzObj.printers as object) : null,
        'websocket active':   qz.websocket.isActive(),
        'user agent':         typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      duration: Date.now() - t0,
    })
  }

  const connected = qzIsConnected()
  const qzLoaded  = typeof window !== 'undefined' && !!((window as unknown as Record<string, unknown>).qz)

  const Row = ({ label, value, mono = false, highlight }: { label: string; value: string; mono?: boolean; highlight?: string }) => (
    <div style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--bdr)', alignItems: 'flex-start' }}>
      <div style={{ width: 210, flexShrink: 0, fontSize: 12, color: 'var(--txt3)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: highlight ?? 'var(--txt)', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Printer Diagnostics</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 24 }}>Raw QZ Tray probe — no filtering or name modification applied</div>

        {/* Status panel */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 12 }}>Current State</div>
          <Row label="QZ Connection Status"      value={connected ? 'Connected' : 'Disconnected'}       highlight={connected ? 'var(--grn,#22c55e)' : 'var(--red,#ef4444)'} />
          <Row label="window.qz present"         value={qzLoaded  ? 'Yes — script loaded' : 'No — not loaded'} highlight={qzLoaded ? 'var(--grn,#22c55e)' : 'var(--red,#ef4444)'} />
          <Row label="Configured Receipt Printer" value={biz.printers?.receipt || '(not set)'}  mono />
          <Row label="Configured Kitchen Printer" value={biz.printers?.kitchen || '(not set)'}  mono />
          <Row label="Configured Bar Printer"     value={biz.printers?.bar     || '(not set)'}  mono />
          <Row label="Print Width"                value={`${biz.printers?.width ?? 80}mm`} />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{ padding: '10px 20px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: connecting ? 'not-allowed' : 'pointer', opacity: connecting ? .6 : 1 }}
          >
            {connecting ? 'Connecting...' : 'Connect QZ'}
          </button>
          <button
            onClick={handleRefreshPrinters}
            style={{ padding: '10px 20px', borderRadius: 'var(--r)', background: 'var(--grn)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Refresh Printers
          </button>
          <button
            onClick={handleTestEnumeration}
            style={{ padding: '10px 20px', borderRadius: 'var(--r)', background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Test Enumeration
          </button>
        </div>

        {/* Results log */}
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
                  <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                    {r.ts}{r.duration !== undefined ? ` · ${r.duration}ms` : ''}
                  </span>
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
