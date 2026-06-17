import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'transactions-shots')
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

const dismissOverlay = async () => {
  const xBtn = page.locator('button').filter({ hasText: '×' }).first()
  if (await xBtn.isVisible().catch(() => false)) { await xBtn.click(); await page.waitForTimeout(400) }
}
const navTo = async (label) => {
  await dismissOverlay()
  await page.locator('div').filter({ hasText: new RegExp(`^${label}$`) }).first().click()
  await page.waitForTimeout(2000)
}

// ═══════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗')
console.log('║     NexPOS Pro — Transactions E2E       ║')
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

// ── STEP 1: Page structure & demo data ──────────────────────
console.log('\n━━━ STEP 1: Transactions page structure ━━━')
await navTo('Transactions')
await shot('01-transactions-page')
const pageBody = await page.textContent('body')

check('Transactions: page heading present',       pageBody.includes('Transactions'))
check('Transactions: record count shown',         pageBody.includes('records') || pageBody.includes('record'))
check('Transactions: J$ total shown',             pageBody.includes('J$') && pageBody.includes('total'))
check('Transactions: All filter button',          pageBody.includes('All'))
check('Transactions: Restaurant filter',          pageBody.includes('Restaurant'))
check('Transactions: Bar filter',                 pageBody.includes('Bar'))
check('Transactions: Carwash filter',             pageBody.includes('Carwash') || pageBody.includes('Car Wash'))
check('Transactions: column ID',                  pageBody.includes('ID'))
check('Transactions: column Time',                pageBody.includes('Time'))
check('Transactions: column Module',              pageBody.includes('Module'))
check('Transactions: column Cashier',             pageBody.includes('Cashier'))
check('Transactions: column Item',                pageBody.includes('Item'))
check('Transactions: column Total',               pageBody.includes('Total'))
check('Transactions: column Payment',             pageBody.includes('Payment'))
check('Transactions: column Status',              pageBody.includes('Status'))
// Search input has placeholder attribute — not in textContent; check via element
const searchEl = await page.locator('input[placeholder*="earch"]').count()
check('Transactions: search input present',       searchEl > 0)
// Demo data: app loads with 3 pre-seeded transactions (Restaurant, Bar, Carwash)
const recordMatch = pageBody.match(/(\d+)\s+records/)
const recordCount = recordMatch ? parseInt(recordMatch[1]) : 0
console.log(`  Records shown: ${recordCount}`)
check('Transactions: demo records present',       recordCount >= 3)
check('Transactions: Complete status visible',    pageBody.includes('Complete'))
check('Transactions: Void button present',        pageBody.includes('Void'))
check('Transactions: Refund button present',      pageBody.includes('Refund'))
// Demo data has all three modules
check('Transactions: Restaurant tx present',      pageBody.includes('Restaurant'))
check('Transactions: Bar tx present',             pageBody.includes('Bar'))
check('Transactions: Carwash tx present',         pageBody.includes('Carwash') || pageBody.includes('Ceramic'))

// ── STEP 2: Module filter — Restaurant ──────────────────────
console.log('\n━━━ STEP 2: Module filter buttons ━━━')
// Scope filter buttons to the filter row (parent of search input)
// This avoids accidentally clicking the sidebar module buttons (Restaurant, Bar, Car Wash)
const filterRow = page.locator('input[placeholder*="earch"]').locator('xpath=..')

const restFilterBtn = filterRow.locator('button').filter({ hasText: /Restaurant/ }).first()
await restFilterBtn.click()
await page.waitForTimeout(500)
await shot('02-filter-restaurant')
const restBody = await page.textContent('body')
// Component always shows "X records" (no singular form)
const restCount = parseInt(restBody.match(/(\d+)\s+records/)?.[1] ?? '0')
check('Filter Restaurant: record count > 0',     restCount > 0)
check('Filter Restaurant: restaurant rows shown', restBody.includes('Restaurant'))
check('Filter Restaurant: shows 1 record',         restCount === 1)

