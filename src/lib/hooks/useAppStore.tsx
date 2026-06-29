'use client'

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react'
import type {
  User, UserRole, ModuleKey, Transaction, Shift, AuditEntry,
  BusinessConfig, FleetAccount, POSState, LoyaltyMember, PromoCode,
  CartItem, OrderType, HeldOrder, OrderTicket, VoidLog, VoidReason, RefundLog,
  MenuItem, Addon,
  NoSaleLog,
} from '@/types'

const STAFF_API = '/api/staff'

interface DbStaffRow {
  id: string
  name: string
  ini: string
  role: string
  pin_hash: string
  color: string
  allowed_modules: string[] | string | null | undefined
  active: boolean
  staff_id: string | null
}

function dbStaffToUser(row: DbStaffRow): User {
  const rawMods = row.allowed_modules
  let allowedModules: ModuleKey[]
  if (Array.isArray(rawMods) && rawMods.length > 0) {
    allowedModules = rawMods as ModuleKey[]
  } else if (typeof rawMods === 'string' && rawMods.length > 0) {
    // Handle PostgreSQL literal "{restaurant,bar}" or JSON string "["restaurant"]"
    try {
      const parsed = JSON.parse(rawMods)
      allowedModules = Array.isArray(parsed) && parsed.length > 0 ? parsed : ['restaurant']
    } catch {
      const stripped = rawMods.replace(/^\{|\}$/g, '').split(',').map(s => s.trim()).filter(Boolean)
      allowedModules = stripped.length > 0 ? (stripped as ModuleKey[]) : ['restaurant']
    }
  } else {
    allowedModules = ['restaurant']
  }
  return {
    id: row.id,
    name: row.name,
    ini: row.ini,
    pin_hash: row.pin_hash,
    role: (['admin', 'manager', 'staff'] as string[]).includes(row.role) ? row.role as UserRole : 'staff',
    color: row.color,
    allowedModules,
    active: row.active,
    staffId: row.staff_id ?? undefined,
  }
}
import { storage } from '@/lib/utils/storage'
import {
  SEED_USERS, MODULE_DATA, DEFAULT_BIZ_CONFIG,
  SEED_FLEET, SEED_PROMOS, SEED_VERSION,
} from '@/lib/data/seed'
import { supabase } from '@/lib/supabase'

// ── State shape ────────────────────────────────────────────────
interface AppState {
  // Auth
  currentUser: User | null
  currentShift: Shift | null
  users: User[]
  // Module
  activeModule: ModuleKey
  activePage: string
  // POS
  posState: Record<ModuleKey, POSState>
  // Global Cart
  cart: CartItem[]
  cartPayMethod: string
  cartOrderType: OrderType
  heldOrders: HeldOrder[]
  orderTickets: OrderTicket[]
  // Data
  transactions: Transaction[]
  shifts: Shift[]
  audit: AuditEntry[]
  biz: BusinessConfig
  fleet: FleetAccount[]
  loyalty: LoyaltyMember[]
  promos: PromoCode[]
  voidLogs: VoidLog[]
  refundLogs: RefundLog[]
  noSaleLogs: NoSaleLog[]
  // Menu — mutable, localStorage-backed, same data the POS reads
  menuData: Record<ModuleKey, { items: MenuItem[]; categories: string[]; addons: Addon[] }>
  // UI
  toasts: { id: number; msg: string; type: string }[]
  syncQueue: unknown[]
  isOnline: boolean
  uiMode: 'pos' | 'admin'
  showEOD: boolean
}

