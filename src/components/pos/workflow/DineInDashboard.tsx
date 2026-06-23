'use client'
import { useState, useMemo } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { storage } from '@/lib/utils/storage'
import { fmt } from '@/lib/utils/tax'

interface Props {
  onTableSelect: (table: string) => void
  onNewTable: () => void
  onBack: () => void
}

type TableStatus = 'available' | 'occupied' | 'waiting'

const STATUS_COLOR: Record<TableStatus, string> = {
  available: 'var(--grn)',
  occupied:  'var(--ora)',
  waiting:   'var(--red)',
}
const STATUS_BG: Record<TableStatus, string> = {
  available: '#14532d22',
  occupied:  '#78350f22',
  waiting:   '#7f1d1d22',
}
const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'Available',
  occupied:  'Occupied',
  waiting:   'Pay Now',
}

export default function DineInDashboard({ onTableSelect, onNewTable, onBack }: Props) {
  const { state, dispatch } = useApp()
  const { orderTickets, biz, activeModule } = state
  const sym = biz.currencySymbol ?? 'J$'

  const [search, setSearch] = useState('')
  const [pendingRelease, setPendingRelease] = useState<string | null>(null)

  // Load tables from storage or seed
  const tables: string[] = useMemo(() => {
    const conf = storage.get<Record<string, unknown>>('tables_config')
    const key = activeModule === 'bar' ? 'bar' : 'restaurant'
    if (conf && Array.isArray(conf[key])) {
      return (conf[key] as unknown[]).map(t => {
        if (typeof t === 'string') return t
        if (t && typeof t === 'object') {
          const e = t as { name?: unknown; id?: unknown }
          return String(e.name ?? e.id ?? '')
        }
        return String(t)
      }).filter(Boolean)
    }
    return ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']
  }, [activeModule])

  // Map open orders to tables
  const openOrders = orderTickets.filter(t => {
    const s = t.status ?? 'paid'
    return s !== 'paid' && s !== 'voided'
  })
  const tableOrderMap: Record<string, typeof openOrders[0]> = {}
  openOrders.forEach(t => { if (t.table) tableOrderMap[t.table] = t })

  const tableData = tables
    .filter(t => !search || t.toLowerCase().includes(search.toLowerCase()))
    .map(name => {
      const ticket = tableOrderMap[name]
      let status: TableStatus = 'available'
      if (ticket) {
        const ks = ticket.kitchenStatus
        status = (ks === 'ready' || ks === 'served') ? 'waiting' : 'occupied'
      }
      const total = ticket
        ? ticket.items.filter(i => !i.voided).reduce((s, i) => s + i.price * i.qty, 0)
        : 0
      return { name, status, ticket, total, guestCount: ticket?.guestCount, elapsed: ticket?.timeline.created }
    })

  const counts = { available: 0, occupied: 0, waiting: 0 }
  tableData.forEach(t => counts[t.status]++)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{
            padding: '8px 16px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)',
            background: 'var(--surf)', color: 'var(--txt2)', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>← Back</button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>🍽 Dine-In</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>Select a table to begin an order</div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            {(['available','occupied','waiting'] as TableStatus[]).map(s => (
              <div key={s} style={{
                padding: '6px 14px', borderRadius: 'var(--r2)', background: STATUS_BG[s],
                border: `1px solid ${STATUS_COLOR[s]}44`,
                fontSize: 12, fontWeight: 700, color: STATUS_COLOR[s],
              }}>
                {counts[s]} {STATUS_LABEL[s]}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search table…"
            style={{
              flex: 1, padding: '9px 14px', borderRadius: 'var(--r)',
              border: '1px solid var(--bdr)', background: 'var(--surf)',
              color: 'var(--txt)', fontSize: 13,
            }}
          />
          <button onClick={onNewTable} style={{
            padding: '9px 20px', borderRadius: 'var(--r)', background: 'var(--blue)',
            border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>+ New Order</button>
        </div>
      </div>

      {/* Table grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {tableData.map(t => (
            <div key={t.name} style={{ position: 'relative' }}>
              <button onClick={() => onTableSelect(t.name)} style={{
                width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '24px 16px', borderRadius: 'var(--r3)',
                background: STATUS_BG[t.status],
                border: `2px solid ${STATUS_COLOR[t.status]}66`,
                cursor: 'pointer', transition: 'all .14s', textAlign: 'center',
                minHeight: 160,
              }}
                onMouseEnter={e => { e.currentTarget.style.border = `2px solid ${STATUS_COLOR[t.status]}` }}
                onMouseLeave={e => { e.currentTarget.style.border = `2px solid ${STATUS_COLOR[t.status]}66` }}
              >
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--txt)', marginBottom: 8 }}>{t.name}</div>
                <div style={{
                  fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                  background: STATUS_COLOR[t.status] + '22', color: STATUS_COLOR[t.status],
                  marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px',
                }}>{STATUS_LABEL[t.status]}</div>
                {t.ticket && (
                  <>
                    {t.guestCount && t.guestCount > 1 && (
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>
                        👥 {t.guestCount} guests
                      </div>
                    )}
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', fontFamily: 'var(--mono)' }}>
                      {fmt(t.total, sym)}
                    </div>
                    {t.elapsed && (
                      <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>since {t.elapsed}</div>
                    )}
                  </>
                )}
              </button>
              {t.ticket && (
                <button
                  title="Release table (void stale ticket)"
                  onClick={e => {
                    e.stopPropagation()
                    if (pendingRelease !== t.name) { setPendingRelease(t.name); return }
                    setPendingRelease(null)
                    dispatch({ type: 'UPDATE_ORDER_TICKET', id: t.ticket!.id, patch: { status: 'voided' } })
                  }}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: pendingRelease === t.name ? '#78350f88' : '#7f1d1d88', border: 'none',
                    color: pendingRelease === t.name ? '#fbbf24' : '#fca5a5',
                    borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700,
                    padding: '3px 8px', cursor: 'pointer', lineHeight: 1.4,
                  }}
                >
                  {pendingRelease === t.name ? 'Sure?' : 'Release'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
