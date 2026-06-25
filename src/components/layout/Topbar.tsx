'use client'

import { useEffect, useState } from 'react'
import { qzIsConnected } from '@/lib/utils/qzTray'
import { useApp } from '@/lib/hooks/useAppStore'
import type { ModuleKey, HeldOrder } from '@/types'
import ShiftEndModal from '@/components/layout/ShiftEndModal'

const MOD_LABEL: Record<ModuleKey, string> = {
  restaurant: 'Restaurant',
  bar:        'Bar',
  carwash:    'Car Wash',
}
const MOD_COLOR: Record<ModuleKey, { color: string; bg: string }> = {
  restaurant: { color: 'var(--ora)', bg: 'var(--ora-bg)' },
  bar:        { color: 'var(--pur)', bg: 'var(--pur-bg)' },
  carwash:    { color: 'var(--blue)',bg: 'var(--blue-bg)'},
}
const PAGE_TITLES: Record<string, Record<ModuleKey | 'default', string>> = {
  pos: { restaurant: 'Point of Sale', bar: 'Point of Sale', carwash: 'Dashboard', default: 'Point of Sale' },
}
const GENERIC_PAGE_TITLES: Record<string, string> = {
  tables:'Tables', transactions:'Transactions',
  reports:'Reports', staff:'Staff', settings:'Settings', audit:'Audit Log',
  shifts:'Shifts', members:'Members', fleet:'Fleet Accounts',
  loyalty:'Loyalty Points', promos:'Promo Codes', bookings:'Bookings',
  inventory:'Inventory', satisfaction:'Customer Satisfaction', targets:'Performance Targets',
  'carwash-services':'Services & Prices', 'carwash-queue':'Wash Queue', kitchen:'Kitchen Display',
  voids:'Void Report',
}

const ORDER_TYPE_LABELS = { 'dine-in': 'Dine-in', takeout: 'Takeout', delivery: 'Delivery' } as const

