'use client'

import React, { createContex t, useContext, useReducer, useEffect, useCall back, useRef } from 'react'
import type {
  U ser, UserRole, ModuleKey, Transaction, Shift,  AuditEntry,
  BusinessConfig, FleetAccount,  POSState, LoyaltyMember, PromoCode,
  CartIte m, OrderType, HeldOrder, OrderTicket, VoidLog , VoidReason, RefundLog,
  MenuItem, Addon,
  NoSaleLog,
}  from '@/types'

const STAFF_API = '/api/staf f'

interface DbStaffRow {
  id: string
  nam e: string
  ini: string
  role: string
  pin_ hash: string
  color: string
  allowed_module s: string[] | string | null | undefined
  act ive: boolean
  staff_id: string | null
}

fun ction dbStaffToUser(row: DbStaffRow): User {
   const rawMods = row.allowed_modules
  let a llowedModules: ModuleKey[]
  if (Array.isArra y(rawMods) && rawMods.length > 0) {
    allow edModules = rawMods as ModuleKey[]
  } else i f (typeof rawMods === 'string' && rawMods.len gth > 0) {
    // Handle PostgreSQL literal " {restaurant,bar}" or JSON string "["restauran t"]"
    try {
      const parsed = JSON.pars e(rawMods)
      allowedModules = Array.isArr ay(parsed) && parsed.length > 0 ? parsed : [' restaurant']
    } catch {
      const stripp ed = rawMods.replace(/^\{|\}$/g, '').split(', ').map(s => s.trim()).filter(Boolean)
      a llowedModules = stripped.length > 0 ? (stripp ed as ModuleKey[]) : ['restaurant']
    }
  }  else {
    allowedModules = ['restaurant']
   }
  return {
    id: row.id,
    name: row.n ame,
    ini: row.ini,
    pin_hash: row.pin_ hash,
    role: (['admin', 'manager', 'staff' ] as string[]).includes(row.role) ? row.role  as UserRole : 'staff',
    color: row.color,
     allowedModules,
    active: row.active,
     staffId: row.staff_id ?? undefined,
  }
}
 import { storage } from '@/lib/utils/storage' 
import {
  SEED_USERS, MODULE_DATA, DEFAULT_ BIZ_CONFIG,
  SEED_TRANSACTIONS, SEED_FLEET,  SEED_PROMOS, SEED_VERSION,
} from '@/lib/data /seed'
import { supabase } from '@/lib/supaba se'

// â”€â”€ State shape â”€ â”€â”€â”€â”€â”€â” €â”€â”€â”€â”€â”€â ”€â”€â”€â”€â”€â”� �â”€â”€â”€â”€â”€â� �€â”€â”€â”€â”€â”€� �”€â”€â”€â”€â”€â”� ��â”€â”€â”€â”€â”€â� ��€â”€â”€â”€â”€â”€ â”€
interface AppState {
  // Auth
  cur rentUser: User | null
  currentShift: Shift |  null
  users: User[]
  // Module
  activeMod ule: ModuleKey
  activePage: string
  // POS
   posState: Record<ModuleKey, POSState>
  //  Global Cart
  cart: CartItem[]
  cartPayMetho d: string
  cartOrderType: OrderType
  heldOr ders: HeldOrder[]
  orderTickets: OrderTicket []
  // Data
  transactions: Transaction[]
   shifts: Shift[]
  audit: AuditEntry[]
  biz:  BusinessConfig
  fleet: FleetAccount[]
  loya lty: LoyaltyMember[]
  promos: PromoCode[]
   voidLogs: VoidLog[]
  refundLogs: RefundLog[] 
  noSaleLogs: NoSaleLog[]
  // Menu — mutable, localStorage-backed,  same data the POS reads
  menuData: Record<Mo duleKey, { items: MenuItem[]; categories: str ing[]; addons: Addon[] }>
  // UI
  toasts: {  id: number; msg: string; type: string }[]
   syncQueue: unknown[]
  isOnline: boolean
  ui Mode: 'pos' | 'admin'
  showEOD: boolean
}

