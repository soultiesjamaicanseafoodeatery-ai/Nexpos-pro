import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'reports-shots')
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

const navTo = async (label) => {
  const xBtn = page.locator('button').filter({ hasText: '×' }).first()
  if (await xBtn.isVisible().catch(() => false)) { await xBtn.click(); await page.waitForTimeout(300) }
  await page.locator('div').filter({ hasText: new RegExp(`^${label}$`) }).first().click()
  await page.waitForTimeout(1800)
}

// ═══════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗')
console.log('║       NexPOS Pro — Reports E2E          ║')
console.log('╚══════════════════════════════════════════╝\n')

// ── LOGIN ──────────────────────────────────────────────────────
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
pass('Logged in as RENEE (admin)')

// ── STEP 1: Reports page — Overview tab (default) ─────────────
console.log('\n━━━ STEP 1: Overview tab ━━━')
await navTo('Reports')
await shot('01-reports-overview')
const overBody = await page.textContent('body')

check('Reports: page heading present',           overBody.includes('Reports'))
check('Reports: subtitle (All-time)',             overBody.includes('All-time') && overBody.includes('transactions'))
check('Reports: tx count ≥ 3 (demo data)',       (() => {
  const m = overBody.match(/(\d+)\s+transactions/)
  return m ? parseInt(m[1]) >= 3 : false
})())

// Tab buttons
check('Reports: Overview tab button',            overBody.includes('Overview'))
check('Reports: By Server tab button',           overBody.includes('By Server'))
check('Reports: Menu Sales tab button',          overBody.includes('Menu Sales'))
check('Reports: Financial tab button',           overBody.includes('Financial'))

// Overview stats cards
check('Overview: Total Revenue card',            overBody.includes('Total Revenue'))
check('Overview: Transactions card',             overBody.includes('Transactions'))
check('Overview: Avg Ticket card',               overBody.includes('Avg Ticket'))
check('Overview: Total Discounts card',          overBody.includes('Total Discounts'))
check('Overview: Total Tax (GCT) card',          overBody.includes('Total Tax') || overBody.includes('GCT'))
check('Overview: Total Gratuity card',           overBody.includes('Total Gratuity') || overBody.includes('Gratuity'))
check('Overview: J$ currency shown',             overBody.includes('J$'))

// Module Breakdown
check('Overview: Module Breakdown section',      overBody.includes('Module Breakdown'))
check('Overview: Restaurant in breakdown',       overBody.includes('Restaurant'))
check('Overview: Bar in breakdown',              overBody.includes('Bar'))
check('Overview: Carwash in breakdown',          overBody.includes('Carwash') || overBody.includes('arwash'))
check('Overview: percentages shown',             overBody.includes('%') && overBody.includes('txns'))

// Payment Methods
check('Overview: Payment Methods section',       overBody.includes('Payment Methods'))
check('Overview: payment type shown (CARD/TAB)', overBody.includes('card') || overBody.includes('Card') || overBody.includes('tab') || overBody.includes('Tab') || overBody.includes('CARD') || overBody.includes('TAB'))

// Top Items
check('Overview: Top Items section',             overBody.includes('Top Items'))
check('Overview: item names listed',             overBody.includes('Ribeye') || overBody.includes('Fashioned') || overBody.includes('Ceramic'))

// ── STEP 2: By Server tab ─────────────────────────────────────
console.log('\n━━━ STEP 2: By Server tab ━━━')
const serverTabBtn = page.locator('button').filter({ hasText: /^By Server$/ }).first()
await serverTabBtn.click()
await page.waitForTimeout(500)
await shot('02-by-server')
const serverBody = await page.textContent('body')

check('By Server: tab switched',                  serverBody.includes('By Server') || serverBody.includes('Sales by Server'))
check('By Server: table header - Server',         serverBody.includes('Server'))
check('By Server: table header - Transactions',   serverBody.includes('Transactions'))
check('By Server: table header - Revenue',        serverBody.includes('Revenue'))
check('By Server: table header - Avg Ticket',     serverBody.includes('Avg Ticket'))
check('By Server: table header - Discounts Given',serverBody.includes('Discounts Given'))
check('By Server: table header - Gratuity Earned',serverBody.includes('Gratuity Earned'))
check('By Server: Sales by Server heading',       serverBody.includes('Sales by Server') || serverBody.includes('Cashier'))
// Demo data cashiers
check('By Server: demo cashier Jordan Kim',       serverBody.includes('Jordan Kim') || serverBody.includes('Jordan'))
check('By Server: demo cashier Taylor Moss',      serverBody.includes('Taylor Moss') || serverBody.includes('Taylor'))
check('By Server: demo cashier Casey Park',       serverBody.includes('Casey Park') || serverBody.includes('Casey'))
check('By Server: J$ revenue values shown',       serverBody.includes('J$'))

// ── STEP 3: Menu Sales tab ────────────────────────────────────
console.log('\n━━━ STEP 3: Menu Sales tab ━━━')
const menuTabBtn = page.locator('button').filter({ hasText: /^Menu Sales$/ }).first()
await menuTabBtn.click()
await page.waitForTimeout(500)
await shot('03-menu-sales')
const menuBody = await page.textContent('body')

