'use client'

import { useApp } from '@/lib/hooks/useAppStore'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import POSPage from '@/components/pos/POSPage'
import TransactionsPage from '@/components/admin/TransactionsPage'
import ReportsPage from '@/components/admin/ReportsPage'
import StaffPage from '@/components/admin/StaffPage'
import PlaceholderPage from '@/components/shared/PlaceholderPage'
import MenuPage from '@/components/admin/MenuPage'

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
}

const ACCESS_DENIED = (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--txt3)' }}>
    <div style={{ fontSize: 40 }}>🔒</div>
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
      case 'tables':       return <PlaceholderPage icon="🪑" title="Tables" desc="Table management view coming soon." />
      case 'members':      return <PlaceholderPage icon="💳" title="Members" desc="Membership management coming soon." />
      case 'fleet':        return <PlaceholderPage icon="🚛" title="Fleet Accounts" desc="Fleet management coming soon." />
      case 'settings':     return <PlaceholderPage icon="⚙️" title="Settings" desc="Business settings coming soon." />
      case 'audit':        return <PlaceholderPage icon="🔍" title="Audit Log" desc="Audit log coming soon." />
      case 'shifts':       return <PlaceholderPage icon="🕐" title="Shifts" desc="Shift management coming soon." />
      case 'loyalty':      return <PlaceholderPage icon="⭐" title="Loyalty Points" desc="Loyalty program coming soon." />
      case 'promos':       return <PlaceholderPage icon="🎟" title="Promo Codes" desc="Promo code management coming soon." />
      case 'bookings':     return <PlaceholderPage icon="📅" title="Bookings" desc="Booking system coming soon." />
      case 'inventory':    return <PlaceholderPage icon="📦" title="Inventory" desc="Inventory management coming soon." />
      case 'satisfaction': return <PlaceholderPage icon="😊" title="Customer Satisfaction" desc="Satisfaction reports coming soon." />
      case 'targets':      return <PlaceholderPage icon="🎯" title="Performance Targets" desc="Target management coming soon." />
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