t ype Action =
  | { type: 'LOGIN'; user: User;  shift: Shift }
  | { type: 'LOGOUT' }
  | {  type: 'SET_MODULE'; mod: ModuleKey }
  | { ty pe: 'SET_PAGE'; page: string }
  | { type: 'S ET_POS_STATE'; mod: ModuleKey; patch: Partial <POSState> }
  | { type: 'ADD_TRANSACTION'; t x: Transaction }
  | { type: 'ADD_TOAST'; msg : string; toastType: string; id: number }
  |  { type: 'REMOVE_TOAST'; id: number }
  | { t ype: 'SET_USERS'; users: User[] }
  | { type:  'SET_BIZ'; biz: BusinessConfig }
  | { type:  'ADD_AUDIT'; entry: AuditEntry }
  | { type:  'VOID_TRANSACTION'; id: number; reason: stri ng }
  | { type: 'CLOCK_OUT' }
  | { type: 'S ET_ONLINE'; online: boolean }
  | { type: 'AD D_TO_CART'; item: CartItem }
  | { type: 'REM OVE_FROM_CART'; id: string }
  | { type: 'UPD ATE_CART_QTY'; id: string; qty: number }
  |  { type: 'UPDATE_CART_NOTE'; id: string; note:  string }
  | { type: 'CLEAR_CART' }
  | { ty pe: 'SET_CART_PAY'; method: string }
  | { ty pe: 'SET_CART_ORDER_TYPE'; orderType: OrderTy pe }
  | { type: 'SET_PROMOS'; promos: PromoC ode[] }
  | { type: 'HOLD_ORDER'; order: Held Order }
  | { type: 'REMOVE_HELD_ORDER'; id:  string }
  | { type: 'UPDATE_TRANSACTION'; tx : Transaction }
  | { type: 'ADD_ORDER_TICKET '; ticket: OrderTicket }
  | { type: 'UPDATE_ ORDER_TICKET'; id: string; patch: Partial<Ord erTicket> }
  | { type: 'VOID_CART_ITEM'; id:  string; reason: VoidReason; reasonText?: str ing; by: string; at: string }
  | { type: 'VO ID_TICKET_ITEM'; ticketId: string; itemId: st ring; reason: VoidReason; reasonText?: string ; by: string; at: string }
  | { type: 'ADD_V OID_LOG'; entry: VoidLog }
  | { type: 'REFUN D_TRANSACTION'; id: number; reason: string; r efundType: 'full' | 'partial'; amount: number ; by: string; at: string }
  | { type: 'ADD_R EFUND_LOG'; entry: RefundLog }
  | { type: 'S ET_UI_MODE'; mode: 'pos' | 'admin' }
  | { ty pe: 'SHOW_EOD' }
  | { type: 'HIDE_EOD' }
  |  { type: 'CLOSE_SHIFT_FORMAL'; closedBy: stri ng; closedAt: string; openingFloat: number; c ountedCash: number; variance: number; varianc eNote: string; wasOverridden?: boolean }
  |  { type: 'ADD_MENU_ITEM';       mod: ModuleKey ; item: MenuItem }
  | { type: 'UPDATE_MENU_I TEM';    mod: ModuleKey; item: MenuItem }
  |  { type: 'DELETE_MENU_ITEM';    mod: ModuleKe y; id: string }
  | { type: 'SET_MENU_CATEGOR IES'; mod: ModuleKey; categories: string[] }
   | { type: 'RENAME_CATEGORY';     mod: Modul eKey; oldName: string; newName: string }
  |  { type: 'ADD_MENU_ADDON';      mod: ModuleKey ; addon: Addon }
  | { type: 'UPDATE_MENU_ADD ON';   mod: ModuleKey; addon: Addon }
  | { t ype: 'DELETE_MENU_ADDON';   mod: ModuleKey; i d: string }
  | { type: 'SYNC_HELD_ORDERS';     orders: HeldOrder[] }
  | { type: 'UPSERT_H ELD_ORDER';   order:  HeldOrder  }
  | { type: 'ADD_NO_SALE_LOG'; entry: NoSaleLog }

