'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { VoidLog } from '@/types'
import { VOID_REASON_LABELS } from '@/types'

const MOD_COLOR: Record<string, string> = { restaurant: 'var(--ora)', bar: 'var(--pur)', carwash: 'var(--blue)', mixed: 'var(--txt3)' }

function fmt(n: number, sym: string) {
  return sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isToday(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function isThisWeek(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)
  return d >= weekStart
}

export default function VoidReport() {
  const { state } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const logs = state.voidLogs ?? []

  const [rangeFilter, setRangeFilter] = useState<'today' | 'week' | 'all'>('today')
  const [typeFilter,  setTypeFilter]  = useState<'all' | 'item' | 'order' | 'transaction'>('all')
  const [search,      setSearch]      = useState('')

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (rangeFilter === 'today' && !isToday(l.ts))     return false
      if (rangeFilter === 'week'  && !isThisWeek(l.ts))  return false
      if (typeFilter !== 'all'    && l.voidType !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (l.itemName ?? '').toLowerCase().includes(q)
          || l.user.toLowerCase().includes(q)
          || (l.orderNum ?? '').includes(q)
          || VOID_REASON_LABELS[l.reason].toLowerCase().includes(q)
      }
      return true
    })
  }, [logs, rangeFilter, typeFilter, search])

  // Summary cards data
  const todayLogs  = logs.filter(l => isToday(l.ts))
  const weekLogs   = logs.filter(l => isThisWeek(l.ts))

  const todayCount  = todayLogs.length
  const todayAmount = todayLogs.reduce((s, l) => s + l.amount, 0)
  const weekCount   = weekLogs.length
  const weekAmount  = weekLogs.reduce((s, l) => s + l.amount, 0)

  // By employee (filtered range)
  const byEmployee = useMemo(() => {
    const rangeLog = rangeFilter === 'today' ? todayLogs : rangeFilter === 'week' ? weekLogs : logs
    const map: Record<string, { count: number; amount: number; role: string }> = {}
    for (const l of rangeLog) {
      if (!map[l.user]) map[l.user] = { count: 0, amount: 0, role: l.role }
      map[l.user].count++
      map[l.user].amount += l.amount
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count)
  }, [logs, rangeFilter])

  // By reason (filtered range)
  const byReason = useMemo(() => {
    const rangeLog = rangeFilter === 'today' ? todayLogs : rangeFilter === 'week' ? weekLogs : logs
    const map: Record<string, number> = {}
    for (const l of rangeLog) {
      const label = VOID_REASON_LABELS[l.reason]
      map[label] = (map[label] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [logs, rangeFilter])

  const totalFiltered = filtered.reduce((s, l) => s + l.amount, 0)

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Void Report</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{logs.length} total void events recorded</div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Today — Count',  value: String(todayCount),        sub: fmt(todayAmount, sym) },
          { label: 'Today — Amount', value: fmt(todayAmount, sym),     sub: `${todayCount} voids` },
          { label: 'This Week',      value: String(weekCount),          sub: fmt(weekAmount, sym) },
          { label: 'Week Amount',    value: fmt(weekAmount, sym),       sub: `${weekCount} voids` },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', fontFamily: 'var(--mono)' }}>{card.value}</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        {/* By Employee */}
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Voids by Employee</div>
          {byEmployee.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No data for this period</div>
          ) : byEmployee.map(([name, data]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surf3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--txt)', flexShrink: 0 }}>
                {name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{name}</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{data.role}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ef4444' }}>{data.count} voids</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{fmt(data.amount, sym)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* By Reason */}
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Most Common Reasons</div>
          {byReason.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No data for this period</div>
          ) : byReason.map(([reason, count], i) => {
            const maxCount = byReason[0][1]
            const pct = Math.round((count / maxCount) * 100)
            return (
              <div key={reason} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: i === 0 ? '#ef4444' : 'var(--txt2)', fontWeight: i === 0 ? 700 : 500 }}>{reason}</span>
                  <span style={{ color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{count}×</span>
                </div>
                <div style={{ height: 4, background: 'var(--surf3)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? '#ef4444' : 'var(--txt3)', borderRadius: 2 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters + log table */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', marginRight: 4 }}>Void Log</span>

          {(['today','week','all'] as const).map(r => (
            <button key={r} onClick={() => setRangeFilter(r)}
              className={`btn btn-sm ${rangeFilter === r ? 'btn-pr' : 'btn-gh'}`}>
              {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'All Time'}
            </button>
          ))}

          <div style={{ width: 1, height: 18, background: 'var(--bdr)', margin: '0 2px' }} />

          {(['all','item','order','transaction'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`btn btn-sm ${typeFilter === t ? 'btn-pr' : 'btn-gh'}`}>
              {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)', background: 'var(--bg3)', color: 'var(--txt)', fontSize: 12, width: 180 }} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No void records for this filter</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Type</th>
                    <th>Order #</th>
                    <th>Item</th>
                    <th>Reason</th>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Module</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l: VoidLog) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 11, color: 'var(--txt3)' }}>{l.ts}</td>
                      <td>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: '#7f1d1d33', color: '#ef4444', textTransform: 'capitalize' }}>
                          {l.voidType}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{l.orderNum ? `#${l.orderNum}` : l.txId ? `Tx#${l.txId}` : '—'}</td>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.itemName ?? '—'}</td>
                      <td>
                        <span title={l.reasonText}>{VOID_REASON_LABELS[l.reason]}</span>
                        {l.reasonText && l.reason === 'other' && (
                          <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 4 }}>({l.reasonText})</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>{l.user}</td>
                      <td style={{ fontSize: 11, color: 'var(--txt3)', textTransform: 'capitalize' }}>{l.role}</td>
                      <td>
                        <span style={{ color: MOD_COLOR[l.mod], fontWeight: 700, fontSize: 12 }}>
                          {l.mod.charAt(0).toUpperCase() + l.mod.slice(1)}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: '#ef4444', textAlign: 'right' }}>
                        {fmt(l.amount, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bdr)', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--txt3)' }}>{filtered.length} records</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', fontFamily: 'var(--mono)' }}>Total voided: {fmt(totalFiltered, sym)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