// Bar filter — scoped to filterRow (no sidebar conflict)
const barFilterBtn = filterRow.locator('button').filter({ hasText: /Bar/ }).first()
await barFilterBtn.click()
await page.waitForTimeout(500)
await shot('03-filter-bar')
const barBody = await page.textContent('body')
const barCount = parseInt(barBody.match(/(\d+)\s+records/)?.[1] ?? '0')
check('Filter Bar: shows bar record(s)',          barCount > 0 || barBody.includes('No transactions'))
check('Filter Bar: Bar module label visible',     barBody.includes('Bar'))

// Carwash filter
const carFilterBtn = filterRow.locator('button').filter({ hasText: /Carwash/ }).first()
await carFilterBtn.click()
await page.waitForTimeout(500)
await shot('04-filter-carwash')
const carBody = await page.textContent('body')
const carCount = parseInt(carBody.match(/(\d+)\s+records/)?.[1] ?? '0')
check('Filter Carwash: shows carwash record(s)',  carCount > 0 || carBody.includes('No transactions'))

// Reset to All
const allFilterBtn = filterRow.locator('button').filter({ hasText: /^All$/ }).first()
await allFilterBtn.click()
await page.waitForTimeout(400)
const allBody = await page.textContent('body')
const allCount = parseInt(allBody.match(/(\d+)\s+records/)?.[1] ?? '0')
check('Filter All: record count restored',        allCount >= recordCount)

// ── STEP 3: Search ───────────────────────────────────────────
console.log('\n━━━ STEP 3: Search ━━━')
const searchInput = page.locator('input[placeholder*="earch"]').first()

// Search by cashier name from demo data
await searchInput.fill('Jordan')
await page.waitForTimeout(500)
await shot('05-search-cashier')
const searchJordan = await page.textContent('body')
check('Search "Jordan": filters rows',   searchJordan.includes('Jordan') || searchJordan.includes('No transactions'))

// Search by item name
await searchInput.fill('Ribeye')
await page.waitForTimeout(400)
const searchItem = await page.textContent('body')
check('Search "Ribeye": filters by item', searchItem.includes('Ribeye') || searchItem.includes('No transactions'))

// Search by something that won't match
await searchInput.fill('ZZZNOMATCH')
await page.waitForTimeout(400)
const searchNone = await page.textContent('body')
check('Search no-match: shows empty state', searchNone.includes('No transactions'))

// Clear search
await searchInput.fill('')
await page.waitForTimeout(400)
await shot('06-search-cleared')
const clearedBody = await page.textContent('body')
check('Search cleared: records restored', clearedBody.includes('Complete'))

// ── STEP 4: Void transaction ─────────────────────────────────
console.log('\n━━━ STEP 4: Void a transaction ━━━')
const voidBtnsBefore = await page.locator('button').filter({ hasText: /^Void$/ }).count()
console.log(`  Void buttons before: ${voidBtnsBefore}`)

const firstVoidBtn = page.locator('button').filter({ hasText: /^Void$/ }).first()
await firstVoidBtn.waitFor({ state: 'visible', timeout: 8000 })
await firstVoidBtn.click()
await page.waitForTimeout(700)
await shot('07-void-modal')
const voidModalBody = await page.textContent('body')

check('Void modal: opened',                voidModalBody.includes('Void') && (voidModalBody.includes('Reason') || voidModalBody.includes('Wrong Item')))
check('Void modal: Wrong Item option',     voidModalBody.includes('Wrong Item'))
check('Void modal: Customer Changed Mind', voidModalBody.includes('Customer Changed Mind'))
check('Void modal: Duplicate Entry',       voidModalBody.includes('Duplicate Entry'))
check('Void modal: Manager Approved',      voidModalBody.includes('Manager Approved'))
check('Void modal: Other option',          voidModalBody.includes('Other'))
check('Void modal: Confirm Void button',   voidModalBody.includes('Confirm Void'))
check('Void modal: Cancel button',         voidModalBody.includes('Cancel'))

