'use client'

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react'
import type {
  User, UserRole, ModuleKey, Transaction, Shift, AuditEntry,
  BusinessConfig, FleetAccount, POSState, LoyaltyMember, PromoCode,
  CartItem, OrderType, HeldOrder, OrderTicket, VoidLog, VoidReason,
} from '@/types'

const STAFF_API = 'https://www.soultiesseafoodjm.com/api/staff'

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
    role: row.role as UserRole,
    color: row.color,
    allowedModules,
    active: row.active,
    staffId: row.staff_id ?? undefined,
  }
}
import { storage } from '@/lib/utils/storage'
import {
  SEED_USERS, MODULE_DATA, DEFAULT_BIZ_CONFIG,
  SEED_TRANSACTIONS, SEED_FLEET, SEED_PROMOS,
} from '@/lib/data/seed'

// ── State shape ───────────────────────────────────────────────
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
  // UI
  toasts: { id: number; msg: string; type: string }[]
  syncQueue: unknown[]
  isOnline: boolean
}

type Action =
  | { type: 'LOGIN'; user: User; shift: Shift }
  | { type: 'LOGOUT' }
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
  | { type: 'CLOCK_OUT' }
  | { type: 'SET_ONLINE'; online: boolean }
  | { type: 'ADD_TO_CART'; item: CartItem }
  | { type: 'REMOVE_FROM_CART'; id: string }
  | { type: 'UPDATE_CART_QTY'; id: string; qty: number }
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
    currentUser: null,
    currentShift: null,
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
    heldOrders:   (() => { const v = storage.get('held_orders');   return Array.isArray(v) ? (v as HeldOrder[]).filter(h => h?.id && Array.isArray(h?.cart)) : [] })(),
    orderTickets: (() => { const v = storage.get('order_tickets'); return Array.isArray(v) ? (v as OrderTicket[]).filter(t => t?.id && t?.timeline && Array.isArray(t?.items)) : [] })(),
    transactions: storage.get<Transaction[]>('tx') ?? SEED_TRANSACTIONS,
    shifts: storage.get<Shift[]>('shifts') ?? [],
    audit: storage.get<AuditEntry[]>('audit') ?? [],
    biz: storage.get<BusinessConfig>('biz_config') ?? DEFAULT_BIZ_CONFIG,
    fleet: storage.get<FleetAccount[]>('fleet') ?? SEED_FLEET,
    loyalty: storage.get<LoyaltyMember[]>('loyalty') ?? [],
    promos: storage.get<PromoCode[]>('promos') ?? SEED_PROMOS,
    voidLogs: (() => { const v = storage.get('void_logs'); return Array.isArray(v) ? (v as VoidLog[]) : [] })(),
    toasts: [],
    syncQueue: storage.get<unknown[]>('sync_queue') ?? [],
    isOnline: true,
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN': {
      const shifts = [action.shift, ...state.shifts]
      storage.set('shifts', shifts)
      return { ...state, currentUser: action.user, currentShift: action.shift, shifts, activePage: 'pos' }
    }
    case 'LOGOUT': {
      const shifts = state.shifts.map(s =>
        s.id === state.currentShift?.id ? { ...s, end: new Date().toISOString() } : s
      )
      storage.set('shifts', shifts)
      return { ...state, currentUser: null, currentShift: null, shifts }
    }
    case 'CLOCK_OUT': {
      if (!state.currentShift) return state
      const shifts = state.shifts.map(s =>
        s.id === state.currentShift!.id ? { ...s, end: new Date().toISOString() } : s
      )
      storage.set('shifts', shifts)
      return { ...state, currentShift: null, shifts }
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
      const transactions = [action.tx, ...state.transactions]
      storage.set('tx', transactions)
      const currentShift = state.currentShift
        ? { ...state.currentShift, txCount: state.currentShift.txCount + 1, revenue: state.currentShift.revenue + action.tx.total }
        : null
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
    default:
      return state
  }
}

// ── Context ───────────────────────────────────────────────────
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
  const [state, dispatch] = useReducer(reducer, undefined, initState)

  // Load staff from Supabase — overwrites seed/cache on success
  const staffFetched = useRef(false)
  useEffect(() => {
    if (staffFetched.current) return
    staffFetched.current = true
    fetch(STAFF_API)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then((rows: unknown) => {
        if (!Array.isArray(rows) || rows.length === 0) return
        const users = (rows as DbStaffRow[]).map(dbStaffToUser)
        dispatch({ type: 'SET_USERS', users })
        storage.set('users', users)
      })
      .catch(() => { /* keep localStorage cache / seed users */ })
  }, [])

  // Online/offline detection
  useEffect(() => {
    const on  = () => dispatch({ type: 'SET_ONLINE', online: true })
    const off = () => dispatch({ type: 'SET_ONLINE', online: false })
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const toast = useCallback((msg: string, type = 'info') => {
    const id = Date.now()
    dispatch({ type: 'ADD_TOAST', msg, toastType: type, id })
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 3000)
  }, [])

  const auditFn = useCallback((action: string, detail: string, type: AuditEntry['type'] = 'info') => {
    dispatch({
      type: 'ADD_AUDIT',
      entry: {
        id: Date.now(), ts: new Date().toLocaleString(),
        user: state.currentUser?.name ?? 'System',
        userId: state.currentUser?.id ?? null,
        action, detail, type,
        mod: state.activeModule,
      },
    })
  }, [state.currentUser, state.activeModule])

  return (
    <AppContext.Provider value={{ state, dispatch, toast, audit: auditFn, moduleData: MODULE_DATA }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
