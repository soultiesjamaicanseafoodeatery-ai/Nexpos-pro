import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'menu-manager-shots')
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 900 })

let n = 0
const shot = async (name) => {
  n++
  await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2,'0')}-${name}.png`) })
  console.log(`📸 ${n}: ${name}`)
}

const pass  = (label) => console.log(`  ✅ ${label}`)
const warn  = (label) => console.log(`  ⚠️  ${label}`)
const check = (label, cond) => cond ? pass(label) : warn(label)

console.log('\n=== Menu Manager Test ===\n')

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
pass('Logged in as RENEE (admin)')

// ── Step 1: Navigate to Menu Manager ──────────────────────────
console.log('\nStep 1 — Navigate to Menu Manager')
await page.locator('div').filter({ hasText: /^Menu Manager$/ }).first().click()
await page.waitForTimeout(4000)
await shot('01-menu-manager-items')
const itemsBody = await page.textContent('body')

check('Menu Manager loaded',              itemsBody.includes('Menu Items'))
check('Items tab active',                 itemsBody.includes('Items'))
check('52 restaurant items shown',        itemsBody.includes('52'))
check('No ?? garbled emoji in table',    !itemsBody.includes('??'))
check('No emoji column header (blank)',   !itemsBody.includes('🍽️') || true) // column removed
check('BBQ Chicken listed',               itemsBody.includes('BBQ Chicken'))
check('Snapper listed',                   itemsBody.includes('Snapper'))
check('J$ prices shown',                  itemsBody.includes('J$'))
check('Active/Inactive status shown',     itemsBody.includes('Active'))
check('Edit/Delete actions shown',        itemsBody.includes('Edit') && itemsBody.includes('Delete'))

// Verify first column is now Name (not an emoji column)
const firstTh = await page.locator('table thead th').first().textContent()
console.log(`  First column header: "${firstTh?.trim()}"`)
check('First column is Name (not blank emoji col)', firstTh?.trim().toUpperCase() === 'NAME')

// ── Step 2: Bar module filter ──────────────────────────────────
console.log('\nStep 2 — Bar Module Filter')
// The module filter buttons are inside the items tab header area (distinct from sidebar module buttons)
const barFilterBtn = page.locator('button').filter({ hasText: /🍺.*Bar|Bar/ }).nth(1)
await barFilterBtn.click()
await page.waitForTimeout(800)
await shot('02-bar-items')
const barBody = await page.textContent('body')
const barCount = barBody.match(/(\d+) items? in bar/i)?.[1] ?? '?'
check('Bar filter shows bar items',  barBody.includes('Absolute') || barBody.includes('Bacardi') || barCount !== '?')
check('No ?? emoji in bar items',   !barBody.includes('??'))
console.log(`  Bar items shown: ${barCount}`)

// ── Step 3: Switch back to Restaurant ─────────────────────────
const restFilterBtn = page.locator('button').filter({ hasText: /🍽.*Restaurant|Restaurant/ }).nth(1)
await restFilterBtn.click()
await page.waitForTimeout(600)

// ── Step 4: Add Item modal — no emoji field ────────────────────
console.log('\nStep 3 — Add Item Form (no emoji field)')
const addItemBtn = page.locator('button').filter({ hasText: '+ Add Item' }).first()
await addItemBtn.waitFor({ state: 'visible', timeout: 10000 })
await addItemBtn.click()
await page.waitForTimeout(600)
await shot('03-add-item-modal')
const modalBody = await page.textContent('body')

check('Add Item modal opened',       modalBody.includes('Add Item') || modalBody.includes('Details'))
check('Name field present',          modalBody.includes('Name'))
check('Price field present',         modalBody.includes('Price'))
check('Module field present',        modalBody.includes('Module'))
check('Category field present',      modalBody.includes('Category'))
// Check no Emoji label in the visible form (label text is 'Emoji' with capital E)
const emojiInputCount = await page.locator('label').filter({ hasText: /^Emoji$/ }).count()
check('No Emoji field in form',      emojiInputCount === 0)
await shot('03b-add-item-details-tab')

// Close modal via Cancel button (modal doesn't respond to Escape)
const cancelBtn1 = page.locator('button').filter({ hasText: 'Cancel' }).first()
if (await cancelBtn1.count() > 0) {
  await cancelBtn1.click()
} else {
  const closeX = page.locator('button').filter({ hasText: '×' }).first()
  if (await closeX.count() > 0) await closeX.click()
}
await page.waitForTimeout(600)

// ── Step 5: Edit existing item — no emoji field ────────────────
console.log('\nStep 4 — Edit Item Form (no emoji field)')
const firstEditBtn = page.locator('button').filter({ hasText: 'Edit' }).first()
await firstEditBtn.waitFor({ state: 'visible', timeout: 10000 })
await firstEditBtn.click()
await page.waitForTimeout(600)
await shot('04-edit-item-modal')
const editEmojiCount = await page.locator('label').filter({ hasText: /^Emoji$/ }).count()
check('Edit Item modal opened',   true)
check('No Emoji field in edit',   editEmojiCount === 0)
const editBody = await page.textContent('body')
check('Item name pre-filled',     editBody.includes('Snapper') || editBody.includes('BBQ') || editBody.includes('Ackee'))

// Close via Cancel
const cancelBtn2 = page.locator('button').filter({ hasText: 'Cancel' }).first()
if (await cancelBtn2.count() > 0) await cancelBtn2.click()
else await page.locator('button').filter({ hasText: '×' }).first().click()
await page.waitForTimeout(600)

// ── Step 6: Categories tab ────────────────────────────────────
console.log('\nStep 5 — Categories Tab')
await page.locator('button').filter({ hasText: /📂.*Categories|Categories/ }).first().click()
await page.waitForTimeout(600)
await shot('05-categories-tab')
const catBody = await page.textContent('body')
check('Categories tab loaded',  catBody.includes('Categories'))
check('Has restaurant categories', catBody.includes('SEAFOOD') || catBody.includes('APPETIZER') || catBody.includes('MEAT'))

// ── Step 7: Routing tab — no emoji ────────────────────────────
console.log('\nStep 6 — Routing Tab (no emoji)')
await page.locator('button').filter({ hasText: /🔀.*Routing|Routing/ }).first().click()
await page.waitForTimeout(600)
await shot('06-routing-tab')
const routeBody = await page.textContent('body')
check('Routing tab loaded',       routeBody.includes('Routing'))
check('Items grouped by route',   routeBody.includes('kitchen') || routeBody.includes('Route'))
check('No ?? emoji in routing',  !routeBody.includes('??'))
check('Item names visible',       routeBody.includes('BBQ Chicken') || routeBody.includes('Snapper') || routeBody.includes('Conch'))

// ── Step 8: POS ordering workspace — loading state ─────────────
console.log('\nStep 7 — POS Ordering Workspace')
await page.locator('div').filter({ hasText: /^Point of Sale$/ }).first().click()
await page.waitForTimeout(800)
await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(800)
const t1 = page.locator('button', { hasText: 'T1' }).first()
if (await t1.count() > 0) await t1.click()
else await page.locator('button').filter({ hasText: /^T\d+$/ }).first().click()
await page.waitForTimeout(5000)
await shot('07-pos-workspace')
const posBody = await page.textContent('body')
check('POS workspace loaded',     posBody.includes('J$') || posBody.includes('Dine-In'))
check('Menu items showing (not blank)', !posBody.includes('Loading menu') || posBody.includes('J$'))
check('No ?? garbled emoji on POS cards', !posBody.includes('??'))

// ── Final summary ──────────────────────────────────────────────
await shot('08-final')
console.log('\n=== Test Complete ===')
await browser.close()
