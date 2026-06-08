'use client'

import { useApp } from '@/lib/hooks/useAppStore'
import type { ModuleKey } from '@/types'
import { ROLES } from '@/lib/data/seed'

interface NavItem {
  id: string
  ic: string
  lbl: string
  roles: string[]
}

const NAV_ITEMS: Record<ModuleKey, NavItem[]> = {
  restaurant: [
    { id:'pos',          ic:'🧾', lbl:'Point of Sale',  roles:['admin','manager','supervisor','cashier'] },
    { id:'tables',       ic:'🪑', lbl:'Tables',          roles:['admin','manager','supervisor','cashier'] },
    { id:'transactions', ic:'📋', lbl:'Transactions',    roles:['admin','manager','supervisor','cashier'] },
    { id:'reports',      ic:'📊', lbl:'Reports',         roles:['admin','manager'] },
    { id:'staff',        ic:'👥', lbl:'Staff',           roles:['admin','manager'] },
    { id:'settings',     ic:'⚙️', lbl:'Settings',        roles:['admin'] },
    { id:'audit',        ic:'🔍', lbl:'Audit Log',       roles:['admin'] },
    { id:'shifts',       ic:'🕐', lbl:'Shifts',          roles:['admin','manager'] },
  ],
  bar: [
    { id:'pos',          ic:'🧾', lbl:'Point of Sale',  roles:['admin','manager','supervisor','cashier','bartender'] },
    { id:'transactions', ic:'📋', lbl:'Transactions',    roles:['admin','manager','supervisor','cashier','bartender'] },
    { id:'reports',      ic:'📊', lbl:'Reports',         roles:['admin','manager'] },
    { id:'shifts',       ic:'🕐', lbl:'Shifts',          roles:['admin','manager'] },
  ],
  carwash: [
    { id:'pos',          ic:'🧾', lbl:'Point of Sale',  roles:['admin','manager','supervisor','cashier','attendant'] },
    { id:'transactions', ic:'📋', lbl:'Transactions',    roles:['admin','manager','supervisor','cashier','attendant'] },
    { id:'members',      ic:'💳', lbl:'Members',         roles:['admin','manager'] },
    { id:'fleet',        ic:'🚛', lbl:'Fleet Accounts',  roles:['admin','manager'] },
    { id:'reports',      ic:'📊', lbl:'Reports',         roles:['admin','manager'] },
    { id:'shifts',       ic:'🕐', lbl:'Shifts',          roles:['admin','manager'] },
  ],
}

const EXTRA_NAV: NavItem[] = [
  { id:'loyalty',     ic:'⭐', lbl:'Loyalty Points',      roles:['admin','manager'] },
  { id:'promos',      ic:'🎟', lbl:'Promo Codes',          roles:['admin','manager'] },
  { id:'bookings',    ic:'📅', lbl:'Bookings',             roles:['admin','manager','supervisor'] },
  { id:'inventory',   ic:'📦', lbl:'Inventory',            roles:['admin','manager'] },
  { id:'satisfaction',ic:'😊', lbl:'Customer Satisfaction',roles:['admin','manager'] },
  { id:'targets',     ic:'🎯', lbl:'Performance Targets',  roles:['admin','manager'] },
]

const MOD_COLORS: Record<ModuleKey, { active: string; bg: string; border: string }> = {
  restaurant: { active: 'var(--ora)', bg: 'var(--ora-bg)', border: 'rgba(255,124,76,.22)' },
  bar:        { active: 'var(--pur)', bg: 'var(--pur-bg)', border: 'rgba(155,138,251,.22)' },
  carwash:    { active: 'var(--blue)',bg: 'var(--blue-bg)',border: 'rgba(79,142,247,.22)' },
}

