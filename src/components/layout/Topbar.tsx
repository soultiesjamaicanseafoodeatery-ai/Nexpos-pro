'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { ModuleKey } from '@/types'

const MOD_LABEL: Record<ModuleKey, string> = {
  restaurant: '🍽️ Restaurant',
  bar:        '🍺 Bar',
  carwash:    '🚗 Car Wash',
}
const MOD_COLOR: Record<ModuleKey, { color: string; bg: string }> = {
  restaurant: { color: 'var(--ora)', bg: 'var(--ora-bg)' },
  bar:        { color: 'var(--pur)', bg: 'var(--pur-bg)' },
  carwash:    { color: 'var(--blue)',bg: 'var(--blue-bg)'},
}
const PAGE_TITLES: Record<string, string> = {
  pos:'Point of Sale', tables:'Tables', transactions:'Transactions',
  reports:'Reports', staff:'Staff', settings:'Settings', audit:'Audit Log',
  shifts:'Shifts', members:'Members', fleet:'Fleet Accounts',
  loyalty:'Loyalty Points', promos:'Promo Codes', bookings:'Bookings',
  inventory:'Inventory', satisfaction:'Customer Satisfaction', targets:'Performance Targets',
}

export default function Topbar() {
  const { state, dispatch } = useApp()
  const { activeModule, activePage, currentUser, currentShift, isOnline } = state
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString())
    tick()
    const id = setInterval(tick, 1000)
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
      <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.2px' }}>
        {PAGE_TITLES[activePage] ?? activePage}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Offline badge */}
        {!isOnline && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 'var(--r2)', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(245,101,101,.3)' }}>
            ⚡ Offline
          </div>
        )}

        {/* Clock */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt3)', background: 'var(--surf)', padding: '4px 9px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)' }}>
          {clock}
        </div>

        {/* User badge */}
        {currentUser && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)', background: 'var(--surf)', color: currentUser.color }}>
            {currentUser.ini} · {currentUser.name.split(' ')[0]}
          </div>
        )}

        {/* Clock out (if active shift) */}
        {currentShift && (currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
          <button className="btn btn-gh btn-sm" onClick={() => dispatch({ type: 'CLOCK_OUT' })}>
            ⏻ Clock Out
          </button>
        )}

        {/* Logout */}
        <button className="btn btn-gh btn-sm" onClick={() => dispatch({ type: 'LOGOUT' })}>
          Logout
        </button>
      </div>
    </div>
  )
}
