import type { Transaction, CartItem, BusinessConfig } from '@/types'

export type PrintWidth = 58 | 80

// Approximate characters per line for each paper width
const COLS: Record<PrintWidth, number> = { 58: 32, 80: 42 }

// ── Text layout helpers ───────────────────────────────────────
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

// ── Smart print — tries QZ Tray first, falls back to browser ─
export async function smartPrint(
  html: string,
  title: string,
  printerName?: string,
  width: PrintWidth = 80,
): Promise<void> {
  if (!html) return
  if (printerName?.trim()) {
    const { qzPrint } = await import('./qzTray')
    const ok = await qzPrint(printerName.trim(), html, width)
    if (ok) return
  }
  printTicket(html, title)
}

// ── Print helper — opens new window and prints ────────────────
export function printTicket(html: string, title = 'Ticket'): void {
  const win = window.open('', '_blank', 'width=440,height=720,menubar=no,toolbar=no')
  if (!win) return
  win.document.write(
    `<!DOCTYPE html><html><head><title>${esc(title)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',Courier,monospace;font-size:11px;background:#fff;color:#000;padding:8px}
    pre{white-space:pre-wrap;word-break:break-all;font-family:inherit;font-size:inherit}
    @media print{body{width:${title.startsWith('58') ? '58' : '80'}mm}@page{margin:2mm}}
    </style></head><body>${html}
    <script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},100)}<\/script>
    </body></html>`
  )
  win.document.close()
}

