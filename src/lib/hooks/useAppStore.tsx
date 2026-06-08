'use client'

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'
import type {
  User, ModuleKey, Transaction, Shift, AuditEntry,
  BusinessConfig, FleetAccount, POSState, LoyaltyMember, PromoCode
} from '@/types'
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
  // Data
  transactions: Transaction[]
  shifts: Shift[]
  audit: AuditEntry[]
  biz: BusinessConfig
  fleet: FleetAccount[]
  loyalty: LoyaltyMember[]
  promos: PromoCode[]
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
  | { type: 'ADD_TOAST'; msg: string; toastType: string }
  | { type: 'REMOVE_TOAST'; id: number }
  | { type: 'SET_USERS'; users: User[] }
  | { type: 'SET_BIZ'; biz: BusinessConfig }
  | { type: 'ADD_AUDIT'; entry: AuditEntry }
  | { type: 'VOID_TRANSACTION'; id: number; reason: string }
  | { type: 'CLOCK_OUT' }
  | { type: 'SET_ONLINE'; online: boolean }

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
    transactions: storage.get<Transaction[]>('tx') ?? SEED_TRANSACTIONS,
    shifts: storage.get<Shift[]>('shifts') ?? [],
    audit: storage.get<AuditEntry[]>('audit') ?? [],
    biz: storage.get<BusinessConfig>('biz_config') ?? DEFAULT_BIZ_CONFIG,
    fleet: storage.get<FleetAccount[]>('fleet') ?? SEED_FLEET,
    loyalty: storage.get<LoyaltyMember[]>('loyalty') ?? [],
    promos: storage.get<PromoCode[]>('promos') ?? SEED_PROMOS,
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
      const id = Date.now()
      return { ...state, toasts: [...state.toasts, { id, msg: action.msg, type: action.toastType }] }
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

  // Seed staff IDs on first load
  useEffect(() => {
    const ids = ['01','02','03','04','05','06']
    const updated = state.users.map((u, i) => ({ ...u, staffId: u.staffId ?? ids[i] ?? String(10 + i) }))
    dispatch({ type: 'SET_USERS', users: updated })
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    dispatch({ type: 'ADD_TOAST', msg, toastType: type })
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
