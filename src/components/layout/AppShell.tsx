'use client'

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import POSFlow from '@/components/pos/POSFlow'
import CarWashFlow from '@/components/carwash/CarWashFlow'
import CarWashQueue from '@/components/carwash/CarWashQueue'
const TransactionsPage = lazy(() => import('@/components/admin/TransactionsPage'))
const ReportsPage = lazy(() => import('@/components/admin/ReportsPage'))
const StaffPage = lazy(() => import('@/components/admin/StaffPage'))
const MenuPage = lazy(() => import('@/components/admin/MenuPage'))
const TablesPage = lazy(() => import('@/components/admin/TablesPage'))
const SettingsPage = lazy(() => import('@/components/admin/SettingsPage'))
const AuditPage = lazy(() => import('@/components/admin/AuditPage'))
const ShiftsPage = lazy(() => import('@/components/admin/ShiftsPage'))
const PromosPage = lazy(() => import('@/components/admin/PromosPage'))
const LoyaltyPage = lazy(() => import('@/components/admin/LoyaltyPage'))
const MembersPage = lazy(() => import('@/components/admin/MembersPage'))
const FleetPage = lazy(() => import('@/components/admin/FleetPage'))
const BookingsPage = lazy(() => import('@/components/admin/BookingsPage'))
const InventoryPage = lazy(() => import('@/components/admin/InventoryPage'))
const SatisfactionPage = lazy(() => import('@/components/admin/SatisfactionPage'))
const TargetsPage = lazy(() => import('@/components/admin/TargetsPage'))
const KitchenDisplay = lazy(() => import('@/components/admin/KitchenDisplay'))
const VoidReport = lazy(() => import('@/components/admin/VoidReport'))
const CarwashServicesPage = lazy(() => import('@/components/admin/CarwashServicesPage'))
const CloseShiftWizard = lazy(() => import('@/components/admin/CloseShiftWizard'))
const PayrollPage = lazy(() => import('@/components/admin/PayrollPage'))
const PrinterDiagnosticsPage = lazy(() => import('@/components/admin/PrinterDiagnosticsPage'))

const PAGE_ROLES: Record<string, string[]> = {
  pos:             ['admin','manager','staff'],
  tables:          ['admin','manager','staff'],
  kitchen:         ['admin','manager','staff'],
  shifts:          ['admin','manager','staff'],
  'carwash-queue': ['admin','manager','staff'],
  transactions:    ['admin','manager'],
  reports:         ['admin','manager'],
  staff:           ['admin','manager'],
  menu:            ['admin','manager'],
  members:         ['admin','manager'],
  fleet:           ['admin','manager'],
  loyalty:         ['admin','manager'],
  promos:          ['admin','manager'],
  bookings:        ['admin','manager'],
  inventory:       ['admin','manager'],
  satisfaction:    ['admin','manager'],
  targets:         ['admin','manager'],
  payroll:         ['admin','manager'],
  voids:                ['admin','manager'],
  'carwash-services':   ['admin','manager'],
  audit:           ['admin'],
  settings:        ['admin'],
  'printer-diag':  ['admin'],
}

const ACCESS_DENIED = (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--txt3)' }}>
    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Access Denied</div>
    <div style={{ fontSize: 13 }}>You do not have permission to view this page.</div>
  </div>
)

export default function AppShell() {
  const { state, dispatch, toast } = useApp()
  const { activePage, activeModule, currentUser, showEOD } = state

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })



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
      case 'printer-diag':       return <PrinterDiagnosticsPage />
      default:                   return activeModule === 'carwash' ? <CarWashFlow /> : <POSFlow />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--txt3)', fontSize:13 }}>Loading…</div>}>{renderPage()}</Suspense>
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