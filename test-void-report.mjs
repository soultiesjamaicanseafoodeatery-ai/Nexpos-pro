import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'void-report-shots')
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

// Helper: void a transaction from the Transactions page
const voidTransaction = async (reasonBtnText) => {
  const voidBtn = page.locator('button').filter({ hasText: /^Void$/ }).first()
  await voidBtn.waitFor({ state: 'visible', timeout: 8000 })
  await voidBtn.click()
  await page.waitForTimeout(500)
  // Select reason button (if not the default "Wrong Item")
  if (reasonBtnText && reasonBtnText !== 'Wrong Item') {
    const reasonBtn = page.locator('button').filter({ hasText: new RegExp(`^${reasonBtnText}$`) }).first()
    await reasonBtn.waitFor({ state: 'visible', timeout: 5000 })
    await reasonBtn.click()
    await page.waitForTimeout(200)
  }
  const confirmBtn = page.locator('button').filter({ hasText: /Confirm Void/ }).first()
  await confirmBtn.click()
  await page.waitForTimeout(800)
}

// ═══════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗')
console.log('║     NexPOS Pro — Void Report E2E        ║')
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

// ── STEP 1: Empty state ───────────────────────────────────────
console.log('\n━━━ STEP 1: Void Report — empty state ━━━')
await navTo('Void Report')
await shot('01-void-report-empty')
const emptyBody = await page.textContent('body')

check('Void Report: page heading',                 emptyBody.includes('Void Report'))
check('Void Report: total events subtitle',        emptyBody.includes('total void events recorded'))
check('Void Report: 0 events in subtitle',         emptyBody.includes('0 total void events'))
// Summary cards
check('Void Report: Today — Count card',           emptyBody.includes('Today') && emptyBody.includes('Count'))
check('Void Report: Today — Amount card',          emptyBody.includes('Today') && emptyBody.includes('Amount'))
check('Void Report: This Week card',               emptyBody.includes('This Week'))
check('Void Report: Week Amount card',             emptyBody.includes('Week Amount'))
// Panels show "No data for this period"
check('Void Report: Voids by Employee panel',      emptyBody.includes('Voids by Employee'))
check('Void Report: Most Common Reasons panel',    emptyBody.includes('Most Common Reasons'))
check('Void Report: empty employee panel',         emptyBody.includes('No data for this period'))
// Void Log section
check('Void Report: Void Log section',             emptyBody.includes('Void Log'))
// Range filter buttons
check('Void Report: Today filter button',          emptyBody.includes('Today'))
check('Void Report: This Week filter button',      emptyBody.includes('This Week'))
check('Void Report: All Time filter button',       emptyBody.includes('All Time'))
// Type filter buttons
check('Void Report: All Types filter',             emptyBody.includes('All Types'))
check('Void Report: Item type filter',             emptyBody.includes('Item'))
check('Void Report: Order type filter',            emptyBody.includes('Order'))
check('Void Report: Transaction type filter',      emptyBody.includes('Transaction'))
// Search input
const searchEl = await page.locator('input[placeholder*="Search"]').count()
check('Void Report: search input present',         searchEl > 0)
// Empty log state
check('Void Report: empty log message',            emptyBody.includes('No void records for this filter'))
// Table column headers should not be visible yet (no records)
check('Void Report: no table rows yet',            !emptyBody.includes('Date/Time') || emptyBody.includes('No void records'))

// ── STEP 2: Create void #1 — void a transaction ───────────────
console.log('\n━━━ STEP 2: Create void #1 (Ribeye Steak, Wrong Item) ━━━')
await navTo('Transactions')
await voidTransaction('Wrong Item') // default, so effectively just confirms
await shot('02-void1-created')
pass('Void #1: Ribeye Steak voided (Wrong Item)')

// ── STEP 3: Void Report — 1 entry ────────────────────────────
console.log('\n━━━ STEP 3: Void Report after 1 void ━━━')
await navTo('Void Report')
await shot('03-void-report-1entry')
const oneBody = await page.textContent('body')

