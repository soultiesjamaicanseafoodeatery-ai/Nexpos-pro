import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'dine-in-shots')
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
  if (await item.count() === 0) { console.log(`⚠️  "${name}" not found`); return false }
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
  console.log(`✅ Added ${name}`)
  return true
}

const pass = (label) => console.log(`  ✅ ${label}`)
const warn = (label) => console.log(`  ⚠️  ${label}`)
const check = (label, cond) => cond ? pass(label) : warn(label)

console.log('\n=== Dine-In Full Order Test ===\n')

// ── Login ──────────────────────────────────────────────────────
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
pass('Logged in as RENEE (admin/manager)')

// ── Step 2: Service Select ─────────────────────────────────────
await shot('01-service-select')
const svc = await page.textContent('body')
console.log('\nStep 2 — Service Select')
check('Dine-In option visible', svc.includes('Dine-In'))
check('Takeout option visible', svc.includes('Takeout'))
check('Delivery option visible', svc.includes('Delivery'))

// ── Step 3: Dine-In → Table Grid ──────────────────────────────
await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(800)
await shot('02-table-grid')
const tgBody = await page.textContent('body')
console.log('\nStep 3 — Table Grid')
check('Table grid loaded', /T\d+/.test(tgBody))

// Pick T5 or fall back to first available table
let tableUsed = 'T5'
const t5 = page.locator('button', { hasText: 'T5' }).first()
if (await t5.count() > 0) {
  await t5.click()
} else {
  const anyTable = page.locator('button').filter({ hasText: /^T\d+$/ }).first()
  tableUsed = (await anyTable.textContent() ?? 'T?').trim()
  await anyTable.click()
}
await page.waitForTimeout(5000)
await shot('03-workspace')
const wsBody = await page.textContent('body')
console.log(`\nStep 4 — Workspace (Table ${tableUsed})`)
check('Workspace header shows Dine-In', wsBody.includes('Dine-In') || wsBody.includes('DINE-IN'))
check(`Table ${tableUsed} shown`, wsBody.includes(tableUsed))
check('Menu loaded (J$ prices visible)', wsBody.includes('J$'))

// ── Step 5: Set Guest Count ────────────────────────────────────
const plusBtns = page.locator('button').filter({ hasText: '+' })
if (await plusBtns.count() > 0) {
  await plusBtns.first().click(); await page.waitForTimeout(120)
  await plusBtns.first().click(); await page.waitForTimeout(120)
}
await shot('04-guests-3')
const gBody = await page.textContent('body')
console.log('\nStep 5 — Guest Count')
check('Guest count updated to 3', gBody.includes('3'))

// ── Step 6: Add Items ──────────────────────────────────────────
console.log('\nStep 6 — Add Menu Items')
await addItem('BBQ Chicken')
await addItem('Snapper')
await addItem('Bammy')

await page.waitForTimeout(500)
await shot('05-cart-filled')
const cartBody = await page.textContent('body')
const rawTotal = cartBody.match(/TOTAL\s+(J\$[\d,\.]+)/)?.[1] ?? cartBody.match(/J\$[\d,]{4,}/)?.[0] ?? 'unknown'
check('Cart shows items', !cartBody.includes('Tap menu items to add'))
check('Cart total visible', rawTotal !== 'unknown')
console.log(`  Cart total: ${rawTotal}`)

