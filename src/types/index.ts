// ── Users & Auth ──────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'supervisor' | 'cashier' | 'bartender' | 'attendant'

export interface User {
  id: string
  name: string
  ini: string
  pin: string
  role: UserRole
  color: string
  allowedModules: ModuleKey[]
  active: boolean
  staffId?: string
}

export interface RoleConfig {
  label: string
  color: string
  pages: string[]
}

// ── Modules ───────────────────────────────────────────────────
export type ModuleKey = 'restaurant' | 'bar' | 'carwash'

export interface MenuItem {
  id: string
  name: string
  desc: string
  price: number
  cat: string
  emoji: string
  active: boolean
  duration?: string
  gradient?: string
  accent?: string
}

export interface Addon {
  id: string
  name: string
  desc: string
  price: number
  icon: string
  active: boolean
}

export interface ModuleData {
  label: string
  icon: string
  color: string
  cobText: string
  selCls: string
  aoCls: string
  taxRate: number
  categories: string[]
  tables?: string[]
  tableStatus?: Record<string, string>
  tabs?: string[]
  items: MenuItem[]
  addons: Addon[]
  bays?: string[]
  bayStatus?: Record<string, string>
  plans?: MemberPlan[]
  members?: Member[]
  taxConfig?: TaxConfig
}

// ── Tax ───────────────────────────────────────────────────────
export interface TaxConfig {
  name: string
  rate: number
  enabled: boolean
  taxableOrderTypes: string[]
  serviceChargeRate: number
  serviceChargeEnabled: boolean
}

export type OrderType = 'dine-in' | 'takeout' | 'delivery' | 'walk-in'

export interface OrderCalc {
  sub: number
  disc: number
  memberDiscAmt: number
  manualDiscAmt: number
  taxableBase: number
  gct: number
  gctRate: number
  gctApplies: boolean
  serviceCharge: number
  scRate: number
  gratuity: number
  deliveryFee: number
  legacyTax: number
  total: number
  orderType: string
}

// ── Membership ────────────────────────────────────────────────
export interface MemberPlan {
  id: string
  name: string
  price: number
  discount: number
  color: string
  freeAddons: string[]
  unlimited: boolean
  description: string
}

export interface BillingRecord {
  date: string
  amount: number
  status: 'paid' | 'failed' | 'pending'
}

export interface MemberBilling {
  status: 'active' | 'failed' | 'cancelled' | 'expired'
  autoRenew: boolean
  monthlyFee: number
  nextBillingDate: string
  lastBillingDate: string
  lastBillingStatus: string
  failedAttempts: number
  paymentMethod: string
  billingHistory: BillingRecord[]
}

export interface Vehicle {
  id?: string
  plate: string
  make: string
  model: string
  year: number
  color: string
  type?: string
  washes?: number
}

export interface Member {
  id: string
  name: string
  email: string
  phone: string
  planId: string
  type: string
  discount: number
  vehicles: Vehicle[]
  washes: number
  joined: string
  billing: MemberBilling
}

// ── Transactions ──────────────────────────────────────────────
export interface Transaction {
  id: number
  ts: string
  mod: ModuleKey
  cashier: string
  userId: string
  customer: string
  item: string
  addons: string[]
  sub: number
  disc: number
  tax: number
  total: number
  pay: string
  orderType?: string
  gct?: number
  serviceCharge?: number
  customerEmail?: string
  voided?: boolean
  voidReason?: string
  note?: string
}

// ── Shifts ────────────────────────────────────────────────────
export interface Shift {
  id: string
  userId: string
  userName: string
  role: UserRole
  modules: ModuleKey[]
  start: string
  end: string | null
  txCount: number
  revenue: number
}

// ── Fleet ─────────────────────────────────────────────────────
export interface FleetInvoice {
  id: string
  date: string
  dueDate: string
  amount: number
  status: 'paid' | 'unpaid' | 'overdue'
  items: number
}

export interface FleetAccount {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  address: string
  accountType: string
  discount: number
  creditLimit: number
  currentBalance: number
  billingCycle: string
  invoiceDay: number
  paymentTerms: string
  status: 'active' | 'overdue' | 'suspended'
  created: string
  accountManager: string
  notes: string
  vehicles: Vehicle[]
  invoices: FleetInvoice[]
}

// ── Business Config ───────────────────────────────────────────
export interface BusinessConfig {
  name: string
  tagline: string
  address: string
  phone: string
  email: string
  website: string
  gctRegNo: string
  trn: string
  currency: string
  currencySymbol: string
  logo: string
  logoUrl: string
  primaryColor: string
  accentColor: string
  receiptWidth: number
  footer: {
    message: string
    refundPolicy: string
    social: { instagram: string; facebook: string; whatsapp: string }
    qrEnabled: boolean
    qrText: string
    promoMsg: string
  }
  modules: {
    restaurant: { terminalName: string; dineInFooter: string; takeoutFooter: string; deliveryFooter: string }
    bar: { terminalName: string; footer: string }
    carwash: { terminalName: string; footer: string }
  }
}

// ── POS State ─────────────────────────────────────────────────
export interface POSState {
  selItem: MenuItem | null
  selAddons: Addon[]
  selTable: string | null
  selTab: string | null
  payMethod: string
  member: Member | null
  plate: string
  qty: number
  note: string
  cat: string
  orderType: OrderType
  customerName: string
  customerPhone: string
  customerAddress: string
  pickupTime: string
  deliveryFee: number
  driverId: string
  taxOverride: boolean | null
  serviceCharge: number
  gratuityPct: number
  seatNote: string
  manualDiscPct?: number
  manualDiscFlat?: number
}

// ── Audit ─────────────────────────────────────────────────────
export interface AuditEntry {
  id: number
  ts: string
  user: string
  userId: string | null
  action: string
  detail: string
  type: 'info' | 'warn' | 'error' | 'success'
  mod: ModuleKey
}

// ── Loyalty ───────────────────────────────────────────────────
export interface LoyaltyMember {
  email: string
  name: string
  points: number
  tier: string
  history: { date: string; pts: number; desc: string }[]
}

// ── Promo Codes ───────────────────────────────────────────────
export interface PromoCode {
  code: string
  type: 'pct' | 'flat'
  value: number
  minOrder: number
  uses: number
  maxUses: number
  expiry: string
  active: boolean
}
