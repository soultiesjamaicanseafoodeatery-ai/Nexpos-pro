'use client'
import { useState, useMemo } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { OrderTicket, HeldOrder, Transaction, CartItem } from '@/types'
import { buildCustomerReceipt, smartPrint } from '@/lib/utils/ticketPrinter'
import { jamaicaDateKey } from '@/lib/utils/businessDate'

// ── Helpers ───────────────────────────────────────────────────
function txDateKey(ts: string): string {
  try { return jamaicaDateKey(ts) } catch { return '' }
}

function elapsedMin(ts: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
    if (diff < 0 || diff > 1440) return '—'
    if (diff < 1) return '< 1m'
    if (diff < 60) return `${diff}m`
    return `${Math.floor(diff / 60)}h ${diff % 60}m`
  } catch { return '—' }
}

function itemsTotal(items: CartItem[]): number {
  return items.filter(i => !i.voided).reduce((s, i) =>
    s + (i.price + i.addons.reduce((a, x) => a + x.price, 0)) * i.qty, 0)
}

function cartTotal(cart: CartItem[]): number {
  return cart.filter(i => !i.voided).reduce((s, i) =>
    s + (i.price + i.addons.reduce((a, x) => a + x.price, 0)) * i.qty, 0)
}

function fmtTime(ts: string): string {
  try { return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}

function fmtDateTime(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}

function orderTypeLabel(orderType: string, table?: string | null): string {
  if (table) return `Table ${table}`
  switch (orderType) {
    case 'dine-in':  return 'Dine-In'
    case 'takeout':  return 'Takeout'
    case 'delivery': return 'Delivery'
    case 'walk-in':  return 'Walk-In'
    case 'carwash':  return 'Car Wash'
    default: return orderType ? orderType.charAt(0).toUpperCase() + orderType.slice(1) : 'Walk-In'
  }
}

function moduleBadge(mod: string): { label: string; color: string } {
  switch (mod) {
    case 'restaurant': return { label: 'Restaurant', color: 'var(--grn)' }
    case 'bar':        return { label: 'Bar',         color: 'var(--pur)' }
    case 'carwash':    return { label: 'Car Wash',    color: 'var(--blue)' }
    default:           return { label: mod || 'Order', color: 'var(--txt3)' }
  }
}

function payLabel(pay: string): string {
  switch (pay) {
    case 'cash':        return 'Cash'
    case 'debit':       return 'Debit Card'
    case 'credit':      return 'Credit Card'
    case 'gift_card':   return 'Gift Card'
    case 'tab':         return 'House Account'
    default: return pay ? pay.charAt(0).toUpperCase() + pay.slice(1) : '—'
  }
}

function ticketStatus(t: OrderTicket): string {
  const s = t.status ?? (t.txId ? 'paid' : 'sent')
  if (s === 'paid') return 'Paid'
  if (t.hasKitchen && t.kitchenStatus === 'ready')    return 'Ready'
  if (t.hasKitchen && t.kitchenStatus === 'preparing') return 'Preparing'
  if (t.hasBar    && t.barStatus     === 'ready')     return 'Bar Ready'
  if (t.hasBar    && t.barStatus     === 'preparing') return 'Bar Making'
  return 'Sent'
}

function statusColor(s: string): string {
  if (s === 'Ready' || s === 'Bar Ready') return 'var(--grn)'
  if (s === 'Preparing' || s === 'Bar Making') return 'var(--ora)'
  if (s === 'Paid') return 'var(--blue)'
  return 'var(--txt3)'
}

// ── Transfer Modal ─────────────────────────────────────────────
function TransferModal({ ticket, onClose }: { ticket: OrderTicket; onClose: () => void }) {
  const { state, dispatch, audit } = useApp()
  const { currentUser, users, activeModule } = state
  const [destId, setDestId] = useState('')
  const eligible = users.filter(u => u.active && u.id !== currentUser?.id)
  const destUser = eligible.find(u => u.id === destId) ?? null

  function doTransfer() {
    if (!currentUser || !destUser) return
    dispatch({ type: 'TRANSFER_ORDER', ticketId: ticket.id, toUserName: destUser.name })
    audit('ORDER_TRANSFER',
      `Order #${ticket.orderNum} transferred ${currentUser.name} → ${destUser.name}`, 'info')
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#00000066', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 24, width: 340, maxWidth: '90vw' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Transfer Order</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>
          #{ticket.orderNum} · {orderTypeLabel(ticket.orderType, ticket.table)}
          {ticket.customerName && ` · ${ticket.customerName}`}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Transfer to</div>
        <select
          value={destId}
          onChange={e => setDestId(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--r2)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 13, marginBottom: 18 }}
        >
          <option value="">Select employee…</option>
          {eligible.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--r2)', border: '1.5px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={doTransfer} disabled={!destUser} style={{ padding: '9px 18px', borderRadius: 'var(--r2)', border: 'none', background: destUser ? 'var(--blue)' : 'var(--surf3)', color: destUser ? '#fff' : 'var(--txt3)', fontWeight: 700, fontSize: 13, cursor: destUser ? 'pointer' : 'not-allowed' }}>Transfer</button>
        </div>
      </div>
    </div>
  )
}