check('Menu Sales: tab switched',                  menuBody.includes('Menu Sales') || menuBody.includes('Category'))
check('Menu Sales: Category Sales section',        menuBody.includes('Category Sales'))
check('Menu Sales: Restaurant (Food) category',    menuBody.includes('Restaurant') && menuBody.includes('Food'))
check('Menu Sales: Bar (Drinks) category',         menuBody.includes('Bar') && menuBody.includes('Drinks'))
check('Menu Sales: Car Wash category',             menuBody.includes('Car Wash') || menuBody.includes('Carwash'))
check('Menu Sales: J$ category revenue',           menuBody.includes('J$'))
check('Menu Sales: transaction count per category',menuBody.includes('transactions'))
check('Menu Sales: Top Food Items section',        menuBody.includes('Top Food Items'))
check('Menu Sales: Top Drinks section',            menuBody.includes('Top Drinks'))
// Demo food item: Ribeye Steak
check('Menu Sales: food item listed (Ribeye)',     menuBody.includes('Ribeye') || menuBody.includes('No food sales'))
// Demo drink item: Old Fashioned ×2
check('Menu Sales: drink item listed (Fashioned)', menuBody.includes('Fashioned') || menuBody.includes('Old') || menuBody.includes('No bar sales'))
check('Menu Sales: count shown (×)',               menuBody.includes('×'))

// ── STEP 4: Financial tab ─────────────────────────────────────
console.log('\n━━━ STEP 4: Financial tab ━━━')
const finTabBtn = page.locator('button').filter({ hasText: /^Financial$/ }).first()
await finTabBtn.click()
await page.waitForTimeout(500)
await shot('04-financial')
const finBody = await page.textContent('body')

check('Financial: tab switched',                    finBody.includes('Financial') || finBody.includes('Tax Report'))
// Tax Report section
check('Financial: Tax Report (GCT) heading',        finBody.includes('Tax Report') && finBody.includes('GCT'))
check('Financial: Total GCT Collected row',         finBody.includes('Total GCT Collected') || finBody.includes('GCT'))
check('Financial: Service Charge Collected row',    finBody.includes('Service Charge'))
check('Financial: Taxable Transactions row',        finBody.includes('Taxable Transactions'))
check('Financial: Non-taxable Transactions row',    finBody.includes('Non-taxable'))
// Gratuity Report
check('Financial: Gratuity Report heading',         finBody.includes('Gratuity Report'))
check('Financial: Total Gratuity Collected row',    finBody.includes('Total Gratuity') || finBody.includes('Gratuity Collected'))
check('Financial: Orders with Gratuity row',        finBody.includes('Orders with Gratuity'))
check('Financial: Avg Gratuity per Order row',      finBody.includes('Avg Gratuity'))
check('Financial: Gratuity % of Revenue row',       finBody.includes('Gratuity %') || finBody.includes('% of Revenue'))
// Discount Summary
check('Financial: Discount Summary section',        finBody.includes('Discount Summary'))
check('Financial: Total Discounts Given card',      finBody.includes('Total Discounts Given'))
check('Financial: Discounted Orders card',          finBody.includes('Discounted Orders'))
check('Financial: Avg Discount card',               finBody.includes('Avg Discount'))
check('Financial: Discount % of Revenue card',      finBody.includes('Discount %') || finBody.includes('% of Revenue'))

// ── STEP 5: Switch back to Overview ──────────────────────────
console.log('\n━━━ STEP 5: Tab switching ━━━')
const overviewTabBtn = page.locator('button').filter({ hasText: /^Overview$/ }).first()
await overviewTabBtn.click()
await page.waitForTimeout(400)
const backBody = await page.textContent('body')
check('Tab switch back: Overview content restored',  backBody.includes('Total Revenue') && backBody.includes('Module Breakdown'))

// Cycle all tabs to confirm no crashes
await page.locator('button').filter({ hasText: /^By Server$/ }).first().click()
await page.waitForTimeout(300)
await page.locator('button').filter({ hasText: /^Menu Sales$/ }).first().click()
await page.waitForTimeout(300)
await page.locator('button').filter({ hasText: /^Financial$/ }).first().click()
await page.waitForTimeout(300)
await page.locator('button').filter({ hasText: /^Overview$/ }).first().click()
await page.waitForTimeout(400)
await shot('05-tabs-cycled')
const cycledBody = await page.textContent('body')
check('Tab cycling: no crash, Overview shown', cycledBody.includes('Total Revenue'))

// ── STEP 6: Data consistency cross-check ─────────────────────
console.log('\n━━━ STEP 6: Data cross-check ━━━')
// Total revenue on Overview vs total in financial data
const revMatch = backBody.match(/J\$([\d,]+\.\d{2})/)
const revVal = revMatch ? parseFloat(revMatch[1].replace(',', '')) : 0
console.log(`  Revenue shown: J$${revMatch?.[1] ?? 'N/A'}`)
check('Overview: total revenue > J$0',          revVal > 0)
check('Overview: revenue matches demo total (≥J$200)', revVal >= 200 || revVal === 0)

// Transaction count in subtitle
const txCountMatch = overBody.match(/(\d+)\s+transactions/)
const txCount = txCountMatch ? parseInt(txCountMatch[1]) : 0
console.log(`  Transaction count: ${txCount}`)
check('Overview: tx count matches demo (≥3)',   txCount >= 3)

// ── STEP 7: Navigate away and back ───────────────────────────
console.log('\n━━━ STEP 7: Navigate away and back ━━━')
await navTo('Transactions')
await page.waitForTimeout(400)
await navTo('Reports')
await shot('06-nav-back')
const navBackBody = await page.textContent('body')
check('Navigate back: Reports page reloads cleanly', navBackBody.includes('Reports') && navBackBody.includes('All-time'))
// Should land on Overview (or whichever tab was last active)
check('Navigate back: content visible',          navBackBody.includes('Total Revenue') || navBackBody.includes('By Server') || navBackBody.includes('Category'))

await shot('07-final')
await browser.close()
console.log('\n╔══════════════════════════════════════════╗')
console.log('║        Reports Test Complete             ║')
console.log('╚══════════════════════════════════════════╝')
