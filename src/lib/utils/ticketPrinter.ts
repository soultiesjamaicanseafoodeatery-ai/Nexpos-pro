import type { Transaction, CartItem, BusinessConfig } from '@/types'

export type PrintWidth = 58 | 80

const COLS: Record<PrintWidth, number> = { 58: 32, 80: 42 }

// Decode HTML entities and map unsupported Unicode to printable ASCII.
// All thermal print builders use this so output is clean on any ESC/POS printer.
function sanitize(s: string): string {
  if (!s) return ''
  return s
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/™/g, ' | ').replace(/®/g, '(R)').replace(/©/g, '(C)')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/°/g, ' deg').replace(/½/g, '1/2')
    .replace(/¼/g, '1/4').replace(/¾/g, '3/4')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ').trim()
}

// HTML-escape used only in printTicket() window title — never for thermal output.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function center(text: string, w: number): string {
  const pad = Math.max(0, Math.floor((w - text.length) / 2))
  return ' '.repeat(pad) + text
}

function div(ch: string, w: number): string {
  return ch.repeat(w)
}

function row(left: string, right: string, w: number): string {
  const gap = Math.max(1, w - left.length - right.length)
  return left + ' '.repeat(gap) + right
}

function wrap(text: string, indent: number, w: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ' '.repeat(indent)
  for (const word of words) {
    if (current.length + word.length + 1 > w && current.trim()) {
      lines.push(current)
      current = ' '.repeat(indent) + word
    } else {
      current += (current.trim() ? ' ' : '') + word
    }
  }
  if (current.trim()) lines.push(current)
  return lines
}

// Word-wrap an item name with an indented prefix (e.g. "  2x " or "   ").
function itemWrap(prefix: string, name: string, w: number): string[] {
  const indent = ' '.repeat(prefix.length)
  const words = name.split(' ')
  const lines: string[] = []
  let cur = prefix
  for (const word of words) {
    if (cur === prefix) {
      cur += word
    } else if (cur.length + 1 + word.length <= w) {
      cur += ' ' + word
    } else {
      lines.push(cur)
      cur = indent + word
    }
  }
  if (cur.trim()) lines.push(cur)
  return lines
}

// ── Smart print — tries QZ Tray first, falls back to browser ─────────────────
// silentOnly: when true, skips browser fallback (for auto-prints triggered by events).
// buzz: fires buzzer AFTER paper cut via qzPrintRaw.
export async function smartPrint(
  html: string,
  title: string,
  printerName?: string,
  width: PrintWidth = 80,
  silentOnly = false,
  buzz = false,
): Promise<void> {
  if (!html) return
  if (printerName?.trim()) {
    const { qzPrintRaw } = await import('./qzTray')
    const text = html.replace(/<\/?pre>/g, '')
    const ok = await qzPrintRaw(printerName.trim(), text, buzz)
    if (ok) return
  }
  if (!silentOnly) {
    printTicket(html, title)
  }
}

// ── Print helper — opens browser window and triggers print dialog ─────────────
export function printTicket(html: string, title = 'Ticket'): void {
  const win = window.open('', '_blank', 'width=440,height=720,menubar=no,toolbar=no')
  if (!win) return
  win.document.write(
    `<!DOCTYPE html><html><head><title>${esc(title)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',Courier,monospace;font-size:14px;background:#fff;color:#000;padding:8px;padding-bottom:50mm}
    pre{white-space:pre-wrap;word-break:break-all;font-family:inherit;font-size:inherit}
    @media print{body{width:${title.startsWith('58') ? '58' : '80'}mm}@page{margin:2mm}}
    </style></head><body>${html}
    <script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},100)}<\/script>
    </body></html>`
  )
  win.document.close()
}

