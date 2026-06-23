'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import POSFlow from '@/components/pos/POSFlow'
import CarWashFlow from '@/components/carwash/CarWashFlow'
import CarWashQueue from '@/components/carwash/CarWashQueue'
import TransactionsPage from '@/components/admin/TransactionsPage'
import ReportsPage from '@/components/admin/ReportsPage'
import StaffPage from '@/components/admin/StaffPage'
import MenuPage from '@/components/admin/MenuPage'
import TablesPage from '@/components/admin/TablesPage'
import SettingsPage from '@/components/admin/SettingsPage'
import AuditPage from '@/components/admin/AuditPage'
import ShiftsPage from '@/components/admin/ShiftsPage'
import PromosPage from '@/components/admin/PromosPage'
import LoyaltyPage from '@/components/admin/LoyaltyPage'
import MembersPage from '@/components/admin/MembersPage'
import FleetPage from '@/components/admin/FleetPage'
import BookingsPage from '@/components/admin/BookingsPage'
import InventoryPage from '@/components/admin/InventoryPage'
import SatisfactionPage from '@/components/admin/SatisfactionPage'
import TargetsPage from '@/components/admin/TargetsPage'
import KitchenDisplay from '@/components/admin/KitchenDisplay'
import VoidReport from '@/components/admin/VoidReport'
import CarwashServicesPage from '@/components/admin/CarwashServicesPage'
import CloseShiftWizard from '@/components/admin/CloseShiftWizard'
import PayrollPage from '@/components/admin/PayrollPage'

const PAGE_ROLES: Record<string, string[]> = {
  pos:          ['admin','manager','supervisor','cashier','server','bartender','attendant'],
  tables:       ['admin','manager','supervisor','cashier'],
  transactions: ['admin','manager','supervisor','cashier','bartender','attendant'],
  reports:      ['admin','manager'],
  staff:        ['admin','manager'],
  menu:         ['admin','manager'],
  settings:     ['admin'],
  audit:        ['admin'],
  shifts:       ['admin','manager'],
  members:      ['admin','manager'],
  fleet:        ['admin','manager'],
  loyalty:      ['admin','manager'],
  promos:       ['admin','manager'],
  bookings:     ['admin','manager','supervisor'],
  inventory:    ['admin','manager'],
  satisfaction: ['admin','manager'],
  targets:      ['admin','manager'],
  payroll:      ['admin','manager'],
  kitchen:      ['admin','manager','supervisor','cashier','bartender','attendant'],
  voids:              ['admin','manager'],
  'carwash-services': ['admin','manager'],
  'carwash-queue':    ['admin','manager','supervisor','cashier','attendant'],
}

const ACCESS_DENIED = (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--txt3)' }}>
    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Access Denied</div>
    <div style={{ fontSize: 13 }}>You do not have permission to view this page.</div>
  </div>
)

export default function AppShell() {
  const { state, dispatch } = useApp()
  const { activePage, activeModule, currentUser, showEOD } = state

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail
      dispatch({
        type: 'ADD_TOAST',
        msg: '⚠️ ' + (detail?.message || 'Printer offline — check QZ Tray is running'),
        toastType: 'error',
        id: Date.now(),
      })
    }
    window.addEventListener('print-failed', handler)
    return () => window.removeEventListener('print-failed', handler)
  }, [dispatch])

  // ── Inactivity auto-logout ──────────────────────────────────
  const [showInactivityWarning, setShowInactivityWarning] = useState(false)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetTimer = useCallback(() => {
    setShowInactivityWarning(false)
    if (timerRef.current)     clearTimeout(timerRef.current)
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    if (!currentUser) return

    // Read from ref so we always use the latest setting without extra deps
    const autoLogoutMin = stateRef.current.biz.autoLogoutMinutes ?? 30
    if (autoLogoutMin === 0) return

    const autoLogoutMs = autoLogoutMin * 60_000
    const warnAt = autoLogoutMs - 60_000

    if (warnAt > 0) {
      warnTimerRef.current = setTimeout(() => setShowInactivityWarning(true), warnAt)
    }

    timerRef.current = setTimeout(() => {
      const s = stateRef.current
      if (s.cart && s.cart.length > 0) {
        dispatch({
          type: 'HOLD_ORDER',
          order: {
            id: `auto-${Date.now()}`,
            label: `Auto-saved (${s.currentUser?.name ?? 'Staff'} — inactivity logout)`,
            cart: s.cart,
            orderType: s.cartOrderType,
            module: s.activeModule,
            selTable: s.posState[s.activeModule]?.selTable ?? null,
            guestCount: 1,
            customerName: '',
            discPct: 0,
            discFlat: 0,
            gratuityPct: 0,
            gratuityOverride: false,
            openedAt: new Date().toISOString(),
            savedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            savedBy: s.currentUser?.name ?? 'System',
          },
        })
      }
      dispatch({ type: 'LOGOUT' })
      setShowInactivityWarning(false)
    }, autoLogoutMs)
  }, [currentUser, dispatch])

  useEffect(() => {
    const events = ['mousedown', 'touchstart', 'keydown', 'scroll'] as const
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      if (timerRef.current)     clearTimeout(timerRef.current)
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    }
  }, [resetTimer])

  const role = currentUser?.role ?? ''
  const allowed = (page: string) => (PAGE_ROLES[page] ?? ['admin']).includes(role)

  function renderPage() {
    if (!allowed(activePage)) return ACCESS_DENIED
    switch (activePage) {
      case 'pos':          return activeModule === 'carwash' ? <CarWashFlow /> : <POSFlow />
      case 'transactions': return <TransactionsPage />
      case 'reports':      return <ReportsPage />
      case 'staff':        return <StaffPage />
      case 'menu':         return <MenuPage />
      case 'tables':       return <TablesPage />
      case 'settings':     return <SettingsPage />
      case 'audit':        return <AuditPage />
      case 'shifts':       return <ShiftsPage />
      case 'promos':       return <PromosPage />
      case 'loyalty':      return <LoyaltyPage />
      case 'members':      return <MembersPage />
      case 'fleet':        return <FleetPage />
      case 'bookings':     return <BookingsPage />
      case 'inventory':    return <InventoryPage />
      case 'satisfaction': return <SatisfactionPage />
      case 'targets':      return <TargetsPage />
      case 'payroll':      return <PayrollPage />
      case 'kitchen':      return <KitchenDisplay />
      case 'voids':              return <VoidReport />
      case 'carwash-services':   return <CarwashServicesPage />
      case 'carwash-queue':      return <CarWashQueue />
      default:                   return activeModule === 'carwash' ? <CarWashFlow /> : <POSFlow />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {renderPage()}
        </div>
      </div>
      {showEOD && <CloseShiftWizard />}

      {showInactivityWarning && (
        <div
          onClick={resetTimer}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
            background: '#92400e', color: '#fde68a',
            padding: '14px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700 }}>
            ⏱️ You will be logged out in 60 seconds due to inactivity. Tap anywhere to stay.
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, padding: '5px 16px', borderRadius: 20, background: 'rgba(255,255,255,.18)', whiteSpace: 'nowrap' }}>
            Stay logged in
          </span>
        </div>
      )}
    </div>
  )
}