type Action =
  | { type: 'LOGIN'; user: User; shift: Shift }
  | { type: 'LOGOUT' }
  | { type: 'CLOCK_OUT' }
  | { type: 'SET_MODULE'; mod: ModuleKey }
  | { type: 'SET_PAGE'; page: string }
  | { type: 'SET_POS_STATE'; mod: ModuleKey; patch: Partial<POSState> }
  | { type: 'ADD_TRANSACTION'; tx: Transaction }
  | { type: 'ADD_TOAST'; msg: string; toastType: string; id: number }
  | { type: 'REMOVE_TOAST'; id: number }
  | { type: 'SET_USERS'; users: User[] }
  | { type: 'SET_BIZ'; biz: BusinessConfig }
  | { type: 'ADD_AUDIT'; entry: AuditEntry }
  | { type: 'VOID_TRANSACTION'; id: number; reason: string }
  | { type: 'SET_ONLINE'; online: boolean }
  | { type: 'ADD_TO_CART'; item: CartItem }
  | { type: 'REMOVE_FROM_CART'; id: string }
  | { type: 'UPDATE_CART_QTY'; id: string; qty: number }
  | { type: 'UPDATE_CART_NOTE'; id: string; note: string }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_CART_PAY'; method: string }
  | { type: 'SET_CART_ORDER_TYPE'; orderType: OrderType }
  | { type: 'SET_PROMOS'; promos: PromoCode[] }
  | { type: 'HOLD_ORDER'; order: HeldOrder }
  | { type: 'REMOVE_HELD_ORDER'; id: string }
  | { type: 'UPDATE_TRANSACTION'; tx: Transaction }
  | { type: 'ADD_ORDER_TICKET'; ticket: OrderTicket }
  | { type: 'UPDATE_ORDER_TICKET'; id: string; patch: Partial<OrderTicket> }
  | { type: 'VOID_CART_ITEM'; id: string; reason: VoidReason; reasonText?: string; by: string; at: string }
  | { type: 'VOID_TICKET_ITEM'; ticketId: string; itemId: string; reason: VoidReason; reasonText?: string; by: string; at: string }
  | { type: 'ADD_VOID_LOG'; entry: VoidLog }
  | { type: 'REFUND_TRANSACTION'; id: number; reason: string; refundType: 'full' | 'partial'; amount: number; by: string; at: string }
  | { type: 'ADD_REFUND_LOG'; entry: RefundLog }
  | { type: 'ADD_NO_SALE_LOG'; entry: NoSaleLog }
  | { type: 'SET_UI_MODE'; mode: 'pos' | 'admin' }
  | { type: 'SHOW_EOD' }
  | { type: 'HIDE_EOD' }
  | { type: 'CLOSE_SHIFT_FORMAL'; closedBy: string; closedAt: string; openingFloat: number; countedCash: number; variance: number; varianceNote: string; wasOverridden?: boolean }
  | { type: 'ADD_MENU_ITEM';       mod: ModuleKey; item: MenuItem }
  | { type: 'UPDATE_MENU_ITEM';    mod: ModuleKey; item: MenuItem }
  | { type: 'DELETE_MENU_ITEM';    mod: ModuleKey; id: string }
  | { type: 'SET_MENU_CATEGORIES'; mod: ModuleKey; categories: string[] }
  | { type: 'RENAME_CATEGORY';     mod: ModuleKey; oldName: string; newName: string }
  | { type: 'ADD_MENU_ADDON';      mod: ModuleKey; addon: Addon }
  | { type: 'UPDATE_MENU_ADDON';   mod: ModuleKey; addon: Addon }
  | { type: 'DELETE_MENU_ADDON';   mod: ModuleKey; id: string }
  | { type: 'SYNC_HELD_ORDERS';    orders: HeldOrder[] }
  | { type: 'TRANSFER_ORDER'; ticketId: string; toUserName: string }
  | { type: 'UPSERT_HELD_ORDER';   order:  HeldOrder  }
  | { type: 'ADD_FLEET_ACCOUNT';    account: FleetAccount }
  | { type: 'UPDATE_FLEET_ACCOUNT'; account: FleetAccount }
  | { type: 'DELETE_FLEET_ACCOUNT'; id: string }
  | { type: 'SET_TRANSACTIONS'; transactions: Transaction[] }

const defaultPOS = (): POSState => ({
  selItem: null, selAddons: [], selTable: null, selTab: null,
  payMethod: 'cash', member: null, plate: '', qty: 1, note: '',
  cat: 'All', orderType: 'dine-in',
  customerName: '', customerPhone: '', customerAddress: '',
  pickupTime: '', deliveryFee: 0, driverId: '',
  taxOverride: null, serviceCharge: 0, gratuityPct: 0, seatNote: '',
})

