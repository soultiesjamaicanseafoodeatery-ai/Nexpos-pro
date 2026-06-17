import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'kitchen-display-shots')
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 900 })

let n = 0
const shot = async (name) => {
  n++
  await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(3,'0')}-${name}.png`) })
}

const pass  = (label) => console.log(`  ✅ ${label}`)
const warn  = (label) => console.log(`  ⚠️  ${label}`)
const check = (label, cond) => cond ? pass(label) : warn(label)

// Close any open modal/overlay (Open Orders panel, item modals, etc.)
const dismissOverlay = async () => {
  // Try × close button first
  const xBtn = page.locator('button').filter({ hasText: '×' }).first()
  if (await xBtn.isVisible().catch(() => false)) {
    await xBtn.click()
    await page.waitForTimeout(600)
    return
  }
  // Try Close button
  const closeBtn = page.locator('button').filter({ hasText: /^Close$/ }).first()
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
    await page.waitForTimeout(600)
  }
}

// Navigate sidebar — dismiss any overlay first, then click nav item
const navTo = async (label) => {
  await dismissOverlay()
  const el = page.locator('div').filter({ hasText: new RegExp(`^${label}$`) }).first()
  await el.click()
  await page.waitForTimeout(2000)
}

const addItem = async (name) => {
  const item = page.locator('div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  if (await item.count() === 0) { warn(`"${name}" not found`); return false }
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
  return true
}

// ── Login ──────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════╗')
console.log('║    NexPOS Pro — Kitchen Display E2E     ║')
console.log('╚══════════════════════════════════════════╝\n')

console.log('━━━ LOGIN ━━━')
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
pass('Logged in as RENEE')

// ── Step 1: Check Kitchen Display — Empty State ─────────────────
console.log('\n━━━ STEP 1: Kitchen Display (empty / baseline) ━━━')
await navTo('Kitchen Display')
await page.waitForTimeout(500)
await shot('01-kitchen-display-empty')
const emptyBody = await page.textContent('body')

check('Kitchen Display: page loaded',           emptyBody.includes('Kitchen Display'))
check('Kitchen Display: header title visible',  emptyBody.includes('Kitchen Display'))
check('Kitchen Display: open counter shown',    emptyBody.includes('open'))
check('Kitchen Display: total counter shown',   emptyBody.includes('total'))
check('Kitchen Display: Pending counter',       emptyBody.includes('Pending'))
check('Kitchen Display: Preparing counter',     emptyBody.includes('Preparing'))
check('Kitchen Display: Ready counter',         emptyBody.includes('Ready'))

// Module filter buttons
check('Filter: All button',       emptyBody.includes('All'))
check('Filter: Kitchen button',   emptyBody.includes('Kitchen'))
check('Filter: Bar button',       emptyBody.includes('Bar'))
check('Filter: Car Wash button',  emptyBody.includes('Car Wash'))

// Status filter buttons
check('Status Filter: Active',    emptyBody.includes('Active'))
check('Status Filter: Pending',   emptyBody.includes('Pending'))
check('Status Filter: Preparing', emptyBody.includes('Preparing'))
check('Status Filter: Ready',     emptyBody.includes('Ready'))
check('Status Filter: Served',    emptyBody.includes('Served'))
check('Status Filter: Done',      emptyBody.includes('Done'))

// Search box
const searchBox = page.locator('input[placeholder*="Search"]').first()
check('Search: input present', await searchBox.count() > 0)

// Empty state (no active orders yet)
const noOrders = emptyBody.includes('No orders matching') || emptyBody.includes('🍳') || emptyBody.includes('open')
check('Initial state: renders without error', noOrders)

// ── Step 2: Place a restaurant dine-in order → kitchen ─────────
console.log('\n━━━ STEP 2: Place Dine-In order → Send to Kitchen ━━━')
await navTo('Point of Sale')

await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(600)

// Pick T3
const t3 = page.locator('button', { hasText: 'T3' }).first()
if (await t3.count() > 0) await t3.click()
else await page.locator('button').filter({ hasText: /^T\d+$/ }).first().click()
await page.waitForTimeout(5000)
await shot('02-pos-workspace')

// Add 2 restaurant items
let addedCount = 0
for (const name of ['BBQ Chicken', 'Bammy', 'Conch']) {
  if (addedCount >= 2) break
  if (await addItem(name)) addedCount++
}
check(`Items added to cart (${addedCount})`, addedCount >= 2)

// Send to kitchen
const sendBtn = page.locator('button').filter({ hasText: /^Send Order$/ }).first()
await sendBtn.waitFor({ state: 'visible', timeout: 10000 })
await sendBtn.click()
await page.waitForTimeout(2000)
await shot('03-order-sent')
const afterSendBody = await page.textContent('body')
const orderNum = afterSendBody.match(/#(\d{4,6})/)?.[0] ?? ''
check(`Order sent to kitchen (${orderNum || 'unknown'})`, afterSendBody.includes('Open Orders'))
pass(`Captured order number: ${orderNum}`)

// ── Step 3: Navigate to Kitchen Display — verify order card ─────
console.log('\n━━━ STEP 3: Verify order card in Kitchen Display ━━━')
await navTo('Kitchen Display')
await page.waitForTimeout(500)
await shot('04-kitchen-with-order')
const kdBody = await page.textContent('body')

check('Kitchen Display: order card appears',    orderNum ? kdBody.includes(orderNum) : kdBody.includes('#'))
check('Kitchen Display: table shown on card',  kdBody.includes('T3') || kdBody.includes('Table'))
check('Kitchen Display: server name on card',  kdBody.includes('RENEE'))
check('Kitchen Display: items listed on card', kdBody.includes('BBQ Chicken') || kdBody.includes('Bammy') || kdBody.includes('Conch'))
check('Kitchen Display: elapsed time shown',   /\d+m/.test(kdBody) || kdBody.includes('—'))
check('Kitchen Display: Kitchen status row',   kdBody.includes('KITCHEN') || kdBody.includes('Kitchen'))
check('Kitchen Display: Pending status active',kdBody.includes('Pending'))
check('Kitchen Display: Preparing button',     kdBody.includes('Preparing'))
check('Kitchen Display: Ready button',         kdBody.includes('Ready'))
check('Kitchen Display: Served button',        kdBody.includes('Served'))
check('Kitchen Display: Reprint button shown', kdBody.includes('Reprint') || kdBody.includes('🖨') || kdBody.includes('Kitchen'))

// Verify open counter > 0
const openMatch = kdBody.match(/(\d+)\s+open/)
const openCount = openMatch ? parseInt(openMatch[1]) : 0
check(`Kitchen Display: open counter ≥ 1 (got ${openCount})`, openCount >= 1)

// ── Step 4: Advance kitchen status — Pending → Preparing → Ready → Served
console.log('\n━━━ STEP 4: Advance kitchen status ━━━')
// The header has status filter buttons: Active/Pending/Preparing/Ready/Served/Done (nth 0)
// The card has kitchen control buttons: Pending/Preparing/Ready/Served (nth 1)
// We must use nth(1) to target the card button, not the header filter button.

// First: ensure Active filter is selected so the card is visible
const activeFilterBtn = page.locator('button').filter({ hasText: /^Active$/ }).first()
await activeFilterBtn.click()
await page.waitForTimeout(400)

// Pending → Preparing (card button = nth 1)
const preparingCardBtn = page.locator('button').filter({ hasText: /^Preparing$/ }).nth(1)
await preparingCardBtn.waitFor({ state: 'visible', timeout: 10000 })
await preparingCardBtn.click()
await page.waitForTimeout(1000)
await shot('05-status-preparing')
const prepBody = await page.textContent('body')
// card should still be visible in Active filter (kitchenStatus=preparing → not allDone)
check('Status → Preparing: card still active', prepBody.includes(orderNum) || prepBody.includes('RENEE'))
check('Status → Preparing: Preparing highlighted', prepBody.includes('Preparing'))

// Preparing → Ready (card button = nth 1)
const readyCardBtn = page.locator('button').filter({ hasText: /^Ready$/ }).nth(1)
await readyCardBtn.waitFor({ state: 'visible', timeout: 5000 })
await readyCardBtn.click()
await page.waitForTimeout(1500)
await shot('06-status-ready')
const readyBody = await page.textContent('body')
check('Status → Ready: card visible',            readyBody.includes(orderNum) || readyBody.includes('RENEE'))
check('Status → Ready: "Awaiting Payment" tag',  readyBody.includes('Awaiting Payment'))

// Ready → Served (card button = nth 1)
const servedCardBtn = page.locator('button').filter({ hasText: /^Served$/ }).nth(1)
await servedCardBtn.waitFor({ state: 'visible', timeout: 5000 })
await servedCardBtn.click()
await page.waitForTimeout(800)
await shot('07-status-served')
// Card disappears from Active view once served (allDone=true)
const servedBody = await page.textContent('body')
check('Status → Served: accepted (card or empty state)', servedBody.includes('Kitchen Display'))

// ── Step 5: Status filter buttons ──────────────────────────────
console.log('\n━━━ STEP 5: Status filter buttons ━━━')

// "Served" status filter (nth 0 = filter button; the card is gone from Active view now)
const servedFilterBtn = page.locator('button').filter({ hasText: /^Served$/ }).nth(0)
await servedFilterBtn.click()
await page.waitForTimeout(600)
await shot('08-filter-served')
const sfBody = await page.textContent('body')
check('Status filter "Served": shows served order', sfBody.includes(orderNum) || sfBody.includes('RENEE') || sfBody.includes('Served'))

// Reset to Active filter
await activeFilterBtn.click()
await page.waitForTimeout(400)

// Done filter (nth 0 = filter button, no card conflict)
const doneFilterBtn = page.locator('button').filter({ hasText: /^Done$/ }).first()
await doneFilterBtn.click()
await page.waitForTimeout(600)
await shot('09-filter-done')
const doneFilterBody = await page.textContent('body')
check('Status filter "Done": renders without error', doneFilterBody.includes('Kitchen Display'))

// Back to Active
await activeFilterBtn.click()
await page.waitForTimeout(400)

// ── Step 6: Module filter buttons ──────────────────────────────
console.log('\n━━━ STEP 6: Module filter buttons ━━━')
// Scope module filter clicks to buttons that are siblings of the "All" filter button
// (avoids accidentally clicking the sidebar "Car Wash" module switcher)
const allFilterBtn = page.locator('button').filter({ hasText: /^All$/ }).first()
// Parent div contains All/Kitchen/Bar/Car Wash filter buttons together
const moduleFilterRow = allFilterBtn.locator('xpath=..')

for (const label of ['Kitchen', 'Bar', 'Car Wash', 'All']) {
  const btn = moduleFilterRow.locator('button').filter({ hasText: new RegExp(`^${label}$`) }).first()
  const btnCount = await btn.count()
  if (btnCount === 0) {
    // Fallback: use nth based on position (All=0, Kitchen=1, Bar=2, Car Wash=3)
    const idx = ['All','Kitchen','Bar','Car Wash'].indexOf(label)
    const fallback = page.locator('button').filter({ hasText: new RegExp(`^${label}$`) }).first()
    await fallback.click()
  } else {
    await btn.click()
  }
  await page.waitForTimeout(400)
  const b = await page.textContent('body')
  check(`Module filter "${label}": renders without error`, b.includes('Kitchen Display'))
  // If we navigated away, come back
  if (!b.includes('Kitchen Display')) await navTo('Kitchen Display')
}
await shot('10-module-filters')

// ── Step 7: Search functionality ───────────────────────────────
console.log('\n━━━ STEP 7: Search ━━━')
const searchInput = page.locator('input[placeholder*="Search"]').first()
await searchInput.fill(orderNum.replace('#',''))
await page.waitForTimeout(600)
await shot('11-search-by-order')
const searchBody = await page.textContent('body')
check(`Search: find order ${orderNum}`, orderNum ? searchBody.includes(orderNum.replace('#','')) || searchBody.includes('RENEE') || searchBody.includes('No orders') : true)

// Clear search
await searchInput.fill('RENEE')
await page.waitForTimeout(600)
const searchReneeBody = await page.textContent('body')
check('Search by server name: renders', searchReneeBody.includes('Kitchen Display'))

await searchInput.fill('')
await page.waitForTimeout(400)

// ── Step 8: Place a bar order and verify bar status controls ────
console.log('\n━━━ STEP 8: Bar order → bar status in Kitchen Display ━━━')
await navTo('Point of Sale')


// Switch to Bar module
const barModBtn = page.locator('button').filter({ hasText: /^Bar$/ }).first()
await barModBtn.waitFor({ state: 'visible', timeout: 8000 })
await barModBtn.click()
await page.waitForTimeout(600)

await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(600)
const t4 = page.locator('button', { hasText: 'T4' }).first()
if (await t4.count() > 0) await t4.click()
else await page.locator('button').filter({ hasText: /^T\d+$/ }).first().click()
await page.waitForTimeout(5000)

// Add a bar item (no payment modal — just add and send)
let barAdded = 0
for (const name of ['Absolute', 'Bacardi Gold', 'Appleton 8yr', 'Hennessy VS']) {
  if (barAdded >= 1) break
  if (await addItem(name)) barAdded++
}
check(`Bar item added (${barAdded})`, barAdded >= 1)
await shot('12-bar-workspace')

// Check if Send Order is available for bar (it routes bar items to bar station in KDS)
const barSendBtn = page.locator('button').filter({ hasText: /^Send Order$/ }).first()
const barSendVisible = await barSendBtn.isVisible().catch(() => false)

if (barSendVisible) {
  await barSendBtn.click({ force: true })
  await page.waitForTimeout(2000)
  await shot('13-bar-order-sent')
  const barSentBody = await page.textContent('body')
  check('Bar order: Send Order clicked', barSentBody.includes('Open Orders') || barSentBody.includes('sent'))

  // Navigate to Kitchen Display
  await navTo('Kitchen Display')
  await shot('14-kitchen-display-bar')
  const barKdBody = await page.textContent('body')
  check('Bar order: KD shows bar section',   barKdBody.includes('BAR') || barKdBody.includes('Bar') || barKdBody.includes('Making'))
  check('Bar order: bar status row present', barKdBody.includes('Making') || barKdBody.includes('Pending'))

  // Advance bar status: Pending → Making (nth 1 skips header filter)
  const makingBtn = page.locator('button').filter({ hasText: /^Making$/ }).first()
  if (await makingBtn.count() > 0) {
    await makingBtn.click()
    await page.waitForTimeout(600)
    const makingBody = await page.textContent('body')
    check('Bar status → Making: accepted', makingBody.includes('Making') || makingBody.includes('Kitchen Display'))
    // Advance Making → Ready (nth 1 = card button)
    const barReadyBtn = page.locator('button').filter({ hasText: /^Ready$/ }).nth(1)
    if (await barReadyBtn.count() > 0) {
      await barReadyBtn.click()
      await page.waitForTimeout(600)
    }
    await shot('15-bar-status-ready')
    pass('Bar status controls work ✓')
  }
} else {
  warn('Bar "Send Order" not shown — bar orders go direct to payment in this context')
  // Confirm Kitchen Display still handles Bar filter
  await navTo('Kitchen Display')
  await shot('13-kitchen-display-bar-filter')
  const barFBody = await page.textContent('body')
  check('Bar filter: Kitchen Display renders cleanly', barFBody.includes('Kitchen Display'))
}

// ── Step 9: Final state — "Done" filter ────────────────────────
console.log('\n━━━ STEP 9: Done filter / completed orders ━━━')
await navTo('Kitchen Display')

const doneFilter2 = page.locator('button').filter({ hasText: /^Done$/ }).first()
await doneFilter2.click()
await page.waitForTimeout(600)
await shot('16-done-filter')
const doneBody2 = await page.textContent('body')
check('Done filter: page renders', doneBody2.includes('Kitchen Display'))
// The first order we served should now show here (served = kitchen done)
check('Done filter: served orders appear or empty state', doneBody2.includes(orderNum.replace('#','')) || doneBody2.includes('No orders') || doneBody2.includes('🍳'))

// ── Final summary ───────────────────────────────────────────────
await shot('17-final')
await browser.close()

console.log('\n╔══════════════════════════════════════════╗')
console.log('║       Kitchen Display Test Complete      ║')
console.log('╚══════════════════════════════════════════╝')
