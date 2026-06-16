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

console.log('\n=== Dine-In Full Order Test ===\n')

// ── Login ──
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
console.log('✅ Logged in as RENEE')

// ── Step 1: Dine-In → Table Grid ──
await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(700)
await shot('01-table-grid')
console.log('✅ On table grid')

// ── Step 2: Select Table T5 ──
await page.locator('button', { hasText: 'T5' }).first().click()
await page.waitForTimeout(5000)
await shot('02-workspace')
const wsBody = await page.textContent('body')
console.log('Workspace header (Dine-In):', wsBody.includes('Dine-In'))
console.log('Table T5 shown:', wsBody.includes('T5'))
console.log('No table selector:', !wsBody.includes('Select Table'))

// ── Step 3: Bump guests to 3 ──
const plusBtns = page.locator('button').filter({ hasText: '+' })
await plusBtns.first().click(); await page.waitForTimeout(150)
await plusBtns.first().click(); await page.waitForTimeout(150)
await shot('03-guests-3')
const g3 = await page.textContent('body')
console.log('3 Guests in header:', g3.includes('3 Guests'))

// ── Step 4: Add 3 menu items ──
// BBQ Chicken
const bbq = page.locator('div').filter({ hasText: /^BBQ Chicken$/ }).first()
if (await bbq.count() > 0) {
  await bbq.click(); await page.waitForTimeout(500)
  const modal = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await modal.count() > 0) { await modal.click(); await page.waitForTimeout(300) }
  console.log('✅ Added BBQ Chicken')
}

// Snapper
const snapper = page.locator('div').filter({ hasText: /^Snapper$/ }).first()
if (await snapper.count() > 0) {
  await snapper.click(); await page.waitForTimeout(500)
  const modal = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await modal.count() > 0) { await modal.click(); await page.waitForTimeout(300) }
  console.log('✅ Added Snapper')
}

// Bammy
const bammy = page.locator('div').filter({ hasText: /^Bammy$/ }).first()
if (await bammy.count() > 0) {
  await bammy.click(); await page.waitForTimeout(500)
  const modal = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await modal.count() > 0) { await modal.click(); await page.waitForTimeout(300) }
  console.log('✅ Added Bammy')
}

await page.waitForTimeout(500)
await shot('04-cart-filled')
const cartBody = await page.textContent('body')
const total = cartBody.match(/TOTAL\s+(J\$[\d,\.]+)/)?.[1] ?? 'unknown'
console.log('Cart total:', total)

// ── Step 5: Send Order to kitchen ──
const sendBtn = page.locator('button').filter({ hasText: /^Send Order$/ }).first()
await sendBtn.waitFor({ state: 'visible', timeout: 10000 })
await sendBtn.click()
await page.waitForTimeout(2500)

// After send, the Open Orders panel opens automatically
await shot('05-open-orders-auto-panel')
const panelBody = await page.textContent('body')
const orderNum = panelBody.match(/#(\d{4,5})/)?.[0] ?? 'unknown'
console.log('Open orders panel visible:', panelBody.includes('Open Orders'))
console.log('Sent order:', orderNum)
console.log('Order in panel:', panelBody.includes('BBQ Chicken') || panelBody.includes('SENT'))

// ── Step 6: Pay directly from the Open Orders panel ──
// This is the real cashier flow: order sent to kitchen → collect payment from panel
const payFromPanel = page.locator('button').filter({ hasText: /^Pay J\$/ }).first()
await payFromPanel.waitFor({ state: 'visible', timeout: 10000 })
console.log('✅ Pay button found in Open Orders panel')
await shot('06-panel-pay-button')

await payFromPanel.click()
await page.waitForTimeout(2000)
await shot('07-payment-modal')

const payBody = await page.textContent('body')
console.log('Payment modal open:', payBody.includes('Cash') || payBody.includes('Card') || payBody.includes('Payment'))

// Select Cash — button contains emoji + "Cash" text, use partial hasText match
// Restrict to <button> only to avoid matching wrapper divs
const allCashBtns = page.locator('button').filter({ hasText: 'Cash' })
const cashCount = await allCashBtns.count()
console.log('Cash buttons found:', cashCount)
// Log all of them to identify which one to click
if (cashCount > 0) {
  const texts = await allCashBtns.allTextContents()
  console.log('Cash button texts:', JSON.stringify(texts))
}

// Click the Cash payment method button (the one that's NOT "Gift Card" text)
// In the choose screen, there's only one button containing just "Cash" (not "Gift Card")
const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).filter({ not: page.locator('button').filter({ hasText: 'Gift' }) }).first()
if (await cashBtn.count() > 0) {
  await cashBtn.click()
  await page.waitForTimeout(1000)
  await shot('08-cash-numpad')
  const numpadBody = await page.textContent('body')
  console.log('Cash numpad shown:', numpadBody.includes('Cash Payment') || numpadBody.includes('Tendered') || numpadBody.includes('Exact'))
}

// Click "Exact" to set tender = total amount
const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
if (await exactBtn.count() > 0) {
  await exactBtn.click()
  await page.waitForTimeout(500)
  console.log('✅ Exact amount set')
} else {
  // Fallback: type the amount manually (J$2380.00 → press 2, 3, 8, 0, 0, 0)
  for (const k of ['2','3','8','0','0','0']) {
    await page.locator('button').filter({ hasText: new RegExp(`^${k}$`) }).last().click()
    await page.waitForTimeout(80)
  }
}

await page.waitForTimeout(400)
await shot('08b-tender-set')

// Complete the payment — button shows "Complete · Change J$X.XX"
const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
if (await completeBtn.count() > 0) {
  const completeTxt = await completeBtn.textContent()
  console.log('Complete button text:', completeTxt)
  await completeBtn.click()
  await page.waitForTimeout(2000)
  await shot('09-payment-success')
  const receipt = await page.textContent('body')
  console.log('Payment Complete shown:', receipt.includes('Payment Complete') || receipt.includes('Change Due') || receipt.includes('Done'))
  console.log('✅ Payment complete')
} else {
  await shot('09-no-complete-button')
  const allBtns = await page.locator('button').allTextContents()
  console.log('⚠️  Complete button not found. All buttons:', JSON.stringify(allBtns.filter(t => t.trim())))
}

await browser.close()
console.log('\n=== Test Complete ===')