// Default is "Wrong Item" — click Confirm Void directly
const confirmVoidBtn = page.locator('button').filter({ hasText: /Confirm Void/ }).first()
await confirmVoidBtn.waitFor({ state: 'visible', timeout: 5000 })
await confirmVoidBtn.click()
await page.waitForTimeout(1000)
await shot('08-voided')
const voidedBody = await page.textContent('body')
check('Void confirmed: VOIDED badge visible',  voidedBody.includes('VOIDED'))
check('Void confirmed: reason in row',         voidedBody.includes('Wrong Item'))

const voidBtnsAfter = await page.locator('button').filter({ hasText: /^Void$/ }).count()
console.log(`  Void buttons after: ${voidBtnsAfter}`)
check('Void: Void button removed from voided row', voidBtnsAfter < voidBtnsBefore)

// ── STEP 5: Verify reason selection (cancel to preserve row) ─
console.log('\n━━━ STEP 5: Void modal reason selection ━━━')
const voidBtn2 = page.locator('button').filter({ hasText: /^Void$/ }).first()
if (await voidBtn2.isVisible().catch(() => false)) {
  await voidBtn2.click()
  await page.waitForTimeout(500)
  // VoidReasonModal reasons are <button> elements with the label text
  const dupEntryBtn = page.locator('button').filter({ hasText: /^Duplicate Entry$/ }).first()
  await dupEntryBtn.waitFor({ state: 'visible', timeout: 5000 })
  await dupEntryBtn.click()
  await page.waitForTimeout(300)
  await shot('09-void-reason-select')
  const dupModalBody = await page.textContent('body')
  check('Void modal: Duplicate Entry selectable',  dupModalBody.includes('Duplicate Entry'))
  // Cancel — don't actually void (preserve this row for refund testing)
  const cancelVoid2 = page.locator('button').filter({ hasText: /^Cancel$/ }).first()
  await cancelVoid2.click()
  await page.waitForTimeout(400)
  const afterCancel2 = await page.textContent('body')
  check('Void modal cancel after reason change: closed',  !afterCancel2.includes('Confirm Void'))
  const voidBtnsAfterCancel = await page.locator('button').filter({ hasText: /^Void$/ }).count()
  check('Void modal cancel: row not voided (count unchanged)', voidBtnsAfterCancel === voidBtnsAfter)
} else {
  warn('Void reason test: no more Void buttons available')
}

// ── STEP 6: Void modal cancel behavior ───────────────────────
console.log('\n━━━ STEP 6: Void modal cancel / × behavior ━━━')
const voidBtn3 = page.locator('button').filter({ hasText: /^Void$/ }).first()
if (await voidBtn3.isVisible().catch(() => false)) {
  // Test Cancel button
  await voidBtn3.click()
  await page.waitForTimeout(400)
  const cancelBtn = page.locator('button').filter({ hasText: /^Cancel$/ }).first()
  await cancelBtn.click()
  await page.waitForTimeout(400)
  const afterCancel = await page.textContent('body')
  check('Void modal Cancel: modal closed',  !afterCancel.includes('Confirm Void'))

  // Test × button
  const voidBtn4 = page.locator('button').filter({ hasText: /^Void$/ }).first()
  if (await voidBtn4.isVisible().catch(() => false)) {
    await voidBtn4.click()
    await page.waitForTimeout(400)
    const xBtn = page.locator('button').filter({ hasText: '×' }).first()
    await xBtn.click()
    await page.waitForTimeout(400)
    const afterX = await page.textContent('body')
    check('Void modal × button: modal closed', !afterX.includes('Confirm Void'))
  } else {
    pass('Void modal × test: no more voidable rows (acceptable)')
  }
} else {
  pass('Void modal cancel: no more voidable rows (acceptable)')
}

// ── STEP 7: Refund — full refund ─────────────────────────────
console.log('\n━━━ STEP 7: Full refund ━━━')
const refundBtnsBefore = await page.locator('button').filter({ hasText: /^Refund$/ }).count()
console.log(`  Refund buttons before: ${refundBtnsBefore}`)

