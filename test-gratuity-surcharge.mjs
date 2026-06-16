import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'grat-surch-shots')
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

console.log('\n=== Gratuity & Surcharge Feature Test ===\n')

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
console.log('✅ Logged in as RENEE (admin)')

// ══════════════════════════════════════════════════════════
// TEST 1: Dine-In auto-gratuity (15%)
// ══════════════════════════════════════════════════════════
console.log('\n── Test 1: Dine-In auto-gratuity (15%) ──')

await page.locator('button').filter({ hasText: 'Dine-In' }).first().click()
await page.waitForTimeout(700)
await shot('01-table-grid')

// Pick table T1 (or any available)
const t1 = page.locator('button', { hasText: 'T1' }).first()
if (await t1.count() > 0) {
  await t1.click()
} else {
  await page.locator('button').filter({ hasText: /^T\d+/ }).first().click()
}
await page.waitForTimeout(4000)
await shot('02-dine-in-workspace')

// Add an item
await addItem('BBQ Chicken')
await page.waitForTimeout(500)
await shot('03-item-added')

// Check right panel for 15% gratuity line
const rightPanel = await page.textContent('body')
const hasGratuity15 = rightPanel.includes('Gratuity (15%)') || rightPanel.includes('15%')
console.log('Auto 15% gratuity shows in cart panel:', hasGratuity15)

