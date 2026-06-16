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

console.log('\n=== Takeout Full Order Test ===\n')

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

// ── Step 1: Service Select ──
await shot('01-service-select')
const body0 = await page.textContent('body')
console.log('Service select visible:', body0.includes('Dine-In') && body0.includes('Takeout'))

// ── Step 2: Takeout → Dashboard ──
await page.locator('button').filter({ hasText: 'Takeout' }).first().click()
await page.waitForTimeout(600)
await shot('02-takeout-dashboard')
const body1 = await page.textContent('body')
console.log('Takeout dashboard visible:', body1.includes('Takeout'))

// ── Step 3: New Takeout Order → Form ──
await page.locator('button').filter({ hasText: /New Takeout Order/i }).first().click()
await page.waitForTimeout(500)
await shot('03-takeout-form')
const body2 = await page.textContent('body')
console.log('Form visible:', body2.includes('Customer Name') && body2.includes('Phone'))
console.log('Service select gone:', !body2.includes('How is this order'))

// ── Step 4: Fill customer details ──
const nameInput = page.locator('input').nth(0)
const phoneInput = page.locator('input').nth(1)
await nameInput.fill('Maria Johnson')
await phoneInput.fill('876-555-0123')
await page.waitForTimeout(300)
await shot('04-form-filled')
console.log('✅ Filled: Maria Johnson / 876-555-0123')

// ── Step 5: Start Order → Workspace ──
await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(5000)
await shot('05-workspace')
const body3 = await page.textContent('body')
console.log('Workspace header (Takeout):', body3.includes('Takeout'))
console.log('Customer name in header:', body3.includes('Maria Johnson'))
console.log('Phone in header:', body3.includes('876-555-0123'))
console.log('No service select:', !body3.includes('How is this order'))
console.log('Menu loaded:', body3.includes('J$'))

// ── Step 6: Add items ──

// Snapper
const snapper = page.locator('div').filter({ hasText: /^Snapper$/ }).first()
if (await snapper.count() > 0) {
  await snapper.click(); await page.waitForTimeout(500)
  const modal = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await modal.count() > 0) { await modal.click(); await page.waitForTimeout(300) }
  console.log('✅ Added Snapper')
} else {
  console.log('⚠️  Snapper not found')
}

// BBQ Chicken
const bbq = page.locator('div').filter({ hasText: /^BBQ Chicken$/ }).first()
if (await bbq.count() > 0) {
  await bbq.click(); await page.waitForTimeout(500)
  const modal = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await modal.count() > 0) { await modal.click(); await page.waitForTimeout(300) }
  console.log('✅ Added BBQ Chicken')
} else {
  console.log('⚠️  BBQ Chicken not found')
}

// Festival (side)
const festival = page.locator('div').filter({ hasText: /^Festival$/ }).first()
if (await festival.count() > 0) {
  await festival.click(); await page.waitForTimeout(500)
  const modal = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await modal.count() > 0) { await modal.click(); await page.waitForTimeout(300) }
  console.log('✅ Added Festival')
} else {
  // Try Bammy as alternative
  const bammy = page.locator('div').filter({ hasText: /^Bammy$/ }).first()
  if (await bammy.count() > 0) {
    await bammy.click(); await page.waitForTimeout(500)
    const modal = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
    if (await modal.count() > 0) { await modal.click(); await page.waitForTimeout(300) }
    console.log('✅ Added Bammy (Festival not found)')
  }
}

await page.waitForTimeout(500)
await shot('06-cart-filled')
const cartBody = await page.textContent('body')
const total = cartBody.match(/TOTAL\s+(J\$[\d,\.]+)/)?.[1] ?? 'unknown'
console.log('Cart total:', total)
console.log('Cart has items:', !cartBody.includes('Tap menu items to add'))

// ── Step 7: Pay directly (no kitchen send for takeout counter orders) ──
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
const payDisabled = await payBtn.getAttribute('disabled')
if (payDisabled !== null) {
  console.log('⚠️  Pay button is disabled — cart may be empty')
  const allBtns = await page.locator('button').allTextContents()
  console.log('Buttons on page:', JSON.stringify(allBtns.filter(t => t.trim()).slice(0, 20)))
} else {
  await payBtn.click()
  await page.waitForTimeout(1500)
  await shot('07-payment-modal')
  const payBody = await page.textContent('body')
  console.log('Payment modal open:', payBody.includes('Process Payment') || payBody.includes('Cash') || payBody.includes('Card'))
  console.log('Customer name in modal:', payBody.includes('Maria Johnson'))

  // Select Cash
  const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
  const cashCount = await cashBtn.count()
  console.log('Cash button found:', cashCount > 0)
  if (cashCount > 0) {
    await cashBtn.click()
    await page.waitForTimeout(1000)
    await shot('08-cash-numpad')
    const numpadBody = await page.textContent('body')
    console.log('Cash numpad shown:', numpadBody.includes('Cash Payment') || numpadBody.includes('Exact'))
  }

  // Click Exact
  const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
  if (await exactBtn.count() > 0) {
    await exactBtn.click()
    await page.waitForTimeout(500)
    console.log('✅ Exact amount set')
  }

  await page.waitForTimeout(400)
  await shot('08b-tender-set')

  // Complete payment
  const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
  if (await completeBtn.count() > 0) {
    const completeTxt = await completeBtn.textContent()
    console.log('Complete button:', completeTxt)
    await completeBtn.click()
    await page.waitForTimeout(2000)
    await shot('09-payment-success')
    const receipt = await page.textContent('body')
    console.log('Payment Complete shown:', receipt.includes('Payment Complete') || receipt.includes('Change Due') || receipt.includes('Done'))
    console.log('Receipt shows customer name:', receipt.includes('Maria'))
    console.log('✅ Payment complete')
  } else {
    await shot('09-no-complete')
    const allBtns = await page.locator('button').allTextContents()
    console.log('⚠️  Complete button not found. Buttons:', JSON.stringify(allBtns.filter(t => t.trim())))
  }
}

await browser.close()
console.log('\n=== Test Complete ===')
