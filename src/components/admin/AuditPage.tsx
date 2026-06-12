'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'

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

  const entries = state.audit.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false
    if (modFilter  !== 'all' && e.mod  !== modFilter)  return false
    if (search) {
      const q = search.toLowerCase()
      return e.action.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q) || e.user.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 15 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Audit Log</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{entries.length} entries</div>
        </div>
      </div>

      {/* Filters */}
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
    </div>
  )
}
