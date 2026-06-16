import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'delivery-shots')
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

console.log('\n=== Delivery Full Order Test ===\n')

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
console.log('Service select visible:', body0.includes('Dine-In') && body0.includes('Delivery'))

// ── Step 2: Delivery → Dashboard ──
await page.locator('button').filter({ hasText: 'Delivery' }).first().click()
await page.waitForTimeout(600)
await shot('02-delivery-dashboard')
const body1 = await page.textContent('body')
console.log('Delivery dashboard visible:', body1.includes('Delivery'))

// ── Step 3: New Delivery Order → Form ──
await page.locator('button').filter({ hasText: /New Delivery Order/i }).first().click()
await page.waitForTimeout(500)
await shot('03-delivery-form')
const body2 = await page.textContent('body')
console.log('Form visible:', body2.includes('Customer Name') && body2.includes('Phone') && body2.includes('Delivery Address'))
console.log('Service select gone:', !body2.includes('How is this order'))

// ── Step 4: Fill customer + address details ──
await page.locator('input').nth(0).fill('John Smith')
await page.locator('input').nth(1).fill('876-999-0000')
await page.locator('input').nth(2).fill('14 King Street, Kingston')
await page.waitForTimeout(300)
await shot('04-form-filled')
console.log('✅ Filled: John Smith / 876-999-0000 / 14 King Street, Kingston')

// ── Step 5: Start Order → Workspace ──
await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(5000)
await shot('05-workspace')
const body3 = await page.textContent('body')
console.log('Workspace header (Delivery):', body3.includes('Delivery'))
console.log('Customer name in header:', body3.includes('John Smith'))
console.log('Phone in header:', body3.includes('876-999-0000'))
console.log('Address in header:', body3.includes('14 King Street'))
console.log('No service select:', !body3.includes('How is this order'))
console.log('Menu loaded:', body3.includes('J$'))

// ── Step 6: Add items ──
// Helper: click a menu item, handle optional Add-to-Cart modal, wait for overlay to clear
const addItem = async (name) => {
  const item = page.locator('div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  if (await item.count() === 0) { console.log(`⚠️  ${name} not found`); return }
  await item.click()
  await page.waitForTimeout(600)
  const addBtn = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await addBtn.count() > 0) {
    await addBtn.click()
    // Wait for the modal / overlay to close before the next item click
    await addBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }
  // Extra buffer + dismiss any lingering overlay with Escape
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  console.log(`✅ Added ${name}`)
}

await addItem('Conch')
await addItem('BBQ Chicken')
await addItem('Bammy')

await page.waitForTimeout(500)
await shot('06-cart-filled')
const cartBody = await page.textContent('body')
const total = cartBody.match(/TOTAL\s+(J\$[\d,\.]+)/)?.[1] ?? 'unknown'
console.log('Cart total:', total)
console.log('Cart has items:', !cartBody.includes('Tap menu items to add'))

// ── Step 7: Pay ──
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
const payDisabled = await payBtn.getAttribute('disabled')
if (payDisabled !== null) {
  console.log('⚠️  Pay button disabled — cart may be empty')
  const allBtns = await page.locator('button').allTextContents()
  console.log('Buttons:', JSON.stringify(allBtns.filter(t => t.trim()).slice(0, 20)))
} else {
  await payBtn.click()
  await page.waitForTimeout(1500)
  await shot('07-payment-modal')
  const payBody = await page.textContent('body')
  console.log('Payment modal open:', payBody.includes('Process Payment') || payBody.includes('Cash'))
  console.log('Customer in modal:', payBody.includes('John Smith'))

  // Select Cash
  const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
  if (await cashBtn.count() > 0) {
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
    const txt = await completeBtn.textContent()
    console.log('Complete button:', txt)
    await completeBtn.click()
    await page.waitForTimeout(2000)
    await shot('09-payment-success')
    const receipt = await page.textContent('body')
    console.log('Payment Complete shown:', receipt.includes('Payment Complete') || receipt.includes('Change Due') || receipt.includes('Done'))
    console.log('Receipt shows customer:', receipt.includes('John Smith') || receipt.includes('John'))
    console.log('Receipt type is Delivery:', receipt.includes('Delivery') || receipt.includes('delivery'))
    console.log('✅ Payment complete')
  } else {
    await shot('09-no-complete')
    const allBtns = await page.locator('button').allTextContents()
    console.log('⚠️  Complete button not found. Buttons:', JSON.stringify(allBtns.filter(t => t.trim())))
  }
}

await browser.close()
console.log('\n=== Test Complete ===')