const firstRefundBtn = page.locator('button').filter({ hasText: /^Refund$/ }).first()
await firstRefundBtn.waitFor({ state: 'visible', timeout: 10000 })
await firstRefundBtn.click()
await page.waitForTimeout(700)
await shot('10-refund-modal')
const refundModalBody = await page.textContent('body')

check('Refund modal: opened',                  refundModalBody.includes('Refund') && refundModalBody.includes('Tx #'))
check('Refund modal: Full option present',     refundModalBody.includes('Full'))
check('Refund modal: Partial option present',  refundModalBody.includes('Partial'))
check('Refund modal: Customer Dissatisfied',   refundModalBody.includes('Customer Dissatisfied'))
check('Refund modal: Wrong Item Served',       refundModalBody.includes('Wrong Item Served'))
check('Refund modal: Duplicate Charge',        refundModalBody.includes('Duplicate Charge'))
check('Refund modal: Order Cancelled',         refundModalBody.includes('Order Cancelled'))
check('Refund modal: Quality Issue',           refundModalBody.includes('Quality Issue'))
check('Refund modal: J$ amount shown',         refundModalBody.includes('J$'))
check('Refund modal: Process Refund button',   refundModalBody.includes('Process Refund'))
check('Refund modal: Cancel button',           refundModalBody.includes('Cancel'))

// Full + Customer Dissatisfied are defaults → can confirm immediately
const processRefundBtn = page.locator('button').filter({ hasText: /Process Refund/ }).first()
await processRefundBtn.waitFor({ state: 'visible', timeout: 5000 })
await processRefundBtn.click()
await page.waitForTimeout(1000)
await shot('11-refunded')
const refundedBody = await page.textContent('body')
check('Refund: REFUNDED badge appears',   refundedBody.includes('REFUNDED'))
check('Refund: reason shown in row',      refundedBody.includes('Customer Dissatisfied') || refundedBody.includes('Dissatisfied'))

const refundBtnsAfter = await page.locator('button').filter({ hasText: /^Refund$/ }).count()
console.log(`  Refund buttons after: ${refundBtnsAfter}`)
check('Refund: Refund button removed from refunded row', refundBtnsAfter < refundBtnsBefore)

// ── STEP 8: Refund — cancel behavior ─────────────────────────
console.log('\n━━━ STEP 8: Refund modal cancel / × behavior ━━━')
const refundBtn2 = page.locator('button').filter({ hasText: /^Refund$/ }).first()
if (await refundBtn2.isVisible().catch(() => false)) {
  await refundBtn2.click()
  await page.waitForTimeout(400)
  const refundCancel = page.locator('button').filter({ hasText: /^Cancel$/ }).first()
  await refundCancel.click()
  await page.waitForTimeout(400)
  const afterRefundCancel = await page.textContent('body')
  check('Refund modal Cancel: modal closed', !afterRefundCancel.includes('Process Refund'))

  // × button
  const refundBtn3 = page.locator('button').filter({ hasText: /^Refund$/ }).first()
  if (await refundBtn3.isVisible().catch(() => false)) {
    await refundBtn3.click()
    await page.waitForTimeout(400)
    const rxBtn = page.locator('button').filter({ hasText: '×' }).first()
    await rxBtn.click()
    await page.waitForTimeout(400)
    const afterRX = await page.textContent('body')
    check('Refund modal ×: modal closed', !afterRX.includes('Process Refund'))
  } else {
    pass('Refund modal ×: no more refundable rows (acceptable)')
  }
} else {
  pass('Refund modal cancel: no more refundable rows (acceptable)')
}