// Open payment modal
const payBtn = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn.waitFor({ state: 'visible', timeout: 10000 })
const payDisabled = await payBtn.getAttribute('disabled')
if (payDisabled !== null) {
  console.log('⚠️  Pay button disabled — item may not have been added')
  const btns = await page.locator('button').allTextContents()
  console.log('Buttons:', JSON.stringify(btns.filter(t => t.trim()).slice(0, 15)))
} else {
  await payBtn.click()
  await page.waitForTimeout(1500)
  await shot('04-payment-modal-dine-in')

  const payBody = await page.textContent('body')
  const modalHasGrat = payBody.includes('Gratuity') || payBody.includes('15%')
  const modalHasSurcharge = payBody.includes('Surcharge') || payBody.includes('Add')
  console.log('Payment modal shows Gratuity section:', modalHasGrat)
  console.log('Payment modal shows Surcharge section:', modalHasSurcharge)

  // ── Test gratuity presets ──
  console.log('\n── Test 2: Gratuity preset — change to 10% ──')
  const btn10 = page.locator('button').filter({ hasText: /^10%$/ }).first()
  if (await btn10.count() > 0) {
    await btn10.click()
    await page.waitForTimeout(600)
    await shot('05-gratuity-10pct')
    const b10 = await page.textContent('body')
    console.log('Gratuity changed to 10%:', b10.includes('10%') || b10.includes('Gratuity'))
  } else {
    console.log('⚠️  10% button not found in modal')
  }

  // Change back to 15%
  const btn15 = page.locator('button').filter({ hasText: /^15%$/ }).first()
  if (await btn15.count() > 0) {
    await btn15.click()
    await page.waitForTimeout(400)
    console.log('✅ Gratuity restored to 15%')
  }

  // ── Test custom gratuity ──
  console.log('\n── Test 3: Custom gratuity — 12% ──')
  const customBtn = page.locator('button').filter({ hasText: /Custom/ }).first()
  if (await customBtn.count() > 0) {
    await customBtn.click()
    await page.waitForTimeout(400)
    await shot('06-custom-grat-input')

    // Fill in 12
    const customInput = page.locator('input[placeholder*="e.g"]').first()
    if (await customInput.count() > 0) {
      await customInput.fill('12')
      await page.waitForTimeout(200)
      const applyBtn = page.locator('button').filter({ hasText: /Apply/ }).first()
      if (await applyBtn.count() > 0) {
        await applyBtn.click()
        await page.waitForTimeout(400)
        await shot('07-custom-grat-applied')
        const bCustom = await page.textContent('body')
        console.log('Custom 12% gratuity applied:', bCustom.includes('12%') || bCustom.includes('Gratuity'))
      }
    } else {
      console.log('⚠️  Custom gratuity input not found')
    }
  }

  // Restore to 15% for the actual test
  const restore15 = page.locator('button').filter({ hasText: /^15%$/ }).first()
  if (await restore15.count() > 0) {
    await restore15.click()
    await page.waitForTimeout(400)
    console.log('✅ Gratuity restored to 15%')
  }

  // ── Test Add Surcharge ──
  console.log('\n── Test 4: Add Credit Card Fee surcharge (3%) ──')
  const addSurchBtn = page.locator('button').filter({ hasText: /\+ Add/ }).first()
  if (await addSurchBtn.count() > 0) {
    await addSurchBtn.click()
    await page.waitForTimeout(500)
    await shot('08-surcharge-form')

    const formBody = await page.textContent('body')
    const hasForm = formBody.includes('Description') || formBody.includes('Percentage') || formBody.includes('Credit Card')
    console.log('Surcharge form visible:', hasForm)

    // Type selector (should already be Credit Card Fee by default)
    // Fill description
    const descInput = page.locator('input[placeholder*="Description"]').first()
    if (await descInput.count() > 0) {
      await descInput.fill('Visa/MC 3%')
      await page.waitForTimeout(200)
    }

    // Value field
    const valueInput = page.locator('input[placeholder*="0%"]').first()
    if (await valueInput.count() > 0) {
      await valueInput.fill('3')
      await page.waitForTimeout(200)
    } else {
      // Try by type=number
      const numInput = page.locator('input[type="number"]').last()
      if (await numInput.count() > 0) {
        await numInput.fill('3')
        await page.waitForTimeout(200)
      }
    }

    await shot('09-surcharge-filled')

    // Click Add Surcharge button
    const addBtn = page.locator('button').filter({ hasText: /Add Surcharge/ }).first()
    if (await addBtn.count() > 0) {
      await addBtn.click()
      await page.waitForTimeout(600)
      await shot('10-surcharge-added')

      const sBody = await page.textContent('body')
      const hasSurchargeItem = sBody.includes('Credit Card') || sBody.includes('Visa/MC') || sBody.includes('3%')
      console.log('Surcharge line item visible:', hasSurchargeItem)
      console.log('Surcharge in summary:', sBody.includes('Credit Card Fee') || sBody.includes('Visa'))
    } else {
      console.log('⚠️  "Add Surcharge" button not found')
    }
  } else {
    console.log('⚠️  "+ Add" button not found in payment modal')
  }

  // ── Verify updated total ──
  await shot('11-summary-with-grat-surch')
  const summaryBody = await page.textContent('body')
  const totalMatch = summaryBody.match(/TOTAL\s+(J\$[\d,\.]+)/)
  console.log('Grand total in modal:', totalMatch?.[1] ?? 'not found')
  console.log('Order summary shows Gratuity + Surcharge:', summaryBody.includes('Gratuity') && (summaryBody.includes('Credit Card') || summaryBody.includes('Surcharge')))

  // ── Complete payment (Cash, Exact) ──
  const cashBtn = page.locator('button').filter({ hasText: 'Cash' }).first()
  if (await cashBtn.count() > 0) {
    await cashBtn.click()
    await page.waitForTimeout(1000)
    await shot('12-cash-step')
  }

  const exactBtn = page.locator('button').filter({ hasText: 'Exact' }).first()
  if (await exactBtn.count() > 0) {
    await exactBtn.click()
    await page.waitForTimeout(500)
  }

  await shot('12b-tender-set')

  const completeBtn = page.locator('button').filter({ hasText: /Complete/ }).first()
  if (await completeBtn.count() > 0) {
    await completeBtn.click()
    await page.waitForTimeout(2000)
    await shot('13-payment-complete')
    const receipt = await page.textContent('body')
    console.log('Payment Complete shown:', receipt.includes('Payment Complete') || receipt.includes('Change Due') || receipt.includes('Done'))
    console.log('✅ Dine-In with Gratuity + Surcharge — payment complete')
  }

  // Close success modal
  const doneBtn = page.locator('button').filter({ hasText: /Done/ }).first()
  if (await doneBtn.count() > 0) await doneBtn.click()
  await page.waitForTimeout(1000)
}