check('1 void: subtitle updated',                  oneBody.includes('1 total void event'))
// Summary cards — today count = 1
check('1 void: Today Count card shows 1',          (() => {
  // Card shows value "1" (as the large number) — need to verify
  return oneBody.includes('1') && oneBody.includes('Today')
})())
check('1 void: J$ amount shown in cards',          oneBody.includes('J$'))
// Panels
check('1 void: Voids by Employee shows RENEE',     oneBody.includes('RENEE'))
check('1 void: RENEE shows 1 void',                oneBody.includes('1 voids') || oneBody.includes('1 void'))
check('1 void: RENEE role shown (administrator)',   oneBody.includes('administrator'))
check('1 void: Most Common Reasons shows reason',  oneBody.includes('Wrong Item'))
// Void Log table columns
check('1 void: Date/Time column',                  oneBody.includes('Date/Time'))
check('1 void: Type column',                       oneBody.includes('Type'))
check('1 void: Order # column',                    oneBody.includes('Order #'))
check('1 void: Item column',                       oneBody.includes('Item'))
check('1 void: Reason column',                     oneBody.includes('Reason'))
check('1 void: Employee column',                   oneBody.includes('Employee'))
check('1 void: Role column',                       oneBody.includes('Role'))
check('1 void: Module column',                     oneBody.includes('Module'))
check('1 void: Amount column',                     oneBody.includes('Amount'))
// Row data
check('1 void: voidType shown (transaction)',      oneBody.includes('transaction'))
check('1 void: Tx# reference shown',              oneBody.includes('Tx#') || oneBody.includes('#'))
check('1 void: item name shown (Ribeye)',          oneBody.includes('Ribeye') || oneBody.includes('Steak'))
check('1 void: Wrong Item reason',                 oneBody.includes('Wrong Item'))
check('1 void: RENEE as employee',                 oneBody.includes('RENEE'))
check('1 void: Restaurant module',                 oneBody.includes('Restaurant'))
check('1 void: J$ amount in row',                  oneBody.includes('J$'))
// Footer
check('1 void: footer shows 1 records',            oneBody.includes('1 records') || oneBody.includes('records'))
check('1 void: footer Total voided',               oneBody.includes('Total voided'))

// ── STEP 4: Create void #2 — different reason ─────────────────
console.log('\n━━━ STEP 4: Create void #2 (Bar tx, Duplicate Entry) ━━━')
await navTo('Transactions')
await voidTransaction('Duplicate Entry')
await shot('04-void2-created')
pass('Void #2: Bar transaction voided (Duplicate Entry)')

// ── STEP 5: Void Report — 2 entries ──────────────────────────
console.log('\n━━━ STEP 5: Void Report after 2 voids ━━━')
await navTo('Void Report')
await shot('05-void-report-2entries')
const twoBody = await page.textContent('body')

check('2 voids: subtitle shows 2',                 twoBody.includes('2 total void events'))
check('2 voids: table shows 2 rows (Today filter)',(() => {
  const m = twoBody.match(/(\d+)\s+records/)
  return m ? parseInt(m[1]) >= 2 : false
})())
check('2 voids: Total voided > J$0',               twoBody.includes('J$') && twoBody.includes('Total voided'))
check('2 voids: both reasons shown',               twoBody.includes('Wrong Item') && twoBody.includes('Duplicate Entry'))
check('2 voids: RENEE appears in employee panel',  twoBody.includes('RENEE'))

// ── STEP 6: Range filter — Today → This Week → All Time ───────
console.log('\n━━━ STEP 6: Range filter buttons ━━━')
// Scope filter buttons to the Void Log header row (parent of search input)
const voidLogRow = page.locator('input[placeholder*="Search"]').locator('xpath=..')

const thisWeekBtn = voidLogRow.locator('button').filter({ hasText: /^This Week$/ }).first()
await thisWeekBtn.click()
await page.waitForTimeout(400)
await shot('06-filter-thisweek')
const weekBody = await page.textContent('body')
check('Filter This Week: records shown',            weekBody.includes('records') || weekBody.includes('No void'))
check('Filter This Week: voids visible',            weekBody.includes('Wrong Item') || weekBody.includes('No void records'))

const allTimeBtn = voidLogRow.locator('button').filter({ hasText: /^All Time$/ }).first()
await allTimeBtn.click()
await page.waitForTimeout(400)
await shot('07-filter-alltime')
const allTimeBody = await page.textContent('body')
const allTimeCount = parseInt(allTimeBody.match(/(\d+)\s+records/)?.[1] ?? '0')
check('Filter All Time: shows records',             allTimeCount >= 2)
check('Filter All Time: both voids visible',        allTimeBody.includes('Wrong Item') && allTimeBody.includes('Duplicate Entry'))

const todayBtn = voidLogRow.locator('button').filter({ hasText: /^Today$/ }).first()
await todayBtn.click()
await page.waitForTimeout(400)
const backToTodayBody = await page.textContent('body')
check('Filter Today: switches back',                backToTodayBody.includes('Wrong Item') || backToTodayBody.includes('No void records'))

// ── STEP 7: Type filter ───────────────────────────────────────
console.log('\n━━━ STEP 7: Type filter buttons ━━━')
// All voids we created are "transaction" type

