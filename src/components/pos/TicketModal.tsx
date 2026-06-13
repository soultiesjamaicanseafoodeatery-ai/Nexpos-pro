'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { OrderTicket, Transaction, BusinessConfig, KitchenStatus, BarStatus, CarwashStatus, PrintWidth, ReprintLog } from '@/types'
import {
  buildCustomerReceipt, buildKitchenTicket, buildBarTicket,
  buildCarwashWorkOrder, smartPrint,
} from '@/lib/utils/ticketPrinter'

interface Props {
  isOpen: boolean
  onClose: () => void
  ticket: OrderTicket
  tx: Transaction
  biz: BusinessConfig
}

type Tab = 'customer' | 'kitchen' | 'bar' | 'carwash' | 'status'

const KITCHEN_COLORS: Record<KitchenStatus, string>  = { pending: 'var(--txt3)', preparing: 'var(--ora)', ready: 'var(--grn)', served: 'var(--blue)' }
const BAR_COLORS:     Record<BarStatus, string>       = { pending: 'var(--txt3)', preparing: 'var(--pur)', ready: 'var(--grn)' }
const CW_COLORS:      Record<CarwashStatus, string>   = { queued: 'var(--txt3)', in_progress: 'var(--ora)', completed: 'var(--grn)' }

export default function TicketModal({ isOpen, onClose, ticket, tx, biz }: Props) {
  const { state, dispatch, audit } = useApp()
  const [tab,      setTab]      = useState<Tab>('customer')
  const [width,    setWidth]    = useState<PrintWidth>(80)
  const [printing, setPrinting] = useState(false)

  if (!isOpen) return null

  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

  const orderData = {
    orderNum:    ticket.orderNum,
    table:       ticket.table,
    server:      ticket.server,
    guestCount:  ticket.guestCount,
    orderType:   ticket.orderType,
    date:        today,
    time:        now,
    items:       ticket.items,
    orderNote:    ticket.orderNote,
    customerName: ticket.customerName,
  }

  const receiptHTML = buildCustomerReceipt(tx, biz, { width })
  const kitchenHTML = buildKitchenTicket(orderData, { width })
  const barHTML     = buildBarTicket(orderData, { width })
  const carwashHTML = buildCarwashWorkOrder(orderData, { width })

  const handlePrint = async (type: Tab) => {
    if (printing) return
    const htmlMap: Record<string, string> = {
      customer: receiptHTML,
      kitchen:  kitchenHTML,
      bar:      barHTML,
      carwash:  carwashHTML,
    }
    const html = htmlMap[type]
    if (!html) return
    const titles: Record<string, string> = {
      customer: 'Customer Receipt',
      kitchen:  'Kitchen Ticket',
      bar:      'Bar Ticket',
      carwash:  'Car Wash Work Order',
    }
    const pw = (biz.printers?.width ?? 80) as 58 | 80
    const printerMap: Record<string, string | undefined> = {
      customer: biz.printers?.receipt,
      kitchen:  biz.printers?.kitchen,
      bar:      biz.printers?.bar || biz.printers?.kitchen,
      carwash:  biz.printers?.receipt,
    }
    setPrinting(true)
    try {
      await smartPrint(html, titles[type] ?? 'Ticket', printerMap[type], pw)
    } finally {
      setTimeout(() => setPrinting(false), 2000)
    }

    // Log reprint
    const user = state.currentUser?.name ?? 'System'
    audit(`PRINT_${type.toUpperCase()}`, `Printed ${titles[type]} for order #${ticket.orderNum}`, 'info')
    const reprintEntry: ReprintLog = { type: type as unknown as ReprintLog['type'], by: user, at: now }
    dispatch({
      type: 'UPDATE_ORDER_TICKET', id: ticket.id,
      patch: { reprints: [...ticket.reprints, reprintEntry] },
    })
  }

  const updateKitchenStatus = (status: KitchenStatus) => {
    const timeline = { ...ticket.timeline }
    if (status === 'preparing' && !timeline.kitchenPreparing) timeline.kitchenPreparing = now
    if (status === 'ready'     && !timeline.kitchenReady)     timeline.kitchenReady = now
    if (status === 'served'    && !timeline.served)           timeline.served = now
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: { kitchenStatus: status, timeline } })
    audit('KITCHEN_STATUS', `Order #${ticket.orderNum} kitchen → ${status}`, 'info')
  }

  const updateBarStatus = (status: BarStatus) => {
    const timeline = { ...ticket.timeline }
    if (status === 'preparing' && !timeline.barPreparing) timeline.barPreparing = now
    if (status === 'ready'     && !timeline.barReady)     timeline.barReady = now
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: { barStatus: status, timeline } })
    audit('BAR_STATUS', `Order #${ticket.orderNum} bar → ${status}`, 'info')
  }

  const updateCWStatus = (status: CarwashStatus) => {
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: { carwashStatus: status } })
  }

  // Live ticket from store (to reflect status updates)
  const live = state.orderTickets.find(t => t.id === ticket.id) ?? ticket

  const tabs = ([
    { id: 'customer' as Tab, lbl: 'Receipt',  show: true },
    { id: 'kitchen'  as Tab, lbl: 'Kitchen',  show: ticket.hasKitchen },
    { id: 'bar'      as Tab, lbl: 'Bar',      show: ticket.hasBar },
    { id: 'carwash'  as Tab, lbl: 'Car Wash', show: ticket.hasCarwash },
    { id: 'status'   as Tab, lbl: 'Status',   show: true },
  ] as { id: Tab; lbl: string; show: boolean }[]).filter(t => t.show)

  const previewHTML: Record<Tab, string> = {
    customer: receiptHTML,
    kitchen:  kitchenHTML,
    bar:      barHTML,
    carwash:  carwashHTML,
    status:   '',
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)',
        width: '100%', maxWidth: 560, maxHeight: '94vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>

        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Order #{ticket.orderNum}</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>
              {ticket.table ? `Table ${ticket.table} · ` : ''}{ticket.orderType}
              {ticket.guestCount && ticket.guestCount > 1 ? ` · ${ticket.guestCount} guests` : ''}
            </div>
          </div>
          {/* Print width toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([58, 80] as PrintWidth[]).map(w => (
              <button key={w} onClick={() => setWidth(w)} style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${width === w ? 'var(--blue)' : 'var(--bdr)'}`,
                background: width === w ? 'var(--blue-bg)' : 'transparent',
                color: width === w ? 'var(--blue)' : 'var(--txt3)',
              }}>{w}mm</button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: 'none', borderBottom: `2.5px solid ${tab === t.id ? 'var(--blue)' : 'transparent'}`,
              background: 'transparent', color: tab === t.id ? 'var(--blue)' : 'var(--txt3)',
              transition: 'all .12s',
            }}>{t.lbl}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Ticket preview */}
          {tab !== 'status' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--surf)' }}>
                {previewHTML[tab] ? (
                  <div style={{ background: '#fff', borderRadius: 'var(--r2)', padding: '12px 16px', boxShadow: '0 2px 12px rgba(0,0,0,.1)', fontFamily: "'Courier New', monospace", fontSize: 13, maxWidth: 420, margin: '0 auto' }}
                    dangerouslySetInnerHTML={{ __html: previewHTML[tab] }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--txt3)', fontSize: 13 }}>
                    No {tab} items in this order.
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => handlePrint(tab)} disabled={!previewHTML[tab] || printing} style={{
                  flex: 1, padding: 12, borderRadius: 'var(--r)', background: previewHTML[tab] && !printing ? 'var(--blue)' : 'var(--surf3)',
                  color: previewHTML[tab] && !printing ? '#fff' : 'var(--txt3)', border: 'none', fontWeight: 800, fontSize: 14, cursor: previewHTML[tab] && !printing ? 'pointer' : 'not-allowed',
                }}>
                  {printing ? 'Printing…' : `Print ${tab === 'customer' ? 'Receipt' : tab === 'kitchen' ? 'Kitchen Ticket' : tab === 'bar' ? 'Bar Ticket' : 'Work Order'}`}
                </button>
              </div>
            </>
          )}

          {/* Status tab */}
          {tab === 'status' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

              {/* Kitchen status */}
              {ticket.hasKitchen && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Kitchen Status</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {(['pending','preparing','ready','served'] as KitchenStatus[]).map(s => (
                      <button key={s} onClick={() => updateKitchenStatus(s)} style={{
                        padding: '10px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 11, cursor: 'pointer', textTransform: 'capitalize',
                        border: `2px solid ${live.kitchenStatus === s ? KITCHEN_COLORS[s] : 'var(--bdr)'}`,
                        background: live.kitchenStatus === s ? `${KITCHEN_COLORS[s]}22` : 'var(--surf)',
                        color: live.kitchenStatus === s ? KITCHEN_COLORS[s] : 'var(--txt3)',
                      }}>{s}</button>
                    ))}
                  </div>
                  {live.timeline.kitchenPreparing && (
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 6 }}>
                      Preparing at {live.timeline.kitchenPreparing}
                      {live.timeline.kitchenReady ? ` · Ready at ${live.timeline.kitchenReady}` : ''}
                      {live.timeline.served ? ` · Served at ${live.timeline.served}` : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Bar status */}
              {ticket.hasBar && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Bar Status</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {(['pending','preparing','ready'] as BarStatus[]).map(s => (
                      <button key={s} onClick={() => updateBarStatus(s)} style={{
                        padding: '10px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 11, cursor: 'pointer', textTransform: 'capitalize',
                        border: `2px solid ${live.barStatus === s ? BAR_COLORS[s] : 'var(--bdr)'}`,
                        background: live.barStatus === s ? `${BAR_COLORS[s]}22` : 'var(--surf)',
                        color: live.barStatus === s ? BAR_COLORS[s] : 'var(--txt3)',
                      }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Car wash status */}
              {ticket.hasCarwash && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Car Wash Status</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {(['queued','in_progress','completed'] as CarwashStatus[]).map(s => (
                      <button key={s} onClick={() => updateCWStatus(s)} style={{
                        padding: '10px 4px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                        border: `2px solid ${live.carwashStatus === s ? CW_COLORS[s] : 'var(--bdr)'}`,
                        background: live.carwashStatus === s ? `${CW_COLORS[s]}22` : 'var(--surf)',
                        color: live.carwashStatus === s ? CW_COLORS[s] : 'var(--txt3)',
                      }}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Order Timeline</div>
                <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                  {[
                    { label: 'Order Created',    time: live.timeline.created },
                    { label: 'Sent to Kitchen',  time: live.timeline.sentToKitchen },
                    { label: 'Preparing',        time: live.timeline.kitchenPreparing ?? live.timeline.barPreparing },
                    { label: 'Ready',            time: live.timeline.kitchenReady ?? live.timeline.barReady },
                    { label: 'Served',           time: live.timeline.served },
                    { label: 'Paid',             time: live.timeline.paid },
                  ].filter(e => e.time).map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--bdr2)', fontSize: 12 }}>
                      <span style={{ color: 'var(--txt3)' }}>{e.label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{e.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reprint history */}
              {live.reprints.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Print History</div>
                  <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                    {live.reprints.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--bdr2)', fontSize: 11 }}>
                        <span style={{ color: 'var(--txt3)', textTransform: 'capitalize' }}>{r.type} printed by {r.by}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>{r.at}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick reprint buttons */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Reprint</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                <button onClick={() => handlePrint('customer')} disabled={printing} style={{ padding: '10px 0', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: printing ? 'var(--txt3)' : 'var(--txt2)', fontWeight: 700, fontSize: 12, cursor: printing ? 'not-allowed' : 'pointer' }}>Receipt</button>
                {ticket.hasKitchen && <button onClick={() => handlePrint('kitchen')} disabled={printing} style={{ padding: '10px 0', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: printing ? 'var(--txt3)' : 'var(--txt2)', fontWeight: 700, fontSize: 12, cursor: printing ? 'not-allowed' : 'pointer' }}>Kitchen Ticket</button>}
                {ticket.hasBar     && <button onClick={() => handlePrint('bar')}     disabled={printing} style={{ padding: '10px 0', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: printing ? 'var(--txt3)' : 'var(--txt2)', fontWeight: 700, fontSize: 12, cursor: printing ? 'not-allowed' : 'pointer' }}>Bar Ticket</button>}
                {ticket.hasCarwash && <button onClick={() => handlePrint('carwash')} disabled={printing} style={{ padding: '10px 0', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: printing ? 'var(--txt3)' : 'var(--txt2)', fontWeight: 700, fontSize: 12, cursor: printing ? 'not-allowed' : 'pointer' }}>Work Order</button>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 8, flexShrink: 0 }}>
          {tab !== 'status' && (
            <button onClick={() => setTab('status')} style={{ padding: '9px 16px', borderRadius: 'var(--r)', background: 'transparent', border: '1.5px solid var(--bdr)', color: 'var(--txt3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Status
            </button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'var(--surf3)', border: 'none', color: 'var(--txt2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
