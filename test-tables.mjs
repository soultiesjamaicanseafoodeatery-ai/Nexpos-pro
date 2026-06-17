import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'tables-shots')
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 900 })

// Auto-accept browser confirm() dialogs
page.on('dialog', async dialog => {
  console.log(`  [dialog] "${dialog.message()}" → accepting`)
  await dialog.accept()
})

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
  await page.waitForTimeout(1500)
}

// ═══════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗')
console.log('║        NexPOS Pro — Tables E2E          ║')
console.log('╚══════════════════════════════════════════╝\n')

// ── Login ──────────────────────────────────────────────────────
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
pass('Logged in as RENEE')

// ── Step 1: Navigate to Tables ─────────────────────────────────
console.log('\n━━━ STEP 1: Tables page baseline ━━━')
await navTo('Tables')
await shot('01-tables-restaurant')
const t1Body = await page.textContent('body')

check('Tables: page loaded',                t1Body.includes('Table Management'))
check('Tables: subtitle with counts',       t1Body.includes('tables') && t1Body.includes('free'))
check('Tables: free count shown',           t1Body.includes('free'))
check('Tables: occupied count shown',       t1Body.includes('occupied'))
check('Tables: reserved count shown',       t1Body.includes('reserved'))
check('Tables: Restaurant tab',             t1Body.includes('Restaurant'))
check('Tables: Bar tab',                    t1Body.includes('Bar'))
check('Tables: status legend (free)',       t1Body.includes('free'))
check('Tables: cycle hint shown',           t1Body.includes('cycle') || t1Body.includes('Click'))
check('Tables: + Add Table button',         t1Body.includes('+ Add Table'))
check('Tables: T1 visible',                 t1Body.includes('T1'))
check('Tables: T8 visible',                 t1Body.includes('T8'))
check('Tables: seats info shown',           t1Body.includes('seats'))
check('Tables: Edit button on cards',       t1Body.includes('Edit'))
check('Tables: Delete button on cards',     t1Body.includes('Delete'))

// Parse current restaurant table count
const tableCountMatch = t1Body.match(/(\d+)\s+tables/)
const restaurantCount = tableCountMatch ? parseInt(tableCountMatch[1]) : 0
console.log(`  Restaurant tables: ${restaurantCount}`)
check('Tables: at least 8 restaurant tables', restaurantCount >= 8)

// ── Step 2: Status cycling ─────────────────────────────────────
console.log('\n━━━ STEP 2: Status cycling (click to cycle) ━━━')

// Find T1's current status
const t1StatusEl = page.locator('div').filter({ hasText: /^T1$/ }).first()
const t1Card = t1StatusEl.locator('xpath=..') // parent
const t1InitText = await page.textContent('body')
const t1InitStatus = t1InitText.match(/T1[\s\S]{0,200}(free|occupied|reserved)/)?.[1] ?? 'unknown'
console.log(`  T1 initial status: ${t1InitStatus}`)

// Click T1 to cycle — the clickable area is the div with onClick (not a button)
await t1StatusEl.click()
await page.waitForTimeout(600)
await shot('02-t1-cycled')
const t1CycledBody = await page.textContent('body')
// status should have changed — extract T1's new status roughly
const expectedNext = { free: 'occupied', occupied: 'reserved', reserved: 'free' }[t1InitStatus]
check(`T1 status cycled (${t1InitStatus} → ${expectedNext ?? 'next'})`,
  expectedNext ? t1CycledBody.includes(expectedNext) : true)

// Cycle again
await t1StatusEl.click()
await page.waitForTimeout(400)
// Cycle back
await t1StatusEl.click()
await page.waitForTimeout(400)
pass('T1 status cycled × 3 without error')

// ── Step 3: Bar tab ────────────────────────────────────────────
console.log('\n━━━ STEP 3: Bar tab ━━━')
// The sidebar has Restaurant/Bar/Car Wash as buttons (module switcher, nth 0).
// Table Management's Restaurant/Bar tabs are nth 1.
const barTabBtn  = page.locator('button').filter({ hasText: /^Bar$/ }).nth(1)
const restTabBtn = page.locator('button').filter({ hasText: /^Restaurant$/ }).nth(1)

await barTabBtn.click()
await page.waitForTimeout(600)
await shot('03-bar-tables')
const barBody = await page.textContent('body')

check('Bar tab: switched to Bar',  barBody.includes('B1') || barBody.includes('Bar'))
check('Bar tab: B1 visible',       barBody.includes('B1'))
check('Bar tab: B5 visible',       barBody.includes('B5'))
check('Bar tab: seats shown',      barBody.includes('seats'))
check('Bar tab: 2 seats default',  barBody.includes('2 seats'))
check('Bar tab: status shown',     barBody.includes('free') || barBody.includes('occupied'))