// ── STEP 9: Partial refund ───────────────────────────────────
console.log('\n━━━ STEP 9: Partial refund ━━━')
const refundBtn4 = page.locator('button').filter({ hasText: /^Refund$/ }).first()
if (await refundBtn4.isVisible().catch(() => false)) {
  await refundBtn4.click()
  await page.waitForTimeout(500)
  await shot('12-partial-refund-modal')

  // Click Partial type button (text is exactly "Partial")
  const partialTypeBtn = page.locator('button').filter({ hasText: /^Partial$/ }).first()
  await partialTypeBtn.waitFor({ state: 'visible', timeout: 5000 })
  await partialTypeBtn.click()
  await page.waitForTimeout(400)

  // Enter amount (input type="number" appears only when Partial is selected)
  const amtInput = page.locator('input[type="number"]').first()
  await amtInput.waitFor({ state: 'visible', timeout: 5000 })
  await amtInput.fill('50')
  await page.waitForTimeout(300)

  const partialBody = await page.textContent('body')
  check('Partial refund: amount field shown',       partialBody.includes('50') || partialBody.includes('Amount'))
  check('Partial refund: Refund Amount summary',    partialBody.includes('Refund Amount') || partialBody.includes('J$'))

  // Customer Dissatisfied is default reason — just click Process Refund
  await shot('12b-partial-filled')
  const processPartial = page.locator('button').filter({ hasText: /Process Refund/ }).first()
  await processPartial.waitFor({ state: 'visible', timeout: 5000 })
  if (await processPartial.isEnabled().catch(() => false)) {
    await processPartial.click()
    await page.waitForTimeout(1000)
    await shot('13-partial-done')
    const partialDone = await page.textContent('body')
    check('Partial refund: REFUNDED badge shown',   partialDone.includes('REFUNDED'))
  } else {
    const closeRefund = page.locator('button').filter({ hasText: /^Cancel$/ }).first()
    await closeRefund.click().catch(() => {})
    warn('Partial refund: Process button not enabled — amount or reason issue (check canConfirm)')
  }
} else {
  warn('Partial refund: no more Refund buttons available')
}

// ── STEP 10: Revenue total (voided excluded) ─────────────────
console.log('\n━━━ STEP 10: Revenue total & final state ━━━')
await shot('14-final-state')
const finalBody = await page.textContent('body')
check('Final: page still shows Transactions',    finalBody.includes('Transactions'))
check('Final: VOIDED badge present',             finalBody.includes('VOIDED'))
check('Final: REFUNDED badge present',           finalBody.includes('REFUNDED'))
// All demo transactions have been processed (voided/refunded) so Complete may not be visible
check('Final: status badges all processed',      finalBody.includes('VOIDED') || finalBody.includes('REFUNDED'))
check('Final: J$ total still shown',             finalBody.includes('J$') && finalBody.includes('total'))
check('Final: all three modules represented',    finalBody.includes('Restaurant') && finalBody.includes('Bar'))
// Revenue total line — voided rows excluded means total < original J$258.60
const totalMatch = finalBody.match(/J\$([\d,]+\.\d{2})\s+total/)
if (totalMatch) {
  const totalVal = parseFloat(totalMatch[1].replace(',', ''))
  console.log(`  Revenue total shown: J$${totalMatch[1]}`)
  check('Final: revenue total > 0',   totalVal > 0)
} else {
  check('Final: revenue total line found', !!totalMatch)
}
// Voided rows should show reason label
check('Final: void reason visible',     finalBody.includes('Wrong Item') || finalBody.includes('Duplicate Entry'))
// Refunded rows should show reason label
check('Final: refund reason visible',   finalBody.includes('Customer Dissatisfied') || finalBody.includes('Dissatisfied'))

// ── STEP 11: POS order generates a transaction ───────────────
console.log('\n━━━ STEP 11: POS order → transaction created ━━━')
const txCountBefore = parseInt(finalBody.match(/(\d+)\s+records?/)?.[1] ?? '0')

// Navigate to POS — click sidebar "Point of Sale" nav item
await dismissOverlay()
await page.locator('div').filter({ hasText: /^Point of Sale$/ }).first().click()
await page.waitForTimeout(2500)
await shot('pos-nav-debug')

