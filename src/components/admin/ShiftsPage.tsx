'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import EODWizard from './EODWizard'
import type { Transaction } from '@/types'

function duration(start: string, end: string | null) {
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const mins = Math.round((e - s) / 60000)
  if (isNaN(mins)) return '—'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function isCashTx(tx: Transaction) {
  if (tx.voided) return false
  if (tx.payments && tx.payments.length > 0)
    return tx.payments.some(p => p.method.toLowerCase().includes('cash'))
  return tx.pay.toLowerCase().includes('cash')
}

function cashAmount(tx: Transaction) {
  if (tx.payments && tx.payments.length > 0)
    return tx.payments.filter(p => p.method.toLowerCase().includes('cash')).reduce((s, p) => s + p.amount, 0)
  return tx.total
}

function sameDay(ts: string, isoDate: string) {
  try {
    const txDate = new Date(ts)
    const ref    = new Date(isoDate)
    return txDate.getFullYear() === ref.getFullYear() &&
           txDate.getMonth()    === ref.getMonth()    &&
           txDate.getDate()     === ref.getDate()
  } catch { return false }
}

function txDateKey(ts: string) {
  try { return new Date(ts).toISOString().slice(0, 10) } catch { return ts }
}

interface StatCardProps { label: string; value: string; sub?: string; color: string }
function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function ShiftsPage() {
  const { state } = useApp()
  const user = state.currentUser
  const isStaff = user?.role === 'staff'
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const todayStr = new Date().toISOString().slice(0, 10)
  const [showEOD, setShowEOD] = useState(false)
  const [eodDate,      setEodDate]      = useState(todayStr)
  const [openingFloat, setOpeningFloat] = useState('')
  const [actualCash,   setActualCash]   = useState('')

  // ── Admin/Manager: shift records ──────────────────────────────
  const allShifts    = [...state.shifts].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  const totalRevenue = allShifts.filter(s => s.end).reduce((sum, s) => sum + s.revenue, 0)

  // ── Staff: transaction-based activity ─────────────────────────
  // Staff joining an open shift don't get a Shift record — their work lives in transactions
  const myAllTxs = isStaff && user
    ? [...state.transactions]
        .filter(tx => !tx.voided && tx.userId === user.id)
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    : []
  const myTodayTxs = myAllTxs.filter(tx => sameDay(tx.ts, todayStr))
  const myTodayRevenue = myTodayTxs.reduce((s, tx) => s + tx.total, 0)

  // Group all my transactions by date for history table
  const myDayMap: Record<string, { count: number; revenue: number }> = {}
  for (const tx of myAllTxs) {
    const key = txDateKey(tx.ts)
    if (!myDayMap[key]) myDayMap[key] = { count: 0, revenue: 0 }
    myDayMap[key].count++
    myDayMap[key].revenue += tx.total
  }
  const myDays = Object.entries(myDayMap).sort((a, b) => b[0].localeCompare(a[0]))

  // ── EOD calculations (admin/manager only) ─────────────────────
  const dayTxs    = state.transactions.filter(tx => sameDay(tx.ts, eodDate))
  const cashTxs   = dayTxs.filter(isCashTx)
  const cashSales  = cashTxs.reduce((s, tx) => s + cashAmount(tx), 0)
  const cardSales  = dayTxs.filter(tx => !tx.voided && !isCashTx(tx)).reduce((s, tx) => s + tx.total, 0)
  const totalSales = dayTxs.filter(tx => !tx.voided).reduce((s, tx) => s + tx.total, 0)
  const floatNum   = parseFloat(openingFloat) || 0
  const actualNum  = parseFloat(actualCash)   || 0
  const expected   = floatNum + cashSales
  const overShort  = actualCash.trim() ? actualNum - expected : null

  const overShortColor = overShort === null ? 'var(--txt3)'
    : overShort === 0  ? 'var(--grn)'
    : '#ef4444'

  // ── Staff view ────────────────────────────────────────────────
  if (isStaff && user) {
    return (
      <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>My Shift</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>Activity tracked per transaction</div>
        </div>

        {/* Active session card */}
        <div style={{ background: '#14532d22', border: '1.5px solid var(--grn)', borderRadius: 'var(--r3)', padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--grn)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Session Active</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2, textTransform: 'capitalize' }}>
              {user.role} · {user.allowedModules.join(', ')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Today&apos;s Transactions</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{myTodayTxs.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Today&apos;s Revenue</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--grn)' }}>{fmt(myTodayRevenue)}</div>
          </div>
        </div>

        {/* My activity by day */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)', marginBottom: 8 }}>My Activity</div>
        </div>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
          {myDays.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
              No transactions recorded yet for your account.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                    {['Date', 'Transactions', 'Revenue'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myDays.map(([date, data]) => (
                    <tr key={date} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt)', fontWeight: 700, textAlign: 'center' }}>{data.count}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--grn)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(data.revenue)}</td>
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

  // ── Admin / Manager view (unchanged) ─────────────────────────
  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>

      {/* Page header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Shifts</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
          {allShifts.length} recorded · {fmt(totalRevenue)} total revenue
        </div>
      </div>

      {/* Active shift */}
      {state.currentShift && (
        <div style={{ background: '#14532d22', border: '1.5px solid var(--grn)', borderRadius: 'var(--r3)', padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--grn)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Active Shift</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{state.currentShift.userName}</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2, textTransform: 'capitalize' }}>{state.currentShift.role} · {state.currentShift.modules.join(', ')}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Started</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{new Date(state.currentShift.start).toLocaleTimeString()}</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{duration(state.currentShift.start, null)} ago</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Transactions</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{state.currentShift.txCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Revenue</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--grn)' }}>{fmt(state.currentShift.revenue)}</div>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowEOD(true)}
        style={{
          background: 'var(--grn)', color: '#fff', border: 'none',
          borderRadius: 'var(--r2)', padding: '12px 22px',
          fontWeight: 700, fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 16, minHeight: 44,
        }}
      >
        📋 Start End of Day
      </button>

      {showEOD && <EODWizard onClose={() => setShowEOD(false)} />}

      {/* ── EOD Cash Reconciliation ───────────────────────────── */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', marginBottom: 18 }}>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>EOD Cash Reconciliation</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
              {dayTxs.length} transactions on {new Date(eodDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <input
            type="date"
            value={eodDate}
            onChange={e => setEodDate(e.target.value)}
            style={{
              background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)',
              padding: '6px 10px', fontSize: 12, color: 'var(--txt)', cursor: 'pointer',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--bdr)' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
              Opening Float (cash in drawer at start)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--txt3)', flexShrink: 0 }}>{sym}</span>
              <input
                type="number" min={0} step={0.01}
                value={openingFloat}
                onChange={e => setOpeningFloat(e.target.value)}
                placeholder="0.00"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 700,
                  border: `1.5px solid ${openingFloat ? 'var(--blue)' : 'var(--bdr)'}`,
                  background: 'var(--bg3)', color: 'var(--txt)',
                }}
              />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
              Actual Cash Counted (physical count)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--txt3)', flexShrink: 0 }}>{sym}</span>
              <input
                type="number" min={0} step={0.01}
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                placeholder="0.00"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 700,
                  border: `1.5px solid ${actualCash ? 'var(--grn)' : 'var(--bdr)'}`,
                  background: 'var(--bg3)', color: 'var(--txt)',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bdr)' }}>
          <StatCard label="Total Sales (all methods)"  value={fmt(totalSales)}  color="var(--txt)"  sub={`${dayTxs.filter(t=>!t.voided).length} transactions`} />
          <StatCard label="Card / Other Sales"         value={fmt(cardSales)}   color="var(--blue)" sub={`${dayTxs.filter(t=>!t.voided && !isCashTx(t)).length} transactions`} />
          <StatCard label="Cash Sales"                 value={fmt(cashSales)}   color="var(--ora)"  sub={`${cashTxs.length} cash transactions`} />
          <StatCard label="Expected Cash in Drawer"    value={fmt(expected)}    color="var(--pur)"  sub={`Float ${fmt(floatNum)} + Cash ${fmt(cashSales)}`} />
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>
              Over / Short
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
              {overShort === null
                ? 'Enter actual cash counted above to see variance'
                : overShort === 0
                  ? 'Drawer balanced perfectly'
                  : overShort > 0
                    ? `Drawer is over by ${fmt(overShort)} — extra cash in drawer`
                    : `Drawer is short by ${fmt(Math.abs(overShort))} — missing cash`}
            </div>
          </div>
          <div style={{
            fontSize: 24, fontWeight: 900, fontFamily: 'var(--mono)', color: overShortColor,
            background: overShort === null ? 'var(--bg3)' : overShort === 0 ? '#14532d22' : '#7f1d1d22',
            border: `2px solid ${overShortColor}44`,
            borderRadius: 'var(--r3)', padding: '8px 18px', whiteSpace: 'nowrap',
          }}>
            {overShort === null ? '—'
              : overShort === 0  ? 'BALANCED'
              : overShort > 0    ? `+${fmt(overShort)}`
              :                    `-${fmt(Math.abs(overShort))}`}
          </div>
        </div>

        <div style={{ padding: '12px 16px 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
            Cash Transactions ({cashTxs.length})
          </div>
          {cashTxs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--txt3)', padding: '10px 0 12px', textAlign: 'center' }}>
              No cash transactions on this date
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)' }}>
                    {['Time', 'Cashier', 'Items', 'Total', 'Cash Received'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cashTxs.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--txt3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{tx.ts.split(',')[1]?.trim() ?? tx.ts}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--txt2)', fontWeight: 600 }}>{tx.cashier}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--txt2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.item}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--grn)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(tx.total)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--ora)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(cashAmount(tx))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--bdr)' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', fontWeight: 700, color: 'var(--txt3)', fontSize: 11 }}>TOTAL</td>
                    <td style={{ padding: '7px 8px', fontWeight: 800, color: 'var(--grn)', fontFamily: 'var(--mono)' }}>{fmt(cashTxs.reduce((s,t)=>s+t.total,0))}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 800, color: 'var(--ora)', fontFamily: 'var(--mono)' }}>{fmt(cashSales)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Shift History ─────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)', marginBottom: 8 }}>Shift History</div>
      </div>
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        {allShifts.length === 0 ? (
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
                {allShifts.map(s => {
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
