'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { FleetAccount } from '@/types'

const STATUS_COLOR: Record<string, string> = { active: 'var(--grn)', overdue: 'var(--red,#ef4444)', suspended: 'var(--ora)' }

export default function FleetPage() {
  const { state } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fleet = state.fleet
  const [selected, setSelected] = useState<FleetAccount | null>(null)
  const [search, setSearch]     = useState('')

  const filtered = fleet.filter(a => {
    const q = search.toLowerCase()
    return !q || a.companyName.toLowerCase().includes(q) || a.contactName.toLowerCase().includes(q) || a.accountType.toLowerCase().includes(q)
  })

  const totalBalance = fleet.reduce((s, a) => s + a.currentBalance, 0)
  const totalCredit  = fleet.reduce((s, a) => s + a.creditLimit, 0)

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Fleet Accounts</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {fleet.length} accounts · {fmt(totalBalance)} outstanding · {fmt(totalCredit)} credit limit
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>
        {/* Account list */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, contact…"
              style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 12px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No fleet accounts.</div>
            ) : filtered.map(a => {
              const sel = selected?.id === a.id
              return (
                <div key={a.id} onClick={() => setSelected(sel ? null : a)} style={{
                  padding: '13px 16px', borderBottom: '1px solid var(--bdr2)', cursor: 'pointer',
                  background: sel ? 'var(--surf2)' : 'transparent', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>{a.companyName}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{a.contactName} · {a.phone} · {a.vehicles.length} vehicles</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: a.currentBalance > 0 ? 'var(--red,#ef4444)' : 'var(--txt)' }}>{fmt(a.currentBalance)}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[a.status] ?? 'var(--txt3)', textTransform: 'capitalize', marginTop: 2 }}>{a.status}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 18, alignSelf: 'start', position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{selected.companyName}</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{selected.contactName} · {selected.email}</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{selected.phone}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 18 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Account Type', value: selected.accountType },
                { label: 'Status', value: selected.status, color: STATUS_COLOR[selected.status] },
                { label: 'Discount', value: `${selected.discount}%` },
                { label: 'Credit Limit', value: fmt(selected.creditLimit) },
                { label: 'Balance', value: fmt(selected.currentBalance), color: selected.currentBalance > 0 ? 'var(--red,#ef4444)' : 'var(--grn)' },
                { label: 'Billing', value: `${selected.billingCycle} · Net ${selected.paymentTerms.replace('Net ','')}` },
              ].map(row => (
                <div key={row.label} style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{row.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: row.color ?? 'var(--txt)', textTransform: 'capitalize' }}>{row.value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Vehicles ({selected.vehicles.length})</div>
            {selected.vehicles.map(v => (
              <div key={v.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 'var(--r)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{v.plate}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{v.year} {v.make} {v.model}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 700 }}>{v.washes ?? 0} washes</div>
              </div>
            ))}

            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8, marginTop: 14 }}>Invoices</div>
            {selected.invoices.map(inv => (
              <div key={inv.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 'var(--r)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{inv.id}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{inv.date} · {inv.items} items</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--txt)' }}>{fmt(inv.amount)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: inv.status === 'paid' ? 'var(--grn)' : 'var(--red,#ef4444)', textTransform: 'capitalize' }}>{inv.status}</div>
                </div>
              </div>
            ))}

            {selected.notes && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#78350f11', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--txt3)', borderLeft: '3px solid var(--ora)' }}>
                {selected.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