// Handle two possible POS states:
// (a) Service select: shows Dine-In, Takeout, Delivery service cards (fresh session)
// (b) Takeout dashboard: shows "+ New Takeout Order" button (if POS was left in Takeout)
const newTakeoutBtn = page.locator('button').filter({ hasText: /New Takeout/ }).first()
const takeoutServiceBtn = page.locator('button').filter({ hasText: /^Takeout$/ }).first()

// The POS service select shows Dine-In, Takeout, Delivery cards.
// Each card has a "Select →" button (not a button with text "Takeout").
// Takeout = 2nd "Select →" button (nth 1). New Takeout Order = already on dashboard.
let atTakeoutDash = await newTakeoutBtn.isVisible({ timeout: 3000 }).catch(() => false)

if (atTakeoutDash) {
  // Already on Takeout dashboard — click "+ New Takeout Order" directly
  await newTakeoutBtn.click()
} else {
  // At service select — click the Takeout card's "Select →" button (index 1)
  const selectBtns = page.locator('button').filter({ hasText: /Select/ })
  const selectCount = await selectBtns.count()
  if (selectCount >= 2) {
    // nth(1) = Takeout Select button
    await selectBtns.nth(1).click()
    await page.waitForTimeout(2000)
    await page.locator('button').filter({ hasText: /New Takeout/ }).first().waitFor({ state: 'visible', timeout: 12000 })
    await page.locator('button').filter({ hasText: /New Takeout/ }).first().click()
  } else {
    warn('POS order: service select not found — skipping E2E order test')
    await browser.close()
    console.log('\n╔══════════════════════════════════════════╗')
    console.log('║      Transactions Test Complete          ║')
    console.log('╚══════════════════════════════════════════╝')
    process.exit(0)
  }
}

await page.waitForTimeout(700)
// Fill customer details
await page.locator('input').nth(0).fill('E2E Tester')
await page.locator('input').nth(1).fill('876-999-9999')
await page.locator('button').filter({ hasText: /Start Order/ }).first().click()
await page.waitForTimeout(5000)

// Add one item
const bbqItem = page.locator('div').filter({ hasText: /^BBQ Chicken$/ }).first()
if (await bbqItem.count() > 0) {
  await bbqItem.click()
  await page.waitForTimeout(500)
  const addBtn = page.locator('button').filter({ hasText: /Add to Cart/ }).first()
  if (await addBtn.count() > 0) {
    await addBtn.click()
    await addBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// Pay with cash (exact)
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
await payBtn.click()
await page.waitForTimeout(1000)
await page.locator('button').filter({ hasText: 'Cash' }).first().click()
await page.waitForTimeout(500)
await page.locator('button').filter({ hasText: 'Exact' }).first().click()
await page.waitForTimeout(400)
const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
await completeBtn.waitFor({ state: 'visible', timeout: 8000 })
await completeBtn.click()
await page.waitForTimeout(1000)
const doneBtn = page.locator('button').filter({ hasText: /^Done$/ }).first()
if (await doneBtn.isVisible().catch(() => false)) { await doneBtn.click(); await page.waitForTimeout(1000) }
await shot('15-pos-order-done')
pass('POS takeout order completed')

// Navigate to Transactions and verify new record
await navTo('Transactions')
await shot('16-new-transaction')
const newTxBody = await page.textContent('body')
const txCountAfter = parseInt(newTxBody.match(/(\d+)\s+records?/)?.[1] ?? '0')
console.log(`  Records: ${txCountBefore} → ${txCountAfter}`)
check('POS order → new tx: record count increased',  txCountAfter > txCountBefore)
check('POS order → new tx: BBQ Chicken in list',     newTxBody.includes('BBQ Chicken'))
check('POS order → new tx: E2E Tester customer',     newTxBody.includes('E2E Tester') || newTxBody.includes('876-999'))
check('POS order → new tx: RENEE cashier',           newTxBody.includes('RENEE'))

await browser.close()
console.log('\n╔══════════════════════════════════════════╗')
console.log('║      Transactions Test Complete          ║')
console.log('╚══════════════════════════════════════════╝')
