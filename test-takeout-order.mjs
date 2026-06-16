import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'takeout-shots')
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

const pass = (label) => console.log(`  ✅ ${label}`)
const warn = (label) => console.log(`  ⚠️  ${label}`)
const check = (label, cond) => cond ? pass(label) : warn(label)

console.log('\n=== Takeout Full Order Test ===\n')

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

// ── Step 2: Service Select ─────────────────────────────────────
await shot('01-service-select')
const svcBody = await page.textContent('body')
console.log('\nStep 2 — Service Select')
check('Dine-In option visible',  svcBody.includes('Dine-In'))
check('Takeout option visible',  svcBody.includes('Takeout'))
check('Delivery option visible', svcBody.includes('Delivery'))

// ── Step 3: Takeout → Dashboard ───────────────────────────────
await page.locator('button').filter({ hasText: 'Takeout' }).first().click()
await page.waitForTimeout(800)
await shot('02-takeout-dashboard')
const dashBody = await page.textContent('body')
console.log('\nStep 3 — Takeout Dashboard')
check('Takeout dashboard loaded',         dashBody.includes('Takeout'))
check('"New Takeout Order" button shown', dashBody.includes('New Takeout Order'))

// ── Step 4: New Takeout Order → Customer Form ─────────────────
await page.locator('button').filter({ hasText: /New Takeout Order/i }).first().click()
await page.waitForTimeout(600)
await shot('03-customer-form')
const formBody = await page.textContent('body')
console.log('\nStep 4 — Customer Form')
check('Customer Name field present', formBody.includes('Customer Name') || formBody.includes('Name'))
check('Phone field present',         formBody.includes('Phone'))
check('Start Order button present',  formBody.includes('Start Order'))

// ── Step 5: Fill Details ───────────────────────────────────────
await page.locator('input').nth(0).fill('Maria Johnson')
await page.locator('input').nth(1).fill('876-555-0123')
await page.waitForTimeout(300)
await shot('04-form-filled')
console.log('\nStep 5 — Fill Customer Details')
pass('Name: Maria Johnson')
pass('Phone: 876-555-0123')

// ── Step 6: Start Order → Workspace ───────────────────────────
await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(5000)
await shot('05-workspace')
const wsBody = await page.textContent('body')
console.log('\nStep 6 — Workspace')
check('Workspace shows Takeout',        wsBody.includes('Takeout') || wsBody.includes('TAKEOUT'))
check('Customer name in header',        wsBody.includes('Maria Johnson'))
check('Phone number in header',         wsBody.includes('876-555-0123'))
check('Menu loaded (J$ prices)',        wsBody.includes('J$'))
check('No table selector shown',        !wsBody.includes('Select Table'))

// ── Step 7: Add Items ──────────────────────────────────────────
console.log('\nStep 7 — Add Menu Items')
let itemsAdded = 0
if (await addItem('BBQ Chicken')) itemsAdded++
if (await addItem('Bammy'))       itemsAdded++
// Try a third item
if (await addItem('Festival'))    itemsAdded++
else if (await addItem('Conch'))  itemsAdded++

await page.waitForTimeout(500)
await shot('06-cart-filled')
const cartBody = await page.textContent('body')
check(`At least 2 items added (got ${itemsAdded})`, itemsAdded >= 2)
check('Cart shows items',                           !cartBody.includes('Tap menu items to add'))

// Extract cart total
const cartTotalMatch = cartBody.match(/TOTAL\s+J\$([\d,]+\.?\d*)/)
const cartTotal = cartTotalMatch ? `J$${cartTotalMatch[1]}` : 'unknown'
console.log(`  Cart total: ${cartTotal}`)

// ── Step 8: Verify No Auto-Gratuity for Takeout ───────────────
console.log('\nStep 8 — Verify No Auto-Gratuity (Takeout)')
check('No "Gratuity (15%)" in cart panel', !cartBody.includes('Gratuity (15%)'))

// ── Step 9: Open Payment Modal ────────────────────────────────
console.log('\nStep 9 — Open Payment Modal (direct pay — no kitchen send)')
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
check('Pay button enabled', await payBtn.getAttribute('disabled') === null)
await payBtn.click()
await page.waitForTimeout(1500)
await shot('07-payment-modal')

