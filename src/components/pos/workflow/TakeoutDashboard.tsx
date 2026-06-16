'use client'
import { useState, useMemo } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { fmt } from '@/lib/utils/tax'

interface Props {
  onNewOrder: () => void
  onOpenOrder: (ticketId: string) => void
  onBack: () => void
}

const STATUS_COLOR: Record<string, string> = {
  sent:      'var(--ora)',
  preparing: 'var(--pur)',
  ready:     'var(--grn)',
  served:    'var(--blue)',
  paid:      'var(--txt3)',
}
const STATUS_LABEL: Record<string, string> = {
  sent:      'New',
  preparing: 'Preparing',
  ready:     'Ready',
  served:    'Collected',
  paid:      'Completed',
}

type FilterMode = 'active' | 'ready' | 'all'

export default function TakeoutDashboard({ onNewOrder, onOpenOrder, onBack }: Props) {
  const { state } = useApp()
  const { orderTickets, biz } = state
  const sym = biz.currencySymbol ?? 'J$'
  const [filter, setFilter] = useState<FilterMode>('active')
  const [search, setSearch] = useState('')

  const takeoutTickets = useMemo(() =>
    orderTickets.filter(t => t.orderType === 'takeout'),
    [orderTickets]
  )

  const filtered = useMemo(() => {
    return takeoutTickets.filter(t => {
      const s = t.status ?? 'sent'
      if (filter === 'active') return s !== 'paid' && s !== 'voided'
      if (filter === 'ready')  return s === 'ready'
      return true
    }).filter(t => {
      if (!search) return true
      const q = search.toLowerCase()
      return t.orderNum.includes(q) ||
        (t.customerName ?? '').toLowerCase().includes(q) ||
        t.server.toLowerCase().includes(q)
    })
  }, [takeoutTickets, filter, search])

  const active  = takeoutTickets.filter(t => { const s = t.status ?? 'sent'; return s !== 'paid' && s !== 'voided' }).length
  const ready   = takeoutTickets.filter(t => t.status === 'ready').length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{
            padding: '8px 16px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)',
            background: 'var(--surf)', color: 'var(--txt2)', fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
          }}>← Back</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>🥡 Takeout</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{active} active · {ready} ready for pickup</div>
          </div>
          <button onClick={onNewOrder} style={{
            marginLeft: 'auto', padding: '10px 24px', borderRadius: 'var(--r)',
            background: 'var(--grn)', border: 'none', color: '#fff',
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}>+ New Takeout Order</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {([['active','Active'], ['ready','Ready for Pickup'], ['all','All Orders']] as const).map(([f, lbl]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${filter === f ? 'transparent' : 'var(--bdr)'}`,
              background: filter === f ? 'var(--blue)' : 'transparent',
              color: filter === f ? '#fff' : 'var(--txt3)',
            }}>{lbl}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search order, customer…"
            style={{
              marginLeft: 'auto', padding: '7px 14px', borderRadius: 20,
              border: '1px solid var(--bdr)', background: 'var(--surf)',
              color: 'var(--txt)', fontSize: 12, minWidth: 200,
            }}
          />
        </div>
      </div>

      {/* Order list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🥡</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt2)' }}>
              {filter === 'active' ? 'No active takeout orders' : 'No orders found'}
            </div>
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--txt3)' }}>
              Tap "New Takeout Order" to get started
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filtered.map(t => {
              const s = t.status ?? 'sent'
              const color = STATUS_COLOR[s] ?? 'var(--txt3)'
              const total = t.items.filter(i => !i.voided).reduce((sum, i) => sum + i.price * i.qty, 0)
              return (
                <button key={t.id} onClick={() => onOpenOrder(t.id)} style={{
                  display: 'flex', flexDirection: 'column', padding: '16px 18px',
                  background: 'var(--bg2)', border: `2px solid var(--bdr)`,
                  borderRadius: 'var(--r3)', cursor: 'pointer', textAlign: 'left',
                  transition: 'all .14s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.border = `2px solid ${color}` }}
                  onMouseLeave={e => { e.currentTarget.style.border = '2px solid var(--bdr)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>#{t.orderNum}</div>
                      <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{t.server}</div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
                      background: color + '22', color, textTransform: 'uppercase', letterSpacing: '.4px',
                    }}>{STATUS_LABEL[s] ?? s}</div>
                  </div>
                  {t.customerName && (
                    <div style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 700, marginBottom: 6 }}>
                      👤 {t.customerName}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 10 }}>
                    {t.items.filter(i => !i.voided).length} item(s)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>since {t.timeline.created}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>
                      {fmt(total, sym)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
