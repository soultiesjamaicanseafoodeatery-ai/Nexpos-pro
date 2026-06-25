// ── Users & Auth ───────� ��──────────────� ��──────────────� ��────────
export type UserRo le = 'admin' | 'manager' | 'staff'

export in terface User {
  id: string
  name: string ini: string
  pin?: string        // plain te xt (seed fallback only)
  pin_hash?: string  // SHA-256 hex (Supabase staff)
  role: User Role
  color: string
  allowedModules: Module Key[]
  active: boolean
  staffId?: string
} 
export interface RoleConfig {
  label: strin g
  color: string
  pages: string[]
}

// ─ ─ Modules ─────────── ─────────────── ─────────────── ──────────
export type Mo duleKey = 'restaurant' | 'bar' | 'carwash'

e xport interface MenuItem {
  id: string
  nam e: string
  desc: string
  price: number
  ca t: string
  emoji: string
  active: boolean  module?: string
  duration?: string
  gradie nt?: string
  accent?: string
}

export inter face Addon {
  id: string
  name: string
  de sc: string
  price: number
  icon: string
  a ctive: boolean
}

export interface ModuleData  {
  label: string
  icon: string
  color: st ring
  cobText: string
  selCls: string
  aoC ls: string
  taxRate: number
  categories: st ring[]
  tables?: string[]
  tableStatus?: Re cord<string, string>
  tabs?: string[]
  item s: MenuItem[]
  addons: Addon[]
  bays?: stri ng[]
  bayStatus?: Record<string, string>
  p lans?: MemberPlan[]
  members?: Member[]
  ta xConfig?: TaxConfig
}

// ── Tax ──� �──────────────� �──────────────� �──────────────� �───────
export interface TaxCo nfig {
  name: string
  rate: number
  enable d: boolean
  taxableOrderTypes: string[]
  se rviceChargeRate: number
  serviceChargeEnable d: boolean
}

export type OrderType = 'dine-i n' | 'takeout' | 'delivery' | 'walk-in'

expo rt interface OrderCalc {
  sub: number
  disc : number
  memberDiscAmt: number
  manualDisc Amt: number
  taxableBase: number
  gct: numb er
  gctRate: number
  gctApplies: boolean serviceCharge: number
  scRate: number
  grat uity: number
  deliveryFee: number
  legacyTa x: number
  surchargeTotal: number
  total: n umber
  orderType: string
}

export type Surc hargeType = 'credit_card_fee' | 'service_char ge' | 'delivery_fee' | 'other'

export interf ace Surcharge {
  id: string
  type: Surcharg eType
  description: string
  amountType: 'pe rcentage' | 'fixed'
  value: number
}

// ─ ─ Membership ────────── ─────────────── ─────────────── ────────
export interface Mem berPlan {
  id: string
  name: string
  price : number
  discount: number
  color: string  freeAddons: string[]
  unlimited: boolean description: string
}

export interface Billi ngRecord {
  date: string
  amount: number status: 'paid' | 'failed' | 'pending'
}

expo rt interface MemberBilling {
  status: 'activ e' | 'failed' | 'cancelled' | 'expired'
  aut oRenew: boolean
  monthlyFee: number
  nextBi llingDate: string
  lastBillingDate: string  lastBillingStatus: string
  failedAttempts: number
  paymentMethod: string
  billingHisto ry: BillingRecord[]
}

export interface Vehic le {
  id?: string
  plate: string
  make: st ring
  model: string
  year: number
  color: string
  type?: string
  washes?: number
}

e xport interface Member {
  id: string
  name:  string
  email: string
  phone: string
  pla nId: string
  type: string
  discount: number 
  vehicles: Vehicle[]
  washes: number
  joi ned: string
  billing: MemberBilling
}

// � �─ Cart ───────────� �──────────────� �──────────────� �────────────
export interface CartItem {
  id: string        // u nique cart line id (crypto.randomUUID())
  it emId: string    // original MenuItem.id
  nam e: string
  price: number     // base price p er unit
  qty: number
  addons: Addon[]
  mod ule: ModuleKey
  note?: string
  plate?: stri ng    // carwash only
  flavour?: string  // selected flavour name
  size?: string     // selected size name
  sides?: string[]  // sel ected side names
  // Void — soft-delete; i tem stays in array for audit
  voided?: boole an
  voidReason?: VoidReason
  voidReasonText ?: string
  voidedBy?: string
  voidedAt?: st ring
}

// ── Transactions ────� �──────────────� �──────────────� �───────────
export int erface PaymentEntry {
  method: string
  amou nt: number
}