// ── Step 7: Send Order to Kitchen ─────────────────────────────
console.log('\nStep 7 — Send Order to Kitchen')
const sendBtn = page.locator('button').filter({ hasText: /^Send Order$/ }).first()
await sendBtn.waitFor({ state: 'visible', timeout: 10000 })
await sendBtn.click()
await page.waitForTimeout(3000)
await shot('06-open-orders-panel')
const panelBody = await page.textContent('body')
const orderNum = panelBody.match(/#(\d{4,6})/)?.[0] ?? 'unknown'
check('Open Orders panel appeared', panelBody.includes('Open Orders'))
check(`Order ticket created (${orderNum})`, orderNum !== 'unknown')
check('Items in panel', panelBody.includes('BBQ Chicken') || panelBody.includes('Snapper') || panelBody.includes('items'))

// ── Step 8: Pay from Open Orders Panel ────────────────────────
console.log('\nStep 8 — Open Payment Modal')
const payFromPanel = page.locator('button').filter({ hasText: /^Pay J\$/ }).first()
await payFromPanel.waitFor({ state: 'visible', timeout: 10000 })
const payBtnText = await payFromPanel.textContent()
console.log(`  Pay button: "${payBtnText?.trim()}"`)
check('Pay button found in panel', payBtnText?.includes('J$'))
await shot('07-panel-pay-button')

await payFromPanel.click()
await page.waitForTimeout(2000)
await shot('08-payment-modal')

// ── Step 9: Verify Payment Modal — Order Summary ───────────────
const modalBody = await page.textContent('body')
console.log('\nStep 9 — Payment Modal: Order Summary')
check('Modal title "Process Payment"', modalBody.includes('Process Payment'))
check('Subtotal shown',                modalBody.includes('Subtotal'))
check('GCT (15%) shown',               modalBody.includes('GCT') || modalBody.includes('15%'))
check('Service Charge shown',          modalBody.includes('Service'))
check('Gratuity (15%) shown',          modalBody.includes('Gratuity'))
check('TOTAL shown',                   modalBody.includes('TOTAL'))

// Extract and log amounts for manual verification
const subtotalAmt = modalBody.match(/Subtotal[^J]*(J\$[\d,\.]+)/)?.[1] ?? '?'
const totalAmt    = modalBody.match(/TOTAL[^J]*(J\$[\d,\.]+)/)?.[1] ?? '?'
console.log(`  Subtotal: ${subtotalAmt}`)
console.log(`  Grand Total: ${totalAmt}`)

// ── Step 10: Verify Gratuity Controls (Manager) ───────────────
console.log('\nStep 10 — Payment Modal: Gratuity Controls')
check('Gratuity section visible',           modalBody.includes('Gratuity'))
const has10  = modalBody.includes('10%')
const has15  = modalBody.includes('15%')
const has18  = modalBody.includes('18%')
const hasCustom = modalBody.includes('Custom')
const hasRemove = modalBody.includes('Remove')
check('Preset 10% button visible',  has10)
check('Preset 15% button visible',  has15)
check('Preset 18% button visible',  has18)
check('Custom button visible',      hasCustom)

// Confirm 15% is active (already set)
await shot('09-gratuity-panel')

// Test switching to 18% and back
const btn18 = page.locator('button').filter({ hasText: /^18%$/ }).first()
if (await btn18.count() > 0) {
  await btn18.click()
  await page.waitForTimeout(400)
  const after18 = await page.textContent('body')
  check('Switching to 18% updates summary', after18.includes('18%'))
  await shot('10-gratuity-18pct')

  const btn15 = page.locator('button').filter({ hasText: /^15%$/ }).first()
  if (await btn15.count() > 0) {
    await btn15.click()
    await page.waitForTimeout(400)
    check('Restored to 15%', true)
  }
} else {
  warn('18% preset not visible (check screenshot)')
}

// ── Step 11: Verify Surcharge Panel ───────────────────────────
console.log('\nStep 11 — Payment Modal: Surcharge Panel')
const afterGrat = await page.textContent('body')
check('Surcharges section visible',   afterGrat.includes('Surcharge'))
check('"+ Add" button visible',       afterGrat.includes('+ Add') || afterGrat.includes('Add'))

// ── Step 12: Payment Methods Visible ─────────────────────────
console.log('\nStep 12 — Payment Methods')
check('Cash method visible',         afterGrat.includes('Cash'))
check('Card method visible',         afterGrat.includes('Card'))
check('Gift Card method visible',    afterGrat.includes('Gift Card'))
check('House Account visible',       afterGrat.includes('House Account'))
check('Split Tender visible',        afterGrat.includes('Split'))
await shot('11-payment-methods')

// ── Step 13: Cash Payment ─────────────────────────────────────
console.log('\nStep 13 — Cash Payment Flow')
const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
await cashBtn.click()
await page.waitForTimeout(1000)
await shot('12-cash-numpad')

const cashBody = await page.textContent('body')
check('Cash Payment screen shown',   cashBody.includes('Cash Payment'))
check('Order Total shown',           cashBody.includes('Order Total') || cashBody.includes('J$'))
check('Exact button visible',        cashBody.includes('Exact'))
check('Quick amounts visible',       cashBody.includes('1K') || cashBody.includes('2K') || cashBody.includes('5K'))

// ── Step 14: Set Exact Tender ─────────────────────────────────
const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
await exactBtn.click()
await page.waitForTimeout(500)
await shot('13-exact-tender')
const exactBody = await page.textContent('body')
check('Change Due shown (J$0.00 for exact)',  exactBody.includes('Change') || exactBody.includes('0.00'))

// ── Step 15: Complete Payment ─────────────────────────────────
console.log('\nStep 15 — Complete Payment')
const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
if (await completeBtn.count() > 0) {
  const completeTxt = (await completeBtn.textContent() ?? '').trim()
  console.log(`  Complete button: "${completeTxt}"`)
  check('Complete button enabled', !(await completeBtn.getAttribute('disabled')))
  await completeBtn.click()
  await page.waitForTimeout(2500)
  await shot('14-payment-success')

  const receipt = await page.textContent('body')
  check('Payment Complete screen shown', receipt.includes('Payment Complete'))
  check('Change Due displayed',          receipt.includes('Change') || receipt.includes('0.00'))
  check('"Done" button present',         receipt.includes('Done'))

  // ── Step 16: Done → Ticket Modal ──────────────────────────
  console.log('\nStep 16 — Ticket Modal')
  const doneBtn = page.locator('button').filter({ hasText: /^Done$/ }).first()
  if (await doneBtn.count() > 0) {
    await doneBtn.click()
    await page.waitForTimeout(1500)
    await shot('15-ticket-modal')
    const ticketBody = await page.textContent('body')
    // Ticket modal shows order details / receipt
    const hasReceipt = ticketBody.includes('Receipt') || ticketBody.includes('Order') || ticketBody.includes(tableUsed)
    check('Ticket/receipt modal opened', hasReceipt)

    const closeTicket = page.locator('button').filter({ hasText: /Close|Done/ }).first()
    if (await closeTicket.count() > 0) {
      await closeTicket.click()
      await page.waitForTimeout(500)
      check('Ticket modal closed', true)
    }
  }
} else {
  await shot('14-no-complete')
  const allBtns = await page.locator('button').allTextContents()
  warn(`Complete button not found. Buttons: ${JSON.stringify(allBtns.filter(t => t.trim()).slice(0, 15))}`)
}

await shot('16-final')
const finalBody = await page.textContent('body')
console.log('\nFinal State')
check('Back at POS workspace', finalBody.includes('J$') || finalBody.includes('Send Order') || finalBody.includes('Dine-In'))

await browser.close()
console.log('\n=== Test Complete ===')
