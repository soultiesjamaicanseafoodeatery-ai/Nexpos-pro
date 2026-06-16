import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'workspace-shots')
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 800 })

let n = 0
const shot = async (name) => {
  n++
  const file = path.join(SHOTS, `${String(n).padStart(2,'0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`📸 ${n}: ${name}`)
  return file
}

const BASE = 'https://nexpropos.vercel.app'

// Login helper
async function login() {
  await page.goto(BASE, { timeout: 60000, waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.locator('button').filter({ hasText: 'RENEE' }).first().waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('button').filter({ hasText: 'RENEE' }).first().click()
  await page.waitForTimeout(300)
  for (const d of ['0','6','0','6']) {
    await page.locator('button').filter({ hasText: new RegExp(`^${d}$`) }).first().click()
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(1500)
  console.log('✅ Logged in')
}

console.log('\n=== Order Workspace Test ===\n')
await login()

// ── Test 1: Service Select screen ──
await shot('01-service-select')
const body0 = await page.textContent('body')
console.log('Service select visible:', body0.includes('How is this order'))

// ── Test 2: Dine-In flow ──
console.log('\n--- Dine-In ---')
await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(600)
await shot('02-dine-in-table-grid')
const body1 = await page.textContent('body')
console.log('Table grid visible:', /T\d+/.test(body1))

// Select T3
await page.locator('button', { hasText: 'T3' }).first().click()
await page.waitForTimeout(4000)
await shot('03-dine-in-workspace')
const body2 = await page.textContent('body')
console.log('Workspace header (Dine-In):', body2.includes('Dine-In'))
console.log('Table T3 in header:', body2.includes('T3'))
console.log('Service select gone:', !body2.includes('How is this order'))
console.log('Table selector hidden:', !body2.includes('Select Table'))
console.log('Customer input hidden:', !body2.includes('Customer name (optional)'))
console.log('Menu loaded:', body2.includes('J$'))

// Click Back → should return to table grid (not service select)
await page.locator('button').filter({ hasText: '← Back' }).last().click()
await page.waitForTimeout(500)
const body3 = await page.textContent('body')
console.log('Back → table grid (not service select):', body3.includes('T1') && !body3.includes('How is this order'))
await shot('04-dine-in-back-to-tables')

// Back to service select
await page.locator('button').filter({ hasText: '← Back' }).first().click()
await page.waitForTimeout(400)

// ── Test 3: Takeout flow ──
console.log('\n--- Takeout ---')
await page.locator('button').filter({ hasText: 'Takeout' }).first().click()
await page.waitForTimeout(400)
await shot('05-takeout-dashboard')

await page.locator('button').filter({ hasText: /New Takeout Order/i }).first().click()
await page.waitForTimeout(500)
await shot('06-takeout-form')
const body4 = await page.textContent('body')
console.log('Takeout form visible:', body4.includes('Customer Name') && body4.includes('Phone'))
console.log('Service select NOT showing:', !body4.includes('How is this order'))

// Fill form
await page.locator('input').nth(0).fill('Maria Johnson')
await page.locator('input').nth(1).fill('876-555-0123')
await page.waitForTimeout(200)
await shot('07-takeout-form-filled')

// Start order
await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(4000)
await shot('08-takeout-workspace')
const body5 = await page.textContent('body')
console.log('Takeout workspace header:', body5.includes('Takeout'))
console.log('Customer name in header:', body5.includes('Maria Johnson'))
console.log('Phone in header:', body5.includes('876-555-0123'))
console.log('Menu visible:', body5.includes('J$'))
console.log('Service select gone:', !body5.includes('How is this order'))

// Back to service select
await page.locator('button').filter({ hasText: '← Back' }).last().click()
await page.waitForTimeout(400)
await page.locator('button').filter({ hasText: '← Back' }).first().click()
await page.waitForTimeout(400)

// ── Test 4: Delivery flow ──
console.log('\n--- Delivery ---')
await page.locator('button').filter({ hasText: 'Delivery' }).first().click()
await page.waitForTimeout(400)

await page.locator('button').filter({ hasText: /New Delivery Order/i }).first().click()
await page.waitForTimeout(500)
await shot('09-delivery-form')
const body6 = await page.textContent('body')
console.log('Delivery form visible:', body6.includes('Delivery Address'))

await page.locator('input').nth(0).fill('John Smith')
await page.locator('input').nth(1).fill('876-999-0000')
await page.locator('input').nth(2).fill('14 King Street, Kingston')
await page.waitForTimeout(200)

await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
await page.waitForTimeout(4000)
await shot('10-delivery-workspace')
const body7 = await page.textContent('body')
console.log('Delivery workspace:', body7.includes('Delivery'))
console.log('Customer in header:', body7.includes('John Smith'))
console.log('Address in header:', body7.includes('14 King Street'))

await browser.close()
console.log('\n=== Test complete ===')
