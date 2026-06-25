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

  const activeCount = takeoutTickets.filter(t => { const s = t.status ?? 'sent'; return s !== 'paid' && s !== 'voided' }).length
  const readyCount  = takeoutTickets.filter(t => t.status === 'ready').length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{
            padding: '8px 16px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)',
            background: 'var(--surf)', color: 'var(--txt2)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>🥡 Takeout</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>
              {activeCount} active · {readyCount} ready for pickup
            </div>
          </div>
          {/* Prominent New Order button */}
          <button onClick={onNewOrder} style={{
            padding: '12px 28px', borderRadius: 'var(--r)', background: 'var(--grn)',
            border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
            letterSpacing: '.2px', flexShrink: 0,
          }}>+ New Takeout Order</button>
        </div>

        {/* Ready-for-pickup banner */}
        {readyCount > 0 && (
          <div onClick={() => setFilter('ready')} style={{
            marginBottom: 12, padding: '10px 16px', borderRadius: 'var(--r)',
            background: '#14532d22', border: '1.5px solid var(--grn)',
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--grn)' }}>
              {readyCount} order{readyCount > 1 ? 's' : ''} ready for pickup
            </span>
            <span style={{ fontSize: 12, color: 'var(--grn)', marginLeft: 'auto', fontWeight: 700 }}>View →</span>
          </div>
        )}

        {/* Filter + search row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {([['active', 'Active'], ['ready', 'Ready'], ['all', 'All']] as const).map(([f, lbl]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${filter === f ? 'transparent' : 'var(--bdr)'}`,
              background: filter === f ? 'var(--blue)' : 'transparent',
              color: filter === f ? '#fff' : 'var(--txt3)',
            }}>{lbl}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search order, customer…"
            style={{
              marginLeft: 'auto', padding: '6px 14px', borderRadius: 20,
              border: '1px solid var(--bdr)', background: 'var(--surf)',
              color: 'var(--txt)', fontSize: 12, minWidth: 180,
            }}
          />
        </div>
      </div>

      {/* Order list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🥡</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt2)' }}>
              {filter === 'active' ? 'No active takeout orders' : 'No orders found'}
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Tap <strong>+ New Takeout Order</strong> above to get started</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {filtered.map(t => {
              const s = t.status ?? 'sent'
              const color = STATUS_COLOR[s] ?? 'var(--txt3)'
              const activeItems = t.items.filter(i => !i.voided)
              const total = activeItems.reduce((sum, i) => sum + i.price * i.qty, 0)
              return (
                <button key={t.id} onClick={() => onOpenOrder(t.id)} style={{
                  display: 'flex', flexDirection: 'column', padding: '14px 16px',
                  background: 'var(--bg2)', border: `2px solid ${color}44`,
                  borderRadius: 'var(--r3)', cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color .12s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = color }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = color + '44' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)' }}>#{t.orderNum}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{t.server}</div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 20,
                      background: color + '22', color, textTransform: 'uppercase', letterSpacing: '.4px',
                    }}>{STATUS_LABEL[s] ?? s}</div>
                  </div>
                  {t.customerName && (
                    <div style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 700, marginBottom: 4 }}>
                      👤 {t.customerName}{t.items[0] && 'phone' in t ? '' : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{activeItems.length} item{activeItems.length !== 1 ? 's' : ''} · {t.timeline.created}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{fmt(total, sym)}</div>
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