function initState(): AppState {
  return {
    currentUser: storage.get<User>('current_user') ?? null,
    currentShift: storage.get<Shift>('current_shift') ?? null,
    users: storage.get<User[]>('users') ?? SEED_USERS,
    activeModule: 'restaurant',
    activePage: 'pos',
    posState: {
      restaurant: { ...defaultPOS() },
      bar:        { ...defaultPOS(), orderType: 'dine-in' },
      carwash:    { ...defaultPOS(), orderType: 'walk-in' as POSState['orderType'] },
    },
    cart: [],
    cartPayMethod: 'cash',
    cartOrderType: 'dine-in',
    menuData: (() => {
      const stored = storage.get<Record<ModuleKey, { items: MenuItem[]; categories: string[]; addons: Addon[] }>>('menu_data')
      if (stored && storage.get<string>('seed_version') === SEED_VERSION) return stored
      const fresh = {
        restaurant: { items: MODULE_DATA.restaurant.items as MenuItem[], categories: MODULE_DATA.restaurant.categories, addons: MODULE_DATA.restaurant.addons as Addon[] },
        bar:        { items: MODULE_DATA.bar.items as MenuItem[],        categories: MODULE_DATA.bar.categories,        addons: MODULE_DATA.bar.addons as Addon[]        },
        carwash:    { items: MODULE_DATA.carwash.items as MenuItem[],    categories: MODULE_DATA.carwash.categories,    addons: MODULE_DATA.carwash.addons as Addon[]    },
      }
      storage.set('menu_data', fresh)
      storage.set('seed_version', SEED_VERSION)
      return fresh
    })(),
    heldOrders:   (() => { const v = storage.get('held_orders');   return Array.isArray(v) ? (v as HeldOrder[]).filter(h => h?.id && Array.isArray(h?.cart)) : [] })(),
    orderTickets: (() => { const v = storage.get('order_tickets'); return Array.isArray(v) ? (v as OrderTicket[]).filter(t => t?.id && t?.timeline && Array.isArray(t?.items)) : [] })(),
    transactions: (() => {
      const cached = storage.get<Transaction[]>('tx') ?? []
      return cached.filter(t => t.id > 1003) // exclude seed demo data; show real localStorage data immediately while Supabase loads
    })(),
    shifts: storage.get<Shift[]>('shifts') ?? [],
    audit: storage.get<AuditEntry[]>('audit') ?? [],
    biz: storage.get<BusinessConfig>('biz_config') ?? DEFAULT_BIZ_CONFIG,
    fleet: (() => { const f = storage.get<FleetAccount[]>('fleet') ?? SEED_FLEET; const clean = f.filter(a => a.id !== 'FL1'); if (clean.length !== f.length) storage.set('fleet', clean); return clean })(),
    loyalty: storage.get<LoyaltyMember[]>('loyalty') ?? [],
    promos: storage.get<PromoCode[]>('promos') ?? SEED_PROMOS,
    voidLogs: (() => { const v = storage.get('void_logs'); return Array.isArray(v) ? (v as VoidLog[]) : [] })(),
    refundLogs: (() => { const v = storage.get('refund_logs'); return Array.isArray(v) ? (v as RefundLog[]) : [] })(),
    noSaleLogs: (() => { const v = storage.get('no_sale_logs'); return Array.isArray(v) ? (v as NoSaleLog[]) : [] })(),
    toasts: [],
    syncQueue: storage.get<unknown[]>('sync_queue') ?? [],
    isOnline: true,
    uiMode: 'pos',
    showEOD: false,
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN': {
      storage.set('current_user', action.user)
      if (state.currentShift !== null) {
        // Another employee joining an active business shift — no new shift record needed
        return { ...state, currentUser: action.user, activePage: 'pos' }
      }
      storage.set('current_shift', action.shift)
      const shifts = [action.shift, ...state.shifts]
      storage.set('shifts', shifts)
      return { ...state, currentUser: action.user, currentShift: action.shift, shifts, activePage: 'pos' }
    }
    case 'LOGOUT': {
      // Lock screen only — keeps the business shift alive for the next employee
      storage.set('current_user', null)
      return { ...state, currentUser: null, cart: [], cartPayMethod: 'cash', cartOrderType: 'dine-in', uiMode: 'pos' }
    }
    case 'CLOCK_OUT': {
      // Personal clock-out — end this employee's session, business shift stays alive
      const now = new Date().toISOString()
      if (state.currentUser) {
        try {
          const clockinAt = localStorage.getItem(`personal_clockin_${state.currentUser.id}`) ?? (state.currentShift?.start ?? now)
          localStorage.setItem(`clockout_${state.currentUser.id}`, JSON.stringify({ clockinAt, at: now }))
          localStorage.removeItem(`personal_clockin_${state.currentUser.id}`)

          // Auto-create payroll time entry when a profile exists for this employee
          type PProfile = { staffId: string; payrollType: 'hourly' | 'salary'; active: boolean }
          type TEntry   = { id: string; staffId: string; staffName: string; date: string; clockIn: string; clockOut: string | null; breakMinutes: number; notes: string }
          const profiles: PProfile[] = JSON.parse(localStorage.getItem('payroll_profiles') ?? '[]')
          const profile = profiles.find(p => p.staffId === state.currentUser!.id && p.active)
          if (profile) {
            // 30-min auto deduction for hourly; 0 for salary (attendance tracking only)
            const breakMinutes = profile.payrollType === 'hourly' ? 30 : 0
            const todayDate    = now.slice(0, 10)
            const toHHMM       = (iso: string) => new Date(iso).toTimeString().slice(0, 5)
            const clockInHHMM  = toHHMM(clockinAt)
            const clockOutHHMM = toHHMM(now)
            const entries: TEntry[] = JSON.parse(localStorage.getItem('payroll_time_entries') ?? '[]')
            // Close an open entry for today if found, else create a new completed entry
            const openIdx = entries.findIndex(e => e.staffId === state.currentUser!.id && e.clockOut === null && e.date === todayDate)
            if (openIdx >= 0) {
              entries[openIdx] = { ...entries[openIdx], clockOut: clockOutHHMM, breakMinutes }
            } else {
              const dup = entries.some(e => e.staffId === state.currentUser!.id && e.date === todayDate && e.clockIn === clockInHHMM)
              if (!dup) {
                const note = profile.payrollType === 'hourly'
                  ? 'auto · 30m break deducted'
                  : 'auto · salary (attendance only)'
                entries.unshift({ id: `TE-AUTO-${Date.now()}`, staffId: state.currentUser!.id, staffName: state.currentUser!.name, date: todayDate, clockIn: clockInHHMM, clockOut: clockOutHHMM, breakMinutes, notes: note })
              }
            }
            localStorage.setItem('payroll_time_entries', JSON.stringify(entries))
          }
        } catch {}
      }
      storage.set('current_user', null)
      return { ...state, currentUser: null, cart: [], cartPayMethod: 'cash', cartOrderType: 'dine-in', uiMode: 'pos' }
    }
    case 'SET_MODULE':
      return { ...state, activeModule: action.mod, activePage: 'pos' }
    case 'SET_PAGE':
      return { ...state, activePage: action.page }
    case 'SET_POS_STATE':
      return {
        ...state,
        posState: {
          ...state.posState,
          [action.mod]: { ...state.posState[action.mod], ...action.patch },
        },
      }
    case 'ADD_TRANSACTION': {
      const transactions = [action.tx, ...state.transactions].slice(0, 50000)
      storage.set('tx', transactions)
      const currentShift = state.currentShift
        ? { ...state.currentShift, txCount: state.currentShift.txCount + 1, revenue: state.currentShift.revenue + action.tx.total }
        : null
      // Auto-deduct inventory on sale
      if (action.tx.items && action.tx.items.length > 0) {
        const inv = storage.get<Array<{ id: string; name: string; quantity: number; lowStockThreshold: number }>>('inventory') ?? []
        if (inv.length > 0) {
          let changed = false
          const updatedInv = inv.map(invItem => {
            const sold = action.tx.items!
              .filter(ci => !ci.voided && ci.name.toLowerCase() === invItem.name.toLowerCase())
              .reduce((s, ci) => s + ci.qty, 0)
            if (sold > 0) { changed = true; return { ...invItem, quantity: Math.max(0, invItem.quantity - sold) } }
            return invItem
          })
          if (changed) storage.set('inventory', updatedInv)
        }
      }
      return { ...state, transactions, currentShift }
    }
    case 'VOID_TRANSACTION': {
      const transactions = state.transactions.map(t =>
        t.id === action.id ? { ...t, voided: true, voidReason: action.reason } : t
      )
      storage.set('tx', transactions)
      return { ...state, transactions }
    }
    case 'ADD_TOAST': {
      return { ...state, toasts: [...state.toasts, { id: action.id, msg: action.msg, type: action.toastType }] }
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) }
    case 'SET_USERS': {
      storage.set('users', action.users)
      return { ...state, users: action.users }
    }
    case 'SET_BIZ': {
      storage.set('biz_config', action.biz)
      return { ...state, biz: action.biz }
    }
    case 'ADD_AUDIT': {
      const audit = [action.entry, ...state.audit].slice(0, 600)
      storage.set('audit', audit)
      return { ...state, audit }
    }
    case 'SET_ONLINE':
      return { ...state, isOnline: action.online }
    case 'ADD_TO_CART': {
      const incoming = action.item
      // Deduplicate: same itemId + same addon ids + same plate → increment qty
      const existingIdx = state.cart.findIndex(ci =>
        ci.itemId === incoming.itemId &&
        ci.plate === incoming.plate &&
        ci.addons.length === incoming.addons.length &&
        ci.addons.every(a => incoming.addons.some(b => b.id === a.id))
      )
      if (existingIdx !== -1) {
        const cart = state.cart.map((ci, idx) =>
          idx === existingIdx ? { ...ci, qty: ci.qty + incoming.qty } : ci
        )
        return { ...state, cart }
      }
      return { ...state, cart: [...state.cart, incoming] }
    }
    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter(ci => ci.id !== action.id) }
    case 'UPDATE_CART_QTY': {
      if (action.qty < 1) {
        return { ...state, cart: state.cart.filter(ci => ci.id !== action.id) }
      }
      return {
        ...state,
        cart: state.cart.map(ci => ci.id === action.id ? { ...ci, qty: action.qty } : ci),
      }
    }
    case 'UPDATE_CART_NOTE':
      return {
        ...state,
        cart: state.cart.map(ci => ci.id === action.id ? { ...ci, note: action.note } : ci),
      }
    case 'CLEAR_CART':
      return { ...state, cart: [] }
    case 'SET_CART_PAY':
      return { ...state, cartPayMethod: action.method }
    case 'SET_CART_ORDER_TYPE':
      return { ...state, cartOrderType: action.orderType }
    case 'SET_PROMOS':
      return { ...state, promos: action.promos }
    case 'HOLD_ORDER': {
      const heldOrders = [action.order, ...state.heldOrders]
      storage.set('held_orders', heldOrders)
      return { ...state, heldOrders }
    }
    case 'REMOVE_HELD_ORDER': {
      const heldOrders = state.heldOrders.filter(h => h.id !== action.id)
      storage.set('held_orders', heldOrders)
      return { ...state, heldOrders }
    }
    case 'SYNC_HELD_ORDERS': {
      storage.set('held_orders', action.orders)
      return { ...state, heldOrders: action.orders }
    }
    case 'UPSERT_HELD_ORDER': {
      const idx = state.heldOrders.findIndex(h => h.id === action.order.id)
      const heldOrders = idx >= 0
        ? state.heldOrders.map((h, i) => i === idx ? action.order : h)
        : [action.order, ...state.heldOrders]
      storage.set('held_orders', heldOrders)
      return { ...state, heldOrders }
    }
    case 'UPDATE_TRANSACTION': {
      const transactions = state.transactions.map(t => t.id === action.tx.id ? action.tx : t)
      storage.set('tx', transactions)
      return { ...state, transactions }
    }
    case 'ADD_ORDER_TICKET': {
      const orderTickets = [action.ticket, ...state.orderTickets].slice(0, 200)
      storage.set('order_tickets', orderTickets)
      return { ...state, orderTickets }
    }
    case 'UPDATE_ORDER_TICKET': {
      const orderTickets = state.orderTickets.map(t =>
        t.id === action.id ? { ...t, ...action.patch } : t
      )
      storage.set('order_tickets', orderTickets)
      return { ...state, orderTickets }
    }

    case 'TRANSFER_ORDER': {
      const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const orderTickets = state.orderTickets.map(t => {
        if (t.id !== action.ticketId) return t
        return {
          ...t,
          server: action.toUserName,
          transferHistory: [...(t.transferHistory ?? []), { from: t.server, to: action.toUserName, at: nowStr }],
        }
      })
      storage.set('order_tickets', orderTickets)
      return { ...state, orderTickets }
    }
    case 'VOID_CART_ITEM': {
      const cart = state.cart.map(ci =>
        ci.id === action.id
          ? { ...ci, voided: true, voidReason: action.reason, voidReasonText: action.reasonText, voidedBy: action.by, voidedAt: action.at }
          : ci
      )
      return { ...state, cart }
    }
    case 'VOID_TICKET_ITEM': {
      const orderTickets = state.orderTickets.map(t =>
        t.id === action.ticketId
          ? { ...t, items: t.items.map(ci =>
              ci.id === action.itemId
                ? { ...ci, voided: true, voidReason: action.reason, voidReasonText: action.reasonText, voidedBy: action.by, voidedAt: action.at }
                : ci
            )}
          : t
      )
      storage.set('order_tickets', orderTickets)
      return { ...state, orderTickets }
    }
    case 'ADD_VOID_LOG': {
      const voidLogs = [action.entry, ...state.voidLogs].slice(0, 500)
      storage.set('void_logs', voidLogs)
      return { ...state, voidLogs }
    }
    case 'REFUND_TRANSACTION': {
      const transactions = state.transactions.map(t =>
        t.id === action.id
          ? { ...t, refunded: true, refundReason: action.reason, refundedBy: action.by, refundedAt: action.at, refundAmount: action.amount }
          : t
      )
      storage.set('tx', transactions)
      return { ...state, transactions }
    }
        case 'ADD_NO_SALE_LOG': {
      const noSaleLogs = [action.entry, ...state.noSaleLogs].slice(0, 1000)
      storage.set('no_sale_logs', noSaleLogs)
      return { ...state, noSaleLogs }
    }
    case 'ADD_REFUND_LOG': {
      const refundLogs = [action.entry, ...state.refundLogs].slice(0, 500)
      storage.set('refund_logs', refundLogs)
      return { ...state, refundLogs }
    }
    case 'SET_UI_MODE':
      return { ...state, uiMode: action.mode }
    case 'SHOW_EOD':
      return { ...state, showEOD: true }
    case 'HIDE_EOD':
      return { ...state, showEOD: false }
    case 'CLOSE_SHIFT_FORMAL': {
      if (!state.currentShift) return state
      const shifts = state.shifts.map(s =>
        s.id === state.currentShift!.id
          ? { ...s, end: action.closedAt, closedBy: action.closedBy, closedAt: action.closedAt,
              openingFloat: action.openingFloat, countedCash: action.countedCash,
              cashVariance: action.variance, varianceNote: action.varianceNote,
              wasOverridden: action.wasOverridden ?? false, isFormalClose: true,
              revenue: state.currentShift!.revenue,
              txCount: state.currentShift!.txCount }
          : s
      )
      storage.set('shifts', shifts)
      storage.set('current_shift', null)
      // Held orders survive shift boundaries - next shift inherits open tables
      return { ...state, currentShift: null, shifts }
    }
    case 'ADD_MENU_ITEM': {
      const menuData = { ...state.menuData, [action.mod]: { ...state.menuData[action.mod], items: [...state.menuData[action.mod].items, action.item] } }
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'UPDATE_MENU_ITEM': {
      const menuData = { ...state.menuData, [action.mod]: { ...state.menuData[action.mod], items: state.menuData[action.mod].items.map(i => i.id === action.item.id ? action.item : i) } }
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'DELETE_MENU_ITEM': {
      const menuData = { ...state.menuData, [action.mod]: { ...state.menuData[action.mod], items: state.menuData[action.mod].items.filter(i => i.id !== action.id) } }
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'SET_MENU_CATEGORIES': {
      const menuData = { ...state.menuData, [action.mod]: { ...state.menuData[action.mod], categories: action.categories } }
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'RENAME_CATEGORY': {
      const cur = state.menuData[action.mod]
      const menuData = { ...state.menuData, [action.mod]: { ...cur,
        categories: cur.categories.map(c => c === action.oldName ? action.newName : c),
        items: cur.items.map(i => i.cat === action.oldName ? { ...i, cat: action.newName } : i),
      }}
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'ADD_MENU_ADDON': {
      const menuData = { ...state.menuData, [action.mod]: { ...state.menuData[action.mod], addons: [...state.menuData[action.mod].addons, action.addon] } }
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'UPDATE_MENU_ADDON': {
      const menuData = { ...state.menuData, [action.mod]: { ...state.menuData[action.mod], addons: state.menuData[action.mod].addons.map(a => a.id === action.addon.id ? action.addon : a) } }
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'DELETE_MENU_ADDON': {
      const menuData = { ...state.menuData, [action.mod]: { ...state.menuData[action.mod], addons: state.menuData[action.mod].addons.filter(a => a.id !== action.id) } }
      storage.set('menu_data', menuData)
      return { ...state, menuData }
    }
    case 'ADD_FLEET_ACCOUNT': {
      const fleet = [action.account, ...state.fleet]
      storage.set('fleet', fleet)
      return { ...state, fleet }
    }
    case 'UPDATE_FLEET_ACCOUNT': {
      const fleet = state.fleet.map(a => a.id === action.account.id ? action.account : a)
      storage.set('fleet', fleet)
      return { ...state, fleet }
    }
    case 'DELETE_FLEET_ACCOUNT': {
      const fleet = state.fleet.filter(a => a.id !== action.id)
      storage.set('fleet', fleet)
      return { ...state, fleet }
    }
    case 'SET_TRANSACTIONS': {
      return { ...state, transactions: action.transactions }
    }
    default:
      return state
  }
}

// ── Supabase held-order row helpers ───────────────────────────────────────────────────────
function heldToRow(h: HeldOrder) {
  return {
    id: h.id, label: h.label, cart: h.cart,
    order_type: h.orderType, module: h.module,
    sel_table: h.selTable ?? null,
    guest_count: h.guestCount, customer_name: h.customerName,
    disc_pct: h.discPct, disc_flat: h.discFlat,
    gratuity_pct: h.gratuityPct, gratuity_override: h.gratuityOverride,
    opened_at: h.openedAt ?? null, saved_at: h.savedAt, saved_by: h.savedBy,
  }
}
function rowToHeld(r: Record<string, unknown>): HeldOrder {
  return {
    id: r.id as string,
    label: r.label as string,
    cart: (r.cart as CartItem[]) ?? [],
    orderType: (r.order_type ?? 'dine-in') as OrderType,
    module: (r.module ?? 'restaurant') as ModuleKey,
    selTable: (r.sel_table as string | null) ?? null,
    guestCount: Number(r.guest_count ?? 0),
    customerName: String(r.customer_name ?? ''),
    discPct: Number(r.disc_pct ?? 0),
    discFlat: Number(r.disc_flat ?? 0),
    gratuityPct: Number(r.gratuity_pct ?? 0),
    gratuityOverride: Boolean(r.gratuity_override),
    openedAt: r.opened_at as string | undefined,
    savedAt: String(r.saved_at ?? ''),
    savedBy: String(r.saved_by ?? ''),
  }
}

// ── Context ───────────────────────────────────────────────────────────────────────────────
interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  // Helpers
  toast: (msg: string, type?: string) => void
  audit: (action: string, detail: string, type?: AuditEntry['type']) => void
  moduleData: typeof MODULE_DATA
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, initState)

  // stateRef: lets the dispatch callback read the latest state without a closure capture
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // Refs for deduplicating realtime echoes
  const pendingWrites  = useRef<Set<string>>(new Set())
  const pendingDeletes = useRef<Set<string>>(new Set())

  // Supabase-aware dispatch — Supabase is the single source of truth for all transactions
  const dispatch = useCallback((action: Action): void => {
    // ADD_TRANSACTION: write to Supabase first, then update local state
    if (action.type === 'ADD_TRANSACTION') {
      ;(async () => {
        try {
          const { error } = await supabase.from('transactions').upsert({
            id:      action.tx.id,
            mod:     action.tx.mod,
            cashier: action.tx.cashier,
            data:    action.tx,
          })
          if (error) throw error
        } catch {
          // Supabase write failed — warn the operator; still record locally for offline resilience
          const warnId = Date.now()
          rawDispatch({ type: 'ADD_TOAST', msg: '⚠️ Transaction not synced to database — check your connection', toastType: 'warn', id: warnId })
          setTimeout(() => rawDispatch({ type: 'REMOVE_TOAST', id: warnId }), 6000)
        }
        // Update local state after Supabase attempt (success or fail)
        rawDispatch(action)
      })()
      return
    }

    // All other actions update local state immediately
    rawDispatch(action)

    // VOID_TRANSACTION: update the stored record in Supabase
    if (action.type === 'VOID_TRANSACTION') {
      const tx = stateRef.current.transactions.find(t => t.id === action.id)
      if (tx) {
        const updated = { ...tx, voided: true, voidReason: action.reason }
        ;(async () => {
          try { await supabase.from('transactions').upsert({ id: updated.id, mod: updated.mod, cashier: updated.cashier, data: updated }) } catch {}
        })()
      }
    }

    // REFUND_TRANSACTION: update the stored record in Supabase
    if (action.type === 'REFUND_TRANSACTION') {
      const tx = stateRef.current.transactions.find(t => t.id === action.id)
      if (tx) {
        const updated = { ...tx, refunded: true, refundReason: action.reason, refundedBy: action.by, refundedAt: action.at, refundAmount: action.amount }
        ;(async () => {
          try { await supabase.from('transactions').upsert({ id: updated.id, mod: updated.mod, cashier: updated.cashier, data: updated }) } catch {}
        })()
      }
    }

    if (action.type === 'HOLD_ORDER') {
      const oid = action.order.id
      pendingWrites.current.add(oid)
      ;(async () => {
        try { await supabase.from('held_orders').upsert(heldToRow(action.order)) } catch {}
        setTimeout(() => pendingWrites.current.delete(oid), 3000)
      })()
    }
    if (action.type === 'REMOVE_HELD_ORDER') {
      const oid = action.id
      pendingDeletes.current.add(oid)
      ;(async () => {
        try { await supabase.from('held_orders').delete().eq('id', oid) } catch {}
        setTimeout(() => pendingDeletes.current.delete(oid), 3000)
      })()
    }
  }, [])

  // Refresh staff from Supabase (initial load + realtime trigger)
  const refreshStaff = useCallback(() => {
    fetch(STAFF_API)
      .then(r => r.ok ? r.json() : null)
      .then((rows: unknown) => {
        if (!Array.isArray(rows) || rows.length === 0) return
        const fromSupabase = (rows as DbStaffRow[]).map(dbStaffToUser)
        rawDispatch({ type: 'SET_USERS', users: fromSupabase })
        storage.set('users', fromSupabase)
      })
      .catch(() => {})
  }, [])

  const staffFetched = useRef(false)
  useEffect(() => {
    if (staffFetched.current) return
    staffFetched.current = true
    refreshStaff()
  }, [refreshStaff])

  // Realtime staff sync — re-fetch whenever any staff row changes on any device
  useEffect(() => {
    const ch = supabase
      .channel('staff-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, refreshStaff)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [refreshStaff])

  // Online/offline detection
  useEffect(() => {
    const on  = () => rawDispatch({ type: 'SET_ONLINE', online: true })
    const off = () => rawDispatch({ type: 'SET_ONLINE', online: false })
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Sync held orders with Supabase – initial load + realtime subscription
  const heldFetched = useRef(false)
  useEffect(() => {
    if (heldFetched.current) return
    heldFetched.current = true

    ;(async () => {
      try {
        const { data } = await supabase.from('held_orders').select('*')
        if (!data) return
        const supaOrders = data.map(row => rowToHeld(row as Record<string, unknown>))
        const supaIds = new Set(supaOrders.map(h => h.id))
        const local = storage.get<HeldOrder[]>('held_orders') ?? []
        const localOnly = local.filter(h => !supaIds.has(h.id))
        // Upload any orders created offline
        if (localOnly.length > 0) {
          try { await supabase.from('held_orders').upsert(localOnly.map(heldToRow)) } catch {}
        }
        rawDispatch({ type: 'SYNC_HELD_ORDERS', orders: [...supaOrders, ...localOnly] })
      } catch {}
    })()

    const ch = supabase
      .channel('held-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'held_orders' }, ({ new: row }) => {
        if (pendingWrites.current.has((row as { id: string }).id)) return
        rawDispatch({ type: 'UPSERT_HELD_ORDER', order: rowToHeld(row as Record<string, unknown>) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'held_orders' }, ({ new: row }) => {
        if (pendingWrites.current.has((row as { id: string }).id)) return
        rawDispatch({ type: 'UPSERT_HELD_ORDER', order: rowToHeld(row as Record<string, unknown>) })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'held_orders' }, ({ old: row }) => {
        if (pendingDeletes.current.has((row as { id: string }).id)) return
        rawDispatch({ type: 'REMOVE_HELD_ORDER', id: (row as { id: string }).id })
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  // Startup: load from Supabase + migrate any localStorage transactions not yet there
  const txFetched = useRef(false)
  useEffect(() => {
    if (txFetched.current) return
    txFetched.current = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('data')
          .order('id', { ascending: false })
          .limit(50000)
        if (error) throw error

        // Supabase is the single source of truth — set state directly, no local merge
        const allTxs = ((data ?? []) as { data: Transaction }[]).map(r => r.data).sort((a, b) => b.id - a.id)
        rawDispatch({ type: 'SET_TRANSACTIONS', transactions: allTxs })
      } catch (err) {
        console.warn('[NexPOS] Could not sync transactions with Supabase:', err)
        // Keep whatever initState loaded from localStorage (already shown to user)
      }
    })()
  }, [])

  const toast = useCallback((msg: string, type = 'info') => {
    const id = Date.now()
    rawDispatch({ type: 'ADD_TOAST', msg, toastType: type, id })
    setTimeout(() => rawDispatch({ type: 'REMOVE_TOAST', id }), 3000)
  }, [])

  const auditFn = useCallback((action: string, detail: string, type: AuditEntry['type'] = 'info') => {
    rawDispatch({
      type: 'ADD_AUDIT',
      entry: {
        id: crypto.randomUUID(), ts: new Date().toLocaleString(),
        user: state.currentUser?.name ?? 'System',
        userId: state.currentUser?.id ?? null,
        action, detail, type,
        mod: state.activeModule,
      },
    })
  }, [state.currentUser, state.activeModule])

  return (
    <AppContext.Provider value={{ state, dispatch, toast, audit: auditFn, moduleData: {
      restaurant: { ...MODULE_DATA.restaurant, ...state.menuData.restaurant },
      bar:        { ...MODULE_DATA.bar,        ...state.menuData.bar        },
      carwash:    { ...MODULE_DATA.carwash,    ...state.menuData.carwash    },
    } as typeof MODULE_DATA }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

