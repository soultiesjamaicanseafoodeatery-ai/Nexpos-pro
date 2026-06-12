'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { MODULE_DATA } from '@/lib/data/seed'
import type { Member, MemberPlan } from '@/types'

const PLANS: MemberPlan[] = [
  { id:'plan-basic',    name:'Basic',    price:29.99, discount:5,  color:'#4f8ef7', freeAddons:[],                            unlimited:false, description:'5% off all washes' },
  { id:'plan-gold',     name:'Gold',     price:49.99, discount:15, color:'#f5a623', freeAddons:['Tire Shine'],                unlimited:false, description:'15% off + free Tire Shine' },
  { id:'plan-platinum', name:'Platinum', price:89.99, discount:20, color:'#38bdf8', freeAddons:['Tire Shine','Wax Protection'],unlimited:true,  description:'20% off + unlimited washes + free add-ons' },
]

const STATUS_COLOR: Record<string, string> = { active: 'var(--grn)', failed: 'var(--red,#ef4444)', cancelled: 'var(--txt3)', expired: 'var(--ora)' }

export default function MembersPage() {
  const { state } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const [members] = useState<Member[]>(() => {
    return (MODULE_DATA.carwash as { members?: Member[] })?.members ?? []
  })
  const [selected, setSelected] = useState<Member | null>(null)
  const [search, setSearch]     = useState('')

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    return !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.vehicles.some(v => v.plate.toLowerCase().includes(q))
  })

  const plan = (id: string) => PLANS.find(p => p.id === id)

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Car Wash Members</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{members.length} members</div>
        </div>
      </div>

      {/* Plan summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {PLANS.map(p => {
          const count = members.filter(m => m.planId === p.id).length
          return (
            <div key={p.id} style={{ background: 'var(--surf)', border: `1.5px solid ${p.color}33`, borderRadius: 'var(--r3)', padding: '14px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: p.color }}>{p.name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt)', marginTop: 4 }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{fmt(p.price)}/mo · {p.discount}% off</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 16 }}>
        {/* Member list */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members, email, plate…"
              style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 12px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No members found.</div>
            ) : filtered.map(m => {
              const p = plan(m.planId)
              const sel = selected?.id === m.id
              return (
                <div key={m.id} onClick={() => setSelected(sel ? null : m)} style={{
                  padding: '12px 14px', borderBottom: '1px solid var(--bdr2)', cursor: 'pointer',
                  background: sel ? 'var(--surf2)' : 'transparent', display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: p ? p.color + '33' : 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: p?.color ?? 'var(--txt)', flexShrink: 0 }}>
                    {m.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{m.email} · {m.vehicles.length} vehicle{m.vehicles.length !== 1 ? 's' : ''} · {m.washes} washes</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: p?.color ?? 'var(--txt3)' }}>{p?.name ?? 'No Plan'}</div>
                    <div style={{ fontSize: 10, color: STATUS_COLOR[m.billing.status] ?? 'var(--txt3)', textTransform: 'capitalize' }}>{m.billing.status}</div>
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
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{selected.email}</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{selected.phone}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 18 }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Plan</div>
              {(() => { const p = plan(selected.planId); return p ? (
                <div style={{ padding: '10px 12px', background: `${p.color}11`, border: `1.5px solid ${p.color}33`, borderRadius: 'var(--r)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: p.color }}>{p.name} — {fmt(p.price)}/mo</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{p.description}</div>
                  <div style={{ fontSize: 11, color: STATUS_COLOR[selected.billing.status], marginTop: 4, textTransform: 'capitalize', fontWeight: 700 }}>Billing: {selected.billing.status}</div>
                </div>
              ) : null })()}
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Vehicles</div>
              {selected.vehicles.map(v => (
                <div key={v.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 'var(--r)', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{v.plate}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{v.year} {v.make} {v.model} · {v.color}</div>
                  <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>{v.washes ?? 0} washes</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt3)' }}>
              <span>Total Washes</span><strong style={{ color: 'var(--txt)' }}>{selected.washes}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt3)', marginTop: 4 }}>
              <span>Member Since</span><strong style={{ color: 'var(--txt)' }}>{selected.joined}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