// ── Customer Receipt ──────────────────────────────────────────────────────────
export function buildCustomerReceipt(
  tx: Transaction,
  biz: BusinessConfig,
  opts: { width?: PrintWidth } = {}
): string {
  const w   = COLS[opts.width ?? 80]
  const sym = biz.currencySymbol ?? 'J$'
  const fmtN = (n: number) =>
    sym + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const L: string[] = []

  // Header
  L.push(div('=', w))
  L.push(center(sanitize(biz.name).toUpperCase(), w))
  if (biz.tagline) L.push(center(sanitize(biz.tagline), w))
  if (biz.address) L.push(center(sanitize(biz.address), w))
  if (biz.phone)   L.push(center('Tel: ' + sanitize(biz.phone), w))
  if (biz.website) L.push(center(sanitize(biz.website), w))
  L.push(div('=', w))

  // Order info
  const orderNum = String(tx.id).slice(-4).padStart(4, '0')
  L.push(row('Receipt #:', orderNum, w))
  L.push(row('Date/Time:', sanitize(tx.ts), w))
  L.push(row('Cashier:', sanitize(tx.cashier), w))
  if (tx.tableNum)                         L.push(row('Table:', sanitize(tx.tableNum), w))
  if (tx.guestCount && tx.guestCount > 1)  L.push(row('Guests:', String(tx.guestCount), w))
  if (tx.customerName)                     L.push(row('Customer:', sanitize(tx.customerName), w))
  if (tx.orderType)                        L.push(row('Order:', tx.orderType.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()), w))
  L.push(div('-', w))

  // Items
  L.push('ITEMS')
  L.push(div('-', w))
  if (tx.items && tx.items.length > 0) {
    for (const ci of tx.items) {
      const lineTotal = (ci.price + ci.addons.reduce((s, a) => s + a.price, 0)) * ci.qty
      const prefix = ci.qty > 1 ? ` ${ci.qty}x ` : '    '
      itemWrap(prefix, sanitize(ci.name), w - fmtN(lineTotal).length - 1).forEach((l, i) => {
        L.push(i === 0 ? row(l, fmtN(lineTotal), w) : l)
      })
      if (ci.size)              L.push('     SIZE: ' + sanitize(ci.size))
      if (ci.flavour)           L.push('     FLAVOUR: ' + sanitize(ci.flavour))
      if (ci.sides?.length)     L.push('     SIDES: ' + ci.sides.map(sanitize).join(', '))
      for (const a of ci.addons)
        L.push(row('     + ' + sanitize(a.name), '+' + fmtN(a.price), w))
      if (ci.note)              L.push('     NOTE: ' + sanitize(ci.note))
    }
  } else {
    L.push(' ' + sanitize(tx.item))
  }
  L.push(div('=', w))

  // Totals
  L.push(row('Subtotal:', fmtN(tx.sub), w))
  if (tx.disc > 0)                         L.push(row('Discount:', '-' + fmtN(tx.disc), w))
  if ((tx.gct ?? 0) > 0)                   L.push(row('GCT (15%):', fmtN(tx.gct!), w))
  if ((tx.serviceCharge ?? 0) > 0)         L.push(row('Service (10%):', fmtN(tx.serviceCharge!), w))
  if ((tx.gratuity ?? 0) > 0)              L.push(row(`Gratuity (${tx.gratuityPct ?? 15}%):`, fmtN(tx.gratuity!), w))
  if ((tx.surchargeTotal ?? 0) > 0)        L.push(row('Surcharges:', fmtN(tx.surchargeTotal!), w))
  L.push(div('=', w))
  L.push(row('TOTAL:', fmtN(tx.total), w))
  L.push(div('=', w))

  // Payment
  const payLabel = tx.pay === 'gift_card' ? 'Gift Card'
    : tx.pay === 'tab' ? 'House Account'
    : tx.pay.charAt(0).toUpperCase() + tx.pay.slice(1)
  L.push(row('Payment:', payLabel, w))
  if (tx.payments && tx.payments.length > 1) {
    for (const p of tx.payments)
      L.push(row('  ' + p.method.charAt(0).toUpperCase() + p.method.slice(1) + ':', fmtN(p.amount), w))
  }
  if (tx.tender    != null) L.push(row('Tendered:', fmtN(tx.tender), w))
  if (tx.changeDue != null) L.push(row('Change:', fmtN(tx.changeDue), w))
  L.push(div('=', w))

  // Footer
  const footer = biz.footer?.message ?? 'Thank you for dining with us!'
  wrap(sanitize(footer), 0, w).forEach(l => L.push(center(l.trim(), w)))
  if (biz.footer?.social?.instagram) L.push(center('IG: @' + sanitize(biz.footer.social.instagram), w))
  if (biz.footer?.social?.facebook)  L.push(center('FB: ' + sanitize(biz.footer.social.facebook), w))
  L.push(div('=', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Kitchen Order Ticket (KOT) ────────────────────────────────────────────────
export interface KOTData {
  orderNum: string
  table?: string
  server: string
  guestCount?: number
  orderType: string
  date: string
  time: string
  items: CartItem[]
  orderNote?: string
}

export function buildKitchenTicket(data: KOTData, opts: { width?: PrintWidth } = {}): string {
  const w = COLS[opts.width ?? 80]
  const foodItems = data.items.filter(ci => ci.module === 'restaurant')
  if (foodItems.length === 0) return ''

  const L: string[] = []

  // Header
  L.push(div('*', w))
  L.push(center('KITCHEN TICKET', w))
  L.push(div('*', w))

  // Order identity — each on its own line so 58mm can fit it
  L.push('')
  L.push(center('ORDER #' + data.orderNum, w))
  L.push('')
  L.push(div('=', w))
  L.push('TYPE:   ' + data.orderType.replace('-', ' ').toUpperCase())
  if (data.table)
    L.push('TABLE:  ' + sanitize(data.table))
  else
    L.push('TABLE:  TAKEOUT')
  L.push('SERVER: ' + sanitize(data.server))
  if (data.guestCount && data.guestCount > 1)
    L.push('GUESTS: ' + data.guestCount)
  L.push('TIME:   ' + sanitize(data.time))
  L.push('DATE:   ' + sanitize(data.date))
  L.push(div('=', w))

  // Items
  for (const ci of foodItems) {
    L.push('')
    const prefix = ci.qty > 1 ? `  ${ci.qty}x ` : '     '
    itemWrap(prefix, sanitize(ci.name).toUpperCase(), w).forEach(l => L.push(l))
    if (ci.size)    L.push('     SIZE: ' + sanitize(ci.size))
    if (ci.flavour) L.push('     FLAVOUR: ' + sanitize(ci.flavour))
    if (ci.sides?.length) {
      L.push('     SIDE' + (ci.sides.length > 1 ? 'S' : '') + ':')
      ci.sides.forEach(s => L.push('       - ' + sanitize(s)))
    }
    if (ci.addons.length > 0) {
      L.push('     ADD-ONS:')
      ci.addons.forEach(a => L.push('       - ' + sanitize(a.name)))
    }
    if (ci.note) {
      L.push('')
      wrap('*** NOTE: ' + sanitize(ci.note).toUpperCase() + ' ***', 5, w)
        .forEach(l => L.push(l))
    }
    L.push('')
    L.push(div('-', w))
  }

  // Special instructions
  if (data.orderNote?.trim()) {
    L.push('')
    L.push(div('!', w))
    L.push(center('ORDER NOTE', w))
    wrap(sanitize(data.orderNote).toUpperCase(), 0, w)
      .forEach(l => L.push(center(l.trim(), w)))
    L.push(div('!', w))
  }

  // Status checkboxes
  L.push('')
  L.push(div('=', w))
  L.push(center('STATUS', w))
  L.push('')
  L.push(center('[ ] PREPARING', w))
  L.push(center('[ ] READY', w))
  L.push(center('[ ] SERVED', w))
  L.push('')
  L.push(div('*', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Bar Order Ticket (BOT) ────────────────────────────────────────────────────
export interface BOTData {
  orderNum: string
  table?: string
  server: string
  time: string
  items: CartItem[]
}

export function buildBarTicket(data: BOTData, opts: { width?: PrintWidth } = {}): string {
  const w = COLS[opts.width ?? 80]
  const barItems = data.items.filter(ci => ci.module === 'bar')
  if (barItems.length === 0) return ''

  const L: string[] = []

  L.push(div('#', w))
  L.push(center('BAR TICKET', w))
  L.push(div('#', w))
  L.push('')
  L.push(center('ORDER #' + data.orderNum, w))
  L.push('')
  L.push(div('=', w))
  L.push('TABLE:  ' + (data.table ? sanitize(data.table) : 'BAR'))
  L.push('SERVER: ' + sanitize(data.server))
  L.push('TIME:   ' + sanitize(data.time))
  L.push(div('=', w))

  for (const ci of barItems) {
    L.push('')
    const prefix = ci.qty > 1 ? `  ${ci.qty}x ` : '     '
    itemWrap(prefix, sanitize(ci.name).toUpperCase(), w).forEach(l => L.push(l))
    if (ci.size)    L.push('     SIZE: ' + sanitize(ci.size))
    if (ci.flavour) L.push('     FLAVOUR: ' + sanitize(ci.flavour))
    if (ci.addons.length > 0) {
      L.push('     ADD-ONS:')
      ci.addons.forEach(a => L.push('       - ' + sanitize(a.name)))
    }
    if (ci.note) {
      L.push('')
      wrap('*** ' + sanitize(ci.note).toUpperCase() + ' ***', 5, w)
        .forEach(l => L.push(l))
    }
    L.push('')
    L.push(div('-', w))
  }

  L.push('')
  L.push(div('=', w))
  L.push(center('STATUS', w))
  L.push('')
  L.push(center('[ ] PREPARING', w))
  L.push(center('[ ] READY', w))
  L.push('')
  L.push(div('#', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Car Wash Work Order ───────────────────────────────────────────────────────
export interface CWOData {
  orderNum: string
  plate?: string
  customerName?: string
  items: CartItem[]
  time: string
  date: string
}

export function buildCarwashWorkOrder(data: CWOData, opts: { width?: PrintWidth } = {}): string {
  const w = COLS[opts.width ?? 80]
  const cwItems = data.items.filter(ci => ci.module === 'carwash')
  if (cwItems.length === 0) return ''

  const L: string[] = []

  L.push(div('=', w))
  L.push(center('CAR WASH WORK ORDER', w))
  L.push(div('=', w))
  L.push('')
  L.push(row('Order #: CW-' + data.orderNum, 'Time: ' + sanitize(data.time), w))
  L.push(row('Date: ' + sanitize(data.date), '', w))
  L.push(div('-', w))
  if (data.customerName) L.push(row('Customer:', sanitize(data.customerName), w))
  if (data.plate)        L.push(row('Plate:', sanitize(data.plate).toUpperCase(), w))
  L.push(div('=', w))
  L.push('SERVICES:')
  L.push(div('-', w))

  for (const ci of cwItems) {
    const prefix = ci.qty > 1 ? `  ${ci.qty}x ` : '     '
    itemWrap(prefix, sanitize(ci.name), w).forEach(l => L.push(l))
    if (ci.addons.length > 0)
      ci.addons.forEach(a => L.push('       + ' + sanitize(a.name)))
    if (ci.note) L.push('       Note: ' + sanitize(ci.note))
  }

  L.push('')
  L.push(div('=', w))
  L.push(center('WORK ORDER STATUS', w))
  L.push('')
  L.push(center('[ ] QUEUED', w))
  L.push(center('[ ] IN PROGRESS', w))
  L.push(center('[ ] COMPLETED', w))
  L.push(div('=', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Void Ticket ───────────────────────────────────────────────────────────────
export function buildVoidTicket(
  orderNum: string,
  itemName: string,
  staffName: string,
  time: string,
  opts: { width?: PrintWidth; reason?: string; qty?: number } = {}
): string {
  const w = COLS[opts.width ?? 80]
  const L: string[] = []

  L.push(div('!', w))
  L.push(center('*** VOID ITEM ***', w))
  L.push(div('!', w))
  L.push('')
  L.push(row('Order #:', sanitize(orderNum), w))
  const voidLabel = (opts.qty && opts.qty > 1 ? `${opts.qty}x ` : '') + sanitize(itemName)
  wrap('VOID: ' + voidLabel, 0, w).forEach(l => L.push(l))
  if (opts.reason) wrap('Reason: ' + sanitize(opts.reason), 0, w).forEach(l => L.push(l))
  L.push(row('Voided by:', sanitize(staffName), w))
  L.push(row('Time:', sanitize(time), w))
  L.push('')
  L.push(center('*** REMOVE FROM ORDER ***', w))
  L.push(div('!', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Z-Report (End of Day Summary) ────────────────────────────────────────────
export interface ZReportData {
  date: string
  closedBy: string
  openingFloat: number
  restaurantSales: number
  barSales: number
  carwashSales: number
  totalSales: number
  cashSales: number
  cardSales: number
  giftCardSales: number
  tabSales: number
  otherSales: number
  totalDiscounts: number
  totalVoids: number
  totalRefunds: number
  voidCount: number
  refundCount: number
  totalGCT: number
  totalServiceCharge: number
  totalGratuity: number
  restaurantCount: number
  barCount: number
  carwashCount: number
  totalCount: number
  expectedCash: number
  actualCash: number
  variance: number
  denominations?: { label: string; qty: number; value: number }[]
  gctRegNo?: string
  trn?: string
  sym: string
}

export function buildZReport(data: ZReportData, opts: { width?: PrintWidth } = {}): string {
  const w = COLS[opts.width ?? 80]
  const sym = data.sym
  const fmtN = (n: number) =>
    sym + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const L: string[] = []

  const varianceLabel =
    data.variance === 0 ? 'BALANCED'
    : data.variance > 0 ? ('OVER +' + fmtN(data.variance))
    : ('SHORT -' + fmtN(Math.abs(data.variance)))

  L.push(div('=', w))
  L.push(center('Z-REPORT -- END OF DAY', w))
  L.push(div('=', w))
  L.push(row('Date:', sanitize(data.date), w))
  L.push(row('Closed by:', sanitize(data.closedBy), w))
  if (data.gctRegNo) L.push(row('GCT Reg:', sanitize(data.gctRegNo), w))
  if (data.trn)      L.push(row('TRN:', sanitize(data.trn), w))
  L.push(div('=', w))

  L.push(center('SALES BY MODULE', w))
  L.push(div('-', w))
  if (data.restaurantCount > 0) L.push(row('Restaurant (' + data.restaurantCount + ' tx)', fmtN(data.restaurantSales), w))
  if (data.barCount > 0)        L.push(row('Bar (' + data.barCount + ' tx)', fmtN(data.barSales), w))
  if (data.carwashCount > 0)    L.push(row('Car Wash (' + data.carwashCount + ' tx)', fmtN(data.carwashSales), w))
  L.push(div('-', w))
  L.push(row('TOTAL (' + data.totalCount + ' transactions)', fmtN(data.totalSales), w))
  L.push(div('=', w))

  L.push(center('PAYMENT METHODS', w))
  L.push(div('-', w))
  if (data.cashSales > 0)     L.push(row('Cash:', fmtN(data.cashSales), w))
  if (data.cardSales > 0)     L.push(row('Card:', fmtN(data.cardSales), w))
  if (data.giftCardSales > 0) L.push(row('Gift Card:', fmtN(data.giftCardSales), w))
  if (data.tabSales > 0)      L.push(row('House Account/Tab:', fmtN(data.tabSales), w))
  if (data.otherSales > 0)    L.push(row('Other:', fmtN(data.otherSales), w))
  L.push(div('=', w))

  L.push(center('ADJUSTMENTS', w))
  L.push(div('-', w))
  L.push(row('Discounts:', data.totalDiscounts > 0 ? ('-' + fmtN(data.totalDiscounts)) : fmtN(0), w))
  L.push(row('Voids (' + data.voidCount + '):', data.totalVoids > 0 ? ('-' + fmtN(data.totalVoids)) : fmtN(0), w))
  L.push(row('Refunds (' + data.refundCount + '):', data.totalRefunds > 0 ? ('-' + fmtN(data.totalRefunds)) : fmtN(0), w))
  L.push(div('=', w))

  L.push(center('TAX SUMMARY', w))
  L.push(div('-', w))
  L.push(row('GCT Collected (15%):', fmtN(data.totalGCT), w))
  if (data.totalServiceCharge > 0) L.push(row('Service Charge (10%):', fmtN(data.totalServiceCharge), w))
  if (data.totalGratuity > 0)      L.push(row('Gratuity:', fmtN(data.totalGratuity), w))
  L.push(div('=', w))

  L.push(center('CASH RECONCILIATION', w))
  L.push(div('-', w))
  L.push(row('Opening Float:', fmtN(data.openingFloat), w))
  L.push(row('+ Cash Sales:', fmtN(data.cashSales), w))
  L.push(div('-', w))
  L.push(row('EXPECTED IN DRAWER:', fmtN(data.expectedCash), w))
  L.push(row('ACTUAL COUNTED:', fmtN(data.actualCash), w))
  L.push(div('=', w))
  L.push(row('VARIANCE:', varianceLabel, w))
  L.push(div('=', w))

  if (data.denominations && data.denominations.some(d => d.qty > 0)) {
    L.push(center('DENOMINATION BREAKDOWN', w))
    L.push(div('-', w))
    for (const d of data.denominations) {
      if (d.qty > 0) L.push(row('  ' + d.label + ' x ' + d.qty, fmtN(d.value), w))
    }
    L.push(div('-', w))
    L.push(row('TOTAL COUNTED:', fmtN(data.actualCash), w))
    L.push(div('=', w))
  }

  L.push('')
  L.push(row('Manager:', '_'.repeat(Math.floor(w * 0.55)), w))
  L.push('')
  L.push(row('Witnessed:', '_'.repeat(Math.floor(w * 0.52)), w))
  L.push('')
  L.push(row('Date/Time:', '_'.repeat(Math.floor(w * 0.54)), w))
  L.push(div('=', w))
  L.push(center('*** END OF DAY CLOSED ***', w))
  L.push(div('=', w))

  return '<pre>' + L.join('\n') + '</pre>'
}
