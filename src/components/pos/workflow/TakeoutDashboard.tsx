'use client'
import { useMemo } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { fmt } from '@/lib/utils/tax'
import type { OrderTicket } from '@/types'

interface Props {
  onNewOrder: (toNum: string) => void
  onOpenOrder: (ticketId: string) => void
  onBack: () => void
}

const STATUS_COLOR: Record<string, string> = {
  sent:      'var(--ora)',
  preparing: 'var(--pur)',
  ready:     'var(--grn)',
  served:    'var(--blue)',
}
const STATUS_LABEL: Record<string, string> = {
  sent:      'New',
  preparing: 'Preparing',
  ready:     'Ready',
  served:    'Collected',
}

function nextToNum(tickets: OrderTicket[]): string {
  const nums = tickets
    .filter(t => t.orderType === 'takeout' && /^TO-\d+$/.test(t.orderNum))
    .map(t => parseInt(t.orderNum.slice(3), 10))
  const max = nums.length ? Math.max(...nums) : 0
  return 'TO-' + String(max + 1).padStart(3, '0')
}

export default function TakeoutDashboard({ onNewOrder, onOpenOrder, onBack }: Props) {
  const { state } = useApp()
  const { orderTickets, biz } = state
  const sym = biz.currencySymbol ?? 'J$'

  const active = useMemo(() =>
    orderTickets.filter(t => t.orderType === 'takeout' && t.status !== 'paid' && t.status !== 'voided'),
    [orderTickets]
  )
  const readyCount = active.filter(t => t.status === 'ready').length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ padding: '8px 16px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>🥡 Takeout Queue</div>
          <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{active.length} active · {readyCount} ready for pickup</div>
        </div>
      </div>

      {/* Tile grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, maxWidth: 720 }}>

          {/* + New tile */}
          <button
            onClick={() => onNewOrder(nextToNum(orderTickets))}
            style={{
              padding: '16px 8px', borderRadius: 'var(--r3)', border: '2px dashed var(--grn)',
              background: '#14532d11', color: 'var(--grn)', cursor: 'pointer', textAlign: 'center',
              minHeight: 96, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 6, transition: 'background .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#14532d22' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#14532d11' }}
          >
            <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 300 }}>+</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.5px' }}>NEW ORDER</div>
          </button>

          {/* Active ticket tiles */}
          {active.map(t => {
            const s = t.status ?? 'sent'
            const color = STATUS_COLOR[s] ?? 'var(--ora)'
            const itemCount = t.items.filter(i => !i.voided).length
            const total = t.items.filter(i => !i.voided).reduce((sum, i) => sum + i.price * i.qty, 0)
            return (
              <button
                key={t.id}
                onClick={() => onOpenOrder(t.id)}
                style={{
                  padding: '12px 8px', borderRadius: 'var(--r3)', border: `2px solid ${color}55`,
                  background: color + '11', cursor: 'pointer', textAlign: 'center',
                  minHeight: 96, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 4, transition: 'all .12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.border = `2px solid ${color}`; e.currentTarget.style.background = color + '22' }}
                onMouseLeave={e => { e.currentTarget.style.border = `2px solid ${color}55`; e.currentTarget.style.background = color + '11' }}
              >
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--txt)', letterSpacing: '-.3px' }}>{t.orderNum}</div>
                <div style={{ fontSize: 9, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.5px', lineHeight: 1.2 }}>{STATUS_LABEL[s] ?? s}</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{itemCount} item{itemCount !== 1 ? 's' : ''}</div>
                {t.customerName && (
                  <div style={{ fontSize: 10, color: 'var(--txt3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', paddingInline: 6 }}>{t.customerName}</div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--txt2)', marginTop: 2 }}>{fmt(total, sym)}</div>
              </button>
            )
          })}
        </div>

        {active.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🥡</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)' }}>No active takeout orders</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Tap <strong>+ NEW ORDER</strong> to get started</div>
          </div>
        )}
      </div>
    </div>
  )
}
