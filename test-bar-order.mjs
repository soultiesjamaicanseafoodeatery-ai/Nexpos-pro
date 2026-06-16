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

// Helper: click a menu item card, handle optional Add-to-Cart modal, wait for overlay to clear
const addItem = async (name) => {
  const item = page.locator('div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  if (await item.count() === 0) { console.log(`⚠️  ${name} not found`); return false }
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

console.log('\n=== Bar Full Order Test ===\n')

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

// ── Step 1: Switch to Bar module ──
const barTab = page.locator('button').filter({ hasText: /^Bar$/ }).first()
await barTab.waitFor({ state: 'visible', timeout: 10000 })
await barTab.click()
await page.waitForTimeout(800)
await shot('01-bar-service-select')
const body1 = await page.textContent('body')
console.log('Bar module active:', body1.includes('Bar'))
console.log('Service select visible:', body1.includes('Dine-In') && body1.includes('Takeout'))

// ── Step 2: Dine-In → Table grid ──
await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(700)
await shot('02-table-grid')
const body2 = await page.textContent('body')
console.log('Table grid visible:', /T\d+/.test(body2))

// ── Step 3: Select a table ──
// Try T2 first, fall back to any available table
let tableClicked = false
const t2 = page.locator('button', { hasText: 'T2' }).first()
if (await t2.count() > 0) {
  await t2.click()
  tableClicked = true
} else {
  const anyTable = page.locator('button').filter({ hasText: /^T\d+/ }).first()
  if (await anyTable.count() > 0) { await anyTable.click(); tableClicked = true }
}
await page.waitForTimeout(5000)
await shot('03-bar-workspace')
const body3 = await page.textContent('body')
console.log('Table clicked:', tableClicked)
console.log('Workspace header (Dine-In):', body3.includes('Dine-In') || body3.includes('DINE-IN'))
console.log('Bar menu loaded:', /rum|vodka|whiskey|gin|cognac|hennessy|appleton|beer|shot/i.test(body3))
console.log('No table selector:', !body3.includes('Select Table'))

// ── Step 4: Explore categories ──
const allTab = page.locator('button').filter({ hasText: /^All$/ }).first()
if (await allTab.count() > 0) { await allTab.click(); await page.waitForTimeout(400) }

// Screenshot what's in the All category
await shot('04-bar-menu-all')
const menuBody = await page.textContent('body')
// Log first few item names to know what's available
const prices = menuBody.match(/J\$[\d,]+\.00/g) ?? []
console.log('Bar items priced:', prices.length, 'items visible')

// Try Rum category
const rumTab = page.locator('button').filter({ hasText: /^Rum$/i }).first()
if (await rumTab.count() > 0) {
  await rumTab.click(); await page.waitForTimeout(400)
  await shot('05-rum-category')
  console.log('✅ Rum category')
}

// Back to All for adding items
if (await allTab.count() > 0) { await allTab.click(); await page.waitForTimeout(400) }

// ── Step 5: Add bar items ──
// Use actual bar item names from the menu (multi-word names, not category names)
// Priority list — try in order, stop after 3 added
const barItemsToTry = [
  'Absolute', 'Bacardi Gold', 'Bacardi Silver', 'Appleton 8yr',
  'Captain Morgan Spiced Rum', 'Beefeater Shot', 'Absolute Shot',
  'Hennessy VS', 'Casamigos Shot', 'Appleton White',
]
let addedCount = 0
for (const item of barItemsToTry) {
  if (addedCount >= 3) break
  const ok = await addItem(item)
  if (ok) addedCount++
}

await page.waitForTimeout(500)
await shot('06-cart-filled')
const cartBody = await page.textContent('body')
const total = cartBody.match(/TOTAL\s+(J\$[\d,\.]+)/)?.[1] ?? 'unknown'
console.log('Items added:', addedCount)
console.log('Cart total:', total)
console.log('Cart has items:', !cartBody.includes('Tap menu items to add'))

// ── Step 6: Pay ──
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
const payDisabled = await payBtn.getAttribute('disabled')

if (payDisabled !== null) {
  console.log('⚠️  Pay button disabled — cart empty, dumping visible text')
  console.log(cartBody.slice(300, 800))
} else {
  await payBtn.click()
  await page.waitForTimeout(1500)
  await shot('07-payment-modal')
  const payBody = await page.textContent('body')
  console.log('Payment modal open:', payBody.includes('Process Payment') || payBody.includes('Cash'))

  // Select Cash
  const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
  if (await cashBtn.count() > 0) {
    await cashBtn.click()
    await page.waitForTimeout(1000)
    await shot('08-cash-numpad')
  }

  // Exact amount
  const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
  if (await exactBtn.count() > 0) {
    await exactBtn.click()
    await page.waitForTimeout(500)
    console.log('✅ Exact amount set')
  }

  await page.waitForTimeout(400)
  await shot('08b-tender-set')

  // Complete
  const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
  if (await completeBtn.count() > 0) {
    const txt = await completeBtn.textContent()
    console.log('Complete button:', txt)
    await completeBtn.click()
    await page.waitForTimeout(2000)
    await shot('09-payment-success')
    const receipt = await page.textContent('body')
    console.log('Payment Complete shown:', receipt.includes('Payment Complete') || receipt.includes('Change Due') || receipt.includes('Done'))
    console.log('✅ Bar payment complete')
  } else {
    await shot('09-no-complete')
    const allBtns = await page.locator('button').allTextContents()
    console.log('⚠️  Complete not found. Buttons:', JSON.stringify(allBtns.filter(t => t.trim())))
  }
}

await browser.close()
console.log('\n=== Test Complete ===')