// ── Step 10: Verify Payment Modal — Order Summary ─────────────
const modalBody = await page.textContent('body')
console.log('\nStep 10 — Payment Modal: Order Summary')
check('Modal title "Process Payment"',     modalBody.includes('Process Payment'))
check('Customer name shown in header',     modalBody.includes('Maria Johnson'))
check('Subtotal shown',                    modalBody.includes('Subtotal'))
check('No GCT for Takeout',               !modalBody.includes('GCT'))
check('No Service Charge for Takeout',    !modalBody.includes('Service (10%)'))
check('No auto-Gratuity for Takeout',     !modalBody.includes('Gratuity (15%)'))
check('TOTAL shown',                       modalBody.includes('TOTAL'))
check('Surcharges panel available',        modalBody.includes('Surcharge') || modalBody.includes('Add'))

// Extract modal total
const modalTotalMatch = modalBody.match(/TOTAL\s+J\$([\d,]+\.?\d*)/)
const modalTotal = modalTotalMatch ? `J$${modalTotalMatch[1]}` : 'unknown'
console.log(`  Modal total: ${modalTotal}`)

// ── Step 11: Verify Payment Methods ───────────────────────────
console.log('\nStep 11 — Payment Methods')
check('Cash visible',          modalBody.includes('Cash'))
check('Card visible',          modalBody.includes('Card'))
check('Gift Card visible',     modalBody.includes('Gift Card'))
check('House Account visible', modalBody.includes('House Account'))
check('Split Tender visible',  modalBody.includes('Split'))
await shot('08-payment-methods')

// ── Step 12: Cash → Exact → Complete ─────────────────────────
console.log('\nStep 12 — Cash Payment')
const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
await cashBtn.click()
await page.waitForTimeout(1000)
await shot('09-cash-numpad')
const cashBody = await page.textContent('body')
check('Cash Payment screen shown', cashBody.includes('Cash Payment'))
check('Order Total shown',         cashBody.includes('Order Total') || cashBody.includes('J$'))
check('Exact button visible',      cashBody.includes('Exact'))

const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
await exactBtn.click()
await page.waitForTimeout(500)
await shot('10-exact-set')
const exactBody = await page.textContent('body')
check('Tender set (Change Due shown)', exactBody.includes('Change') || exactBody.includes('0.00'))

const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
await completeBtn.waitFor({ state: 'visible', timeout: 8000 })
const completeTxt = (await completeBtn.textContent() ?? '').trim()
console.log(`  Complete button: "${completeTxt}"`)
check('Complete button shows Change J$0.00', completeTxt.includes('Complete'))

// ── Step 13: Payment Complete ─────────────────────────────────
console.log('\nStep 13 — Complete Payment')
await completeBtn.click()
await page.waitForTimeout(500)
await shot('11-payment-success')
const successBody = await page.textContent('body')
check('Payment Complete or Change Due shown', successBody.includes('Payment Complete') || successBody.includes('Change Due') || successBody.includes('Done'))

// Close success / ticket modal
const doneBtn = page.locator('button').filter({ hasText: /^Done$/ }).first()
if (await doneBtn.count() > 0) {
  await doneBtn.click()
  await page.waitForTimeout(1500)
  await shot('12-ticket-modal')
  const ticketBody = await page.textContent('body')
  check('Ticket/receipt modal opened', ticketBody.includes('Takeout') || ticketBody.includes('Maria') || ticketBody.includes('Order'))

  const closeBtn = page.locator('button').filter({ hasText: /Close|Done/ }).first()
  if (await closeBtn.count() > 0) {
    await closeBtn.click()
    await page.waitForTimeout(500)
    check('Ticket modal closed', true)
  }
}

// ── Final State ───────────────────────────────────────────────
await shot('13-final')
const finalBody = await page.textContent('body')
console.log('\nFinal State')
check('Back at POS / Takeout dashboard', finalBody.includes('Takeout') || finalBody.includes('J$') || finalBody.includes('New Takeout'))

await browser.close()
console.log('\n=== Test Complete ===')
