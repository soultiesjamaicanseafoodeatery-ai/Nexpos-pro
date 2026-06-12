'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { storage } from '@/lib/utils/storage'

interface Target {
  module: 'restaurant' | 'bar' | 'carwash' | 'overall'
  period: 'daily' | 'weekly' | 'monthly'
  value: number
}

const DEFAULT_TARGETS: Target[] = [
  { module: 'overall',    period: 'daily',   value: 50000 },
  { module: 'overall',    period: 'weekly',  value: 300000 },
  { module: 'overall',    period: 'monthly', value: 1200000 },
  { module: 'restaurant', period: 'daily',   value: 25000 },
  { module: 'bar',        period: 'daily',   value: 15000 },
  { module: 'carwash',    period: 'daily',   value: 10000 },
]

function periodRevenue(txs: { ts: string; total: number; mod: string; voided?: boolean }[], mod: string, period: 'daily' | 'weekly' | 'monthly') {
  const now = new Date()
  return txs
    .filter(t => {
      if (t.voided) return false
      if (mod !== 'overall' && t.mod !== mod) return false
      const d = new Date(t.ts)
      if (isNaN(d.getTime())) return false
      if (period === 'daily')   return d.toDateString() === now.toDateString()
      if (period === 'weekly') {
        const start = new Date(now); start.setDate(now.getDate() - now.getDay())
        return d >= start
      }
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((s, t) => s + t.total, 0)
}

export default function TargetsPage() {
  const { state } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const [targets, setTargets] = useState<Target[]>(() => storage.get<Target[]>('targets') ?? DEFAULT_TARGETS)
  const [period, setPeriod]   = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [editing, setEditing] = useState<{ module: string; period: string } | null>(null)
  const [editVal, setEditVal] = useState(0)

  const persist = (list: Target[]) => { setTargets(list); storage.set('targets', list) }

  const getTarget = (mod: string, p: string) => targets.find(t => t.module === mod && t.period === p)?.value ?? 0

  const saveEdit = () => {
    if (!editing) return
    const updated = targets.filter(t => !(t.module === editing.module && t.period === editing.period))
    persist([...updated, { module: editing.module as Target['module'], period: editing.period as Target['period'], value: editVal }])
    setEditing(null)
  }

  const MODULES: { key: string; label: string; color: string }[] = [
    { key: 'overall',    label: 'Overall',    color: 'var(--blue)' },
    { key: 'restaurant', label: 'Restaurant', color: 'var(--ora)' },
    { key: 'bar',        label: 'Bar',        color: 'var(--pur)' },
    { key: 'carwash',    label: 'Car Wash',   color: '#38bdf8' },
  ]

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Performance Targets</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>Set revenue goals and track progress</div>
      </div>

      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['daily','weekly','monthly'] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            padding: '8px 20px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${period === p ? 'transparent' : 'var(--bdr)'}`,
            background: period === p ? 'var(--blue)' : 'transparent',
            color: period === p ? '#fff' : 'var(--txt2)',
            textTransform: 'capitalize',
          }}>{p}</button>
        ))}
      </div>

      {/* Target cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {MODULES.map(m => {
          const target  = getTarget(m.key, period)
          const actual  = periodRevenue(state.transactions as Parameters<typeof periodRevenue>[0], m.key, period)
          const pct     = target > 0 ? Math.min(100, (actual / target) * 100) : 0
          const isEdit  = editing?.module === m.key && editing?.period === period
          const overAchieved = actual >= target && target > 0

          return (
            <div key={m.key} style={{ background: 'var(--surf)', border: `1.5px solid ${m.color}33`, borderRadius: 'var(--r3)', padding: '18px 20px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: m.color }}>{m.label}</div>
                {!isEdit ? (
                  <button onClick={() => { setEditing({ module: m.key, period }); setEditVal(target) }}
                    style={{ fontSize: 11, color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                ) : (
                  <button onClick={() => setEditing(null)} style={{ fontSize: 11, color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
                )}
              </div>

              {isEdit ? (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input type="number" min={0} value={editVal} onChange={e => setEditVal(Number(e.target.value))}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                    style={{ flex: 1, background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '7px 8px', fontSize: 13, color: 'var(--txt)', minWidth: 0 }} autoFocus />
                  <button onClick={saveEdit} style={{ padding: '7px 12px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save</button>
                </div>
              ) : null}

              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: overAchieved ? 'var(--grn)' : 'var(--txt)', lineHeight: 1 }}>{fmt(actual)}</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>of {fmt(target)} target</div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: 'var(--surf2)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 3, transition: 'width .4s',
                  background: overAchieved ? 'var(--grn)' : pct > 50 ? m.color : 'var(--ora)',
                }} />
              </div>

              <div style={{ fontSize: 11, color: overAchieved ? 'var(--grn)' : 'var(--txt3)', fontWeight: overAchieved ? 700 : 400 }}>
                {target === 0 ? 'No target set' : overAchieved ? `Target achieved! +${fmt(actual - target)}` : `${fmt(target - actual)} remaining`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
