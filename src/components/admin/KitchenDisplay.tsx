'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { KitchenStatus, BarStatus, CarwashStatus, OrderTicket } from '@/types'
import { buildKitchenTicket, buildBarTicket, smartPrint } from '@/lib/utils/ticketPrinter'

type FilterMode = 'all' | 'kitchen' | 'bar' | 'carwash'
type StatusFilter = 'active' | 'pending' | 'preparing' | 'ready' | 'served' | 'done'

const KITCHEN_LABELS: Record<KitchenStatus, string>  = { pending: 'Pending', preparing: 'Preparing', ready: 'Ready', served: 'Served' }
const BAR_LABELS:     Record<BarStatus, string>       = { pending: 'Pending', preparing: 'Making', ready: 'Ready' }
const CW_LABELS:      Record<CarwashStatus, string>   = { queued: 'Queued', in_progress: 'In Progress', completed: 'Done' }

const KITCHEN_BADGE: Record<KitchenStatus, { bg: string; color: string }> = {
  pending:   { bg: 'var(--surf3)', color: 'var(--txt3)' },
  preparing: { bg: '#78350f44',   color: 'var(--ora)' },
  ready:     { bg: '#14532d44',   color: 'var(--grn)' },
  served:    { bg: '#1e3a5f44',   color: 'var(--blue)' },
}
const BAR_BADGE: Record<BarStatus, { bg: string; color: string }> = {
  pending:   { bg: 'var(--surf3)', color: 'var(--txt3)' },
  preparing: { bg: '#4c1d9544',   color: 'var(--pur)' },
  ready:     { bg: '#14532d44',   color: 'var(--grn)' },
}
const CW_BADGE: Record<CarwashStatus, { bg: string; color: string }> = {
  queued:      { bg: 'var(--surf3)', color: 'var(--txt3)' },
  in_progress: { bg: '#78350f44',   color: 'var(--ora)' },
  completed:   { bg: '#14532d44',   color: 'var(--grn)' },
}

function elapsed(createdTime: string | undefined): string {
  if (!createdTime) return '—'
  try {
    let created = new Date(createdTime)
    if (isNaN(created.getTime())) {
      const now = new Date()
      const [h, m] = createdTime.replace(/[AP]M/i, '').trim().split(':').map(Number)
      if (isNaN(h) || isNaN(m)) return '—'
      const isPM = /pm/i.test(createdTime)
      const hour = isPM && h !== 12 ? h + 12 : (!isPM && h === 12 ? 0 : h)
      created = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, m)
      if (created > now) created.setDate(created.getDate() - 1)
    }
    const diff = Math.floor((Date.now() - created.getTime()) / 60000)
    if (diff < 0 || diff > 1440) return '—'
    if (diff < 1) return '< 1m'
    if (diff < 60) return `\m`
    return `\h \m`
  } catch {
    return '—'
  }
}

