import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'bar-shots')
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

console.log('\n=== Bar Module Test — Vercel Production ===\n')

await page.goto('https://nexpropos.vercel.app', { timeout: 60000, waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// Login as RENEE / 0606
await page.locator('button').filter({ hasText: 'RENEE' }).first().waitFor({ state: 'visible', timeout: 15000 })
await page.locator('button').filter({ hasText: 'RENEE' }).first().click()
await page.waitForTimeout(300)
for (const d of ['0','6','0','6']) {
  await page.locator('button').filter({ hasText: new RegExp(`^${d}$`) }).first().click()
  await page.waitForTimeout(100)
}
await page.waitForTimeout(1500)
console.log('✅ Logged in as RENEE')

// Switch to Bar module via the top module tabs
const barTab = page.locator('button').filter({ hasText: /^Bar$/ }).first()
await barTab.waitFor({ state: 'visible', timeout: 10000 })
await barTab.click()
await page.waitForTimeout(800)
await shot('01-bar-service-select')

const body1 = await page.textContent('body')
console.log('Bar module active:', body1.includes('Bar'))

// Service Select should still show — click Dine-In or Takeout for bar
const dineInBtn = page.locator('button').filter({ hasText: 'Dine-In' }).first()
if (await dineInBtn.count() > 0) {
  await dineInBtn.click()
  await page.waitForTimeout(600)
  await shot('02-bar-dine-in-dashboard')

  // Click first available table (T1)
  const t1 = page.locator('button', { hasText: 'T1' }).first()
  if (await t1.count() > 0) {
    await t1.click()
  } else {
    const anyTable = page.locator('button').filter({ hasText: /T\d+/ }).first()
    if (await anyTable.count() > 0) await anyTable.click()
  }
  await page.waitForTimeout(6000)
  await shot('03-bar-order-entry')

  const body2 = await page.textContent('body')
  const hasBarItems = /rum|vodka|whiskey|gin|tequila|cognac|hennessy|patron|appleton|mojito|beer|shot/i.test(body2)
  const noItems = body2.includes('No items match')
  console.log('Bar menu items loaded:', hasBarItems)
  console.log('"No items match" showing:', noItems)

  // Click a category tab
  const rumTab = page.locator('button').filter({ hasText: /^Rum$/i }).first()
  if (await rumTab.count() > 0) {
    await rumTab.click()
    await page.waitForTimeout(400)
    await shot('04-rum-category')
    console.log('✅ Rum category clicked')
  }

  // Click Vodka tab
  const vodkaTab = page.locator('button').filter({ hasText: /^Vodka$/i }).first()
  if (await vodkaTab.count() > 0) {
    await vodkaTab.click()
    await page.waitForTimeout(400)
    await shot('05-vodka-category')
    console.log('✅ Vodka category clicked')
  }

  // Add a bar item to cart
  const itemBtn = page.locator('button, div[onclick]').filter({ hasText: /Hennessy|Appleton|Patron|Rum|Vodka/i }).first()
  // Try clicking any visible item card
  const allTab = page.locator('button').filter({ hasText: /^All$/ }).first()
  if (await allTab.count() > 0) { await allTab.click(); await page.waitForTimeout(300) }

  await shot('06-bar-all-items')
}

await browser.close()
console.log('\n=== Bar test complete ===')