export interface Transaction {   id: number
  ts: string
  mod: ModuleKey | 'mixed'
  cashier: string
  userId: string customer: string
  item: string
  addons: str ing[]
  sub: number
  disc: number
  tax: num ber
  total: number
  pay: string
  orderType ?: string
  gct?: number
  serviceCharge?: nu mber
  gratuity?: number
  gratuityPct?: numb er
  surchargeTotal?: number
  guestCount?: n umber
  customerName?: string
  tableNum?: st ring
  tender?: number
  changeDue?: number  payments?: PaymentEntry[]
  customerEmail?: string
  voided?: boolean
  voidReason?: stri ng
  voidedBy?: string
  voidedAt?: string refunded?: boolean
  refundReason?: string refundedBy?: string
  refundedAt?: string
  r efundAmount?: number
  note?: string
  items? : CartItem[]
}

export interface HeldOrder {   id: string
  label: string
  cart: CartItem []
  orderType: OrderType
  module: ModuleKey 
  selTable: string | null
  guestCount: numb er
  customerName: string
  discPct: number  discFlat: number
  gratuityPct: number
  gra tuityOverride: boolean
  openedAt?: string savedAt: string
  savedBy: string
}

// ─� � Shifts ──────────── ─────────────── ─────────────── ──────────
export interfa ce Shift {
  id: string
  userId: string
  us erName: string
  role: UserRole
  modules: Mo duleKey[]
  start: string
  end: string | nul l
  txCount: number
  revenue: number
  // fo rmal close metadata
  closedBy?: string
  clo sedAt?: string
  openingFloat?: number
  coun tedCash?: number
  cashVariance?: number
  va rianceNote?: string
  wasOverridden?: boolean 
  isFormalClose?: boolean
}

// ── Fleet  ──────────────� �──────────────� �──────────────� �────────
export interface Fl eetInvoice {
  id: string
  date: string
  du eDate: string
  amount: number
  status: 'pai d' | 'unpaid' | 'overdue'
  items: number
} export interface FleetAccount {
  id: string   companyName: string
  contactName: string  email: string
  phone: string
  address: str ing
  accountType: string
  discount: number   creditLimit: number
  currentBalance: numbe r
  billingCycle: string
  invoiceDay: number 
  paymentTerms: string
  status: 'active' | 'overdue' | 'suspended'
  created: string
  a ccountManager: string
  notes: string
  vehic les: Vehicle[]
  invoices: FleetInvoice[]
} // ── Business Config ──────� ��──────────────� ��──────────────� ��──────
export interface Busines sConfig {
  name: string
  tagline: string address: string
  phone: string
  email: stri ng
  website: string
  gctRegNo: string
  trn : string
  currency: string
  currencySymbol:  string
  logo: string
  logoUrl: string
  pr imaryColor: string
  accentColor: string
  re ceiptWidth: number
  footer: {
    message: s tring
    refundPolicy: string
    social: { instagram: string; facebook: string; whatsapp : string }
    qrEnabled: boolean
    qrText:  string
    promoMsg: string
  }
  modules: { 
    restaurant: { terminalName: string; dine InFooter: string; takeoutFooter: string; deli veryFooter: string }
    bar: { terminalName:  string; footer: string }
    carwash: { term inalName: string; footer: string }
  }
  prin ters?: {
    receipt: string    // Windows pr inter name for customer receipts
    kitchen:  string    // Windows printer name for kitche n tickets
    bar: string        // Windows p rinter name for bar tickets (falls back to ki tchen if blank)
    width: 58 | 80     // the rmal paper width in mm
    autoPrint: boolean   // legacy
    receiptPreview: boolean // sh ow receipt modal before printing (default fal se = always print silently)
    drawerEnabled : boolean // open cash drawer after cash paym ent
  }
  autoLogoutMinutes?: number
}

// � �─ POS State ────────── ─────────────── ─────────────── ─────────
export interface POSState {
  selItem: MenuItem | null
  selAd dons: Addon[]
  selTable: string | null
  sel Tab: string | null
  payMethod: string
  memb er: Member | null
  plate: string
  qty: numb er
  note: string
  cat: string
  orderType: OrderType
  customerName: string
  customerPh one: string
  customerAddress: string
  picku pTime: string
  deliveryFee: number
  driverI d: string
  taxOverride: boolean | null
  ser viceCharge: number
  gratuityPct: number
  se atNote: string
  manualDiscPct?: number
  man ualDiscFlat?: number
}