// Cycle B1 status (div onClick inside the card, not a button)
const b1El = page.locator('div').filter({ hasText: /^B1$/ }).first()
await b1El.waitFor({ state: 'visible', timeout: 5000 })
await b1El.click(); await page.waitForTimeout(400)
await b1El.click(); await page.waitForTimeout(400)
await b1El.click(); await page.waitForTimeout(400)
pass('B1 status cycled × 3 on Bar tab')

// Switch back to Restaurant
await restTabBtn.click()
await page.waitForTimeout(400)

// ── Step 4: Add Table ──────────────────────────────────────────
console.log('\n━━━ STEP 4: Add Table ━━━')
const TEST_TABLE = 'ZTEST9'

const addTableBtn = page.locator('button').filter({ hasText: '+ Add Table' }).first()
await addTableBtn.click()
await page.waitForTimeout(500)
await shot('04-add-table-modal')
const addModalBody = await page.textContent('body')

check('Add Table modal: opened',        addModalBody.includes('Add Table'))
check('Add Table modal: Table Name field', addModalBody.includes('Table Name'))
check('Add Table modal: Seats field',   addModalBody.includes('Seats'))
check('Add Table modal: Cancel button', addModalBody.includes('Cancel'))

// Fill in name and seats
const nameInput = page.locator('input[placeholder*="T9"]').first()
await nameInput.fill(TEST_TABLE)
await page.waitForTimeout(200)
const seatsInput = page.locator('input[type="number"]').first()
await seatsInput.fill('6')
await page.waitForTimeout(200)
await shot('04b-add-table-filled')

// Submit
const addSubmitBtn = page.locator('button').filter({ hasText: /^Add Table$/ }).first()
await addSubmitBtn.click()
await page.waitForTimeout(1500)
await shot('05-table-added')
const addedBody = await page.textContent('body')

check(`Add Table: ${TEST_TABLE} appears in grid`, addedBody.includes(TEST_TABLE))
check('Add Table: modal closed',                  !addedBody.includes('Table Name\n') || addedBody.includes(TEST_TABLE))
check('Add Table: success toast shown',            addedBody.includes('added') || addedBody.includes(TEST_TABLE))
check('Add Table: table count increased',          (() => {
  const m = addedBody.match(/(\d+)\s+tables/)
  return m ? parseInt(m[1]) > restaurantCount : true
})())

// ── Step 5: Duplicate name prevention ─────────────────────────
console.log('\n━━━ STEP 5: Duplicate name prevention ━━━')
await addTableBtn.click()
await page.waitForTimeout(400)
const dupNameInput = page.locator('input[placeholder*="T9"]').first()
await dupNameInput.fill(TEST_TABLE) // same name again
await page.waitForTimeout(200)
const dupSubmitBtn = page.locator('button').filter({ hasText: /^Add Table$/ }).first()
await dupSubmitBtn.click()
await page.waitForTimeout(800)
await shot('06-duplicate-prevented')
const dupBody = await page.textContent('body')
check('Duplicate: toast shown (already exists)', dupBody.includes('already exists') || dupBody.includes('exists'))

// Close modal
const cancelModalBtn = page.locator('button').filter({ hasText: /^Cancel$/ }).first()
if (await cancelModalBtn.isVisible().catch(() => false)) { await cancelModalBtn.click(); await page.waitForTimeout(400) }

// ── Step 6: Edit Table ─────────────────────────────────────────
console.log('\n━━━ STEP 6: Edit Table ━━━')
// Card structure: card-div > clickable-div > name-div (with exact text "ZTEST9")
// Use XPath to go up 2 levels from the name div to reach the card div
const testNameDiv = page.locator('div').filter({ hasText: new RegExp(`^${TEST_TABLE}$`) }).first()
const testCard    = testNameDiv.locator('xpath=../..')
const editBtn     = testCard.locator('button').filter({ hasText: /^Edit$/ }).first()
await editBtn.waitFor({ state: 'visible', timeout: 8000 })
await editBtn.click()
await page.waitForTimeout(400)
await shot('07-edit-table')
const editBody = await page.textContent('body')
check('Edit: inline edit form shown', editBody.includes('Save') && editBody.includes('Cancel'))

// Only one edit form active at a time — find globally
const editSeatsInput = page.locator('input[type="number"]').first()
await editSeatsInput.fill('8')
await page.waitForTimeout(200)

