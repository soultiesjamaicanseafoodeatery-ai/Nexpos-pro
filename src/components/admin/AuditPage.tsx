'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { NO_SALE_REASON_LABELS } from '@/types'

const TYPE_COLOR: Record<string, string> = {
  info:    'var(--blue)',
  warn:    'var(--ora)',
  error:   'var(--red,#ef4444)',
  success: 'var(--grn)',
}
const TYPE_BG: Record<string, string> = {
  info:    '#1e3a5f22',
  warn:    '#78350f22',
  error:   '#7f1d1d22',
  success: '#14532d22',
}

export default function AuditPage() {
  const { state } = useApp()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modFilter, setModFilter]   = useState('all')
  const [view, setView] = useState<'audit' | 'nosale'>('audit')

  const noSaleLogs = (state as any).noSaleLogs ?? []

  const entries = state.audit.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false
    if (modFilter  !== 'all' && e.mod  !== modFilter)  return false
    if (search) {
      const q = search.toLowerCase()
      return e.action.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q) || e.user.toLowerCase().includes(q)
    }
    return true
  })

  const exportCSV = () => {
    const headers = ['Timestamp', 'Type', 'Module', 'User', 'Action', 'Detail']
    const rows = entries.map(e => [
      e.ts ?? '',
      e.type ?? '',
      e.mod ?? '',
      e.user ?? '',
      e.action ?? '',
      String(e.detail ?? '').replace(/"/g, '""'),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportNoSaleCSV = () => {
    const headers = ['Timestamp', 'Reason', 'Requested By', 'Approved By', 'Drawer Opened', 'Module']
    const rows = noSaleLogs.map((e: any) => [
      e.ts ?? '',
      NO_SALE_REASON_LABELS[e.reason] ?? e.reason ?? '',
      e.requestedBy ?? '',
      e.approvedBy ?? '',
      e.drawerOpened ? 'Yes' : 'No',
      e.mod ?? '',
    ])
    const csv = [headers, ...rows].map(r => r.map((v: string) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `no-sale-log-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reasonCounts = Object.keys(NO_SALE_REASON_LABELS).map(r => ({
    reason: r,
    label: NO_SALE_REASON_LABELS[r as keyof typeof NO_SALE_REASON_LABELS],
    count: noSaleLogs.filter((e: any) => e.reason === r).length,
  })).filter(x => x.count > 0)

  const TAB: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', border: '1.5px solid transparent',
  }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 15 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Audit Log</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => setView('audit')} style={{
              ...TAB,
              background: view === 'audit' ? 'var(--blue)' : 'transparent',
              color: view === 'audit' ? '#fff' : 'var(--txt3)',
              border: view === 'audit' ? '1.5px solid transparent' : '1.5px solid var(--bdr)',
            }}>Audit Log</button>
            <button onClick={() => setView('nosale')} style={{
              ...TAB,
              background: view === 'nosale' ? 'var(--ora)' : 'transparent',
              color: view === 'nosale' ? '#fff' : 'var(--txt3)',
              border: view === 'nosale' ? '1.5px solid transparent' : '1.5px solid var(--bdr)',
            }}>No Sale</button>
          </div>
        </div>
        {view === 'audit' && (
          <button onClick={exportCSV} style={{
            padding: '7px 14px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700,
            background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer',
          }}>Export CSV</button>
        )}
        {view === 'nosale' && noSaleLogs.length > 0 && (
          <button onClick={exportNoSaleCSV} style={{
            padding: '7px 14px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700,
            background: 'var(--ora)', color: '#fff', border: 'none', cursor: 'pointer',
          }}>Export CSV</button>
        )}
      </div>

      {/* ── Audit view ── */}
      {view === 'audit' && (
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', marginBottom: 13 }}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search action, detail, user…"
              style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '6px 10px', fontSize: 12, color: 'var(--txt)', width: 220 }} />

            {['all','info','warn','error','success'].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${typeFilter === t ? 'transparent' : 'var(--bdr)'}`,
                background: typeFilter === t ? (t === 'all' ? 'var(--blue)' : TYPE_COLOR[t]) : 'transparent',
                color: typeFilter === t ? '#fff' : 'var(--txt3)',
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}

            <select value={modFilter} onChange={e => setModFilter(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '5px 8px', fontSize: 12, color: 'var(--txt)' }}>
              <option value="all">All Modules</option>
              <option value="restaurant">Restaurant</option>
              <option value="bar">Bar</option>
              <option value="carwash">Car Wash</option>
            </select>
          </div>

          {entries.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
              No audit entries yet — actions taken in the POS will appear here.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                    {['Time','Type','Module','User','Action','Detail'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--bdr2)', verticalAlign: 'top' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>{e.ts}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: TYPE_BG[e.type], color: TYPE_COLOR[e.type], textTransform: 'uppercase' }}>{e.type}</span>
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', textTransform: 'capitalize' }}>{e.mod}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.user}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt)', fontWeight: 700 }}>{e.action}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', maxWidth: 320 }}>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── No Sale view ── */}
      {view === 'nosale' && (
        <div>
          {/* Reason breakdown */}
          {reasonCounts.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {reasonCounts.map(r => (
                <div key={r.reason} style={{
                  background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)',
                  padding: '10px 16px', minWidth: 120, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ora)' }}>{r.count}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{r.label}</div>
                </div>
              ))}
              <div style={{
                background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)',
                padding: '10px 16px', minWidth: 120, textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt)' }}>{noSaleLogs.length}</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>Total</div>
              </div>
            </div>
          )}

          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            {noSaleLogs.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                No No Sale events recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                      {['Time','Reason','Requested By','Approved By','Module'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {noSaleLogs.map((e: any) => (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--bdr2)', verticalAlign: 'top' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--txt3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>{e.ts}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--txt)', fontWeight: 700 }}>
                          {NO_SALE_REASON_LABELS[e.reason as keyof typeof NO_SALE_REASON_LABELS] ?? e.reason}
                          {e.reasonText && <div style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 400 }}>{e.reasonText}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--txt2)', fontWeight: 600 }}>{e.requestedBy}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--txt2)' }}>{e.approvedBy}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--txt3)', textTransform: 'capitalize' }}>{e.mod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}