// ── Audit ─� �──────────────� �──────────────� �──────────────� �──────
export interface AuditEnt ry {
  id: string
  ts: string
  user: string 
  userId: string | null
  action: string
  d etail: string
  type: 'info' | 'warn' | 'erro r' | 'success'
  mod: ModuleKey
}

// ── Loyalty ────────────� ��──────────────� ��──────────────� ��────────
export interface L oyaltyMember {
  email: string
  name: string 
  points: number
  tier: string
  history: {  date: string; pts: number; desc: string }[] }

// ── Void System ──────� �──────────────� �──────────────� �──────────
export type V oidReason =
  | 'wrong_item'
  | 'customer_ch anged_mind'
  | 'duplicate_entry'
  | 'kitche n_error'
  | 'bar_error'
  | 'manager_approve d'
  | 'other'

export const VOID_REASON_LABE LS: Record<VoidReason, string> = {
  wrong_it em:            'Wrong Item',
  customer_chang ed_mind: 'Customer Changed Mind',
  duplicate _entry:       'Duplicate Entry',
  kitchen_er ror:         'Kitchen Error',
  bar_error:           'Bar Error',
  manager_approved:    'Manager Approved',
  other:    'Other',
}

export interface VoidLog {
  i d: string
  ts: string
  user: string
  userI d: string
  role: string
  voidType: 'item' |  'order' | 'transaction'
  orderNum?: string   txId?: number
  itemName?: string
  reason:  VoidReason
  reasonText?: string
  amount: n umber
  mod: ModuleKey
}

// ── Order Tic kets & Kitchen Status ───────� �──────────────� �─────
export type KitchenStatus  =  'pending' | 'preparing' | 'ready' | 'served' 
export type BarStatus      = 'pending' | 'pr eparing' | 'ready'
export type CarwashStatus  = 'queued'  | 'in_progress' | 'completed'
ex port type PrintWidth     = 58 | 80

export ty pe OrderStatus = 'sent' | 'preparing' | 'read y' | 'served' | 'paid' | 'voided'

export int erface RefundLog {
  id: string
  ts: string   txId: number
  user: string
  userId: strin g
  role: string
  reason: string
  refundTyp e: 'full' | 'partial'
  amount: number
  mod:  ModuleKey
}

export interface OrderTimeline {
  created:           string
  sentToKitchen ?:    string
  kitchenPreparing?: string
  ki tchenReady?:     string
  barPreparing?: string
  barReady?:         string
  served?:            string
  paid?:             string    // set at payment time; absent on unpaid o pen orders
}

export interface ReprintLog {  type: 'customer' | 'kitchen' | 'bar' | 'carw ash' | 'void'
  by:   string
  at:   string
} 

export interface OrderTicket {
  id:      string
  orderNum:      string
  txId?:         number      // set at payment time; a bsent on open orders
  table?:        string   server:        string
  guestCount?:   numb er
  customerName?: string
  orderType:     s tring
  status?:       OrderStatus  // absent  on legacy tickets (treat as 'paid')
  hasKit chen:    boolean
  hasBar:        boolean
  h asCarwash:    boolean
  kitchenStatus: Kitche nStatus
  barStatus:     BarStatus
  carwashS tatus: CarwashStatus
  items:         CartIte m[]
  orderNote?:    string
  discPct?: number      // saved at SEND ORDER for later payment calc
  discFlat?:     number
  gratui tyPct?:  number
  timeline:      OrderTimelin e
  reprints:      ReprintLog[]
}

// ── Promo Codes ─────────── ─────────────── ─────────────── ──────
export interface PromoCode  {
  code: string
  type: 'pct' | 'flat'
  va lue: number
  minOrder: number
  uses: number 
  maxUses: number
  expiry: string
  active:  boolean
}  

// -- No Sale --
export type NoSaleReason =
  | 'making_change'
  | 'cash_drop'
  | 'shift_float'
  | 'drawer_check'
  | 'customer_request'
  | 'other'

export const NO_SALE_REASON_LABELS: Record<NoSaleReason, string> = {
  making_change:    'Making Change',
  cash_drop:        'Cash Drop',
  shift_float:      'Shift Float',
  drawer_check:     'Drawer Check',
  customer_request: 'Customer Request',
  other:            'Other',
}

export interface NoSaleLog {
  id: string
  ts: string
  requestedBy: string
  requestedById: string
  requestedByRole: string
  approvedBy: string
  approvedById: string
  reason: NoSaleReason
  reasonText?: string
  drawerOpened: boolean
  shiftId: string
  mod: ModuleKey
}