const def aultPOS = (): POSState => ({
  selItem: null,  selAddons: [], selTable: null, selTab: null, 
  payMethod: 'cash', member: null, plate: '' , qty: 1, note: '',
  cat: 'All', orderType:  'dine-in',
  customerName: '', customerPhone:  '', customerAddress: '',
  pickupTime: '', d eliveryFee: 0, driverId: '',
  taxOverride: n ull, serviceCharge: 0, gratuityPct: 0, seatNo te: '',
})

function initState(): AppState {
   return {
    currentUser: storage.get<User> ('current_user') ?? null,
    currentShift: s torage.get<Shift>('current_shift') ?? null,
     users: storage.get<User[]>('users') ?? SEE D_USERS,
    activeModule: 'restaurant',
     activePage: 'pos',
    posState: {
      rest aurant: { ...defaultPOS() },
      bar:         { ...defaultPOS(), orderType: 'dine-in' },
       carwash:    { ...defaultPOS(), orderTyp e: 'walk-in' as POSState['orderType'] },
     },
    cart: [],
    cartPayMethod: 'cash',
     cartOrderType: 'dine-in',
    menuData: (( ) => {
      const stored = storage.get<Recor d<ModuleKey, { items: MenuItem[]; categories:  string[]; addons: Addon[] }>>('menu_data')
       if (stored && storage.get<string>('seed_ version') === SEED_VERSION) return stored
       const fresh = {
        restaurant: { item s: MODULE_DATA.restaurant.items as MenuItem[] , categories: MODULE_DATA.restaurant.categori es, addons: MODULE_DATA.restaurant.addons as  Addon[] },
        bar:        { items: MODUL E_DATA.bar.items as MenuItem[],        catego ries: MODULE_DATA.bar.categories,        addo ns: MODULE_DATA.bar.addons as Addon[]         },
        carwash:    { items: MODULE_DATA.c arwash.items as MenuItem[],    categories: MO DULE_DATA.carwash.categories,    addons: MODU LE_DATA.carwash.addons as Addon[]    },
       }
      storage.set('menu_data', fresh)
       storage.set('seed_version', SEED_VERSION)
       return fresh
    })(),
    heldOrders:    (() => { const v = storage.get('held_orders' );   return Array.isArray(v) ? (v as HeldOrde r[]).filter(h => h?.id && Array.isArray(h?.ca rt)) : [] })(),
    orderTickets: (() => { co nst v = storage.get('order_tickets'); return  Array.isArray(v) ? (v as OrderTicket[]).filte r(t => t?.id && t?.timeline && Array.isArray( t?.items)) : [] })(),
    transactions: stora ge.get<Transaction[]>('tx') ?? SEED_TRANSACTI ONS,
    shifts: storage.get<Shift[]>('shifts ') ?? [],
    audit: storage.get<AuditEntry[] >('audit') ?? [],
    biz: storage.get<Busine ssConfig>('biz_config') ?? DEFAULT_BIZ_CONFIG ,
    fleet: storage.get<FleetAccount[]>('fle et') ?? SEED_FLEET,
    loyalty: storage.get< LoyaltyMember[]>('loyalty') ?? [],
    promos : storage.get<PromoCode[]>('promos') ?? SEED_ PROMOS,
    voidLogs: (() => { const v = stor age.get('void_logs'); return Array.isArray(v)  ? (v as VoidLog[]) : [] })(),
    refundLogs : (() => { const v = storage.get('refund_logs '); return Array.isArray(v) ? (v as RefundLog []) : [] })(),
    noSaleLogs: (() => { const v = storage.get('no_sale_logs'); return Array.isArray(v) ? (v as NoSaleLog[]) : [] })(),
    toasts: [],
    syncQueue:  storage.get<unknown[]>('sync_queue') ?? [],
     isOnline: true,
    uiMode: 'pos',
    sh owEOD: false,
  }
}