// ── View Details Modal ─────────────────────────────────────────
function DetailsModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { state } = useApp()
  const { biz } = state
  const sym = biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const receiptNum = String(tx.id).slice(-4).padStart(4, '0')
  const mod = moduleBadge(tx.mod)
  const [printing, setPrinting] = useState(false)

  async function reprint() {
    if (printing) return
    setPrinting(true)
    try {
      const html = buildCustomerReceipt(tx, biz, { width: biz.printers?.width ?? 80 })
      await smartPrint(html, 'Receipt', biz.printers?.receipt, biz.printers?.width ?? 80)
    } finally { setPrinting(false) }
  }

  const status = tx.voided ? 'Voided' : tx.refunded ? 'Refunded' : 'Completed'
  const statusCol = tx.voided ? '#ef4444' : tx.refunded ? 'var(--ora)' : 'var(--grn)'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#00000077', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', width: 480, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Receipt #{receiptNum}</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{fmtDateTime(tx.ts)}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${statusCol}22`, color: statusCol, border: `1px solid ${statusCol}44` }}>{status}</span>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          {/* Info rows */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 14 }}>
            {[
              ['Cashier', tx.cashier],
              ['Module', mod.label],
              ['Order Type', orderTypeLabel(tx.orderType ?? '', tx.tableNum)],
              tx.customerName ? ['Customer', tx.customerName] : null,
              tx.guestCount && tx.guestCount > 1 ? ['Guests', String(tx.guestCount)] : null,
              tx.orderNum ? ['Order #', tx.orderNum] : null,
            ].filter((r): r is [string, string] => r !== null).map(([l, v]) => (
              <div key={l as string}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Items */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Items</div>
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 12px', marginBottom: 14 }}>
            {tx.items && tx.items.length > 0 ? tx.items.map((ci, i) => (
              <div key={ci.id + i} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: i < tx.items!.length - 1 ? '1px solid var(--bdr2)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ci.voided ? 'var(--txt3)' : 'var(--txt)' }}>
                    {ci.qty > 1 && <span style={{ color: 'var(--txt3)', marginRight: 4 }}>{ci.qty}×</span>}
                    {ci.name}
                    {ci.voided && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 6 }}>VOID</span>}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: ci.voided ? 'var(--txt3)' : 'var(--txt)' }}>
                    {fmt((ci.price + ci.addons.reduce((a, x) => a + x.price, 0)) * ci.qty)}
                  </div>
                </div>
                {ci.size    && <div style={{ fontSize: 11, color: 'var(--pur)', marginTop: 2 }}>Size: {ci.size}</div>}
                {ci.flavour && <div style={{ fontSize: 11, color: 'var(--ora)', marginTop: 2 }}>Flavour: {ci.flavour}</div>}
                {ci.sides?.length ? <div style={{ fontSize: 11, color: 'var(--grn)', marginTop: 2 }}>Sides: {ci.sides.join(', ')}</div> : null}
                {ci.addons.map(a => <div key={a.id} style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>+ {a.name} {a.price > 0 ? fmt(a.price) : ''}</div>)}
                {ci.note && <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, marginTop: 2 }}>NOTE: {ci.note}</div>}
              </div>
            )) : (
              <div style={{ fontSize: 13, color: 'var(--txt2)' }}>{tx.item}</div>
            )}
          </div>

          {/* Totals */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px 12px', marginBottom: 14 }}>
            {[
              ['Subtotal',      tx.sub,           true],
              tx.disc > 0             ? ['Discount',       -tx.disc,         true] : null,
              (tx.gct ?? 0) > 0       ? ['GCT (15%)',      tx.gct!,          true] : null,
              (tx.serviceCharge??0)>0 ? ['Service (10%)',  tx.serviceCharge!, true] : null,
              (tx.gratuity??0)>0      ? [`Gratuity (${tx.gratuityPct??15}%)`, tx.gratuity!, true] : null,
              (tx.surchargeTotal??0)>0? ['Surcharges',     tx.surchargeTotal!,true] : null,
            ].filter((r): r is [string, number, boolean] => r !== null).map(([l, v]) => (
              <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: 'var(--txt2)' }}>
                <span>{l as string}</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(v as number)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 6, borderTop: '1px solid var(--bdr)', fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>
              <span>Total</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{fmt(tx.total)}</span>
            </div>
          </div>

          {/* Payment */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Payment</div>
            {tx.payments && tx.payments.length > 1 ? tx.payments.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt2)', padding: '2px 0' }}>
                <span>{payLabel(p.method)}</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(p.amount)}</span>
              </div>
            )) : (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{payLabel(tx.pay)}</div>
            )}
            {tx.tender    != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt2)', marginTop: 4 }}><span>Tendered</span><span style={{ fontFamily: 'var(--mono)' }}>{fmt(tx.tender)}</span></div>}
            {tx.changeDue != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}><span>Change</span><span style={{ fontFamily: 'var(--mono)' }}>{fmt(tx.changeDue)}</span></div>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--r2)', border: '1.5px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Close</button>
          <button onClick={reprint} disabled={printing} style={{ padding: '9px 18px', borderRadius: 'var(--r2)', border: 'none', background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: printing ? 'not-allowed' : 'pointer', opacity: printing ? 0.7 : 1 }}>
            {printing ? 'Printing…' : '🖨 Reprint Receipt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function MyOrdersPage() {
  const { state, dispatch } = useApp()
  const { currentUser, orderTickets, heldOrders, transactions, users, biz } = state
  const sym = biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const isManager = ['admin', 'manager'].includes(currentUser?.role ?? '')
  const todayStr  = jamaicaDateKey()

  const [tab,          setTab]          = useState<'active' | 'history'>('active')
  const [searchQ,      setSearchQ]      = useState('')
  const [dateFilter,   setDateFilter]   = useState<'today' | 'yesterday' | 'last7' | 'custom'>('today')
  const [customFrom,   setCustomFrom]   = useState(todayStr)
  const [customTo,     setCustomTo]     = useState(todayStr)
  const [empFilter,    setEmpFilter]    = useState('')          // employee name filter (manager+)
  const [transferTicket, setTransferTicket] = useState<OrderTicket | null>(null)
  const [detailTx,     setDetailTx]     = useState<Transaction | null>(null)
  const [reprinting,   setReprinting]   = useState<number | null>(null)

  // ── Active: open tickets ──────────────────────────────────────
  const myTickets = useMemo(() => {
    return orderTickets.filter(t => {
      const status = t.status ?? (t.txId ? 'paid' : 'sent')
      if (status === 'paid' || status === 'voided') return false
      if (!isManager && t.server !== (currentUser?.name ?? '')) return false
      if (isManager && empFilter && t.server !== empFilter) return false
      return true
    }).sort((a, b) => {
      try { return new Date(a.timeline.created).getTime() - new Date(b.timeline.created).getTime() } catch { return 0 }
    })
  }, [orderTickets, isManager, currentUser, empFilter])

  // ── Active: held/draft orders ─────────────────────────────────
  const myHeld = useMemo(() => {
    return heldOrders.filter(h => {
      if (!isManager && h.savedBy !== (currentUser?.name ?? '')) return false
      if (isManager && empFilter && h.savedBy !== empFilter) return false
      return true
    })
  }, [heldOrders, isManager, currentUser, empFilter])

  // ── History: transactions ─────────────────────────────────────
  const dateRange = useMemo(() => {
    const yestStr = jamaicaDateKey(Date.now() - 24 * 60 * 60 * 1000)
    const weekStr = jamaicaDateKey(Date.now() - 6 * 24 * 60 * 60 * 1000)
    if (dateFilter === 'today')     return { from: todayStr, to: todayStr }
    if (dateFilter === 'yesterday') return { from: yestStr,  to: yestStr  }
    if (dateFilter === 'last7')     return { from: weekStr,  to: todayStr }
    return { from: customFrom, to: customTo }
  }, [dateFilter, customFrom, customTo, todayStr])

  const historyTxs = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return transactions.filter(tx => {
      const d = txDateKey(tx.ts)
      if (d < dateRange.from || d > dateRange.to) return false
      if (!isManager && tx.cashier !== (currentUser?.name ?? '')) return false
      if (isManager && empFilter && tx.cashier !== empFilter) return false
      if (q) {
        const receiptNum = String(tx.id).slice(-4).padStart(4, '0')
        if (!receiptNum.includes(q) &&
            !(tx.tableNum ?? '').toLowerCase().includes(q) &&
            !(tx.customerName ?? '').toLowerCase().includes(q) &&
            !(tx.orderNum ?? '').toLowerCase().includes(q) &&
            !(tx.cashier ?? '').toLowerCase().includes(q)) return false
      }
      return true
    }).sort((a, b) => b.id - a.id)
  }, [transactions, dateRange, isManager, currentUser, empFilter, searchQ])

  const activeTicketsFiltered = useMemo(() => {
    if (!searchQ.trim()) return myTickets
    const q = searchQ.trim().toLowerCase()
    return myTickets.filter(t =>
      t.orderNum.includes(q) ||
      (t.table ?? '').toLowerCase().includes(q) ||
      (t.customerName ?? '').toLowerCase().includes(q) ||
      t.server.toLowerCase().includes(q)
    )
  }, [myTickets, searchQ])

  const allEmployees = useMemo(() => users.filter(u => u.active).map(u => u.name).sort(), [users])

  async function quickReprint(tx: Transaction) {
    if (reprinting) return
    setReprinting(tx.id)
    try {
      const html = buildCustomerReceipt(tx, biz, { width: biz.printers?.width ?? 80 })
      await smartPrint(html, 'Receipt', biz.printers?.receipt, biz.printers?.width ?? 80)
    } finally { setReprinting(null) }
  }

  const btnStyle = (active: boolean, color = 'var(--blue)'): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: `1.5px solid ${active ? color : 'var(--bdr)'}`,
    background: active ? color : 'transparent',
    color: active ? '#fff' : 'var(--txt3)',
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)' }}>My Orders</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>
              {tab === 'active'
                ? `${myTickets.length} open · ${myHeld.length} draft`
                : `${historyTxs.length} orders`}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setTab('active')}  style={btnStyle(tab === 'active',  'var(--blue)')}>Active</button>
            <button onClick={() => setTab('history')} style={btnStyle(tab === 'history', 'var(--blue)')}>History</button>
          </div>

          {/* Search */}
          <input
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search order, table, customer…"
            style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 20, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12, minWidth: 200 }}
          />
        </div>

        {/* Filters row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Date filters — history tab only */}
          {tab === 'history' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(['today','yesterday','last7'] as const).map(f => (
                <button key={f} onClick={() => setDateFilter(f)} style={btnStyle(dateFilter === f, 'var(--surf3)')}>
                  {f === 'today' ? 'Today' : f === 'yesterday' ? 'Yesterday' : 'Last 7 Days'}
                </button>
              ))}
              {isManager && (
                <button onClick={() => setDateFilter('custom')} style={btnStyle(dateFilter === 'custom', 'var(--surf3)')}>Custom</button>
              )}
              {isManager && dateFilter === 'custom' && (
                <>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12 }} />
                  <span style={{ fontSize: 12, color: 'var(--txt3)', alignSelf: 'center' }}>to</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12 }} />
                </>
              )}
            </div>
          )}

          {/* Employee filter (manager+) */}
          {isManager && (
            <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)', background: 'var(--surf)', color: empFilter ? 'var(--txt)' : 'var(--txt3)', fontSize: 12 }}>
              <option value="">All Employees</option>
              {allEmployees.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

        {/* ── ACTIVE TAB ─────────────────────────────────────── */}
        {tab === 'active' && (
          <>
            {/* Open Orders */}
            {activeTicketsFiltered.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>
                  Open Orders ({activeTicketsFiltered.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginBottom: 20 }}>
                  {activeTicketsFiltered.map(ticket => {
                    const mod = moduleBadge(ticket.hasCarwash ? 'carwash' : ticket.hasBar ? 'bar' : 'restaurant')
                    const status = ticketStatus(ticket)
                    const total = itemsTotal(ticket.items)
                    const canTransfer = isManager || ticket.server === (currentUser?.name ?? '')
                    return (
                      <div key={ticket.id} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>#{ticket.orderNum}</div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: `${mod.color}22`, color: mod.color, border: `1px solid ${mod.color}44` }}>{mod.label}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 2 }}>{orderTypeLabel(ticket.orderType, ticket.table)}{ticket.customerName ? ` · ${ticket.customerName}` : ''}</div>
                            {isManager && <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Server: {ticket.server}</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(status) }}>{status}</div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{elapsedMin(ticket.timeline.created)}</div>
                          </div>
                        </div>

                        <div style={{ padding: '8px 14px', flex: 1 }}>
                          {ticket.items.slice(0, 3).map((ci, i) => !ci.voided && (
                            <div key={ci.id + i} style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 2 }}>
                              {ci.qty > 1 && <span style={{ fontWeight: 700, marginRight: 4 }}>{ci.qty}×</span>}{ci.name}
                            </div>
                          ))}
                          {ticket.items.filter(i => !i.voided).length > 3 && (
                            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>+{ticket.items.filter(i => !i.voided).length - 3} more</div>
                          )}
                        </div>

                        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--grn)', fontFamily: 'var(--mono)' }}>{fmt(total)}</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {canTransfer && (
                              <button onClick={() => setTransferTicket(ticket)} style={{ padding: '6px 10px', borderRadius: 'var(--r2)', border: '1.5px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Transfer</button>
                            )}
                            <button onClick={() => dispatch({ type: 'SET_PAGE', page: 'pos' })} style={{ padding: '6px 10px', borderRadius: 'var(--r2)', border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Open POS</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Draft Orders */}
            {myHeld.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>
                  Draft Orders ({myHeld.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {myHeld.map(order => {
                    const mod = moduleBadge(order.module)
                    const total = cartTotal(order.cart)
                    return (
                      <div key={order.id} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>{order.label || 'Draft Order'}</div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: `${mod.color}22`, color: mod.color, border: `1px solid ${mod.color}44` }}>{mod.label}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{orderTypeLabel(order.orderType, order.selTable)}{order.customerName ? ` · ${order.customerName}` : ''}</div>
                            {isManager && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>By: {order.savedBy}</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: 'var(--surf3)', color: 'var(--txt3)', border: '1px solid var(--bdr)' }}>Draft</span>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>{fmtTime(order.savedAt)}</div>
                          </div>
                        </div>
                        <div style={{ padding: '8px 14px' }}>
                          {order.cart.slice(0, 3).map((ci, i) => !ci.voided && (
                            <div key={ci.id + i} style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 2 }}>
                              {ci.qty > 1 && <span style={{ fontWeight: 700, marginRight: 4 }}>{ci.qty}×</span>}{ci.name}
                            </div>
                          ))}
                          {order.cart.filter(i => !i.voided).length > 3 && (
                            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>+{order.cart.filter(i => !i.voided).length - 3} more</div>
                          )}
                        </div>
                        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--grn)', fontFamily: 'var(--mono)' }}>{fmt(total)}</div>
                          <button onClick={() => dispatch({ type: 'SET_PAGE', page: 'pos' })} style={{ padding: '6px 10px', borderRadius: 'var(--r2)', border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Open POS</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {myTickets.length === 0 && myHeld.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🍳</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>No active orders</div>
                <div style={{ fontSize: 12 }}>Orders you send to the kitchen will appear here.</div>
              </div>
            )}
          </>
        )}

        {/* ── HISTORY TAB ────────────────────────────────────── */}
        {tab === 'history' && (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            {historyTxs.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--txt3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>No orders found</div>
                <div style={{ fontSize: 12 }}>Try a different date range or search term.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                      {['Receipt', 'Date & Time', 'Type', 'Items', 'Payment', 'Total', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyTxs.map(tx => {
                      const receiptNum = String(tx.id).slice(-4).padStart(4, '0')
                      const mod = moduleBadge(tx.mod)
                      const statusLabel = tx.voided ? 'Voided' : tx.refunded ? 'Refunded' : 'Completed'
                      const statusCol   = tx.voided ? '#ef4444' : tx.refunded ? 'var(--ora)' : 'var(--grn)'
                      const firstItem   = tx.items && tx.items.length > 0 ? tx.items[0].name : tx.item
                      const itemCount   = tx.items ? tx.items.filter(i => !i.voided).length : 1
                      return (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--bdr2)', opacity: tx.voided ? 0.6 : 1 }}>
                          <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)', fontSize: 11 }}>#{receiptNum}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDateTime(tx.ts)}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: `${mod.color}22`, color: mod.color, border: `1px solid ${mod.color}44`, whiteSpace: 'nowrap' }}>{mod.label}</span>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--txt2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {itemCount > 1 ? `${firstItem} +${itemCount - 1}` : firstItem}
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{payLabel(tx.pay)}</td>
                          <td style={{ padding: '9px 12px', color: 'var(--grn)', fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                            {sym}{tx.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: `${statusCol}22`, color: statusCol, border: `1px solid ${statusCol}44` }}>{statusLabel}</span>
                          </td>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => setDetailTx(tx)} style={{ padding: '5px 10px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Details</button>
                              <button onClick={() => quickReprint(tx)} disabled={reprinting === tx.id} style={{ padding: '5px 10px', borderRadius: 'var(--r)', border: 'none', background: 'var(--surf3)', color: reprinting === tx.id ? 'var(--txt3)' : 'var(--txt2)', fontSize: 11, fontWeight: 700, cursor: reprinting === tx.id ? 'not-allowed' : 'pointer' }}>
                                {reprinting === tx.id ? '…' : '🖨'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {transferTicket && <TransferModal ticket={transferTicket} onClose={() => setTransferTicket(null)} />}
      {detailTx       && <DetailsModal  tx={detailTx}          onClose={() => setDetailTx(null)}       />}
    </div>
  )
}