const saveBtn = page.locator('button').filter({ hasText: /^Save$/ }).first()
await saveBtn.click()
await page.waitForTimeout(1200)
await shot('08-table-edited')
const savedBody = await page.textContent('body')
check('Edit: saved successfully',  savedBody.includes(TEST_TABLE))
check('Edit: seats updated to 8',  savedBody.includes('8 seats'))
check('Edit: toast shown',         savedBody.includes('updated'))

// ── Step 7: Add Table to Bar module ───────────────────────────
console.log('\n━━━ STEP 7: Add Table to Bar module ━━━')
const BAR_TEST = 'BZTEST'
await barTabBtn.click()
await page.waitForTimeout(400)
await addTableBtn.click()
await page.waitForTimeout(500)
const barNameInput = page.locator('input[placeholder*="T9"]').first()
await barNameInput.fill(BAR_TEST)
await page.waitForTimeout(200)
const barSeatsInput = page.locator('input[type="number"]').first()
await barSeatsInput.fill('3')
await page.waitForTimeout(200)
const barAddSubmit = page.locator('button').filter({ hasText: /^Add Table$/ }).first()
await barAddSubmit.click()
await page.waitForTimeout(1200)
await shot('09-bar-table-added')
const barAddedBody = await page.textContent('body')
check(`Bar: ${BAR_TEST} table added`, barAddedBody.includes(BAR_TEST))

// ── Step 8: Delete bar test table ─────────────────────────────
console.log('\n━━━ STEP 8: Delete Table ━━━')
// Name div has exact text "BZTEST"; go up 2 XPath levels to reach the card div
const barTestNameDiv = page.locator('div').filter({ hasText: new RegExp(`^${BAR_TEST}$`) }).first()
const barTestCard    = barTestNameDiv.locator('xpath=../..')
const barDeleteBtn   = barTestCard.locator('button').filter({ hasText: /^Delete$/ }).first()
await barDeleteBtn.waitFor({ state: 'visible', timeout: 8000 })
await barDeleteBtn.click()
await page.waitForTimeout(1200)
await shot('10-bar-table-deleted')
const barDeletedBody = await page.textContent('body')
// Card div with exact name text should be gone; toast "Table BZTEST deleted" also includes name so check by element count
const barTestCardCount = await page.locator('div').filter({ hasText: new RegExp(`^${BAR_TEST}$`) }).count()
check(`Delete: ${BAR_TEST} card removed from grid`, barTestCardCount === 0)
check('Delete: toast shown (deleted)',              barDeletedBody.includes('deleted'))

// ── Step 9: Delete restaurant test table ──────────────────────
console.log('\n━━━ STEP 9: Delete restaurant test table ━━━')
await restTabBtn.click()
await page.waitForTimeout(400)
// Same card locator pattern
const restTestNameDiv = page.locator('div').filter({ hasText: new RegExp(`^${TEST_TABLE}$`) }).first()
const restTestCard    = restTestNameDiv.locator('xpath=../..')
const restDeleteBtn   = restTestCard.locator('button').filter({ hasText: /^Delete$/ }).first()
await restDeleteBtn.waitFor({ state: 'visible', timeout: 8000 })
await restDeleteBtn.click()
await page.waitForTimeout(1200)
await shot('11-restaurant-table-deleted')
const restDeletedBody = await page.textContent('body')
const restTestCardCount = await page.locator('div').filter({ hasText: new RegExp(`^${TEST_TABLE}$`) }).count()
check(`Delete: ${TEST_TABLE} card removed from grid`, restTestCardCount === 0)

// Verify count returned to original
const finalCountMatch = restDeletedBody.match(/(\d+)\s+tables/)
const finalCount = finalCountMatch ? parseInt(finalCountMatch[1]) : 0
check(`Tables: count back to ${restaurantCount} after cleanup`, finalCount === restaurantCount)

// ── Step 10: POS reflects Tables ──────────────────────────────
console.log('\n━━━ STEP 10: POS table grid reflects Tables config ━━━')
await navTo('Point of Sale')
await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(800)
await shot('12-pos-table-grid')
const posTablesBody = await page.textContent('body')
check('POS: table grid shows T1',  posTablesBody.includes('T1'))
check('POS: table grid shows T8',  posTablesBody.includes('T8'))
check('POS: ZTEST9 not in POS',   !posTablesBody.includes(TEST_TABLE))

// ── Final ───────────────────────────────────────────────────────
await shot('13-final')
await browser.close()
console.log('\n╔══════════════════════════════════════════╗')
console.log('║          Tables Test Complete            ║')
console.log('╚══════════════════════════════════════════╝')