// ── Customer Receipt ──────────────────────────────────────────
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

  // ── Header
  L.push(div('=', w))
  L.push(center(esc(biz.name.toUpperCase()), w))
  if (biz.tagline)  L.push(center(esc(biz.tagline), w))
  if (biz.address)  L.push(center(esc(biz.address), w))
  if (biz.phone)    L.push(center(`Tel: ${esc(biz.phone)}`, w))
  if (biz.website)  L.push(center(esc(biz.website), w))
  L.push(div('=', w))

  // ── Order info
  const orderNum = String(tx.id).slice(-4).padStart(4, '0')
  L.push(row('Receipt #:', orderNum, w))
  L.push(row('Date/Time:', esc(tx.ts), w))
  L.push(row('Cashier:', esc(tx.cashier), w))
  if (tx.tableNum)                              L.push(row('Table:', esc(tx.tableNum), w))
  if (tx.guestCount && tx.guestCount > 1)       L.push(row('Guests:', String(tx.guestCount), w))
  if (tx.customerName)                          L.push(row('Customer:', esc(tx.customerName), w))
  if (tx.orderType)                             L.push(row('Order:', tx.orderType.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()), w))
  L.push(div('-', w))

  // ── Items
  L.push('ITEMS')
  L.push(div('-', w))
  if (tx.items && tx.items.length > 0) {
    for (const ci of tx.items) {
      const lineTotal = (ci.price + ci.addons.reduce((s, a) => s + a.price, 0)) * ci.qty
      L.push(row(` ${ci.qty > 1 ? `${ci.qty}x ` : '   '}${esc(ci.name)}`, fmtN(lineTotal), w))
      if (ci.size)                              L.push(`       SIZE: ${esc(ci.size)}`)
      if (ci.flavour)                           L.push(`       FLAVOUR: ${esc(ci.flavour)}`)
      if (ci.sides?.length)                     L.push(`       SIDES: ${esc(ci.sides.join(', '))}`)
      for (const a of ci.addons)                L.push(row(`       + ${esc(a.name)}`, `+${fmtN(a.price)}`, w))
      if (ci.note)                              L.push(`       NOTE: ${esc(ci.note)}`)
    }
  } else {
    L.push(' ' + esc(tx.item))
  }
  L.push(div('=', w))

  // ── Totals
  L.push(row('Subtotal:', fmtN(tx.sub), w))
  if (tx.disc > 0)                              L.push(row('Discount:', '-' + fmtN(tx.disc), w))
  if ((tx.gct ?? 0) > 0)                        L.push(row(`GCT (15%):`, fmtN(tx.gct!), w))
  if ((tx.serviceCharge ?? 0) > 0)              L.push(row('Service (10%):', fmtN(tx.serviceCharge!), w))
  if ((tx.gratuity ?? 0) > 0)                   L.push(row(`Gratuity (${tx.gratuityPct ?? 15}%):`, fmtN(tx.gratuity!), w))
  L.push(div('=', w))
  L.push(row('TOTAL:', fmtN(tx.total), w))
  L.push(div('=', w))

  // ── Payment
  const payLabel = tx.pay === 'gift_card' ? 'Gift Card'
    : tx.pay === 'tab' ? 'House Account'
    : tx.pay.charAt(0).toUpperCase() + tx.pay.slice(1)
  L.push(row('Payment:', payLabel, w))
  if (tx.payments && tx.payments.length > 1) {
    for (const p of tx.payments)
      L.push(row(`  ${p.method.charAt(0).toUpperCase() + p.method.slice(1)}:`, fmtN(p.amount), w))
  }
  if (tx.tender   != null)                      L.push(row('Tendered:', fmtN(tx.tender), w))
  if (tx.changeDue != null)                     L.push(row('Change:', fmtN(tx.changeDue), w))
  L.push(div('=', w))

  // ── Footer
  const footer = biz.footer?.message ?? 'Thank you for dining with us!'
  wrap(footer, 0, w).forEach(l => L.push(center(l.trim(), w)))
  if (biz.footer?.social?.instagram)            L.push(center(`IG: @${esc(biz.footer.social.instagram)}`, w))
  if (biz.footer?.social?.facebook)             L.push(center(`FB: ${esc(biz.footer.social.facebook)}`, w))
  if (biz.gctRegNo)                             L.push(center(`GCT Reg: ${esc(biz.gctRegNo)}`, w))
  if (biz.trn)                                  L.push(center(`TRN: ${esc(biz.trn)}`, w))
  L.push(div('=', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Kitchen Order Ticket (KOT) ────────────────────────────────
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
  L.push(div('*', w))
  L.push(center('** KITCHEN TICKET **', w))
  L.push(div('*', w))
  L.push('')
  L.push(row(`ORDER #${data.orderNum}`, data.table ? `TABLE: ${data.table}` : 'TAKEOUT', w))
  L.push(row(`Date: ${data.date}`, `Time: ${data.time}`, w))
  L.push(row(`Server: ${esc(data.server)}`, data.guestCount && data.guestCount > 1 ? `Guests: ${data.guestCount}` : '', w))
  L.push(row('Type:', data.orderType.replace('-', ' ').toUpperCase(), w))
  L.push(div('=', w))

  for (const ci of foodItems) {
    L.push('')
    L.push(` ${ci.qty > 1 ? `${ci.qty}x ` : '   '}${esc(ci.name).toUpperCase()}`)
    if (ci.size)                  L.push(`       SIZE: ${esc(ci.size)}`)
    if (ci.flavour)               L.push(`       FLAVOUR: ${esc(ci.flavour)}`)
    if (ci.sides?.length) {
      L.push(`       SIDE${ci.sides.length > 1 ? 'S' : ''}:`)
      ci.sides.forEach(s => L.push(`         - ${esc(s)}`))
    }
    if (ci.addons.length > 0) {
      L.push(`       ADD-ONS:`)
      ci.addons.forEach(a => L.push(`         - ${esc(a.name)}`))
    }
    if (ci.note) {
      L.push('')
      L.push(`       *** NOTE: ${esc(ci.note).toUpperCase()} ***`)
    }
    L.push(div('-', w))
  }

  if (data.orderNote?.trim()) {
    L.push('')
    L.push(div('!', w))
    L.push(center('SPECIAL INSTRUCTIONS', w))
    L.push(div('!', w))
    data.orderNote.trim().split('\n').forEach(line =>
      L.push(center(esc(line).toUpperCase(), w))
    )
    L.push(div('!', w))
  }

  L.push('')
  L.push(div('=', w))
  L.push(center('KITCHEN STATUS', w))
  L.push('')
  L.push(center('[ ] PREPARING', w))
  L.push(center('[ ] READY', w))
  L.push(center('[ ] SERVED', w))
  L.push(div('*', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Bar Order Ticket (BOT) ────────────────────────────────────
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
  L.push(center('** BAR TICKET **', w))
  L.push(div('#', w))
  L.push('')
  L.push(row(`ORDER #${data.orderNum}`, data.table ? `TABLE: ${data.table}` : 'BAR', w))
  L.push(row(`Time: ${data.time}`, `Server: ${esc(data.server)}`, w))
  L.push(div('=', w))

  for (const ci of barItems) {
    L.push('')
    L.push(` ${ci.qty > 1 ? `${ci.qty}x ` : '   '}${esc(ci.name).toUpperCase()}`)
    if (ci.size)    L.push(`       SIZE: ${esc(ci.size)}`)
    if (ci.flavour) L.push(`       FLAVOUR: ${esc(ci.flavour)}`)
    if (ci.addons.length > 0)
      L.push(`       ADD-ONS: ${ci.addons.map(a => esc(a.name)).join(', ')}`)
    if (ci.note)    L.push(`       *** ${esc(ci.note).toUpperCase()} ***`)
    L.push(div('-', w))
  }

  L.push('')
  L.push(div('=', w))
  L.push(center('BAR STATUS', w))
  L.push('')
  L.push(center('[ ] PREPARING', w))
  L.push(center('[ ] READY', w))
  L.push(div('#', w))

  return `<pre>${L.join('\n')}</pre>`
}

// ── Car Wash Work Order ───────────────────────────────────────
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
  L.push(row(`Order #: CW-${data.orderNum}`, `Time: ${data.time}`, w))
  L.push(row(`Date: ${data.date}`, '', w))
  L.push(div('-', w))
  if (data.customerName)  L.push(row('Customer:', esc(data.customerName), w))
  if (data.plate)         L.push(row('Plate:', esc(data.plate).toUpperCase(), w))
  L.push(div('=', w))
  L.push('SERVICES:')
  L.push(div('-', w))

  for (const ci of cwItems) {
    L.push(` ${ci.qty > 1 ? `${ci.qty}x ` : '   '}${esc(ci.name)}`)
    if (ci.addons.length > 0)
      ci.addons.forEach(a => L.push(`       + ${esc(a.name)}`))
    if (ci.note) L.push(`       Note: ${esc(ci.note)}`)
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

// ── Void Ticket ───────────────────────────────────────────────
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
  L.push(row('Order #:', orderNum, w))
  L.push(row('VOID:', `${opts.qty && opts.qty > 1 ? `${opts.qty}x ` : ''}${esc(itemName)}`, w))
  if (opts.reason) L.push(row('Reason:', esc(opts.reason), w))
  L.push(row('Voided by:', esc(staffName), w))
  L.push(row('Time:', time, w))
  L.push('')
  L.push(center('*** REMOVE FROM ORDER ***', w))
  L.push(div('!', w))
  return `<pre>${L.join('\n')}</pre>`
}
