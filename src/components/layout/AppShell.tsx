'use client'

import { useApp } from '@/lib/hooks/useAppStore'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import POSPage from '@/components/pos/POSPage'
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

// Roles allowed per page — must match Sidebar NAV_ITEMS
const PAGE_ROLES: Record<string, string[]> = {
  pos:          ['admin','manager','supervisor','cashier','bartender','attendant'],
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
  kitchen:      ['admin','manager','supervisor','cashier','bartender','attendant'],
  voids:        ['admin','manager'],
}

const ACCESS_DENIED = (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--txt3)' }}>
    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Access Denied</div>
    <div style={{ fontSize: 13 }}>You do not have permission to view this page.</div>
  </div>
)

export default function AppShell() {
  const { state } = useApp()
  const { activePage, currentUser } = state

  const role = currentUser?.role ?? ''
  const allowed = (page: string) => (PAGE_ROLES[page] ?? ['admin']).includes(role)

  function renderPage() {
    if (!allowed(activePage)) return ACCESS_DENIED
    switch (activePage) {
      case 'pos':          return <POSPage />
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
      case 'kitchen':      return <KitchenDisplay />
      case 'voids':        return <VoidReport />
      default:             return <POSPage />
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
    </div>
  )
}
