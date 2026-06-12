'use client'

import { useState } from 'react'
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
    { id:'kitchen',      ic:'🍳', lbl:'Kitchen Display', roles:['admin','manager','supervisor','cashier'] },
    { id:'tables',       ic:'🪑', lbl:'Tables',          roles:['admin','manager','supervisor','cashier'] },
    { id:'transactions', ic:'📋', lbl:'Transactions',    roles:['admin','manager','supervisor','cashier'] },
    { id:'reports',      ic:'📊', lbl:'Reports',         roles:['admin','manager'] },
    { id:'voids',        ic:'🚫', lbl:'Void Report',     roles:['admin','manager'] },
    { id:'staff',        ic:'👥', lbl:'Staff',           roles:['admin','manager'] },
    { id:'menu',         ic:'🍽', lbl:'Menu Manager',    roles:['admin','manager'] },
    { id:'settings',     ic:'⚙️', lbl:'Settings',        roles:['admin','manager'] },
    { id:'audit',        ic:'🔍', lbl:'Audit Log',       roles:['admin'] },
    { id:'shifts',       ic:'🕐', lbl:'Shifts',          roles:['admin','manager'] },
  ],
  bar: [
    { id:'pos',          ic:'🧾', lbl:'Point of Sale',  roles:['admin','manager','supervisor','cashier','bartender'] },
    { id:'kitchen',      ic:'🍳', lbl:'Kitchen Display', roles:['admin','manager','supervisor','cashier','bartender'] },
    { id:'transactions', ic:'📋', lbl:'Transactions',    roles:['admin','manager','supervisor','cashier','bartender'] },
    { id:'reports',      ic:'📊', lbl:'Reports',         roles:['admin','manager'] },
    { id:'voids',        ic:'🚫', lbl:'Void Report',     roles:['admin','manager'] },
    { id:'menu',         ic:'🍽', lbl:'Menu Manager',    roles:['admin','manager'] },
    { id:'shifts',       ic:'🕐', lbl:'Shifts',          roles:['admin','manager'] },
    { id:'settings',     ic:'⚙️', lbl:'Settings',        roles:['admin','manager'] },
  ],
  carwash: [
    { id:'pos',          ic:'🧾', lbl:'Point of Sale',  roles:['admin','manager','supervisor','cashier','attendant'] },
    { id:'transactions', ic:'📋', lbl:'Transactions',    roles:['admin','manager','supervisor','cashier','attendant'] },
    { id:'members',      ic:'💳', lbl:'Members',         roles:['admin','manager'] },
    { id:'fleet',        ic:'🚛', lbl:'Fleet Accounts',  roles:['admin','manager'] },
    { id:'reports',      ic:'📊', lbl:'Reports',         roles:['admin','manager'] },
    { id:'voids',        ic:'🚫', lbl:'Void Report',     roles:['admin','manager'] },
    { id:'shifts',       ic:'🕐', lbl:'Shifts',          roles:['admin','manager'] },
    { id:'settings',     ic:'⚙️', lbl:'Settings',        roles:['admin','manager'] },
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

const MOD_COLORS: Record<ModuleKey, { active: string; bg: string; border: string; letter: string }> = {
  restaurant: { active: 'var(--ora)', bg: 'var(--ora-bg)', border: 'rgba(255,124,76,.22)', letter: 'R' },
  bar:        { active: 'var(--pur)', bg: 'var(--pur-bg)', border: 'rgba(155,138,251,.22)', letter: 'B' },
  carwash:    { active: 'var(--blue)',bg: 'var(--blue-bg)',border: 'rgba(79,142,247,.22)',  letter: 'C' },
}

const MOD_LABELS: Record<ModuleKey, string> = {
  restaurant: 'Restaurant',
  bar:        'Bar',
  carwash:    'Car Wash',
}

export default function Sidebar() {
  const { state, dispatch } = useApp()
  const { currentUser, activeModule, activePage } = state

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar_collapsed') === '1' } catch { return false }
  })

  if (!currentUser) return null

  const toggleCollapse = () => {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  const { active, bg, border } = MOD_COLORS[activeModule]
  const navItems = NAV_ITEMS[activeModule] ?? []
  const accessibleMods = currentUser.allowedModules
  const canAccess = (item: NavItem) => item.roles.includes(currentUser.role)
  const role = ROLES[currentUser.role]

  const W = collapsed ? 56 : 214

  return (
    <div style={{
      width: W, minWidth: W, background: 'var(--bg2)', borderRight: '1px solid var(--bdr)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
      transition: 'width .2s ease, min-width .2s ease',
    }}>
      {/* Brand */}
      <div style={{ padding: collapsed ? '13px 11px' : 13, borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 9, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ width: 33, height: 33, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, background: bg, color: active }}>
          POS
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px', whiteSpace: 'nowrap' }}>NexPOS Pro</div>
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>v2.0</div>
          </div>
        )}
      </div>

      {/* Module switcher */}
      <div style={{ padding: collapsed ? '8px 6px' : 8, borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        {(['restaurant','bar','carwash'] as ModuleKey[]).map(mod => {
          const canUse = accessibleMods.includes(mod)
          const isOn = mod === activeModule
          const colors = MOD_COLORS[mod]
          return (
            <button key={mod} disabled={!canUse} onClick={() => dispatch({ type: 'SET_MODULE', mod })}
              title={collapsed ? MOD_LABELS[mod] : undefined}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 8,
                padding: collapsed ? '8px 0' : '7px 10px',
                borderRadius: 'var(--r2)', cursor: canUse ? 'pointer' : 'not-allowed',
                color: isOn ? colors.active : 'var(--txt2)', fontSize: 12, fontWeight: 600, marginBottom: 3,
                border: isOn ? `1.5px solid ${colors.border}` : '1.5px solid transparent',
                background: isOn ? colors.bg : 'transparent',
                transition: 'all .13s', textAlign: 'left', opacity: canUse ? 1 : .25,
              }}>
              {collapsed ? (
                <span style={{ fontSize: 13, fontWeight: 800 }}>{colors.letter}</span>
              ) : (
                <>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: isOn ? colors.active : 'var(--bdr2)', flexShrink: 0 }} />
                  {MOD_LABELS[mod]}
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: collapsed ? '8px 6px' : 8, overflowY: 'auto' }}>
        {!collapsed && (
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', padding: '5px 10px 3px' }}>Navigation</div>
        )}
        {navItems.map(item => {
          const accessible = canAccess(item)
          const isOn = activePage === item.id
          return (
            <div key={item.id}
              onClick={() => accessible && dispatch({ type: 'SET_PAGE', page: item.id })}
              title={collapsed ? item.lbl : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 8,
                padding: collapsed ? '9px 0' : '7px 10px',
                borderRadius: 'var(--r2)', cursor: accessible ? 'pointer' : 'not-allowed',
                color: isOn ? active : 'var(--txt2)', fontSize: collapsed ? 16 : 12,
                fontWeight: isOn ? 700 : 500, marginBottom: 2, transition: 'all .12s',
                background: isOn ? (collapsed ? bg : 'var(--surf2)') : 'transparent',
                opacity: accessible ? 1 : .28,
              }}>
              {collapsed ? (
                <span>{item.ic}</span>
              ) : (
                <span>{item.lbl}</span>
              )}
            </div>
          )
        })}

        {/* Extra features */}
        {!collapsed && EXTRA_NAV.some(n => n.roles.includes(currentUser.role)) && (
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
                <span>{item.lbl}</span>
              </div>
            ))}
          </>
        )}
        {collapsed && EXTRA_NAV.filter(n => n.roles.includes(currentUser.role)).map(item => (
          <div key={item.id}
            onClick={() => dispatch({ type: 'SET_PAGE', page: item.id })}
            title={item.lbl}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0',
              borderRadius: 'var(--r2)', cursor: 'pointer', fontSize: 16, marginBottom: 2,
              background: activePage === item.id ? bg : 'transparent',
            }}>
            <span>{item.ic}</span>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: collapsed ? '6px' : '6px 9px', borderTop: '1px solid var(--bdr)', flexShrink: 0 }}>
        <button onClick={toggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: '100%', padding: '7px 0', borderRadius: 'var(--r2)',
            background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--txt3)',
            cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 5, transition: 'all .12s',
          }}>
          {collapsed ? '▶' : '◀ Collapse'}
        </button>
      </div>

      {/* User footer */}
      <div style={{ padding: collapsed ? '9px 6px' : 9, borderTop: '1px solid var(--bdr)', flexShrink: 0 }}>
        {collapsed ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: `${currentUser.color}22`, color: currentUser.color, cursor: 'default' }} title={currentUser.name}>
              {currentUser.ini}
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}
