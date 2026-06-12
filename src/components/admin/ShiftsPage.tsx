'use client'
import { useApp } from '@/lib/hooks/useAppStore'

function duration(start: string, end: string | null) {
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const mins = Math.round((e - s) / 60000)
  if (isNaN(mins)) return '—'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function ShiftsPage() {
  const { state } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const shifts = [...state.shifts].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  const active = state.currentShift

  const totalRevenue = shifts.filter(s => s.end).reduce((sum, s) => sum + s.revenue, 0)

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Shifts</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
          {shifts.length} recorded · {fmt(totalRevenue)} total revenue
        </div>
      </div>

      {/* Active shift card */}
      {active && (
        <div style={{ background: '#14532d22', border: '1.5px solid var(--grn)', borderRadius: 'var(--r3)', padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--grn)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Active Shift</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{active.userName}</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2, textTransform: 'capitalize' }}>{active.role} · {active.modules.join(', ')}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Started</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{new Date(active.start).toLocaleTimeString()}</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{duration(active.start, null)} ago</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Transactions</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{active.txCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Revenue</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--grn)' }}>{fmt(active.revenue)}</div>
          </div>
        </div>
      )}

      {/* Shift history */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        {shifts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No shifts recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                  {['Staff','Role','Modules','Start','End','Duration','Transactions','Revenue'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shifts.map(s => {
                  const isActive = !s.end
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--txt)' }}>{s.userName}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', textTransform: 'capitalize' }}>{s.role}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)' }}>{s.modules.join(', ')}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {new Date(s.start).toLocaleString()}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {isActive ? <span style={{ color: 'var(--grn)', fontWeight: 700 }}>Active</span> : new Date(s.end!).toLocaleString()}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt2)', fontFamily: 'var(--mono)' }}>{duration(s.start, s.end)}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt)', fontWeight: 700, textAlign: 'center' }}>{s.txCount}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--grn)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(s.revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
