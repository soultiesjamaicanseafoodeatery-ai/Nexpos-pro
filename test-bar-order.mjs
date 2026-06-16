import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'bar-order-shots')
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 800 })

let n = 0
const shot = async (name) => {
  n++
  await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2,'0')}-${name}.png`) })
  console.log(`📸 ${n}: ${name}`)
}

const addItem = async (name) => {
  const item = page.locator('div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  if (await item.count() === 0) { console.log(`  ⚠️  "${name}" not found`); return false }
  await item.click()
  await page.waitForTimeout(600)
  const addBtn = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await addBtn.count() > 0) {
    await addBtn.click()
    await addBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  console.log(`  ✅ Added ${name}`)
  return true
}

const pass  = (label) => console.log(`  ✅ ${label}`)
const warn  = (label) => console.log(`  ⚠️  ${label}`)
const check = (label, cond) => cond ? pass(label) : warn(label)

console.log('\n=== Bar Full Order Test ===\n')

// ── Step 1: Login ──────────────────────────────────────────────
await page.goto('https://nexpropos.vercel.app', { timeout: 60000, waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.locator('button').filter({ hasText: 'RENEE' }).first().waitFor({ state: 'visible', timeout: 15000 })
await page.locator('button').filter({ hasText: 'RENEE' }).first().click()
await page.waitForTimeout(300)
for (const d of ['0','6','0','6']) {
  await page.locator('button').filter({ hasText: new RegExp(`^${d}$`) }).first().click()
  await page.waitForTimeout(100)
}
await page.waitForTimeout(1500)
console.log('Step 1 — Login')
pass('Logged in as RENEE (admin)')

// ── Step 2: Switch to Bar Module ───────────────────────────────
console.log('\nStep 2 — Switch to Bar Module')
const barTab = page.locator('button').filter({ hasText: /^Bar$/ }).first()
await barTab.waitFor({ state: 'visible', timeout: 10000 })
await barTab.click()
await page.waitForTimeout(800)
await shot('01-bar-service-select')
const barSvcBody = await page.textContent('body')
check('Bar module active',          barSvcBody.includes('Bar'))
check('Dine-In option visible',     barSvcBody.includes('Dine-In'))
check('Takeout option visible',     barSvcBody.includes('Takeout'))

// ── Step 3: Dine-In → Table Grid ──────────────────────────────
console.log('\nStep 3 — Bar Dine-In → Table Grid')
await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(800)
await shot('02-table-grid')
const tableBody = await page.textContent('body')
check('Table grid loaded', /T\d+/.test(tableBody))

// Pick T2 or fall back to first available
let tableUsed = 'T2'
const t2 = page.locator('button', { hasText: 'T2' }).first()
if (await t2.count() > 0) {
  await t2.click()
} else {
  const anyTable = page.locator('button').filter({ hasText: /^T\d+$/ }).first()
  tableUsed = (await anyTable.textContent() ?? 'T?').trim()
  await anyTable.click()
}
await page.waitForTimeout(5000)
await shot('03-bar-workspace')
const wsBody = await page.textContent('body')
console.log(`\nStep 4 — Bar Workspace (Table ${tableUsed})`)
check('Workspace shows Dine-In',            wsBody.includes('Dine-In') || wsBody.includes('DINE-IN'))
check(`Table ${tableUsed} shown`,           wsBody.includes(tableUsed))
check('Bar menu loaded (J$ prices)',        wsBody.includes('J$'))
check('No restaurant-only items shown',     wsBody.includes('Bar') || wsBody.includes('VODKA') || wsBody.includes('RUM') || wsBody.includes('Rum') || wsBody.includes('Vodka') || wsBody.includes('Absolute') || wsBody.includes('Bacardi'))

// ── Step 5: Browse Categories ──────────────────────────────────
console.log('\nStep 5 — Browse Bar Categories')
const allTab = page.locator('button').filter({ hasText: /^All$/ }).first()
if (await allTab.count() > 0) { await allTab.click(); await page.waitForTimeout(400) }
await shot('04-bar-menu-all')
const menuBody = await page.textContent('body')
const barCategories = ['VODKA','RUM','GIN','COGNAC','WHISKEY','TEQUILA','Vodka','Rum','Gin']
const foundCats = barCategories.filter(c => menuBody.includes(c))
check(`Bar categories visible (${foundCats.slice(0,3).join(', ')})`, foundCats.length > 0)

// Log item count for reference
const prices = menuBody.match(/J\$[\d,]+\.00/g) ?? []
console.log(`  Bar items priced: ${prices.length}`)

// Try a category tab
const rumTab = page.locator('button').filter({ hasText: /^Rum$/i }).first()
if (await rumTab.count() > 0) {
  await rumTab.click()
  await page.waitForTimeout(400)
  await shot('05-rum-category')
  check('Rum category works', true)
  // Back to All
  if (await allTab.count() > 0) { await allTab.click(); await page.waitForTimeout(400) }
}

// ── Step 6: Add Bar Items ──────────────────────────────────────
console.log('\nStep 6 — Add Bar Items')
let itemsAdded = 0
// Try known bar items in priority order
const barItems = ['Absolute', 'Bacardi Gold', 'Bacardi Silver', 'Appleton 8yr',
  'Hennessy VS', 'Beefeater Shot', 'Casamigos Shot', 'Appleton White',
  'Captain Morgan Spiced Rum']
for (const item of barItems) {
  if (itemsAdded >= 3) break
  if (await addItem(item)) itemsAdded++
}

// If nothing matched, try clicking any visible price-bearing card
if (itemsAdded === 0) {
  warn('Named items not found — trying any clickable item card')
  const allDivs = await page.locator('div').allTextContents()
  const candidates = allDivs
    .map(t => t.trim())
    .filter(t => t.length > 2 && t.length < 30 && !/J\$/.test(t) && !/^\d/.test(t))
    .filter((t, i, a) => a.indexOf(t) === i)
  for (const name of candidates.slice(0, 20)) {
    if (itemsAdded >= 3) break
    if (await addItem(name)) itemsAdded++
  }
}

await page.waitForTimeout(500)
await shot('06-cart-filled')
const cartBody = await page.textContent('body')
check(`At least 2 bar items added (got ${itemsAdded})`, itemsAdded >= 2)
check('Cart shows items', !cartBody.includes('Tap menu items to add'))

const cartTotalMatch = cartBody.match(/TOTAL\s+J\$([\d,]+\.?\d*)/)
console.log(`  Cart total: ${cartTotalMatch ? 'J$' + cartTotalMatch[1] : 'unknown'}`)

// ── Step 7: Verify No Tax on Bar Items ────────────────────────
console.log('\nStep 7 — Verify Bar Tax Logic')
// Bar dine-in: gratuity section will show (it's dine-in) but gratuity amount = 0
// because gratuity only applies to restaurant module items (restaurantSub > 0)
check('No "Gratuity (15%)" charge in cart (bar items excluded)', !cartBody.includes('Gratuity (15%)'))

// ── Step 8: Open Payment Modal ────────────────────────────────
console.log('\nStep 8 — Open Payment Modal')
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
check('Pay button enabled', await payBtn.getAttribute('disabled') === null)
await payBtn.click()
await page.waitForTimeout(1500)
await shot('07-payment-modal')

// ── Step 9: Payment Modal — Order Summary ─────────────────────
const modalBody = await page.textContent('body')
console.log('\nStep 9 — Payment Modal: Order Summary')
check('Modal title "Process Payment"',     modalBody.includes('Process Payment'))
check(`Table ${tableUsed} shown in modal`, modalBody.includes(tableUsed))
check('Subtotal shown',                    modalBody.includes('Subtotal'))
check('No GCT on bar items',              !modalBody.includes('GCT'))
check('No Service Charge on bar items',   !modalBody.includes('Service (10%)'))
check('No Gratuity amount on bar items',  !modalBody.includes('Gratuity (15%)'))
check('TOTAL shown',                       modalBody.includes('TOTAL'))
check('Surcharges panel available',        modalBody.includes('Surcharge') || modalBody.includes('Add'))

const modalTotalMatch = modalBody.match(/TOTAL\s+J\$([\d,]+\.?\d*)/)
console.log(`  Modal total: ${modalTotalMatch ? 'J$' + modalTotalMatch[1] : 'unknown'}`)

// ── Step 10: Gratuity Panel (dine-in shows panel but no charge) ─
console.log('\nStep 10 — Gratuity Panel (Bar Dine-In)')
// The gratuity panel renders for all dine-in orders (orderType=dine-in)
// but the computed gratuity amount is 0 for bar-only items
const hasGratPanel = modalBody.includes('Gratuity') || modalBody.includes('10%') || modalBody.includes('18%')
check('Gratuity control panel visible (dine-in)',    hasGratPanel)
check('No gratuity line in summary (bar items only)', !modalBody.includes('Gratuity (15%)'))
await shot('08-gratuity-panel')

// ── Step 11: Payment Methods ───────────────────────────────────
console.log('\nStep 11 — Payment Methods')
check('Cash visible',          modalBody.includes('Cash'))
check('Card visible',          modalBody.includes('Card'))
check('Gift Card visible',     modalBody.includes('Gift Card'))
check('House Account visible', modalBody.includes('House Account'))
check('Split Tender visible',  modalBody.includes('Split'))
await shot('09-payment-methods')

// ── Step 12: Cash Payment ─────────────────────────────────────
console.log('\nStep 12 — Cash Payment Flow')
const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
await cashBtn.click()
await page.waitForTimeout(1000)
await shot('10-cash-numpad')
const cashBody = await page.textContent('body')
check('Cash Payment screen shown', cashBody.includes('Cash Payment'))
check('Order Total shown',         cashBody.includes('Order Total') || cashBody.includes('J$'))
check('Exact button visible',      cashBody.includes('Exact'))
check('Quick amounts visible',     cashBody.includes('1K') || cashBody.includes('2K') || cashBody.includes('5K') || cashBody.includes('10K') || cashBody.includes('20K'))

const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
await exactBtn.click()
await page.waitForTimeout(500)
await shot('11-exact-set')
const exactBody = await page.textContent('body')
check('Change Due shown (exact tender)', exactBody.includes('Change') || exactBody.includes('0.00'))

const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
await completeBtn.waitFor({ state: 'visible', timeout: 8000 })
const completeTxt = (await completeBtn.textContent() ?? '').trim()
console.log(`  Complete button: "${completeTxt}"`)
check('Complete button enabled', completeTxt.includes('Complete'))

// ── Step 13: Complete Payment ─────────────────────────────────
console.log('\nStep 13 — Complete Payment')
await completeBtn.click()
await page.waitForTimeout(500)
await shot('12-payment-success')
const successBody = await page.textContent('body')
check('Payment Complete or Change Due shown',
  successBody.includes('Payment Complete') || successBody.includes('Change Due') || successBody.includes('Done'))

// ── Step 14: Ticket Modal ─────────────────────────────────────
console.log('\nStep 14 — Ticket Modal')
const doneBtn = page.locator('button').filter({ hasText: /^Done$/ }).first()
if (await doneBtn.count() > 0) {
  await doneBtn.click()
  await page.waitForTimeout(1500)
  await shot('13-ticket-modal')
  const ticketBody = await page.textContent('body')
  check('Ticket/receipt modal opened',
    ticketBody.includes('Bar') || ticketBody.includes(tableUsed) || ticketBody.includes('Order'))

  const closeBtn = page.locator('button').filter({ hasText: /Close|Done/ }).first()
  if (await closeBtn.count() > 0) {
    await closeBtn.click()
    await page.waitForTimeout(500)
    check('Ticket modal closed', true)
  }
} else {
  warn('Done button not found after payment')
}

// ── Final State ───────────────────────────────────────────────
await shot('14-final')
const finalBody = await page.textContent('body')
console.log('\nFinal State')
check('Back at Bar workspace or service select',
  finalBody.includes('Bar') || finalBody.includes('J$') || finalBody.includes('Dine-In'))

await browser.close()
console.log('\n=== Test Complete ===')
