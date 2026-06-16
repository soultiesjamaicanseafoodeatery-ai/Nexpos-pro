import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'carwash-shots')
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

// Helper: click a menu item card, handle optional Add-to-Cart modal, wait for overlay to clear
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

console.log('\n=== Car Wash Full Order Test ===\n')

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

// ── Step 1: Switch to Car Wash module ──
const cwBtn = page.locator('button').filter({ hasText: 'Car Wash' }).first()
await cwBtn.waitFor({ state: 'visible', timeout: 10000 })
await cwBtn.click()
await page.waitForTimeout(800)
await shot('01-carwash-service-select')
const body1 = await page.textContent('body')
console.log('Car Wash module active:', body1.includes('Car Wash'))
console.log('Service select visible:', body1.includes('Dine-In') && body1.includes('Takeout'))

// ── Step 2: Select Takeout (walk-in car wash customer) ──
await page.locator('button').filter({ hasText: 'Takeout' }).first().click()
await page.waitForTimeout(600)
await shot('02-takeout-dashboard')

// ── Step 3: New Takeout Order → form ──
await page.locator('button').filter({ hasText: /New Takeout Order/i }).first().click()
await page.waitForTimeout(500)
await shot('03-customer-form')
const body2 = await page.textContent('body')
console.log('Customer form visible:', body2.includes('Customer Name') || body2.includes('Phone'))

// ── Step 4: Fill customer details ──
await page.locator('input').nth(0).fill('David Brown')
await page.locator('input').nth(1).fill('876-444-5555')
await page.waitForTimeout(300)
await shot('04-form-filled')
console.log('✅ Filled: David Brown / 876-444-5555')

// ── Step 5: Start Order → workspace ──
await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(5000)
await shot('05-workspace')
const body3 = await page.textContent('body')
console.log('Workspace loaded:', body3.includes('Takeout') || body3.includes('New Sale'))
console.log('Customer in header:', body3.includes('David Brown'))
console.log('Car Wash POS toolbar:', body3.includes('New Sale') || body3.includes('PLATE'))

// ── Step 6: Enter plate number in the toolbar ──
const plateInput = page.locator('input[placeholder*="PLATE"], input[placeholder*="plate"], input[maxlength="10"]').first()
if (await plateInput.count() > 0) {
  await plateInput.fill('PBP-1234')
  await page.waitForTimeout(400)
  await shot('06-plate-entered')
  console.log('✅ Plate number entered: PBP-1234')
} else {
  console.log('⚠️  Plate input not found')
  await shot('06-no-plate-input')
}

// ── Step 7: Discover available car wash services ──
await shot('07-carwash-menu')
const menuBody = await page.textContent('body')
const prices = menuBody.match(/J\$[\d,]+\.00/g) ?? []
console.log('Car wash services visible:', prices.length, 'items priced')

// Extract item names from the menu to know what to add
// Print a snippet of the menu area text
const menuSnippet = menuBody.replace(/\s+/g, ' ').match(/New Sale.+/)?.[0]?.slice(0, 500) ?? menuBody.slice(400, 900)
console.log('Menu text snapshot:', menuSnippet.slice(0, 400))

// ── Step 8: Add car wash services ──
// Try service names common to car washes — will discover correct names from snapshot
const serviceNamesToTry = [
  'Basic Wash', 'Full Wash', 'Express Wash', 'Deluxe Wash', 'Premium Wash',
  'Interior Clean', 'Full Detail', 'Exterior Wash', 'Hand Wash', 'Full Service',
  'Wash', 'Detail', 'Wax', 'Polish', 'Interior', 'Exterior',
  'Basic', 'Standard', 'Premium', 'Deluxe', 'Full',
]

let addedCount = 0
for (const name of serviceNamesToTry) {
  if (addedCount >= 2) break
  const el = page.locator('div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  if (await el.count() > 0) {
    const ok = await addItem(name)
    if (ok) addedCount++
  }
}

