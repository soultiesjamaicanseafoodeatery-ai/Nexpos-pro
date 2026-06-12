'use client'

import { useState, useMemo } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'

type Tab = 'overview' | 'server' | 'menu' | 'financial'

export default function ReportsPage() {
  const { state } = useApp()
  const { transactions, biz } = state
  const sym = biz.currencySymbol ?? 'J$'
  const txs = transactions.filter(t => !t.voided)
  const fmtN = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const [tab, setTab] = useState<Tab>('overview')

  // ── Overview stats ─────────────────────────────────────────
  const totalRev  = txs.reduce((s, t) => s + t.total, 0)
  const totalDisc = txs.reduce((s, t) => s + (t.disc ?? 0), 0)
  const totalGCT  = txs.reduce((s, t) => s + (t.gct ?? t.tax ?? 0), 0)
  const totalSC   = txs.reduce((s, t) => s + (t.serviceCharge ?? 0), 0)
  const totalGrat = txs.reduce((s, t) => s + (t.gratuity ?? 0), 0)
  const avgTicket = txs.length ? totalRev / txs.length : 0

  const byMod: Record<string, { count: number; rev: number }> = { restaurant: {count:0,rev:0}, bar: {count:0,rev:0}, carwash: {count:0,rev:0} }
  txs.forEach(t => { byMod[t.mod] && (byMod[t.mod].count++, byMod[t.mod].rev += t.total) })

  const byPay: Record<string, number> = {}
  txs.forEach(t => { byPay[t.pay] = (byPay[t.pay] ?? 0) + t.total })

  // ── Server/Cashier breakdown ───────────────────────────────
  const byServer = useMemo(() => {
    const map: Record<string, { count: number; rev: number; disc: number; grat: number }> = {}
    txs.forEach(t => {
      if (!map[t.cashier]) map[t.cashier] = { count: 0, rev: 0, disc: 0, grat: 0 }
      map[t.cashier].count++
      map[t.cashier].rev   += t.total
      map[t.cashier].disc  += t.disc ?? 0
      map[t.cashier].grat  += t.gratuity ?? 0
    })
    return Object.entries(map).sort((a, b) => b[1].rev - a[1].rev)
  }, [txs])

  // ── Menu breakdown ─────────────────────────────────────────
  const itemCount: Record<string, { count: number; mod: string }> = {}
  txs.forEach(t => {
    if (!itemCount[t.item]) itemCount[t.item] = { count: 0, mod: t.mod }
    itemCount[t.item].count++
  })
  const topFood  = Object.entries(itemCount).filter(([,v]) => v.mod === 'restaurant').sort((a,b) => b[1].count - a[1].count).slice(0, 10)
  const topDrinks = Object.entries(itemCount).filter(([,v]) => v.mod === 'bar').sort((a,b) => b[1].count - a[1].count).slice(0, 10)
  const topAll   = Object.entries(itemCount).sort((a,b) => b[1].count - a[1].count).slice(0, 10)

  // Category = Module in this system
  const catSales = [
    { label: 'Restaurant (Food)', count: byMod.restaurant.count, rev: byMod.restaurant.rev, color: 'var(--ora)' },
    { label: 'Bar (Drinks)',      count: byMod.bar.count,        rev: byMod.bar.rev,        color: 'var(--pur)' },
    { label: 'Car Wash',          count: byMod.carwash.count,    rev: byMod.carwash.rev,    color: 'var(--blue)' },
  ]

  // ── Financial / Tax / Gratuity ─────────────────────────────
  const taxableTxs = txs.filter(t => (t.gct ?? 0) > 0)
  const nonTaxableTxs = txs.filter(t => !t.gct)
  const gratTxs = txs.filter(t => (t.gratuity ?? 0) > 0)

  const modMeta: Record<string, { icon: string; color: string }> = {
    restaurant: { icon: '🍽️', color: 'var(--ora)' },
    bar:        { icon: '🍺', color: 'var(--pur)' },
    carwash:    { icon: '🚗', color: 'var(--blue)' },
    mixed:      { icon: '🔀', color: 'var(--txt3)' },
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'server',    label: 'By Server' },
    { id: 'menu',      label: 'Menu Sales' },
    { id: 'financial', label: 'Financial' },
  ]

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Reports</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>All-time · {txs.length} transactions</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`btn btn-sm ${tab === t.id ? 'btn-pr' : 'btn-gh'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview tab ─────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Revenue',   value: fmtN(totalRev),  color: 'var(--grn)' },
              { label: 'Transactions',    value: String(txs.length), color: 'var(--blue)' },
              { label: 'Avg Ticket',      value: fmtN(avgTicket), color: 'var(--pur)' },
              { label: 'Total Discounts', value: fmtN(totalDisc), color: 'var(--amb,#f59e0b)' },
              { label: 'Total Tax (GCT)', value: fmtN(totalGCT),  color: 'var(--teal,#14b8a6)' },
              { label: 'Total Gratuity',  value: fmtN(totalGrat), color: 'var(--ora)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 13 }}>
            {/* Module breakdown */}
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Module Breakdown</div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(byMod).map(([mod, data]) => {
                  const pct = totalRev > 0 ? (data.rev / totalRev) * 100 : 0
                  const { icon, color } = modMeta[mod]
                  return (
                    <div key={mod}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{icon} {mod.charAt(0).toUpperCase()+mod.slice(1)}</span>
                        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{fmtN(data.rev)}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--surf3)', borderRadius: 4 }}>
                        <div style={{ height: 4, background: color, borderRadius: 4, width: `${pct}%` }} />
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
              {Object.entries(byPay).filter(([,v]) => v > 0).map(([pay, rev]) => (
                <div key={pay} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--bdr)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{pay}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{fmtN(rev)}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{totalRev > 0 ? ((rev/totalRev)*100).toFixed(1) : 0}%</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Top items */}
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Top Items</div>
              {topAll.map(([name, data], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--bdr)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surf3)', color: 'var(--txt3)', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</div>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ fontSize: 11, color: modMeta[data.mod]?.color ?? 'var(--txt3)', fontWeight: 800 }}>{data.count}×</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Server Sales tab ──────────────────────────────────── */}
      {tab === 'server' && (
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Sales by Server / Cashier</div>
          {byServer.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No data yet</div>
          ) : (
            <table className="dt" style={{ width: '100%' }}>
              <thead>
                <tr><th>Server</th><th>Transactions</th><th>Revenue</th><th>Avg Ticket</th><th>Discounts Given</th><th>Gratuity Earned</th></tr>
              </thead>
              <tbody>
                {byServer.map(([name, data]) => (
                  <tr key={name}>
                    <td style={{ fontWeight: 700 }}>{name}</td>
                    <td style={{ textAlign: 'center' }}>{data.count}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)' }}>{fmtN(data.rev)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>{fmtN(data.count > 0 ? data.rev / data.count : 0)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: data.disc > 0 ? 'var(--ora)' : 'var(--txt3)' }}>{data.disc > 0 ? fmtN(data.disc) : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: data.grat > 0 ? 'var(--grn)' : 'var(--txt3)' }}>{data.grat > 0 ? fmtN(data.grat) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Menu Sales tab ────────────────────────────────────── */}
      {tab === 'menu' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Category Sales */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', gridColumn: '1 / -1' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Category Sales</div>
            <div style={{ padding: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {catSales.map(cat => (
                <div key={cat.label} style={{ flex: '1 1 150px', background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', marginBottom: 6 }}>{cat.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: cat.color }}>{fmtN(cat.rev)}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>{cat.count} transactions</div>
                  <div style={{ height: 3, background: 'var(--surf3)', borderRadius: 2, marginTop: 8 }}>
                    <div style={{ height: '100%', width: `${totalRev > 0 ? (cat.rev / totalRev) * 100 : 0}%`, background: cat.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Food */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13, color: 'var(--ora)' }}>Top Food Items</div>
            {topFood.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)', fontSize: 12 }}>No food sales</div> :
              topFood.map(([name, data], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--bdr)' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--ora-bg,#78350f22)', color: 'var(--ora)', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ora)' }}>{data.count}×</span>
                </div>
              ))
            }
          </div>

          {/* Top Drinks */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13, color: 'var(--pur)' }}>Top Drinks</div>
            {topDrinks.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)', fontSize: 12 }}>No bar sales</div> :
              topDrinks.map(([name, data], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--bdr)' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--pur-bg,#4c1d9522)', color: 'var(--pur)', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--pur)' }}>{data.count}×</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Financial tab ─────────────────────────────────────── */}
      {tab === 'financial' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Tax Report */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Tax Report (GCT)</div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Total GCT Collected',    value: fmtN(totalGCT),  color: 'var(--teal,#14b8a6)' },
                { label: 'Service Charge Collected',value: fmtN(totalSC),  color: 'var(--blue)' },
                { label: 'Taxable Transactions',    value: String(taxableTxs.length), color: 'var(--txt)' },
                { label: 'Non-taxable Transactions',value: String(nonTaxableTxs.length), color: 'var(--txt3)' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bdr2)' }}>
                  <span style={{ fontSize: 12, color: 'var(--txt2)' }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gratuity Report */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Gratuity Report</div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Total Gratuity Collected', value: fmtN(totalGrat), color: 'var(--grn)' },
                { label: 'Orders with Gratuity',     value: String(gratTxs.length), color: 'var(--txt)' },
                { label: 'Avg Gratuity per Order',   value: gratTxs.length ? fmtN(totalGrat / gratTxs.length) : '—', color: 'var(--ora)' },
                { label: 'Gratuity % of Revenue',    value: totalRev > 0 ? `${((totalGrat / totalRev) * 100).toFixed(1)}%` : '—', color: 'var(--txt3)' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bdr2)' }}>
                  <span style={{ fontSize: 12, color: 'var(--txt2)' }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Discounts */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', gridColumn: '1 / -1' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', fontWeight: 800, fontSize: 13 }}>Discount Summary</div>
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Discounts Given', value: fmtN(totalDisc), color: 'var(--red,#ef4444)' },
                { label: 'Discounted Orders',     value: String(txs.filter(t => t.disc > 0).length), color: 'var(--txt)' },
                { label: 'Avg Discount',          value: txs.filter(t => t.disc > 0).length ? fmtN(totalDisc / txs.filter(t => t.disc > 0).length) : '—', color: 'var(--ora)' },
                { label: 'Discount % of Revenue', value: totalRev > 0 ? `${((totalDisc / (totalRev + totalDisc)) * 100).toFixed(1)}%` : '—', color: 'var(--txt3)' },
              ].map(row => (
                <div key={row.label} style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{row.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: row.color }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