export default function KitchenDisplay() {
  const { state, dispatch, audit } = useApp()
  const { orderTickets, currentUser, biz } = state

  const [filter,       setFilter]       = useState<FilterMode>('all')
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const prevPendingRef                    = useRef(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [searchQ,      setSearchQ]      = useState('')
  const [printing,     setPrinting]     = useState<string | null>(null)

  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const pendingCount = orderTickets.filter(t => t.kitchenStatus === 'pending').length
  useEffect(() => {
    if (pendingCount > prevPendingRef.current) {
      setNewOrderAlert(true)
      const t = setTimeout(() => setNewOrderAlert(false), 4000)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('New Order', { body: `\ order(s) waiting`, icon: '/favicon.ico' })
      }
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.4, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
        setTimeout(() => ctx.close(), 1000)
      } catch {}
      return () => clearTimeout(t)
    }
    prevPendingRef.current = pendingCount
  }, [pendingCount])

  const updateKitchen = (ticket: OrderTicket, status: KitchenStatus) => {
    const timeline = { ...ticket.timeline }
    if (status === 'preparing' && !timeline.kitchenPreparing) timeline.kitchenPreparing = now
    if (status === 'ready'     && !timeline.kitchenReady)     timeline.kitchenReady = now
    if (status === 'served'    && !timeline.served)           timeline.served = now
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: { kitchenStatus: status, timeline } })
    audit('KITCHEN_STATUS', `Order #${ticket.orderNum} kitchen → ${status}`, 'info')
  }

  const updateBar = (ticket: OrderTicket, status: BarStatus) => {
    const timeline = { ...ticket.timeline }
    if (status === 'preparing' && !timeline.barPreparing) timeline.barPreparing = now
    if (status === 'ready'     && !timeline.barReady)     timeline.barReady = now
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: { barStatus: status, timeline } })
    audit('BAR_STATUS', `Order #${ticket.orderNum} bar → ${status}`, 'info')
  }

  const updateCW = (ticket: OrderTicket, status: CarwashStatus) => {
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: { carwashStatus: status } })
  }

  const handleReprint = async (ticket: OrderTicket, type: 'kitchen' | 'bar') => {
    if (printing) return
    const originalTs = ticket.timeline?.created
    const originalDate = originalTs ? (() => { const d = new Date(originalTs); return isNaN(d.getTime()) ? null : d })() : null
    const today = originalDate
      ? originalDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    const time = originalDate
      ? originalDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : (originalTs ?? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
    const pw    = (biz.printers?.width ?? 80) as 58 | 80
    const orderData = {
      orderNum: ticket.orderNum, table: ticket.table, server: ticket.server,
      guestCount: ticket.guestCount, orderType: ticket.orderType,
      date: today, time, items: ticket.items,
      orderNote: ticket.orderNote ? ("*** REPRINT *** | " + ticket.orderNote) : '*** REPRINT ***',
      customerName: ticket.customerName,
    }
    const html        = type === 'kitchen' ? buildKitchenTicket(orderData, { width: pw }) : buildBarTicket(orderData, { width: pw })
    const printerName = type === 'kitchen' ? biz.printers?.kitchen : (biz.printers?.bar || biz.printers?.kitchen)
    setPrinting(ticket.id + type)
    try {
      await smartPrint(html, type === 'kitchen' ? 'Kitchen Ticket' : 'Bar Ticket', printerName, pw)
      audit('REPRINT', `Reprinted ${type} ticket for order #${ticket.orderNum}`, 'info')
    } finally {
      setTimeout(() => setPrinting(null), 2000)
    }
  }

  const isTicketPaid = (t: OrderTicket) =>
    (t.status ?? (t.txId ? 'paid' : 'sent')) === 'paid'

  const activeTickets = useMemo(() => orderTickets.filter(t => !isTicketPaid(t)), [orderTickets])

  const filtered = useMemo(() => {
    return activeTickets.filter(t => {
      // Module filter
      if (filter === 'kitchen' && !t.hasKitchen) return false
      if (filter === 'bar'     && !t.hasBar)     return false
      if (filter === 'carwash' && !t.hasCarwash) return false

      // Status filter
      const kitchenDone = t.kitchenStatus === 'served' || !t.hasKitchen
      const barDone     = t.barStatus === 'ready' || !t.hasBar
      const cwDone      = t.carwashStatus === 'completed' || !t.hasCarwash
      const allDone     = kitchenDone && barDone && cwDone

      if (statusFilter === 'active')   return !allDone
      if (statusFilter === 'done')     return allDone
      if (statusFilter === 'pending')  return (t.hasKitchen && t.kitchenStatus === 'pending') || (t.hasBar && t.barStatus === 'pending')
      if (statusFilter === 'preparing')return (t.hasKitchen && t.kitchenStatus === 'preparing') || (t.hasBar && t.barStatus === 'preparing')
      if (statusFilter === 'ready')    return (t.hasKitchen && t.kitchenStatus === 'ready') || (t.hasBar && t.barStatus === 'ready') || (t.hasCarwash && t.carwashStatus === 'in_progress')
      if (statusFilter === 'served')   return t.kitchenStatus === 'served'
      return true
    }).filter(t => {
      if (!searchQ) return true
      const q = searchQ.toLowerCase()
      return t.orderNum.includes(q) ||
        (t.table ?? '').toLowerCase().includes(q) ||
        (t.customerName ?? '').toLowerCase().includes(q) ||
        t.server.toLowerCase().includes(q)
    })
  }, [activeTickets, filter, statusFilter, searchQ])

  const pending   = activeTickets.filter(t => (t.hasKitchen && t.kitchenStatus === 'pending') || (t.hasBar && t.barStatus === 'pending')).length
  const preparing = activeTickets.filter(t => (t.hasKitchen && t.kitchenStatus === 'preparing') || (t.hasBar && t.barStatus === 'preparing')).length
  const ready     = activeTickets.filter(t => (t.hasKitchen && t.kitchenStatus === 'ready') || (t.hasBar && t.barStatus === 'ready')).length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)' }}>Kitchen Display</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{activeTickets.length} open · {orderTickets.length} total</div>
          </div>

          {/* Live counters */}
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {[
              { label: 'Pending',   count: pending,   color: 'var(--txt3)' },
              { label: 'Preparing', count: preparing, color: 'var(--ora)' },
              { label: 'Ready',     count: ready,     color: 'var(--grn)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '6px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)' }}>{s.count}</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Module filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([['all', 'All'], ['kitchen', 'Kitchen'], ['bar', 'Bar'], ['carwash', 'Car Wash']] as const).map(([f, lbl]) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${filter === f ? 'transparent' : 'var(--bdr)'}`,
                background: filter === f ? 'var(--blue)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--txt3)',
              }}>{lbl}</button>
            ))}
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([['active', 'Active'], ['pending', 'Pending'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['served', 'Served'], ['done', 'Done']] as const).map(([f, lbl]) => (
              <button key={f} onClick={() => setStatusFilter(f)} style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${statusFilter === f ? 'transparent' : 'var(--bdr)'}`,
                background: statusFilter === f ? 'var(--surf3)' : 'transparent',
                color: statusFilter === f ? 'var(--txt)' : 'var(--txt3)',
              }}>{lbl}</button>
            ))}
          </div>

          {/* Search */}
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search order, table, customer…"
            style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 20, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12, minWidth: 200 }} />
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🍳</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)' }}>No orders matching this filter</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {filtered.map(ticket => {
              const live = state.orderTickets.find(t => t.id === ticket.id) ?? ticket
              const elapsedTime = elapsed(live.timeline?.created)
              const isUrgent = (() => {
                const mins = parseInt(elapsedTime)
                return !isNaN(mins) && mins > 20 && (live.kitchenStatus === 'pending' || live.kitchenStatus === 'preparing')
              })()
              const awaitingPayment = (live.kitchenStatus === 'ready' || live.kitchenStatus === 'served') && !isTicketPaid(live)

              return (
                <div key={ticket.id} style={{
                  background: 'var(--bg2)', border: `2px solid ${isUrgent ? 'var(--red, #ef4444)' : 'var(--bdr)'}`,
                  borderRadius: 'var(--r3)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                }}>
                  {/* Card header */}
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8, background: isUrgent ? '#7f1d1d11' : 'transparent' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>
                        #{live.orderNum}
                        {live.table && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: 'var(--txt3)' }}>· Table {live.table}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>
                        {live.server}
                        {live.customerName && ` · ${live.customerName}`}
                        {live.guestCount && live.guestCount > 1 ? ` · ${live.guestCount} guests` : ''}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      {awaitingPayment && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', background: '#78350f33', border: '1px solid #f59e0b55', borderRadius: 6, padding: '2px 6px', letterSpacing: '.4px', textTransform: 'uppercase' }}>
                          Awaiting Payment
                        </span>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: isUrgent ? 'var(--red, #ef4444)' : 'var(--txt3)' }}>{elapsedTime}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{live.timeline.created}</div>
                    </div>
                  </div>

                  {/* Items list */}
                  <div style={{ padding: '10px 14px', flex: 1 }}>
                    {(live.items ?? []).map((ci, i) => (
                      <div key={ci.id + i} style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 4, display: 'flex', gap: 6 }}>
                        <span style={{ fontWeight: 700, minWidth: 18, color: 'var(--txt)' }}>{ci.qty}×</span>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--txt)' }}>{ci.name}</div>
                          {ci.flavour && <div style={{ fontSize: 10, color: 'var(--ora)' }}>Flavour: {ci.flavour}</div>}
                          {ci.size    && <div style={{ fontSize: 10, color: 'var(--pur)' }}>Size: {ci.size}</div>}
                          {ci.sides?.length && <div style={{ fontSize: 10, color: 'var(--grn)' }}>Sides: {ci.sides.join(', ')}</div>}
                          {ci.addons.length > 0 && <div style={{ fontSize: 10, color: 'var(--txt3)' }}>+{ci.addons.map(a => a.name).join(', ')}</div>}
                          {ci.note && <div style={{ fontSize: 10, color: 'var(--red, #ef4444)', fontWeight: 700 }}>NOTE: {ci.note}</div>}
                        </div>
                      </div>
                    ))}
                    {live.orderNote && (
                      <div style={{ marginTop: 8, padding: '6px 8px', background: '#78350f22', border: '1px solid #f9731633', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--ora)', fontWeight: 600 }}>
                        SPECIAL: {live.orderNote}
                      </div>
                    )}
                  </div>

                  {/* Status controls */}
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bdr)', display: 'flex', flexDirection: 'column', gap: 6 }}>

                    {/* Kitchen status */}
                    {live.hasKitchen && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Kitchen</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(['pending','preparing','ready','served'] as KitchenStatus[]).map(s => {
                            const styles = KITCHEN_BADGE[s]
                            const isActive = live.kitchenStatus === s
                            return (
                              <button key={s} onClick={() => updateKitchen(live, s)} style={{
                                flex: 1, padding: '7px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 10, cursor: 'pointer',
                                border: `2px solid ${isActive ? styles.color : 'var(--bdr)'}`,
                                background: isActive ? styles.bg : 'var(--surf)',
                                color: isActive ? styles.color : 'var(--txt3)', transition: 'all .1s',
                                textTransform: 'capitalize',
                              }}>{KITCHEN_LABELS[s]}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bar status */}
                    {live.hasBar && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Bar</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(['pending','preparing','ready'] as BarStatus[]).map(s => {
                            const styles = BAR_BADGE[s]
                            const isActive = live.barStatus === s
                            return (
                              <button key={s} onClick={() => updateBar(live, s)} style={{
                                flex: 1, padding: '7px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 10, cursor: 'pointer',
                                border: `2px solid ${isActive ? styles.color : 'var(--bdr)'}`,
                                background: isActive ? styles.bg : 'var(--surf)',
                                color: isActive ? styles.color : 'var(--txt3)', transition: 'all .1s',
                                textTransform: 'capitalize',
                              }}>{BAR_LABELS[s]}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Carwash status */}
                    {live.hasCarwash && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>Car Wash</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(['queued','in_progress','completed'] as CarwashStatus[]).map(s => {
                            const styles = CW_BADGE[s]
                            const isActive = live.carwashStatus === s
                            return (
                              <button key={s} onClick={() => updateCW(live, s)} style={{
                                flex: 1, padding: '7px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 10, cursor: 'pointer',
                                border: `2px solid ${isActive ? styles.color : 'var(--bdr)'}`,
                                background: isActive ? styles.bg : 'var(--surf)',
                                color: isActive ? styles.color : 'var(--txt3)', transition: 'all .1s',
                              }}>{CW_LABELS[s]}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Reprint buttons */}
                    {(live.hasKitchen || live.hasBar) && (
                      <div style={{ display: 'flex', gap: 4, paddingTop: 4, borderTop: '1px solid var(--bdr2)', marginTop: 2 }}>
                        {live.hasKitchen && (
                          <button onClick={() => handleReprint(live, 'kitchen')} disabled={!!printing} style={{
                            flex: 1, padding: '6px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 10,
                            cursor: printing ? 'not-allowed' : 'pointer',
                            border: '1.5px solid var(--bdr)', background: 'var(--surf)',
                            color: printing === live.id + 'kitchen' ? 'var(--ora)' : 'var(--txt3)',
                          }}>🖨 {printing === live.id + 'kitchen' ? 'Printing…' : 'Kitchen'}</button>
                        )}
                        {live.hasBar && (
                          <button onClick={() => handleReprint(live, 'bar')} disabled={!!printing} style={{
                            flex: 1, padding: '6px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 10,
                            cursor: printing ? 'not-allowed' : 'pointer',
                            border: '1.5px solid var(--bdr)', background: 'var(--surf)',
                            color: printing === live.id + 'bar' ? 'var(--pur)' : 'var(--txt3)',
                          }}>🖨 {printing === live.id + 'bar' ? 'Printing…' : 'Bar'}</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
