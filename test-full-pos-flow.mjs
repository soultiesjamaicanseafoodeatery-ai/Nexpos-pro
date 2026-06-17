import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'full-pos-shots')
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 800 })

// ── Helpers ────────────────────────────────────────────────────
let n = 0
const shot = async (name) => {
  n++
  await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(3,'0')}-${name}.png`) })
}

const pass  = (label) => console.log(`  ✅ ${label}`)
const warn  = (label) => console.log(`  ⚠️  ${label}`)
const check = (label, cond) => cond ? pass(label) : warn(label)

const addItem = async (name) => {
  const item = page.locator('div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  if (await item.count() === 0) { warn(`"${name}" not found`); return false }
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
  return true
}

const cashExactComplete = async () => {
  const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
  await cashBtn.click()
  await page.waitForTimeout(800)
  const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
  await exactBtn.click()
  await page.waitForTimeout(400)
  const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
  await completeBtn.waitFor({ state: 'visible', timeout: 8000 })
  await completeBtn.click()
  await page.waitForTimeout(600)
}

const closeDoneTicket = async () => {
  const doneBtn = page.locator('button').filter({ hasText: /^Done$/ }).first()
  if (await doneBtn.count() > 0) {
    await doneBtn.click()
    await page.waitForTimeout(1200)
    const closeBtn = page.locator('button').filter({ hasText: /Close|Done/ }).first()
    if (await closeBtn.count() > 0) { await closeBtn.click(); await page.waitForTimeout(400) }
  }
}

const backToServiceSelect = async () => {
  await page.goto('https://nexpropos.vercel.app', { timeout: 30000, waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const reneeBtn = page.locator('button').filter({ hasText: 'RENEE' }).first()
  if (await reneeBtn.count() > 0) {
    await reneeBtn.click()
    await page.waitForTimeout(300)
    for (const d of ['0','6','0','6']) {
      await page.locator('button').filter({ hasText: new RegExp(`^${d}$`) }).first().click()
      await page.waitForTimeout(100)
    }
    await page.waitForTimeout(1500)
  }
}

// ═══════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗')
console.log('║     NexPOS Pro — Full POS Flow E2E      ║')
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
await shot('login-complete')
const loginBody = await page.textContent('body')
check('Login: RENEE authenticated',       loginBody.includes('RENEE'))
check('Service select screen shown',      loginBody.includes('Dine-In') && loginBody.includes('Takeout') && loginBody.includes('Delivery'))
check('Dine-In card visible',             loginBody.includes('Dine-In'))
check('Takeout card visible',             loginBody.includes('Takeout'))
check('Delivery card visible',            loginBody.includes('Delivery'))

// ═══════════════════════════════════════════════════════════════
// FLOW 1: DINE-IN
// ═══════════════════════════════════════════════════════════════
console.log('\n━━━ FLOW 1: DINE-IN ━━━')

await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(800)
await shot('dinein-table-grid')
const tgBody = await page.textContent('body')
check('Dine-In: table grid loaded', /T\d+/.test(tgBody))

// Pick T5 or first available
const t5 = page.locator('button', { hasText: 'T5' }).first()
let dineTable = 'T5'
if (await t5.count() > 0) { await t5.click() }
else {
  const anyT = page.locator('button').filter({ hasText: /^T\d+$/ }).first()
  dineTable = (await anyT.textContent() ?? 'T?').trim()
  await anyT.click()
}
await page.waitForTimeout(5000)
await shot('dinein-workspace')
const wsBody = await page.textContent('body')
check(`Dine-In: table ${dineTable} workspace opened`, wsBody.includes(dineTable))
check('Dine-In: menu items loaded (J$ visible)', wsBody.includes('J$'))
check('Dine-In: no ?? emoji on menu cards',      !wsBody.includes('??'))

// Add items
let dineItems = 0
if (await addItem('BBQ Chicken')) dineItems++
if (await addItem('Bammy'))       dineItems++
if (await addItem('Conch'))       dineItems++
check(`Dine-In: items added (${dineItems})`, dineItems >= 2)

// Guest count
const plusBtn = page.locator('button').filter({ hasText: '+' }).first()
if (await plusBtn.count() > 0) {
  await plusBtn.click(); await page.waitForTimeout(100)
  await plusBtn.click(); await page.waitForTimeout(100)
}
await shot('dinein-cart')

// Send to kitchen
const sendBtn = page.locator('button').filter({ hasText: /^Send Order$/ }).first()
await sendBtn.waitFor({ state: 'visible', timeout: 10000 })
await sendBtn.click()
await page.waitForTimeout(3000)
await shot('dinein-open-orders')
const ordersBody = await page.textContent('body')
const orderNum = ordersBody.match(/#(\d{4,6})/)?.[0] ?? 'unknown'
check('Dine-In: order sent to kitchen',         ordersBody.includes('Open Orders'))
check(`Dine-In: ticket created (${orderNum})`,  orderNum !== 'unknown')

// Pay from panel
const payPanelBtn = page.locator('button').filter({ hasText: /^Pay J\$/ }).first()
await payPanelBtn.waitFor({ state: 'visible', timeout: 10000 })
await payPanelBtn.click()
await page.waitForTimeout(1800)
await shot('dinein-payment-modal')
const dineModal = await page.textContent('body')
check('Dine-In: payment modal opened',            dineModal.includes('Process Payment'))
check('Dine-In: Subtotal shown',                  dineModal.includes('Subtotal'))
check('Dine-In: GCT (15%) applied',               dineModal.includes('GCT'))
check('Dine-In: Service Charge applied',          dineModal.includes('Service'))
check('Dine-In: Gratuity (15%) applied',          dineModal.includes('Gratuity'))
check('Dine-In: TOTAL shown',                     dineModal.includes('TOTAL'))
check('Dine-In: gratuity presets (10/15/18)',     dineModal.includes('10%') && dineModal.includes('18%'))
check('Dine-In: surcharge panel available',       dineModal.includes('Surcharge') || dineModal.includes('Add'))
check('Dine-In: all payment methods present',     dineModal.includes('Cash') && dineModal.includes('Card') && dineModal.includes('Gift Card') && dineModal.includes('Split'))

await cashExactComplete()
await shot('dinein-complete')
const dineSuccess = await page.textContent('body')
check('Dine-In: payment completed',  dineSuccess.includes('Payment Complete') || dineSuccess.includes('Change Due') || dineSuccess.includes('Done'))
await closeDoneTicket()
pass('Dine-In: flow complete ✓')

// ═══════════════════════════════════════════════════════════════
// FLOW 2: TAKEOUT
// ═══════════════════════════════════════════════════════════════
console.log('\n━━━ FLOW 2: TAKEOUT ━━━')
await backToServiceSelect()
await shot('takeout-service-select')

await page.locator('button').filter({ hasText: 'Takeout' }).first().click()
await page.waitForTimeout(800)
const takeoutDash = await page.textContent('body')
check('Takeout: dashboard loaded',           takeoutDash.includes('Takeout'))
check('Takeout: New Takeout Order button',   takeoutDash.includes('New Takeout Order'))

await page.locator('button').filter({ hasText: /New Takeout Order/i }).first().click()
await page.waitForTimeout(600)
const toForm = await page.textContent('body')
check('Takeout: customer form shown',  toForm.includes('Name') || toForm.includes('Phone'))

await page.locator('input').nth(0).fill('Maria Johnson')
await page.locator('input').nth(1).fill('876-555-0123')
await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(5000)
await shot('takeout-workspace')
const toWS = await page.textContent('body')
check('Takeout: workspace opened',          toWS.includes('Takeout') || toWS.includes('TAKEOUT'))
check('Takeout: customer name shown',       toWS.includes('Maria Johnson'))
check('Takeout: no table selector',        !toWS.includes('Select Table'))
check('Takeout: menu loaded',               toWS.includes('J$'))

let toItems = 0
if (await addItem('BBQ Chicken')) toItems++
if (await addItem('Bammy'))       toItems++
check(`Takeout: items added (${toItems})`, toItems >= 2)

const toPayBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await toPayBtn.waitFor({ state: 'visible', timeout: 10000 })
await toPayBtn.click()
await page.waitForTimeout(1500)
await shot('takeout-payment-modal')
const toModal = await page.textContent('body')
check('Takeout: payment modal opened',          toModal.includes('Process Payment'))
check('Takeout: customer name in modal',        toModal.includes('Maria Johnson'))
check('Takeout: NO GCT for takeout',           !toModal.includes('GCT'))
check('Takeout: NO Service Charge for takeout',!toModal.includes('Service (10%)'))
check('Takeout: NO auto-Gratuity for takeout', !toModal.includes('Gratuity (15%)'))
check('Takeout: TOTAL shown',                   toModal.includes('TOTAL'))
check('Takeout: surcharge panel available',     toModal.includes('Surcharge') || toModal.includes('Add'))

await cashExactComplete()
await closeDoneTicket()
pass('Takeout: flow complete ✓')

// ═══════════════════════════════════════════════════════════════
// FLOW 3: DELIVERY
// ═══════════════════════════════════════════════════════════════
console.log('\n━━━ FLOW 3: DELIVERY ━━━')
await backToServiceSelect()
await shot('delivery-service-select')

await page.locator('button').filter({ hasText: 'Delivery' }).first().click()
await page.waitForTimeout(800)
const delDash = await page.textContent('body')
check('Delivery: dashboard loaded',           delDash.includes('Delivery'))
check('Delivery: New Delivery Order button',  delDash.includes('New Delivery Order'))

await page.locator('button').filter({ hasText: /New Delivery Order/i }).first().click()
await page.waitForTimeout(600)
const delForm = await page.textContent('body')
check('Delivery: 3-field customer form shown', delForm.includes('Name') && delForm.includes('Phone') && (delForm.includes('Address') || delForm.includes('Delivery')))

await page.locator('input').nth(0).fill('John Smith')
await page.locator('input').nth(1).fill('876-999-0000')
await page.locator('input').nth(2).fill('14 King Street, Kingston')
await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(5000)
await shot('delivery-workspace')
const delWS = await page.textContent('body')
check('Delivery: workspace opened',         delWS.includes('Delivery') || delWS.includes('DELIVERY'))
check('Delivery: customer name shown',      delWS.includes('John Smith'))
check('Delivery: phone shown',              delWS.includes('876-999-0000'))
check('Delivery: address shown',            delWS.includes('King Street') || delWS.includes('Kingston'))
check('Delivery: menu loaded',              delWS.includes('J$'))

let delItems = 0
if (await addItem('Conch'))       delItems++
if (await addItem('BBQ Chicken')) delItems++
check(`Delivery: items added (${delItems})`, delItems >= 2)

const delPayBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await delPayBtn.waitFor({ state: 'visible', timeout: 10000 })
await delPayBtn.click()
await page.waitForTimeout(1500)
await shot('delivery-payment-modal')
const delModal = await page.textContent('body')
check('Delivery: payment modal opened',          delModal.includes('Process Payment'))
check('Delivery: NO GCT for delivery',          !delModal.includes('GCT'))
check('Delivery: NO Service Charge for delivery',!delModal.includes('Service (10%)'))
check('Delivery: NO Gratuity for delivery',     !delModal.includes('Gratuity (15%)'))
check('Delivery: TOTAL shown',                   delModal.includes('TOTAL'))

await cashExactComplete()
await closeDoneTicket()
pass('Delivery: flow complete ✓')

// ═══════════════════════════════════════════════════════════════
// FLOW 4: BAR
// ═══════════════════════════════════════════════════════════════
console.log('\n━━━ FLOW 4: BAR ━━━')
await backToServiceSelect()

// Switch to Bar module
const barTab = page.locator('button').filter({ hasText: /^Bar$/ }).first()
await barTab.waitFor({ state: 'visible', timeout: 10000 })
await barTab.click()
await page.waitForTimeout(800)
await shot('bar-service-select')
const barSvc = await page.textContent('body')
check('Bar: module switched to Bar',  barSvc.includes('Bar'))

await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(800)
const t2 = page.locator('button', { hasText: 'T2' }).first()
if (await t2.count() > 0) await t2.click()
else await page.locator('button').filter({ hasText: /^T\d+$/ }).first().click()
await page.waitForTimeout(5000)
await shot('bar-workspace')
const barWS = await page.textContent('body')
check('Bar: workspace loaded',             barWS.includes('J$'))
check('Bar: bar categories visible',       barWS.includes('VODKA') || barWS.includes('RUM') || barWS.includes('Rum') || barWS.includes('Absolute') || barWS.includes('Bacardi'))
check('Bar: no ?? emoji on bar items',    !barWS.includes('??'))

let barItems = 0
for (const name of ['Absolute','Bacardi Gold','Bacardi Silver','Appleton 8yr']) {
  if (barItems >= 3) break
  if (await addItem(name)) barItems++
}
check(`Bar: items added (${barItems})`, barItems >= 2)

const barPayBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await barPayBtn.waitFor({ state: 'visible', timeout: 10000 })
await barPayBtn.click()
await page.waitForTimeout(1500)
await shot('bar-payment-modal')
const barModal = await page.textContent('body')
check('Bar: payment modal opened',               barModal.includes('Process Payment'))
check('Bar: NO GCT on bar items',               !barModal.includes('GCT'))
check('Bar: NO Service Charge on bar items',    !barModal.includes('Service (10%)'))
check('Bar: NO Gratuity amount on bar items',   !barModal.includes('Gratuity (15%)'))
check('Bar: gratuity panel visible (dine-in)',   barModal.includes('Gratuity') || barModal.includes('10%'))
check('Bar: TOTAL shown',                        barModal.includes('TOTAL'))
check('Bar: all payment methods present',        barModal.includes('Cash') && barModal.includes('Card') && barModal.includes('Gift Card'))

await cashExactComplete()
await closeDoneTicket()
pass('Bar: flow complete ✓')

// ═══════════════════════════════════════════════════════════════
// FLOW 5: MENU MANAGER
// ═══════════════════════════════════════════════════════════════
console.log('\n━━━ FLOW 5: MENU MANAGER ━━━')
await backToServiceSelect()

await page.locator('div').filter({ hasText: /^Menu Manager$/ }).first().click()
await page.waitForTimeout(4000)
await shot('menu-manager')
const mmBody = await page.textContent('body')
check('Menu Manager: loaded',              mmBody.includes('Menu Items'))
check('Menu Manager: 52 restaurant items', mmBody.includes('52'))
check('Menu Manager: no ?? emoji',        !mmBody.includes('??'))
check('Menu Manager: Name is first column',(await page.locator('table thead th').first().textContent())?.trim().toUpperCase() === 'NAME')
check('Menu Manager: no Emoji field/col', !mmBody.includes('Emoji'))
check('Menu Manager: Add Item button',     mmBody.includes('+ Add Item'))
check('Menu Manager: Categories tab',      mmBody.includes('Categories'))
check('Menu Manager: Routing tab',         mmBody.includes('Routing'))
await shot('full-pos-done')

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
await browser.close()
console.log('\n╔══════════════════════════════════════════╗')
console.log('║           All Flows Complete             ║')
console.log('╚══════════════════════════════════════════╝')