export default function Sidebar() {
  const { state, dispatch } = useApp()
  const { currentUser, activeModule, activePage } = state
  if (!currentUser) return null

  const { active, bg, border } = MOD_COLORS[activeModule]
  const modData = { restaurant: { label:'Restaurant',icon:'🍽️' }, bar: { label:'Bar',icon:'🍺' }, carwash: { label:'Car Wash',icon:'🚗' } }
  const navItems = NAV_ITEMS[activeModule] ?? []
  const accessibleMods = currentUser.allowedModules
  const canAccess = (item: NavItem) => item.roles.includes(currentUser.role)
  const role = ROLES[currentUser.role]

  return (
    <div style={{ width: 214, background: 'var(--bg2)', borderRight: '1px solid var(--bdr)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      {/* Brand */}
      <div style={{ padding: 13, borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <div style={{ width: 33, height: 33, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, background: bg }}>
          🏢
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px' }}>NexPOS Pro</div>
          <div style={{ fontSize: 10, color: 'var(--txt3)' }}>v2.0</div>
        </div>
      </div>

      {/* Module switcher */}
      <div style={{ padding: 8, borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        {(['restaurant','bar','carwash'] as ModuleKey[]).map(mod => {
          const canUse = accessibleMods.includes(mod)
          const isOn = mod === activeModule
          const colors = MOD_COLORS[mod]
          return (
            <button key={mod} disabled={!canUse} onClick={() => dispatch({ type: 'SET_MODULE', mod })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 'var(--r2)', cursor: canUse ? 'pointer' : 'not-allowed',
                color: isOn ? colors.active : 'var(--txt2)', fontSize: 12, fontWeight: 600, marginBottom: 3,
                border: isOn ? `1.5px solid ${colors.border}` : '1.5px solid transparent',
                background: isOn ? colors.bg : 'transparent',
                transition: 'all .13s', textAlign: 'left', opacity: canUse ? 1 : .25,
              }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: isOn ? colors.active : 'var(--bdr2)', flexShrink: 0 }} />
              {modData[mod].icon} {modData[mod].label}
            </button>
          )
        })}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: 8, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', padding: '5px 10px 3px' }}>Navigation</div>
        {navItems.map(item => {
          const accessible = canAccess(item)
          const isOn = activePage === item.id
          return (
            <div key={item.id}
              onClick={() => accessible && dispatch({ type: 'SET_PAGE', page: item.id })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 'var(--r2)', cursor: accessible ? 'pointer' : 'not-allowed',
                color: isOn ? 'var(--txt)' : 'var(--txt2)', fontSize: 12,
                fontWeight: isOn ? 700 : 500, marginBottom: 2, transition: 'all .12s',
                background: isOn ? 'var(--surf2)' : 'transparent',
                opacity: accessible ? 1 : .28,
              }}>
              <span style={{ fontSize: 14, width: 17, textAlign: 'center', flexShrink: 0 }}>{item.ic}</span>
              <span>{item.lbl}</span>
            </div>
          )
        })}

        {/* Extra features */}
        {EXTRA_NAV.some(n => n.roles.includes(currentUser.role)) && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', padding: '10px 10px 3px' }}>Features</div>
            {EXTRA_NAV.filter(n => n.roles.includes(currentUser.role)).map(item => (
              <div key={item.id}
                onClick={() => dispatch({ type: 'SET_PAGE', page: item.id })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                  borderRadius: 'var(--r2)', cursor: 'pointer',
                  color: activePage === item.id ? 'var(--txt)' : 'var(--txt2)', fontSize: 12,
                  fontWeight: activePage === item.id ? 700 : 500, marginBottom: 2, transition: 'all .12s',
                  background: activePage === item.id ? 'var(--surf2)' : 'transparent',
                }}>
                <span style={{ fontSize: 14, width: 17, textAlign: 'center', flexShrink: 0 }}>{item.ic}</span>
                <span>{item.lbl}</span>
              </div>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div style={{ padding: 9, borderTop: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ background: 'var(--surf)', borderRadius: 'var(--r2)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, background: `${currentUser.color}22`, color: currentUser.color }}>
            {currentUser.ini}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser.name}</div>
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{role?.label}</div>
          </div>
          <button onClick={() => dispatch({ type: 'LOGOUT' })} title="Logout" style={{ background: 'transparent', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 14, padding: 2 }}>⏻</button>
        </div>
      </div>
    </div>
  )
}
