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
  has_pin?: boolean // /api/staff GET never returns pin_hash itself — see that route
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
    has_pin: row.has_pin,
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
import { recordChannelStatus, recordSyncResult, recordTransactionWriteResult } from '@/lib/utils/healthTelemetry'

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
  toasts: { id: number; msg: string; type: string; action?: { label: string; onClick: () => void } }[]
  syncQueue: unknown[]
  isOnline: boolean
  uiMode: 'pos' | 'admin'
  showEOD: boolean
}

type Action =
  | { type: 'LOGIN'; user: User; shift: Shift }
  | { type: 'LOGOUT' }
  | { type: 'RESTORE_SESSION'; user: User | null }
  | { type: 'CLOCK_OUT' }
  | { type: 'SET_MODULE'; mod: ModuleKey }
  | { type: 'SET_PAGE'; page: string }
  | { type: 'SET_POS_STATE'; mod: ModuleKey; patch: Partial<POSState> }
  | { type: 'ADD_TRANSACTION'; tx: Transaction }
  | { type: 'ADD_TOAST'; msg: string; toastType: string; id: number; action?: { label: string; onClick: () => void } }
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
  | { type: 'CLOSE_SHIFT_FORMAL'; closedBy: string; closedAt: string; openingFloat: number; countedCash: number; variance: number; varianceNote: string; wasOverridden?: boolean; revenue: number; txCount: number }
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
  | { type: 'SYNC_ORDER_TICKETS';  tickets: OrderTicket[] }
  | { type: 'UPSERT_ORDER_TICKET'; ticket: OrderTicket }
  | { type: 'SYNC_VOID_LOGS';   entries: VoidLog[] }
  | { type: 'SYNC_REFUND_LOGS'; entries: RefundLog[] }
  | { type: 'SYNC_AUDIT';       entries: AuditEntry[] }
  | { type: 'SET_CURRENT_SHIFT'; shift: Shift | null }
  | { type: 'ADD_FLEET_ACCOUNT';    account: FleetAccount }
  | { type: 'UPDATE_FLEET_ACCOUNT'; account: FleetAccount }
  | { type: 'DELETE_FLEET_ACCOUNT'; id: string }
  | { type: 'SET_TRANSACTIONS'; transactions: Transaction[] }
  | { type: 'UPSERT_TRANSACTION'; tx: Transaction }

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
    // Supabase (`business_shifts`) is the sole authoritative source for the active
    // business shift — never localStorage. Starts null; populated moments after
    // mount by the fetch-on-load + realtime effect below, same convention as
    // business_config/held_orders/order_tickets. A stale/absent localStorage value
    // here was the root cause of a real incident (a remote device's own stale
    // shift-start silently producing a wildly wrong Close Shift total) — see
    // CloseShiftWizard.tsx and the business_shifts sync effect for the fix.
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
    // Supabase is the single source of truth (realtime-synced below, like Tables) —
    // no localStorage dependency, so Kitchen Display sees the same tickets on every
    // terminal. Starts empty; populated by the fetch-on-load effect moments after mount.
    orderTickets: [],
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
      // Tentatively adopt the candidate shift locally for instant feedback — the
      // dispatch wrapper below reconciles this against Supabase (business_shifts)
      // immediately after, and corrects local state via SET_CURRENT_SHIFT if this
      // device lost a race to another device opening the shift at the same moment.
      const shifts = [action.shift, ...state.shifts]
      storage.set('shifts', shifts)
      return { ...state, currentUser: action.user, currentShift: action.shift, shifts, activePage: 'pos' }
    }
    case 'SET_CURRENT_SHIFT': {
      const shifts = action.shift
        ? (state.shifts.some(s => s.id === action.shift!.id)
            ? state.shifts.map(s => s.id === action.shift!.id ? action.shift! : s)
            : [action.shift, ...state.shifts])
        : state.shifts
      storage.set('shifts', shifts)
      return { ...state, currentShift: action.shift, shifts }
    }
    case 'LOGOUT': {
      // Lock screen only — keeps the business shift alive for the next employee
      storage.set('current_user', null)
      return { ...state, currentUser: null, cart: [], cartPayMethod: 'cash', cartOrderType: 'dine-in', uiMode: 'pos' }
    }
    // Startup session check (see the effect below) — localStorage's cached
    // currentUser is only ever an optimistic guess for instant UI; this
    // reconciles it against what the server's session cookie actually proves.
    // A null user here means the cookie was missing/invalid/expired, and the
    // browser must not stay "logged in" just because localStorage said so.
    case 'RESTORE_SESSION': {
      storage.set('current_user', action.user)
      if (!action.user) {
        return { ...state, currentUser: null, cart: [], cartPayMethod: 'cash', cartOrderType: 'dine-in', uiMode: 'pos' }
      }
      return { ...state, currentUser: action.user }
    }
    case 'CLOCK_OUT': {
      // Personal clock-out — end this employee's session, business shift stays alive
      const now = new Date().toISOString()
      if (state.currentUser) {
        try {
          const clockinAt = localStorage.getItem(`personal_clockin_${state.currentUser.id}`) ?? (state.currentShift?.start ?? now)
          localStorage.setItem(`clockout_${state.currentUser.id}`, JSON.stringify({ clockinAt, at: now }))
          localStorage.removeItem(`personal_clockin_${state.currentUser.id}`)
          localStorage.removeItem(`personal_shiftrow_${state.currentUser.id}`)

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
      // currentShift.txCount/.revenue are no longer incremented here — they were a
      // local-only running counter (itself cross-device-inconsistent) that nothing
      // reads anymore; Close Shift and the Active Shift display both now compute
      // totals fresh from state.transactions against the Supabase-authoritative
      // shift start instead.
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
      return { ...state, transactions }
    }
    case 'VOID_TRANSACTION': {
      const transactions = state.transactions.map(t =>
        t.id === action.id ? { ...t, voided: true, voidReason: action.reason } : t
      )
      storage.set('tx', transactions)
      return { ...state, transactions }
    }
    case 'ADD_TOAST': {
      return { ...state, toasts: [...state.toasts, { id: action.id, msg: action.msg, type: action.toastType, action: action.action }] }
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
    case 'SYNC_AUDIT': {
      storage.set('audit', action.entries)
      return { ...state, audit: action.entries }
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
    case 'SYNC_ORDER_TICKETS': {
      return { ...state, orderTickets: action.tickets }
    }
    // UPSERT_ORDER_TICKET is the ONLY reducer case that ever applies an OrderTicket change to
    // local state — for every ticket mutation (create/update/transfer/void-item) as well as
    // realtime-inbound sync. See resolveOrderTicket() above and the dispatch wrapper below:
    // ADD_ORDER_TICKET/UPDATE_ORDER_TICKET/TRANSFER_ORDER/VOID_TICKET_ITEM are resolved to a
    // single canonical ticket there and dispatched as UPSERT_ORDER_TICKET, never handled here
    // directly, so there is exactly one place this array is ever mutated.
    case 'UPSERT_ORDER_TICKET': {
      const idx = state.orderTickets.findIndex(t => t.id === action.ticket.id)
      const orderTickets = idx >= 0
        ? state.orderTickets.map((t, i) => i === idx ? action.ticket : t)
        // New ticket: prepend, capped at 200 — same cap the old ADD_ORDER_TICKET case had.
        : [action.ticket, ...state.orderTickets].slice(0, 200)
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
    case 'ADD_VOID_LOG': {
      const voidLogs = [action.entry, ...state.voidLogs].slice(0, 500)
      storage.set('void_logs', voidLogs)
      return { ...state, voidLogs }
    }
    case 'SYNC_VOID_LOGS': {
      storage.set('void_logs', action.entries)
      return { ...state, voidLogs: action.entries }
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
    case 'SYNC_REFUND_LOGS': {
      storage.set('refund_logs', action.entries)
      return { ...state, refundLogs: action.entries }
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
              revenue: action.revenue,
              txCount: action.txCount }
          : s
      )
      storage.set('shifts', shifts)
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
    case 'UPSERT_TRANSACTION': {
      const idx = state.transactions.findIndex(t => t.id === action.tx.id)
      const transactions = idx >= 0
        ? state.transactions.map((t, i) => i === idx ? action.tx : t)
        : [action.tx, ...state.transactions].slice(0, 50000)
      storage.set('tx', transactions)
      return { ...state, transactions }
    }
    default:
      return state
  }
}

// ── Order ticket mutation — THE single canonical computation ───────────────────────────────
// There is exactly one place an OrderTicket mutation is computed, ever. resolveOrderTicket()
// takes the current ticket list plus one of these four action types and returns the one,
// fully-resolved OrderTicket — the SAME object then used both to update local state (via
// dispatching UPSERT_ORDER_TICKET) and to write to Supabase (see the dispatch wrapper below).
// This exists because the previous design computed the patch twice — once inside the reducer's
// own ADD_ORDER_TICKET/UPDATE_ORDER_TICKET/TRANSFER_ORDER/VOID_TICKET_ITEM cases (correct, for
// local state), and once in the write-through side effect (which read a stale pre-render
// snapshot and wrote it back UNMODIFIED, silently dropping the actual patch) — two independent
// computations of "what should this ticket become" that were free to (and did) diverge.
// Any future order-ticket action MUST be added here, not as a new reducer case and not as a
// second ad-hoc merge anywhere else. Never construct a second version of an OrderTicket.
type OrderTicketMutation = Extract<Action,
  { type: 'ADD_ORDER_TICKET' | 'UPDATE_ORDER_TICKET' | 'TRANSFER_ORDER' | 'VOID_TICKET_ITEM' }>

function resolveOrderTicket(tickets: OrderTicket[], action: OrderTicketMutation): OrderTicket | null {
  switch (action.type) {
    case 'ADD_ORDER_TICKET':
      // Pure insert — the caller already built the full ticket, nothing to merge.
      return action.ticket
    case 'UPDATE_ORDER_TICKET': {
      const t = tickets.find(t => t.id === action.id)
      return t ? { ...t, ...action.patch } : null
    }
    case 'TRANSFER_ORDER': {
      const t = tickets.find(t => t.id === action.ticketId)
      if (!t) return null
      const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      return {
        ...t,
        server: action.toUserName,
        transferHistory: [...(t.transferHistory ?? []), { from: t.server, to: action.toUserName, at: nowStr }],
      }
    }
    case 'VOID_TICKET_ITEM': {
      const t = tickets.find(t => t.id === action.ticketId)
      if (!t) return null
      return {
        ...t,
        items: t.items.map(ci =>
          ci.id === action.itemId
            ? { ...ci, voided: true, voidReason: action.reason, voidReasonText: action.reasonText, voidedBy: action.by, voidedAt: action.at }
            : ci
        ),
      }
    }
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

// ── Supabase business-shift row helpers ───────────────────────────────────────
// business_shifts is the sole authoritative source for the active business
// shift (see CloseShiftWizard.tsx) — every device reads/writes the same row.
function rowToShift(r: Record<string, unknown>): Shift {
  return {
    id: r.id as string,
    userId: r.started_by_id as string,
    userName: r.started_by_name as string,
    role: r.role as UserRole,
    modules: (r.modules as ModuleKey[]) ?? [],
    start: r.started_at as string,
    end: (r.closed_at as string | null) ?? null,
    txCount: Number(r.tx_count ?? 0),
    revenue: Number(r.revenue ?? 0),
    closedBy: (r.closed_by as string | undefined) ?? undefined,
    closedAt: (r.closed_at as string | undefined) ?? undefined,
    openingFloat: r.opening_float != null ? Number(r.opening_float) : undefined,
    countedCash: r.counted_cash != null ? Number(r.counted_cash) : undefined,
    cashVariance: r.cash_variance != null ? Number(r.cash_variance) : undefined,
    varianceNote: (r.variance_note as string | undefined) ?? undefined,
    wasOverridden: (r.was_overridden as boolean | undefined) ?? undefined,
    isFormalClose: (r.is_formal_close as boolean | undefined) ?? undefined,
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
    // Permission gate — verified here, at the single point every action from every
    // component actually passes through, not just by hiding the triggering button.
    // Placed before both local state update AND any Supabase write below, so a
    // blocked action never partially applies (e.g. blocked locally but still
    // written to the database by the async side-effect code further down).
    const role = stateRef.current.currentUser?.role
    if (action.type === 'SET_MODULE' && stateRef.current.currentUser &&
        !stateRef.current.currentUser.allowedModules.includes(action.mod)) return
    if ((action.type === 'VOID_TRANSACTION' || action.type === 'REFUND_TRANSACTION') &&
        role !== 'admin' && role !== 'manager') return

    // LOGOUT clears the server-side session cookie too — this is a lock screen
    // (the business shift and personal clock-in stay alive), but the next person
    // to use this terminal must re-enter a PIN and get their own fresh session,
    // not silently inherit whatever cookie was left behind.
    if (action.type === 'LOGOUT') {
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    }

    // ADD_TRANSACTION: write to Supabase first, then update local state
    if (action.type === 'ADD_TRANSACTION') {
      // Stamp the active personal clock-in session's shift ID here — the single choke
      // point every module's transaction ultimately passes through — rather than
      // duplicating this lookup in Restaurant/Bar/Car Wash/etc. Only stamps if the
      // caller hasn't already set one (none currently do) and a personal session is
      // actually active for this user; never invents an ID otherwise.
      let tx = action.tx
      if (!tx.shiftId && tx.userId) {
        let activeShiftId: string | null = null
        try {
          const clockedIn = localStorage.getItem(`personal_clockin_${tx.userId}`)
          if (clockedIn) activeShiftId = localStorage.getItem(`personal_shiftid_${tx.userId}`)
        } catch {}
        if (activeShiftId) {
          tx = { ...tx, shiftId: activeShiftId }
        } else {
          console.warn(`[shift] Transaction ${tx.id} (user ${tx.userId}) saved with no active personal shiftId — My Shift will fall back to cashier+date matching for it`)
        }
      }
      pendingWrites.current.add(String(tx.id))
      ;(async () => {
        try {
          const { error } = await supabase.from('transactions').upsert({
            id:      tx.id,
            mod:     tx.mod,
            cashier: tx.cashier,
            data:    tx,
          })
          if (error) throw error
          recordTransactionWriteResult(tx.id, true)
        } catch {
          // Supabase write failed — warn the operator; still record locally for offline resilience
          const warnId = Date.now()
          rawDispatch({ type: 'ADD_TOAST', msg: '⚠️ Transaction not synced to database — check your connection', toastType: 'warn', id: warnId })
          setTimeout(() => rawDispatch({ type: 'REMOVE_TOAST', id: warnId }), 6000)
          recordTransactionWriteResult(tx.id, false)
        }
        // Update local state after Supabase attempt (success or fail)
        rawDispatch({ ...action, tx })
        setTimeout(() => pendingWrites.current.delete(String(tx.id)), 3000)
      })()
      return
    }

    // Order tickets: resolveOrderTicket() (above the reducer) computes the ONE canonical
    // ticket for this action — the exact same object is then used both to update local state
    // (via UPSERT_ORDER_TICKET, the only reducer case that ever touches orderTickets) and to
    // write to Supabase below. There is no second computation, no second merge, no reading
    // stateRef a second time — see the comment on resolveOrderTicket for why that matters.
    if (action.type === 'ADD_ORDER_TICKET' || action.type === 'UPDATE_ORDER_TICKET' ||
        action.type === 'TRANSFER_ORDER' || action.type === 'VOID_TICKET_ITEM') {
      const resolved = resolveOrderTicket(stateRef.current.orderTickets, action)
      if (resolved) {
        rawDispatch({ type: 'UPSERT_ORDER_TICKET', ticket: resolved })
        pendingWrites.current.add(resolved.id)
        ;(async () => {
          try {
            const { error } = await supabase.from('order_tickets').upsert({ id: resolved.id, data: resolved })
            if (error) throw error
            recordSyncResult(true)
          } catch { recordSyncResult(false) }
          setTimeout(() => pendingWrites.current.delete(resolved.id), 3000)
        })()
      }
      return
    }

    // Capture before rawDispatch (stateRef only updates after a render commits,
    // so this reflects pre-action state regardless of where it's read in this
    // synchronous function body).
    const hadNoOpenShiftBeforeLogin = action.type === 'LOGIN' && stateRef.current.currentShift === null

    // All other actions update local state immediately
    rawDispatch(action)

    // LOGIN, when no shift was open locally: this device believes it's starting a
    // new business shift. Confirm that with Supabase rather than trusting local
    // state alone — the `business_shifts_one_open` unique index guarantees exactly
    // one open shift can ever exist. If another device already opened one at
    // (near-)the same moment, adopt that one instead of silently diverging.
    if (action.type === 'LOGIN' && hadNoOpenShiftBeforeLogin) {
      ;(async () => {
        const shift = action.shift
        const { error } = await supabase.from('business_shifts').insert({
          id: shift.id, started_by_id: shift.userId, started_by_name: shift.userName,
          role: shift.role, modules: shift.modules, started_at: shift.start, status: 'open',
        })
        if (error) {
          // Lost the race (or some other open shift already exists) — adopt the
          // real authoritative one from Supabase instead of keeping our local guess.
          try {
            const { data } = await supabase.from('business_shifts').select('*').eq('status', 'open').limit(1).maybeSingle()
            rawDispatch({ type: 'SET_CURRENT_SHIFT', shift: data ? rowToShift(data) : null })
          } catch {}
        }
      })()
    }

    // VOID_TRANSACTION: update the stored record in Supabase
    if (action.type === 'VOID_TRANSACTION') {
      const tx = stateRef.current.transactions.find(t => t.id === action.id)
      if (tx) {
        const updated = { ...tx, voided: true, voidReason: action.reason }
        pendingWrites.current.add(String(updated.id))
        ;(async () => {
          try {
            const { error } = await supabase.from('transactions').upsert({ id: updated.id, mod: updated.mod, cashier: updated.cashier, data: updated })
            if (error) throw error
            recordSyncResult(true)
          } catch { recordSyncResult(false) }
          setTimeout(() => pendingWrites.current.delete(String(updated.id)), 3000)
        })()
      }
    }

    // REFUND_TRANSACTION: update the stored record in Supabase
    if (action.type === 'REFUND_TRANSACTION') {
      const tx = stateRef.current.transactions.find(t => t.id === action.id)
      if (tx) {
        const updated = { ...tx, refunded: true, refundReason: action.reason, refundedBy: action.by, refundedAt: action.at, refundAmount: action.amount }
        pendingWrites.current.add(String(updated.id))
        ;(async () => {
          try {
            const { error } = await supabase.from('transactions').upsert({ id: updated.id, mod: updated.mod, cashier: updated.cashier, data: updated })
            if (error) throw error
            recordSyncResult(true)
          } catch { recordSyncResult(false) }
          setTimeout(() => pendingWrites.current.delete(String(updated.id)), 3000)
        })()
      }
    }

    // Audit trail (void/refund history, manager actions) — write-through so every
    // terminal sees who did what and why, not just the device that acted.
    if (action.type === 'ADD_VOID_LOG' || action.type === 'ADD_REFUND_LOG' || action.type === 'ADD_AUDIT') {
      const entry = action.type === 'ADD_AUDIT' ? action.entry : action.entry
      const table = action.type === 'ADD_VOID_LOG' ? 'void_logs' : action.type === 'ADD_REFUND_LOG' ? 'refund_logs' : 'audit_trail'
      pendingWrites.current.add(entry.id)
      ;(async () => {
        try { await supabase.from(table).insert({ id: entry.id, data: entry }) } catch {}
        setTimeout(() => pendingWrites.current.delete(entry.id), 3000)
      })()
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

  // Startup session check — localStorage's cached currentUser is only an
  // optimistic guess used for instant UI on load; it is never proof of
  // authentication. Ask the server whether the session cookie is actually
  // valid, and reconcile local state either way (see RESTORE_SESSION above).
  const sessionChecked = useRef(false)
  useEffect(() => {
    if (sessionChecked.current) return
    sessionChecked.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/auth/session')
        if (res.ok) {
          const { user } = await res.json()
          rawDispatch({ type: 'RESTORE_SESSION', user: user ?? null })
        } else if (stateRef.current.currentUser) {
          // No valid session, but localStorage/optimistic state thought otherwise.
          rawDispatch({ type: 'RESTORE_SESSION', user: null })
        }
      } catch {
        // Network failure — leave the optimistic local state as-is rather than
        // forcing a lockout while offline; every real API call is still
        // independently gated server-side regardless of what the UI shows.
      }
    })()
  }, [])

  // Realtime staff sync — re-fetch whenever any staff row changes on any device
  useEffect(() => {
    // refreshStaff is already a stable, named callback (used directly as the
    // live event handler below) — reconnect backfill just calls the same
    // function again, no extraction needed.
    let wasDown = false
    const ch = supabase
      .channel('staff-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, refreshStaff)
      .subscribe(status => {
        recordChannelStatus('staff', status)
        if (status === 'SUBSCRIBED' && wasDown) { wasDown = false; refreshStaff() }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') wasDown = true
      })
    return () => { supabase.removeChannel(ch) }
  }, [refreshStaff])

  // Business config (incl. printer settings) — initial load + realtime sync.
  // Without this, a terminal whose localStorage was ever cleared (browser reset,
  // profile wipe, new device) silently falls back to DEFAULT_BIZ_CONFIG — no
  // printer names, drawerEnabled false — even though Settings already saved a
  // valid config to Supabase. SettingsPage writes to this table; until now
  // nothing read it back (unlike staff/held_orders/transactions below).
  const bizFetched = useRef(false)
  useEffect(() => {
    if (bizFetched.current) return
    bizFetched.current = true

    // Named (not an anonymous IIFE) so the exact same fetch can be re-run on
    // reconnect below — behavior and body are unchanged from before.
    const fetchBizConfig = async () => {
      try {
        const { data } = await supabase.from('business_config').select('data').eq('id', 'main').maybeSingle()
        if (data?.data) rawDispatch({ type: 'SET_BIZ', biz: data.data as BusinessConfig })
      } catch {}
    }
    fetchBizConfig()

    // Reconnect backfill — same rationale as held_orders/order_tickets above.
    let wasDown = false
    const ch = supabase
      .channel('biz-config-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_config' }, ({ new: row }) => {
        const biz = (row as { data?: BusinessConfig } | null)?.data
        if (biz) rawDispatch({ type: 'SET_BIZ', biz })
      })
      .subscribe(status => {
        recordChannelStatus('biz-config', status)
        if (status === 'SUBSCRIBED' && wasDown) { wasDown = false; fetchBizConfig() }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') wasDown = true
      })
    return () => { supabase.removeChannel(ch) }
  }, [])

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

    // Named (not an anonymous IIFE) so the exact same fetch can be re-run on
    // reconnect below — behavior and body are unchanged from before.
    const fetchHeldOrders = async () => {
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
    }
    fetchHeldOrders()

    // Reconnect backfill — a channel that drops and later resubscribes has, by
    // definition, missed any postgres_changes events fired during the gap;
    // nothing else here catches up on that (confirmed root cause of a real
    // incident: a held order created on one terminal never appeared on
    // another). Re-running the same fetch used at mount is the smallest way
    // to close that gap. `wasDown` lives in this closure (the effect only
    // ever runs once, per the ref guard above) so it persists across
    // however many status callbacks fire without needing a separate ref.
    let wasDown = false
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
      .subscribe(status => {
        recordChannelStatus('held-orders', status)
        if (status === 'SUBSCRIBED' && wasDown) { wasDown = false; fetchHeldOrders() }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') wasDown = true
      })

    return () => { supabase.removeChannel(ch) }
  }, [])

  // Active business shift (Close Shift / EOD boundary) — Supabase is the sole
  // authoritative source, identical on every device. Fixes the incident where a
  // remote device's own stale/absent localStorage shift-start silently produced
  // a wildly wrong Close Shift total (~J$600,000 vs an actual ~J$6,000) — see
  // CloseShiftWizard.tsx. Initial load + realtime keeps every device in sync,
  // including immediately reflecting a close performed on another device.
  const shiftFetched = useRef(false)
  useEffect(() => {
    if (shiftFetched.current) return
    shiftFetched.current = true

    // Named (not an anonymous IIFE) so the exact same fetch can be re-run on
    // reconnect below — behavior and body are unchanged from before. The live
    // event handler's open/closed branching further down is untouched; this
    // only re-runs the mount-time read of "what's the current open shift."
    const fetchBusinessShift = async () => {
      try {
        const { data } = await supabase.from('business_shifts').select('*').eq('status', 'open').limit(1).maybeSingle()
        rawDispatch({ type: 'SET_CURRENT_SHIFT', shift: data ? rowToShift(data) : null })
      } catch {}
    }
    fetchBusinessShift()

    // Reconnect backfill — same rationale as held_orders/order_tickets above.
    let wasDown = false
    const ch = supabase
      .channel('business-shift-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_shifts' }, ({ new: row }) => {
        const r = row as Record<string, unknown> | null
        if (!r || Object.keys(r).length === 0) return // DELETE payloads (unused here) have empty `new`
        if (r.status === 'open') {
          rawDispatch({ type: 'SET_CURRENT_SHIFT', shift: rowToShift(r) })
        } else if (stateRef.current.currentShift?.id === r.id) {
          // This device's active shift was closed — from this device or another.
          rawDispatch({ type: 'SET_CURRENT_SHIFT', shift: null })
        }
      })
      .subscribe(status => {
        recordChannelStatus('business-shift', status)
        if (status === 'SUBSCRIBED' && wasDown) { wasDown = false; fetchBusinessShift() }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') wasDown = true
      })

    return () => { supabase.removeChannel(ch) }
  }, [])

  // Kitchen Display / order tickets — Supabase is the sole source of truth (no
  // localStorage), initial load + realtime subscription so every terminal (order
  // entry, Kitchen Display, etc.) sees the same tickets instantly.
  const ticketsFetched = useRef(false)
  useEffect(() => {
    if (ticketsFetched.current) return
    ticketsFetched.current = true

    // Named (not an anonymous IIFE) so the exact same fetch can be re-run on
    // reconnect below — behavior and body are unchanged from before.
    const fetchOrderTickets = async () => {
      try {
        const { data, error } = await supabase.from('order_tickets').select('data').order('updated_at', { ascending: false }).limit(200)
        if (error) throw error
        const tickets = ((data ?? []) as { data: OrderTicket }[]).map(r => r.data)
          .filter(t => t?.id && t?.timeline && Array.isArray(t?.items))
        rawDispatch({ type: 'SYNC_ORDER_TICKETS', tickets })
      } catch {}
    }
    fetchOrderTickets()

    // Reconnect backfill — same rationale as held_orders above: a dropped
    // channel misses whatever changed during the gap, and nothing else here
    // catches up on it. Re-running the mount fetch is the smallest fix.
    let wasDown = false
    const ch = supabase
      .channel('order-tickets-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_tickets' }, ({ new: row }) => {
        const id = (row as { id: string }).id
        if (pendingWrites.current.has(id)) return
        rawDispatch({ type: 'UPSERT_ORDER_TICKET', ticket: (row as { data: OrderTicket }).data })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_tickets' }, ({ new: row }) => {
        const id = (row as { id: string }).id
        if (pendingWrites.current.has(id)) return
        rawDispatch({ type: 'UPSERT_ORDER_TICKET', ticket: (row as { data: OrderTicket }).data })
      })
      .subscribe(status => {
        recordChannelStatus('order-tickets', status)
        if (status === 'SUBSCRIBED' && wasDown) { wasDown = false; fetchOrderTickets() }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') wasDown = true
      })

    return () => { supabase.removeChannel(ch) }
  }, [])

  // Audit trail sync (void/refund history, manager actions) — initial load merges
  // Supabase with any local-only entries (uploading those), then realtime INSERT
  // keeps every terminal's history current, not just the device that acted.
  const logsFetched = useRef(false)
  useEffect(() => {
    if (logsFetched.current) return
    logsFetched.current = true

    // Each named (not an anonymous IIFE) so all three can be re-run together
    // on reconnect below — behavior and bodies are unchanged from before.
    const fetchVoidLogs = async () => {
      try {
        const { data } = await supabase.from('void_logs').select('data').order('created_at', { ascending: false }).limit(500)
        const supaEntries = ((data ?? []) as { data: VoidLog }[]).map(r => r.data)
        const supaIds = new Set(supaEntries.map(e => e.id))
        const local = storage.get<VoidLog[]>('void_logs') ?? []
        const localOnly = local.filter(e => !supaIds.has(e.id))
        if (localOnly.length > 0) {
          try { await supabase.from('void_logs').insert(localOnly.map(e => ({ id: e.id, data: e }))) } catch {}
        }
        rawDispatch({ type: 'SYNC_VOID_LOGS', entries: [...supaEntries, ...localOnly].slice(0, 500) })
      } catch {}
    }
    const fetchRefundLogs = async () => {
      try {
        const { data } = await supabase.from('refund_logs').select('data').order('created_at', { ascending: false }).limit(500)
        const supaEntries = ((data ?? []) as { data: RefundLog }[]).map(r => r.data)
        const supaIds = new Set(supaEntries.map(e => e.id))
        const local = storage.get<RefundLog[]>('refund_logs') ?? []
        const localOnly = local.filter(e => !supaIds.has(e.id))
        if (localOnly.length > 0) {
          try { await supabase.from('refund_logs').insert(localOnly.map(e => ({ id: e.id, data: e }))) } catch {}
        }
        rawDispatch({ type: 'SYNC_REFUND_LOGS', entries: [...supaEntries, ...localOnly].slice(0, 500) })
      } catch {}
    }
    const fetchAuditTrail = async () => {
      try {
        const { data } = await supabase.from('audit_trail').select('data').order('created_at', { ascending: false }).limit(600)
        const supaEntries = ((data ?? []) as { data: AuditEntry }[]).map(r => r.data)
        const supaIds = new Set(supaEntries.map(e => e.id))
        const local = storage.get<AuditEntry[]>('audit') ?? []
        const localOnly = local.filter(e => !supaIds.has(e.id))
        if (localOnly.length > 0) {
          try { await supabase.from('audit_trail').insert(localOnly.map(e => ({ id: e.id, data: e }))) } catch {}
        }
        rawDispatch({ type: 'SYNC_AUDIT', entries: [...supaEntries, ...localOnly].slice(0, 600) })
      } catch {}
    }
    fetchVoidLogs()
    fetchRefundLogs()
    fetchAuditTrail()

    // Reconnect backfill — same rationale as held_orders/order_tickets above.
    // One shared channel covers three tables, so a reconnect re-runs all three.
    let wasDown = false
    const ch = supabase
      .channel('audit-trail-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'void_logs' }, ({ new: row }) => {
        const entry = (row as { data: VoidLog }).data
        if (pendingWrites.current.has(entry.id)) return
        rawDispatch({ type: 'SYNC_VOID_LOGS', entries: [entry, ...stateRef.current.voidLogs.filter(e => e.id !== entry.id)].slice(0, 500) })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'refund_logs' }, ({ new: row }) => {
        const entry = (row as { data: RefundLog }).data
        if (pendingWrites.current.has(entry.id)) return
        rawDispatch({ type: 'SYNC_REFUND_LOGS', entries: [entry, ...stateRef.current.refundLogs.filter(e => e.id !== entry.id)].slice(0, 500) })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_trail' }, ({ new: row }) => {
        const entry = (row as { data: AuditEntry }).data
        if (pendingWrites.current.has(entry.id)) return
        rawDispatch({ type: 'SYNC_AUDIT', entries: [entry, ...stateRef.current.audit.filter(e => e.id !== entry.id)].slice(0, 600) })
      })
      .subscribe(status => {
        recordChannelStatus('audit-trail', status)
        if (status === 'SUBSCRIBED' && wasDown) { wasDown = false; fetchVoidLogs(); fetchRefundLogs(); fetchAuditTrail() }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') wasDown = true
      })

    return () => { supabase.removeChannel(ch) }
  }, [])

  // Named (not an anonymous IIFE) so the subscribe effect below can re-run the
  // exact same fetch on reconnect — behavior and body are unchanged from
  // before. Declared here, outside both effects, specifically so the
  // existing fetch/subscribe effect split (kept as-is, not merged) can share
  // one function reference.
  const fetchTransactions = async () => {
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
  }

  // Startup: load from Supabase + migrate any localStorage transactions not yet there
  const txFetched = useRef(false)
  useEffect(() => {
    if (txFetched.current) return
    txFetched.current = true
    fetchTransactions()
  }, [])

  // Transactions — realtime subscription so every terminal's revenue figures
  // (My Shift, Active Shift, Close Shift, EOD, Transactions, Reports, Targets —
  // see lib/utils/revenue.ts) update the instant a sale/void/refund happens
  // anywhere, not just on this device, without requiring a page refresh. Same
  // INSERT/UPDATE + pendingWrites-echo-dedup pattern as order_tickets above.
  useEffect(() => {
    // Reconnect backfill — same rationale as held_orders/order_tickets above.
    let wasDown = false
    const ch = supabase
      .channel('transactions-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, ({ new: row }) => {
        const id = String((row as { id: number }).id)
        if (pendingWrites.current.has(id)) return
        rawDispatch({ type: 'UPSERT_TRANSACTION', tx: (row as { data: Transaction }).data })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions' }, ({ new: row }) => {
        const id = String((row as { id: number }).id)
        if (pendingWrites.current.has(id)) return
        rawDispatch({ type: 'UPSERT_TRANSACTION', tx: (row as { data: Transaction }).data })
      })
      .subscribe(status => {
        recordChannelStatus('transactions', status)
        if (status === 'SUBSCRIBED' && wasDown) { wasDown = false; fetchTransactions() }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') wasDown = true
      })

    return () => { supabase.removeChannel(ch) }
  }, [])

  // Print-failure notifications — a print job that silently fails during the
  // payment/checkout hot path (silentOnly=true in ticketPrinter.ts's smartPrint) never
  // opens a browser dialog, so without this staff would have zero signal that a kitchen
  // ticket, bar ticket, or receipt never printed. Listens for the 'print-job-failed'
  // event smartPrint dispatches in exactly that case, surfaces a warning toast with a
  // one-click Reprint action, and logs it to the Audit Log. Purely additive — never
  // touches, delays, or blocks payment/checkout/kitchen submission itself.
  useEffect(() => {
    function handlePrintJobFailed(e: Event) {
      const detail = (e as CustomEvent).detail as {
        title: string; printerName?: string; width: 58 | 80; buzz?: boolean; html: string
      }
      const label =
        /kitchen/i.test(detail.title)    ? 'Kitchen ticket'
        : /bar/i.test(detail.title)      ? 'Bar ticket'
        : /work order/i.test(detail.title) ? 'Work order'
        : /void/i.test(detail.title)     ? 'Void ticket'
        : /receipt/i.test(detail.title)  ? 'Receipt'
        : detail.title
      const toastId = Date.now()
      rawDispatch({
        type: 'ADD_TOAST', id: toastId, toastType: 'warn', msg: `${label} failed to print.`,
        action: {
          label: 'Reprint',
          onClick: () => {
            import('@/lib/utils/ticketPrinter').then(({ smartPrint }) =>
              smartPrint(detail.html, detail.title, detail.printerName, detail.width, false, detail.buzz)
            )
          },
        },
      })
      // Longer than the default 3s toast timeout — this is a warning staff need time to notice, not a quick confirmation.
      setTimeout(() => rawDispatch({ type: 'REMOVE_TOAST', id: toastId }), 15000)
      rawDispatch({
        type: 'ADD_AUDIT',
        entry: {
          id: crypto.randomUUID(), ts: new Date().toLocaleString(),
          user: stateRef.current.currentUser?.name ?? 'System',
          userId: stateRef.current.currentUser?.id ?? null,
          action: 'PRINT_FAILED',
          detail: `${label} failed to print — printer "${detail.printerName ?? 'not configured'}"`,
          type: 'warn',
          mod: stateRef.current.activeModule,
        },
      })
    }
    window.addEventListener('print-job-failed', handlePrintJobFailed)
    return () => window.removeEventListener('print-job-failed', handlePrintJobFailed)
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