function reducer(state:  AppState, action: Action): AppState {
  switc h (action.type) {
    case 'LOGIN': {
      s torage.set('current_user', action.user)
       if (state.currentShift !== null) {
        r eturn { ...state, currentUser: action.user, a ctivePage: 'pos' }
      }
      storage.set( 'current_shift', action.shift)
      const sh ifts = [action.shift, ...state.shifts]
       storage.set('shifts', shifts)
      return {  ...state, currentUser: action.user, currentSh ift: action.shift, shifts, activePage: 'pos'  }
    }
    case 'LOGOUT': {
      const shif ts = state.shifts.map(s =>
        s.id === s tate.currentShift?.id ? { ...s, end: new Date ().toISOString() } : s
      )
      storage. set('shifts', shifts)
      storage.set('curr ent_user', null)
      storage.set('current_s hift', null)
      return { ...state, current User: null, currentShift: null, shifts, cart:  [], cartPayMethod: 'cash', cartOrderType: 'd ine-in', uiMode: 'pos' }
    }
    case 'CLOC K_OUT': {
      if (!state.currentShift) retu rn state
      const shifts = state.shifts.ma p(s =>
        s.id === state.currentShift!.i d ? { ...s, end: new Date().toISOString() } :  s
      )
      storage.set('shifts', shifts )
      return { ...state, currentShift: null , shifts }
    }
    case 'SET_MODULE':
       return { ...state, activeModule: action.mod,  activePage: 'pos' }
    case 'SET_PAGE':
       return { ...state, activePage: action.page  }
    case 'SET_POS_STATE':
      return {
         ...state,
        posState: {
           ...state.posState,
          [action.mod]:  { ...state.posState[action.mod], ...action.pa tch },
        },
      }
    case 'ADD_TRANS ACTION': {
      const transactions = [action .tx, ...state.transactions].slice(0, 50000)
       storage.set('tx', transactions)
      co nst currentShift = state.currentShift
         ? { ...state.currentShift, txCount: state.cu rrentShift.txCount + 1, revenue: state.curren tShift.revenue + action.tx.total }
        :  null
      // Auto-deduct inventory on sale
       if (action.tx.items && action.tx.items.l ength > 0) {
        const inv = storage.get< Array<{ id: string; name: string; quantity: n umber; lowStockThreshold: number }>>('invento ry') ?? []
        if (inv.length > 0) {
           let changed = false
          const upd atedInv = inv.map(invItem => {
            co nst sold = action.tx.items!
              .fi lter(ci => !ci.voided && ci.name.toLowerCase( ) === invItem.name.toLowerCase())
               .reduce((s, ci) => s + ci.qty, 0)
             if (sold > 0) { changed = true; return {  ...invItem, quantity: Math.max(0, invItem.qua ntity - sold) } }
            return invItem
           })
          if (changed) storage.s et('inventory', updatedInv)
        }
      } 
      return { ...state, transactions, curre ntShift }
    }
    case 'VOID_TRANSACTION':  {
      const transactions = state.transactio ns.map(t =>
        t.id === action.id ? { .. .t, voided: true, voidReason: action.reason }  : t
      )
      storage.set('tx', transact ions)
      return { ...state, transactions } 
    }
    case 'ADD_TOAST': {
      return {  ...state, toasts: [...state.toasts, { id: ac tion.id, msg: action.msg, type: action.toastT ype }] }
    }
    case 'REMOVE_TOAST':
       return { ...state, toasts: state.toasts.filt er(t => t.id !== action.id) }
    case 'SET_U SERS': {
      storage.set('users', action.us ers)
      return { ...state, users: action.u sers }
    }
    case 'SET_BIZ': {
      stor age.set('biz_config', action.biz)
      retur n { ...state, biz: action.biz }
    }
    cas e 'ADD_AUDIT': {
      const audit = [action. entry, ...state.audit].slice(0, 600)
      st orage.set('audit', audit)
      return { ...s tate, audit }
    }
    case 'SET_ONLINE':
       return { ...state, isOnline: action.onlin e }
    case 'ADD_TO_CART': {
      const inc oming = action.item
      // Deduplicate: sam e itemId + same addon ids + same plate â†� �� increment qty
      const existingIdx = st ate.cart.findIndex(ci =>
        ci.itemId == = incoming.itemId &&
        ci.plate === inc oming.plate &&
        ci.addons.length === i ncoming.addons.length &&
        ci.addons.ev ery(a => incoming.addons.some(b => b.id === a .id))
      )
      if (existingIdx !== -1) { 
        const cart = state.cart.map((ci, idx ) =>
          idx === existingIdx ? { ...ci,  qty: ci.qty + incoming.qty } : ci
        )
         return { ...state, cart }
      }
       return { ...state, cart: [...state.cart, i ncoming] }
    }
    case 'REMOVE_FROM_CART': 
      return { ...state, cart: state.cart.fi lter(ci => ci.id !== action.id) }
    case 'U PDATE_CART_QTY': {
      if (action.qty < 1)  {
        return { ...state, cart: state.cart .filter(ci => ci.id !== action.id) }
      }
       return {
        ...state,
        cart : state.cart.map(ci => ci.id === action.id ?  { ...ci, qty: action.qty } : ci),
      }
     }
    case 'UPDATE_CART_NOTE':
      return  {
        ...state,
        cart: state.cart. map(ci => ci.id === action.id ? { ...ci, note : action.note } : ci),
      }
    case 'CLEA R_CART':
      return { ...state, cart: [] }
     case 'SET_CART_PAY':
      return { ...st ate, cartPayMethod: action.method }
    case  'SET_CART_ORDER_TYPE':
      return { ...stat e, cartOrderType: action.orderType }
    case  'SET_PROMOS':
      return { ...state, promo s: action.promos }
    case 'HOLD_ORDER': {
       const heldOrders = [action.order, ...sta te.heldOrders]
      storage.set('held_orders ', heldOrders)
      return { ...state, heldO rders }
    }
    case 'REMOVE_HELD_ORDER': { 
      const heldOrders = state.heldOrders.fi lter(h => h.id !== action.id)
      storage.s et('held_orders', heldOrders)
      return {  ...state, heldOrders }
    }
    case 'SYNC_H ELD_ORDERS': {
      storage.set('held_orders ', action.orders)
      return { ...state, he ldOrders: action.orders }
    }
    case 'UPS ERT_HELD_ORDER': {
      const idx = state.he ldOrders.findIndex(h => h.id === action.order .id)
      const heldOrders = idx >= 0
         ? state.heldOrders.map((h, i) => i === idx  ? action.order : h)
        : [action.order,  ...state.heldOrders]
      storage.set('held_ orders', heldOrders)
      return { ...state,  heldOrders }
    }
    case 'UPDATE_TRANSACT ION': {
      const transactions = state.tran sactions.map(t => t.id === action.tx.id ? act ion.tx : t)
      storage.set('tx', transacti ons)
      return { ...state, transactions }
     }
    case 'ADD_ORDER_TICKET': {
      co nst orderTickets = [action.ticket, ...state.o rderTickets].slice(0, 200)
      storage.set( 'order_tickets', orderTickets)
      return {  ...state, orderTickets }
    }
    case 'UPD ATE_ORDER_TICKET': {
      const orderTickets  = state.orderTickets.map(t =>
        t.id = == action.id ? { ...t, ...action.patch } : t
       )
      storage.set('order_tickets', or derTickets)
      return { ...state, orderTic kets }
    }
    case 'VOID_CART_ITEM': {
       const cart = state.cart.map(ci =>
         ci.id === action.id
          ? { ...ci, void ed: true, voidReason: action.reason, voidReas onText: action.reasonText, voidedBy: action.b y, voidedAt: action.at }
          : ci
       )
      return { ...state, cart }
    }
     case 'VOID_TICKET_ITEM': {
      const orderT ickets = state.orderTickets.map(t =>
         t.id === action.ticketId
          ? { ...t,  items: t.items.map(ci =>
              ci.id  === action.itemId
                ? { ...ci,  voided: true, voidReason: action.reason, void ReasonText: action.reasonText, voidedBy: acti on.by, voidedAt: action.at }
                 : ci
            )}
          : t
      )
       storage.set('order_tickets', orderTickets) 
      return { ...state, orderTickets }
     }
    case 'ADD_VOID_LOG': {
      const void Logs = [action.entry, ...state.voidLogs].slic e(0, 500)
      storage.set('void_logs', void Logs)
      return { ...state, voidLogs }
     }
    case 'REFUND_TRANSACTION': {
      con st transactions = state.transactions.map(t => 
        t.id === action.id
          ? { ... t, refunded: true, refundReason: action.reaso n, refundedBy: action.by, refundedAt: action. at, refundAmount: action.amount }
          :  t
      )
      storage.set('tx', transactio ns)
      return { ...state, transactions }
     }
        case 'ADD_NO_SALE_LOG': {
      const noSaleLogs = [action.entry, ...state.noSaleLogs].slice(0, 1000)
      storage.set('no_sale_logs', noSaleLogs)
      return { ...state, noSaleLogs }
    }
    case 'ADD_REFUND_LOG': {
      const  refundLogs = [action.entry, ...state.refundL ogs].slice(0, 500)
      storage.set('refund_ logs', refundLogs)
      return { ...state, r efundLogs }
    }
    case 'SET_UI_MODE':
       return { ...state, uiMode: action.mode }
     case 'SHOW_EOD':
      return { ...state,  showEOD: true }
    case 'HIDE_EOD':
      re turn { ...state, showEOD: false }
    case 'C LOSE_SHIFT_FORMAL': {
      if (!state.curren tShift) return state
      const shifts = sta te.shifts.map(s =>
        s.id === state.cur rentShift!.id
          ? { ...s, end: action .closedAt, closedBy: action.closedBy, closedA t: action.closedAt,
              openingFloa t: action.openingFloat, countedCash: action.c ountedCash,
              cashVariance: actio n.variance, varianceNote: action.varianceNote ,
              wasOverridden: action.wasOver ridden ?? false, isFormalClose: true }
           : s
      )
      storage.set('shifts', s hifts)
      // Held orders survive shift bou ndaries - next shift inherits open tables
       return { ...state, currentShift: null, shi fts }
    }
    case 'ADD_MENU_ITEM': {
       const menuData = { ...state.menuData, [actio n.mod]: { ...state.menuData[action.mod], item s: [...state.menuData[action.mod].items, acti on.item] } }
      storage.set('menu_data', m enuData)
      return { ...state, menuData }
     }
    case 'UPDATE_MENU_ITEM': {
      co nst menuData = { ...state.menuData, [action.m od]: { ...state.menuData[action.mod], items:  state.menuData[action.mod].items.map(i => i.i d === action.item.id ? action.item : i) } }
       storage.set('menu_data', menuData)
       return { ...state, menuData }
    }
    case  'DELETE_MENU_ITEM': {
      const menuData =  { ...state.menuData, [action.mod]: { ...stat e.menuData[action.mod], items: state.menuData [action.mod].items.filter(i => i.id !== actio n.id) } }
      storage.set('menu_data', menu Data)
      return { ...state, menuData }
     }
    case 'SET_MENU_CATEGORIES': {
      co nst menuData = { ...state.menuData, [action.m od]: { ...state.menuData[action.mod], categor ies: action.categories } }
      storage.set( 'menu_data', menuData)
      return { ...stat e, menuData }
    }
    case 'RENAME_CATEGORY ': {
      const cur = state.menuData[action. mod]
      const menuData = { ...state.menuDa ta, [action.mod]: { ...cur,
        categorie s: cur.categories.map(c => c === action.oldNa me ? action.newName : c),
        items: cur. items.map(i => i.cat === action.oldName ? { . ..i, cat: action.newName } : i),
      }}
       storage.set('menu_data', menuData)
      r eturn { ...state, menuData }
    }
    case ' ADD_MENU_ADDON': {
      const menuData = { . ..state.menuData, [action.mod]: { ...state.me nuData[action.mod], addons: [...state.menuDat a[action.mod].addons, action.addon] } }
       storage.set('menu_data', menuData)
      ret urn { ...state, menuData }
    }
    case 'UP DATE_MENU_ADDON': {
      const menuData = {  ...state.menuData, [action.mod]: { ...state.m enuData[action.mod], addons: state.menuData[a ction.mod].addons.map(a => a.id === action.ad don.id ? action.addon : a) } }
      storage. set('menu_data', menuData)
      return { ... state, menuData }
    }
    case 'DELETE_MENU _ADDON': {
      const menuData = { ...state. menuData, [action.mod]: { ...state.menuData[a ction.mod], addons: state.menuData[action.mod ].addons.filter(a => a.id !== action.id) } }
       storage.set('menu_data', menuData)
       return { ...state, menuData }
    }
    def ault:
      return state
  }
}