export default function Topbar() {
  const { state, dispatch } = useApp()
  const { activeModule, activePage, currentUser, currentShift, isOnline, cartOrderType, cart, posState } = state
  const hasRestaurantItems = cart.some(ci => (ci as { module?: string }).module === 'restaurant')
  const [clock, setClock] = useState('')
  const [printerOk, setPrinterOk] = useState<boolean | null>(null)
  const [showShiftEnd, setShowShiftEnd] = useState(false)

  // ── Save any open cart to held orders before any logout ───────
  function saveCart() {
    if (cart.length > 0 && currentUser) {
      const ps = posState[activeModule]
      const selTable = posState['restaurant'].selTable ?? posState['bar'].selTable ?? null
      const label = ps.customerName || (selTable ? `Table ${selTable}` : `Order ${Date.now().toString().slice(-4)}`)
      const held: HeldOrder = {
        id: crypto.randomUUID(),
        label: `${label} (auto-saved)`,
        cart: [...cart],
        orderType: cartOrderType,
        module: activeModule,
        selTable,
        guestCount: 1,
        customerName: ps.customerName,
        discPct: ps.manualDiscPct ?? 0,
        discFlat: ps.manualDiscFlat ?? 0,
        gratuityPct: ps.gratuityPct ?? 0,
        gratuityOverride: false,
        openedAt: new Date().toISOString(),
        savedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        savedBy: currentUser.name,
      }
      dispatch({ type: 'HOLD_ORDER', order: held })
      dispatch({ type: 'CLEAR_CART' })
    }
  }

  // ── Logout — fast user switch, no order check ─────────────────
  function handleLogout() {
    saveCart()
    dispatch({ type: 'LOGOUT' })
  }

  // ── Clock Out — end of shift, checks active orders first ──────
  function handleClockOut() {
    saveCart()
    const isManager = ['admin', 'manager'].includes(currentUser?.role ?? '')
    const hasActive = state.orderTickets.some(t =>
      !['paid', 'voided'].includes(t.status ?? '') &&
      (isManager || t.server === currentUser?.name)
    )
    if (hasActive) { setShowShiftEnd(true); return }
    dispatch({ type: 'LOGOUT' })
  }

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const check = () => setPrinterOk(qzIsConnected())
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [])

  const { color, bg } = MOD_COLOR[activeModule]

  return (
    <div style={{
      height: 52, background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)',
      display: 'flex', alignItems: 'center', padding: '0 15px', gap: 8, flexShrink: 0,
    }}>
      {/* Module badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 800, color, background: bg, flexShrink: 0 }}>
        {MOD_LABEL[activeModule]}
      </div>

      {/* Page title */}
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.2px', flexShrink: 0 }}>
        {PAGE_TITLES[activePage]?.[activeModule] ?? PAGE_TITLES[activePage]?.['default'] ?? GENERIC_PAGE_TITLES[activePage] ?? activePage}
      </div>

      {/* Order type pills — POS page, restaurant/bar only */}
      {activePage === 'pos' && activeModule !== 'carwash' && hasRestaurantItems && (
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {(['dine-in', 'takeout', 'delivery'] as const).map(ot => (
            <button key={ot} onClick={() => dispatch({ type: 'SET_CART_ORDER_TYPE', orderType: ot })} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${cartOrderType === ot ? 'var(--ora)' : 'var(--bdr)'}`,
              background: cartOrderType === ot ? '#78350f22' : 'transparent',
              color: cartOrderType === ot ? 'var(--ora)' : 'var(--txt3)',
              transition: 'all .12s',
            }}>
              {ORDER_TYPE_LABELS[ot]}
            </button>
          ))}
        </div>
      )}
      {!(activePage === 'pos' && activeModule !== 'carwash' && hasRestaurantItems) && (
        <div style={{ flex: 1 }} />
      )}

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Printer status */}
        {printerOk !== null && (
          <div
            title={printerOk ? 'QZ Tray connected — printer ready' : 'Printer offline — open QZ Tray to connect'}
            style={{
              fontSize: 11, fontWeight: 700, padding: '8px 12px', borderRadius: 'var(--r2)',
              background: printerOk ? 'rgba(34,197,94,0.12)' : 'var(--surf)',
              color: printerOk ? 'var(--grn)' : 'var(--txt3)',
              border: printerOk ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--bdr)',
              cursor: 'default', userSelect: 'none',
            }}
          >
            {printerOk ? '🖨 Ready' : '🖨 Offline'}
          </div>
        )}

        {/* Offline badge */}
        {!isOnline && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: '8px 12px', borderRadius: 'var(--r2)', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(245,101,101,.3)' }}>
            Offline
          </div>
        )}

        {/* Clock */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt3)', background: 'var(--surf)', padding: '8px 12px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)' }}>
          {clock}
        </div>

        {/* User badge */}
        {currentUser && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: '8px 12px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)', background: 'var(--surf)', color: currentUser.color }}>
            {currentUser.ini} · {currentUser.name.split(' ')[0]}
          </div>
        )}

        {/* Close Shift — managers only */}
        {currentShift && (currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
          <button onClick={() => dispatch({ type: 'SHOW_EOD' })} style={{
            padding: '8px 14px', borderRadius: 'var(--r2)', fontSize: 11, fontWeight: 800, cursor: 'pointer',
            border: '1px solid rgba(245,101,101,.5)', background: '#7f1d1d33', color: 'var(--red)',
          }}>
            🔒 Close Shift
          </button>
        )}

        {/* Clock Out — end of shift with transfer workflow */}
        <button onClick={handleClockOut} style={{
          padding: '8px 14px', borderRadius: 'var(--r2)', fontSize: 11, fontWeight: 800, cursor: 'pointer',
          border: '1px solid rgba(251,146,60,.4)', background: 'rgba(251,146,60,.12)', color: 'var(--ora)',
        }}>
          Clock Out
        </button>

        {/* Logout — fast switch to login screen */}
        <button className="btn btn-gh btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {showShiftEnd && (
        <ShiftEndModal
          onLogout={() => { setShowShiftEnd(false); dispatch({ type: 'LOGOUT' }) }}
          onCancel={() => setShowShiftEnd(false)}
        />
      )}
    </div>
  )
}
