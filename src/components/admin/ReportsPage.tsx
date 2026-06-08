'use client'

import { useApp } from '@/lib/hooks/useAppStore'

export default function ReportsPage() {
  const { state } = useApp()
  const { transactions, biz } = state
  const sym = biz.currencySymbol ?? 'J$'
  const txs = transactions.filter(t => !t.voided)

  const totalRev  = txs.reduce((s, t) => s + t.total, 0)
  const totalDisc = txs.reduce((s, t) => s + (t.disc ?? 0), 0)
  const totalTax  = txs.reduce((s, t) => s + (t.tax ?? 0), 0)
  const avgTicket = txs.length ? totalRev / txs.length : 0

  const byMod: Record<string, { count: number; rev: number }> = { restaurant: { count:0,rev:0 }, bar: { count:0,rev:0 }, carwash: { count:0,rev:0 } }
  txs.forEach(t => { byMod[t.mod].count++; byMod[t.mod].rev += t.total })

  const byPay: Record<string, number> = {}
  txs.forEach(t => { byPay[t.pay] = (byPay[t.pay] ?? 0) + t.total })

  const itemCount: Record<string, number> = {}
  txs.forEach(t => { itemCount[t.item] = (itemCount[t.item] ?? 0) + 1 })
  const topItems = Object.entries(itemCount).sort((a,b) => b[1]-a[1]).slice(0,8)

  const stats = [
    { label: 'Total Revenue', value: `${sym}${totalRev.toFixed(2)}`, color: 'var(--grn)' },
    { label: 'Transactions',  value: txs.length,                     color: 'var(--blue)' },
    { label: 'Avg Ticket',    value: `${sym}${avgTicket.toFixed(2)}`, color: 'var(--pur)' },
    { label: 'Total Discounts',value: `-${sym}${totalDisc.toFixed(2)}`,color: 'var(--amb)' },
    { label: 'Total Tax',     value: `${sym}${totalTax.toFixed(2)}`,  color: 'var(--teal)' },
  ]

  const modMeta: Record<string, { icon: string; color: string }> = {
    restaurant: { icon: '🍽️', color: 'var(--ora)' },
    bar:        { icon: '🍺', color: 'var(--pur)' },
    carwash:    { icon: '🚗', color: 'var(--blue)' },
  }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Reports</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>All-time summary · {txs.length} transactions</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 11, marginBottom: 18 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: '-.5px', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 13, marginBottom: 13 }}>
        {/* Module breakdown */}
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Module Breakdown</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(byMod).map(([mod, data]) => {
              const pct = totalRev > 0 ? (data.rev / totalRev) * 100 : 0
              const { icon, color } = modMeta[mod]
              return (
                <div key={mod}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{icon} {mod.charAt(0).toUpperCase()+mod.slice(1)}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{sym}{data.rev.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--surf3)', borderRadius: 4 }}>
                    <div style={{ height: 4, background: color, borderRadius: 4, width: `${pct}%`, transition: 'width .5s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>{data.count} txns · {pct.toFixed(1)}%</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Payment methods */}
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Payment Methods</div>
          <div style={{ padding: '0 0', flex: 1 }}>
            {Object.entries(byPay).filter(([,v]) => v > 0).map(([pay, rev]) => (
              <div key={pay} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{pay}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{sym}{rev.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{totalRev > 0 ? ((rev/totalRev)*100).toFixed(1) : 0}%</div>
                </div>
              </div>
            ))}
            {Object.keys(byPay).length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt3)', fontSize: 12 }}>No data</div>}
          </div>
        </div>

        {/* Top items */}
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Top Items</div>
          <div style={{ padding: '0 0' }}>
            {topItems.map(([name, cnt], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--bdr)' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surf3)', color: 'var(--txt3)', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</div>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue)' }}>{cnt}x</span>
              </div>
            ))}
            {topItems.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--txt3)', fontSize: 12 }}>No data</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