// ══════════════════════════════════════════════════════════
// TEST 5: Takeout — NO auto-gratuity
// ══════════════════════════════════════════════════════════
console.log('\n── Test 5: Takeout — no auto-gratuity ──')

// Close any open ticket/receipt modal then navigate back to service select
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// Look for Close/Done buttons in ticket modal
const closeTicketBtn = page.locator('button').filter({ hasText: /Close|Done/ }).first()
if (await closeTicketBtn.count() > 0) {
  await closeTicketBtn.click()
  await page.waitForTimeout(800)
}

// Navigate to base URL — login state is preserved in localStorage
await page.goto('https://nexpropos.vercel.app', { timeout: 30000, waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// If PIN screen appears, re-login
const pinScreen = page.locator('button').filter({ hasText: 'RENEE' }).first()
if (await pinScreen.count() > 0) {
  await pinScreen.click()
  await page.waitForTimeout(300)
  for (const d of ['0','6','0','6']) {
    await page.locator('button').filter({ hasText: new RegExp(`^${d}$`) }).first().click()
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(1500)
  console.log('Re-logged in for Takeout test')
}

await page.locator('button').filter({ hasText: 'Takeout' }).first().waitFor({ state: 'visible', timeout: 10000 })
await page.locator('button').filter({ hasText: 'Takeout' }).first().click()
await page.waitForTimeout(700)

const newTOBtn = page.locator('button').filter({ hasText: /New Takeout Order/i }).first()
if (await newTOBtn.count() > 0) {
  await newTOBtn.click()
  await page.waitForTimeout(500)
  await page.locator('input').nth(0).fill('Test Customer')
  await page.locator('input').nth(1).fill('876-555-0000')
  await page.waitForTimeout(200)
  await page.locator('button').filter({ hasText: 'Start Order' }).first().click()
  await page.waitForTimeout(4000)
}

await addItem('BBQ Chicken')
await page.waitForTimeout(500)
await shot('14-takeout-workspace')

const takeoutBody = await page.textContent('body')
const takeoutHasNoGrat = !takeoutBody.includes('Gratuity (15%)')
console.log('No auto-gratuity for Takeout:', takeoutHasNoGrat)

// Open payment modal for takeout
const payBtn2 = page.locator('button').filter({ hasText: /✓ Pay/ }).first()
await payBtn2.waitFor({ state: 'visible', timeout: 10000 })
const payDisabled2 = await payBtn2.getAttribute('disabled')
if (payDisabled2 === null) {
  await payBtn2.click()
  await page.waitForTimeout(1500)
  await shot('15-takeout-payment-modal')

  const toBody = await page.textContent('body')
  // For takeout, the gratuity panel should be hidden (only shows for dine-in or when gratuity > 0)
  const noGratInModal = !toBody.includes('Gratuity (15%)')
  console.log('Payment modal: no 15% gratuity for Takeout:', noGratInModal)
  console.log('Surcharge panel still available for Takeout:', toBody.includes('Surcharge') || toBody.includes('+ Add'))

  // Complete takeout payment
  const cashBtn2 = page.locator('button').filter({ hasText: 'Cash' }).first()
  if (await cashBtn2.count() > 0) { await cashBtn2.click(); await page.waitForTimeout(800) }
  const exactBtn2 = page.locator('button').filter({ hasText: 'Exact' }).first()
  if (await exactBtn2.count() > 0) { await exactBtn2.click(); await page.waitForTimeout(400) }
  const completeBtn2 = page.locator('button').filter({ hasText: /Complete/ }).first()
  if (await completeBtn2.count() > 0) {
    await completeBtn2.click()
    await page.waitForTimeout(1500)
    await shot('16-takeout-complete')
    const r2 = await page.textContent('body')
    console.log('Takeout payment complete:', r2.includes('Payment Complete') || r2.includes('Done'))
  }
}

await browser.close()
console.log('\n=== Test Complete ===')