// ── Sup abase held-order row helpers ─────� ��──────────────� ��──────────────� ��──────────────� ��────
function heldToRow(h: HeldOrde r) {
  return {
    id: h.id, label: h.label,  cart: h.cart,
    order_type: h.orderType, m odule: h.module,
    sel_table: h.selTable ??  null,
    guest_count: h.guestCount, custome r_name: h.customerName,
    disc_pct: h.discP ct, disc_flat: h.discFlat,
    gratuity_pct:  h.gratuityPct, gratuity_override: h.gratuityO verride,
    opened_at: h.openedAt ?? null, s aved_at: h.savedAt, saved_by: h.savedBy,
  }
 }
function rowToHeld(r: Record<string, unknow n>): HeldOrder {
  return {
    id: r.id as s tring,
    label: r.label as string,
    cart : (r.cart as CartItem[]) ?? [],
    orderType : (r.order_type ?? 'dine-in') as OrderType,
     module: (r.module ?? 'restaurant') as Modu leKey,
    selTable: (r.sel_table as string |  null) ?? null,
    guestCount: Number(r.gues t_count ?? 0),
    customerName: String(r.cus tomer_name ?? ''),
    discPct: Number(r.disc _pct ?? 0),
    discFlat: Number(r.disc_flat  ?? 0),
    gratuityPct: Number(r.gratuity_pct  ?? 0),
    gratuityOverride: Boolean(r.gratu ity_override),
    openedAt: r.opened_at as s tring | undefined,
    savedAt: String(r.save d_at ?? ''),
    savedBy: String(r.saved_by ? ? ''),
  }
}