// If nothing found from the list, grab the actual item names from the DOM and try those
if (addedCount === 0) {
  console.log('⚠️  No items from standard list found — reading actual item names from DOM')
  // Get all text from price-bearing divs to find item names
  const allDivTexts = await page.locator('div').allTextContents()
  const itemNames = allDivTexts
    .map(t => t.trim())
    .filter(t => t.length > 2 && t.length < 40 && !t.includes('J$') && !t.includes('\n') && !/^\d+$/.test(t))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 30)
  console.log('Candidate item names:', JSON.stringify(itemNames.slice(0, 20)))

  // Try to click any item card (div followed by a price)
  const itemCards = page.locator('div').filter({ hasText: /^.{3,35}$/ }).filter({ hasText: /^(?!J\$)/ })
  const count = await itemCards.count()
  console.log('Item card candidates:', count)
  if (count > 0) {
    // Try clicking the first few cards that look like service names
    for (let i = 0; i < Math.min(count, 15) && addedCount < 2; i++) {
      const card = itemCards.nth(i)
      const txt = (await card.textContent() ?? '').trim()
      if (txt.length > 3 && txt.length < 40 && !txt.includes('$') && !['All', 'New Sale', 'Outside Orders', 'Send Order', 'Hold', 'Split', 'Clear', 'Back', 'Open', 'Held', 'Takeout', 'David Brown'].includes(txt)) {
        console.log(`Trying to click: "${txt}"`)
        const ok = await addItem(txt)
        if (ok) addedCount++
      }
    }
  }
}

await page.waitForTimeout(500)
await shot('08-cart-filled')
const cartBody = await page.textContent('body')
const total = cartBody.match(/TOTAL\s+(J\$[\d,\.]+)/)?.[1] ?? 'unknown'
console.log('Services added:', addedCount)
console.log('Cart total:', total)
console.log('Cart has items:', !cartBody.includes('Tap menu items to add'))

// ── Step 9: Pay ──
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
const payDisabled = await payBtn.getAttribute('disabled')

if (payDisabled !== null) {
  console.log('⚠️  Pay button disabled — cart empty')
  // Dump available buttons and divs for debugging
  const allBtns = await page.locator('button').allTextContents()
  console.log('Buttons:', JSON.stringify(allBtns.filter(t => t.trim())))
} else {
  await payBtn.click()
  await page.waitForTimeout(1500)
  await shot('09-payment-modal')
  const payBody = await page.textContent('body')
  console.log('Payment modal open:', payBody.includes('Process Payment') || payBody.includes('Cash'))
  console.log('Plate in modal:', payBody.includes('PBP-1234'))

  // Select Cash
  const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
  if (await cashBtn.count() > 0) {
    await cashBtn.click()
    await page.waitForTimeout(1000)
    await shot('10-cash-numpad')
  }

  // Exact amount
  const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
  if (await exactBtn.count() > 0) {
    await exactBtn.click()
    await page.waitForTimeout(500)
    console.log('✅ Exact amount set')
  }

  await page.waitForTimeout(400)
  await shot('10b-tender-set')

  // Complete
  const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
  if (await completeBtn.count() > 0) {
    const txt = await completeBtn.textContent()
    console.log('Complete button:', txt)
    await completeBtn.click()
    await page.waitForTimeout(2000)
    await shot('11-payment-success')
    const receipt = await page.textContent('body')
    console.log('Payment Complete shown:', receipt.includes('Payment Complete') || receipt.includes('Change Due') || receipt.includes('Done'))
    console.log('Plate on receipt:', receipt.includes('PBP-1234') || receipt.includes('PBP'))
    console.log('Receipt type:', receipt.includes('Car Wash') || receipt.includes('carwash') || receipt.includes('Wash'))
    console.log('✅ Car Wash payment complete')
  } else {
    await shot('11-no-complete')
    const allBtns = await page.locator('button').allTextContents()
    console.log('⚠️  Complete not found. Buttons:', JSON.stringify(allBtns.filter(t => t.trim())))
  }
}

await browser.close()
console.log('\n=== Test Complete ===')