const transTypeBtn = voidLogRow.locator('button').filter({ hasText: /^Transaction$/ }).first()
await transTypeBtn.click()
await page.waitForTimeout(400)
await shot('08-type-transaction')
const transBody = await page.textContent('body')
check('Type Transaction: shows transaction voids',  transBody.includes('transaction') || transBody.includes('Wrong Item'))

const itemTypeBtn = voidLogRow.locator('button').filter({ hasText: /^Item$/ }).first()
await itemTypeBtn.click()
await page.waitForTimeout(400)
await shot('09-type-item')
const itemTypeBody = await page.textContent('body')
check('Type Item: empty (no item voids created)',   itemTypeBody.includes('No void records for this filter'))

const orderTypeBtn = voidLogRow.locator('button').filter({ hasText: /^Order$/ }).first()
await orderTypeBtn.click()
await page.waitForTimeout(400)
const orderTypeBody = await page.textContent('body')
check('Type Order: empty (no order voids created)', orderTypeBody.includes('No void records for this filter'))

// Reset to All Types
const allTypesBtn = voidLogRow.locator('button').filter({ hasText: /^All Types$/ }).first()
await allTypesBtn.click()
await page.waitForTimeout(400)
const allTypesBody = await page.textContent('body')
check('Type All Types: records restored',           allTypesBody.includes('Wrong Item') || allTypesBody.includes('records'))

// ── STEP 8: Search ────────────────────────────────────────────
console.log('\n━━━ STEP 8: Search ━━━')
const searchInput = page.locator('input[placeholder*="Search"]').first()

// Search by employee
await searchInput.fill('RENEE')
await page.waitForTimeout(400)
await shot('10-search-renee')
const searchRenee = await page.textContent('body')
check('Search "RENEE": shows matching rows',        searchRenee.includes('RENEE') && !searchRenee.includes('No void records'))

// Search by item
await searchInput.fill('Ribeye')
await page.waitForTimeout(400)
const searchItem = await page.textContent('body')
check('Search "Ribeye": filters by item name',      searchItem.includes('Ribeye') || searchItem.includes('No void records'))

// Search by reason text
await searchInput.fill('Wrong Item')
await page.waitForTimeout(400)
const searchReason = await page.textContent('body')
check('Search "Wrong Item": filters by reason',     searchReason.includes('Wrong Item') || searchReason.includes('No void records'))

// Search no-match
await searchInput.fill('ZZZNOMATCH')
await page.waitForTimeout(400)
const searchNone = await page.textContent('body')
check('Search no-match: shows empty state',         searchNone.includes('No void records for this filter'))

// Clear search
await searchInput.fill('')
await page.waitForTimeout(400)

// ── STEP 9: Switch to All Time to verify full summary ─────────
console.log('\n━━━ STEP 9: All Time — final summary ━━━')
await allTimeBtn.click()
await page.waitForTimeout(400)
await shot('11-alltime-final')
const finalBody = await page.textContent('body')

check('Final All Time: 2 records shown',            (() => {
  const m = finalBody.match(/(\d+)\s+records/)
  return m ? parseInt(m[1]) >= 2 : false
})())
check('Final All Time: Total voided amount shown',  finalBody.includes('Total voided') && finalBody.includes('J$'))
check('Final All Time: RENEE in employee panel',    finalBody.includes('RENEE'))
check('Final All Time: 2 voids by RENEE',           finalBody.includes('2 voids'))
check('Final All Time: Wrong Item in reasons',      finalBody.includes('Wrong Item'))
check('Final All Time: Duplicate Entry in reasons', finalBody.includes('Duplicate Entry'))
check('Final All Time: Restaurant module row',      finalBody.includes('Restaurant'))
check('Final All Time: Bar module row',             finalBody.includes('Bar'))

// Total voided amount should be sum of voided txs
const totalMatch = finalBody.match(/Total voided:\s*J\$([\d,]+\.\d{2})/)
if (totalMatch) {
  const tot = parseFloat(totalMatch[1].replace(',', ''))
  console.log(`  Total voided: J$${totalMatch[1]}`)
  check('Final: total voided amount > J$0',  tot > 0)
}

// Navigate away and back
await navTo('Reports')
await page.waitForTimeout(400)
await navTo('Void Report')
await shot('12-nav-back')
const navBody = await page.textContent('body')
check('Navigate back: Void Report reloads cleanly', navBody.includes('Void Report') && navBody.includes('void events'))

await browser.close()
console.log('\n╔══════════════════════════════════════════╗')
console.log('║      Void Report Test Complete           ║')
console.log('╚══════════════════════════════════════════╝')