// ── Context ────� ��──────────────� ��──────────────� ��──────────────� ��──────────────� ��──────────────
 interface AppContextValue {
  state: AppState 
  dispatch: React.Dispatch<Action>
  // Help ers
  toast: (msg: string, type?: string) =>  void
  audit: (action: string, detail: string , type?: AuditEntry['type']) => void
  module Data: typeof MODULE_DATA
}

const AppContext  = createContext<AppContextValue | null>(null) 

export function AppProvider({ children }: {  children: React.ReactNode }) {
  const [stat e, rawDispatch] = useReducer(reducer, undefin ed, initState)

  // Refs for deduplicating r ealtime echoes
  const pendingWrites  = useRe f<Set<string>>(new Set())
  const pendingDele tes = useRef<Set<string>>(new Set())

  // Su pabase-aware dispatch: syncs HOLD_ORDER / REM OVE_HELD_ORDER to Supabase
  const dispatch =  useCallback((action: Action): void => {
     rawDispatch(action)
    if (action.type === ' HOLD_ORDER') {
      const oid = action.order .id
      pendingWrites.current.add(oid)
       ;(async () => {
        try { await supabas e.from('held_orders').upsert(heldToRow(action .order)) } catch {}
        setTimeout(() =>  pendingWrites.current.delete(oid), 3000)
       })()
    }
    if (action.type === 'REMOVE_ HELD_ORDER') {
      const oid = action.id
       pendingDeletes.current.add(oid)
      ;(a sync () => {
        try { await supabase.fro m('held_orders').delete().eq('id', oid) } cat ch {}
        setTimeout(() => pendingDeletes .current.delete(oid), 3000)
      })()
    }
   }, [])

  // Refresh staff from Supabase (i nitial load + realtime trigger)
  const refre shStaff = useCallback(() => {
    fetch(STAFF _API)
      .then(r => r.ok ? r.json() : null )
      .then((rows: unknown) => {
        if  (!Array.isArray(rows) || rows.length === 0)  return
        const fromSupabase = (rows as  DbStaffRow[]).map(dbStaffToUser)
        rawD ispatch({ type: 'SET_USERS', users: fromSupab ase })
        storage.set('users', fromSupab ase)
      })
      .catch(() => {})
  }, []) 

  const staffFetched = useRef(false)
  useE ffect(() => {
    if (staffFetched.current) r eturn
    staffFetched.current = true
    ref reshStaff()
  }, [refreshStaff])

  // Realti me staff sync — re-fetch whenever any staff  row changes on any device
  useEffect(() =>  {
    const ch = supabase
      .channel('sta ff-sync')
      .on('postgres_changes', { eve nt: '*', schema: 'public', table: 'staff' },  refreshStaff)
      .subscribe()
    return ( ) => { supabase.removeChannel(ch) }
  }, [ref reshStaff])

  // Online/offline detection
   useEffect(() => {
    const on  = () => rawDi spatch({ type: 'SET_ONLINE', online: true })
     const off = () => rawDispatch({ type: 'SE T_ONLINE', online: false })
    window.addEve ntListener('online',  on)
    window.addEvent Listener('offline', off)
    return () => { w indow.removeEventListener('online', on); wind ow.removeEventListener('offline', off) }
  },  [])

  // Sync held orders with Supabase –  initial load + realtime subscription
  const  heldFetched = useRef(false)
  useEffect(() = > {
    if (heldFetched.current) return
    h eldFetched.current = true

    ;(async () =>  {
      try {
        const { data } = await  supabase.from('held_orders').select('*')
         if (!data) return
        const supaOrder s = data.map(row => rowToHeld(row as Record<s tring, unknown>))
        const supaIds = new  Set(supaOrders.map(h => h.id))
        const  local = storage.get<HeldOrder[]>('held_order s') ?? []
        const localOnly = local.fil ter(h => !supaIds.has(h.id))
        // Uploa d any orders created offline
        if (loca lOnly.length > 0) {
          try { await sup abase.from('held_orders').upsert(localOnly.ma p(heldToRow)) } catch {}
        }
        ra wDispatch({ type: 'SYNC_HELD_ORDERS', orders:  [...supaOrders, ...localOnly] })
      } cat ch {}
    })()

    const ch = supabase
       .channel('held-orders')
      .on('postgres_ changes', { event: 'INSERT', schema: 'public' , table: 'held_orders' }, ({ new: row }) => { 
        if (pendingWrites.current.has((row a s { id: string }).id)) return
        rawDisp atch({ type: 'UPSERT_HELD_ORDER', order: rowT oHeld(row as Record<string, unknown>) })
       })
      .on('postgres_changes', { event: ' UPDATE', schema: 'public', table: 'held_order s' }, ({ new: row }) => {
        if (pending Writes.current.has((row as { id: string }).id )) return
        rawDispatch({ type: 'UPSERT _HELD_ORDER', order: rowToHeld(row as Record< string, unknown>) })
      })
      .on('post gres_changes', { event: 'DELETE', schema: 'pu blic', table: 'held_orders' }, ({ old: row })  => {
        if (pendingDeletes.current.has( (row as { id: string }).id)) return
        r awDispatch({ type: 'REMOVE_HELD_ORDER', id: ( row as { id: string }).id })
      })
      . subscribe()

    return () => { supabase.remo veChannel(ch) }
  }, [])

  const toast = use Callback((msg: string, type = 'info') => {
     const id = Date.now()
    rawDispatch({ typ e: 'ADD_TOAST', msg, toastType: type, id })
     setTimeout(() => rawDispatch({ type: 'REMO VE_TOAST', id }), 3000)
  }, [])

  const aud itFn = useCallback((action: string, detail: s tring, type: AuditEntry['type'] = 'info') =>  {
    rawDispatch({
      type: 'ADD_AUDIT',
       entry: {
        id: crypto.randomUUID( ), ts: new Date().toLocaleString(),
        u ser: state.currentUser?.name ?? 'System',
         userId: state.currentUser?.id ?? null,
         action, detail, type,
        mod: sta te.activeModule,
      },
    })
  }, [state. currentUser, state.activeModule])

  return ( 
    <AppContext.Provider value={{ state, dis patch, toast, audit: auditFn, moduleData: {
       restaurant: { ...MODULE_DATA.restaurant,  ...state.menuData.restaurant },
      bar:         { ...MODULE_DATA.bar,        ...state.m enuData.bar        },
      carwash:    { ... MODULE_DATA.carwash,    ...state.menuData.car wash    },
    } as typeof MODULE_DATA }}>
       {children}
    </AppContext.Provider>
  ) 
}

export function useApp() {
  const ctx =  useContext(AppContext)
  if (!ctx) throw new  Error('useApp must be used inside AppProvider ')
  return ctx
}

 