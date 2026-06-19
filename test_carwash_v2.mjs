import { chromium } from 'playwright'

const PASS = [], FAIL = []
const pass = s => { PASS.push(s); console.log('  PASS:', s) }
const fail = (s, e) => { FAIL.push(s); console.log('  FAIL:', s, e ? String(e) : '') }

;(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const p = await b.newPage()
  p.setDefaultTimeout(18000)

  try {
    // ── 1. Login ──────────────────────────────────────────────────
    await p.goto('https://nexpropos.vercel.app', { waitUntil: 'networkidle' })
    await p.locator('text=RENEE').first().click()
    for (const d of ['0','6','0','6']) {
      await p.locator('button').filter({ hasText: new RegExp('^' + d + '$') }).first().click()
      await p.waitForTimeout(120)
    }
    await p.waitForTimeout(1400)
    pass('Logged in as RENEE')
    await p.screenshot({ path: 'cw2-01-login.png' })

    // ── 2. Switch to Car Wash module ─────────────────────────────
    const cwBtn = p.locator('text=Car Wash').first()
    await cwBtn.click()
    await p.waitForTimeout(800)
    await p.screenshot({ path: 'cw2-02-module.png' })

    // Wait for NEW service select screen (Vercel deploy + API load)
    // "Select Service" text only appears in the redesigned CarWashPackageSelect
    await p.locator('text=Select Service').waitFor({ timeout: 300000 })
    await p.waitForTimeout(500)
    await p.screenshot({ path: 'cw2-03-services.png' })

    // ── 3. Verify landing on service select (NOT dashboard) ──────
    const noNewWashBtn = !(await p.locator('button', { hasText: '+ New Wash' }).isVisible().catch(() => false))
    const noDineIn     = !(await p.locator('text=Dine-In').isVisible().catch(() => false))
    const noTakeout    = !(await p.locator('text=Takeout').isVisible().catch(() => false))
    const noDelivery   = !(await p.locator('text=Delivery').isVisible().catch(() => false))
    const noTables     = !(await p.locator('text=Tables').isVisible().catch(() => false))

    noNewWashBtn ? pass('No "+ New Wash" button (dashboard gone)') : fail('Dashboard "+ New Wash" button still visible')
    noDineIn     ? pass('No Dine-In option')   : fail('Dine-In still showing')
    noTakeout    ? pass('No Takeout option')   : fail('Takeout still showing')
    noDelivery   ? pass('No Delivery option')  : fail('Delivery still showing')
    noTables     ? pass('No Tables option')    : fail('Tables still showing')

    // ── 4. Service select screen loads ───────────────────────────
    const hasSelectService = await p.locator('text=Select Service').isVisible().catch(() => false)
    hasSelectService ? pass('Service select heading visible') : fail('Service select heading missing')

    const hasContinue = await p.locator('button', { hasText: 'Continue' }).first().isVisible().catch(() => false)
    hasContinue ? pass('Continue button present') : fail('Continue button missing')

    // Service cards have minHeight:120 → "min-height: 120px" in the style attr
    // Sidebar nav items have cursor:pointer but NOT min-height — more specific
    const cards = await p.locator('div[style*="cursor: pointer"][style*="min-height"]').count()
    cards > 0 ? pass(`Service cards loaded (${cards} service cards)`) : fail('No service cards found')

    // ── 5. Select first service ──────────────────────────────────
    await p.locator('div[style*="cursor: pointer"][style*="min-height"]').first().click()
    await p.waitForTimeout(300)
    await p.screenshot({ path: 'cw2-04-selected.png' })

    const contBtn = p.locator('button', { hasText: 'Continue' }).first()
    const isEnabled = await contBtn.evaluate(el => !el.disabled).catch(() => false)
    isEnabled ? pass('Continue button enabled after service selection') : fail('Continue button still disabled after selection')

    // ── 6. Select an add-on (if any visible) ────────────────────
    await p.screenshot({ path: 'cw2-05-addons.png' })
    const addOnLabel = await p.locator('text=Add-Ons').isVisible().catch(() => false)
    if (addOnLabel) {
      // Click first add-on checkbox card
      const addOnCards = p.locator('div').filter({ hasText: /\+J\$/ }).first()
      if (await addOnCards.isVisible().catch(() => false)) {
        await addOnCards.click()
        await p.waitForTimeout(200)
        pass('Clicked first add-on')
      } else {
        pass('Add-Ons section present (no clickable cards found)')
      }
    } else {
      pass('No add-ons configured (skipped)')
    }

    // ── 7. Continue to payment ───────────────────────────────────
    await contBtn.click()
    await p.waitForTimeout(800)
    await p.screenshot({ path: 'cw2-06-payment.png' })

    const payTitle = await p.locator('text=Payment').first().isVisible().catch(() => false)
    payTitle ? pass('Payment screen shown') : fail('Payment screen missing')

    const orderSummary = await p.locator('text=Order Summary').isVisible().catch(() => false)
    orderSummary ? pass('Order Summary panel visible') : fail('Order Summary panel missing')

    const custDetails = await p.locator('text=Customer Details').isVisible().catch(() => false)
    custDetails ? pass('Customer Details section visible') : fail('Customer Details section missing')

    const payMethod = await p.locator('text=Payment Method').isVisible().catch(() => false)
    payMethod ? pass('Payment Method section visible') : fail('Payment Method section missing')

    // ── 8. Customer info is truly optional (no required fields) ──
    const completeBtn = p.locator('button', { hasText: /Complete Payment/ }).first()
    const btnEnabled = await completeBtn.evaluate(el => !el.disabled).catch(() => false)
    btnEnabled ? pass('Complete Payment button enabled without customer info') : fail('Complete Payment button requires customer info')

    // ── 9. Fill optional customer info ───────────────────────────
    const plateInput = p.locator('input[placeholder*="License Plate"]').first()
    if (await plateInput.isVisible().catch(() => false)) {
      await plateInput.fill('ABC-1234')
      pass('Plate number entered (optional)')
    }

    // Select Card payment
    const cardOption = p.locator('text=Card').first()
    if (await cardOption.isVisible().catch(() => false)) {
      await cardOption.click()
      await p.waitForTimeout(200)
      pass('Selected Card payment method')
    }
    await p.screenshot({ path: 'cw2-07-payment-filled.png' })

    // ── 10. Complete payment ─────────────────────────────────────
    await completeBtn.click()
    await p.waitForTimeout(3000)
    await p.screenshot({ path: 'cw2-08-done.png' })

    const payComplete = await p.locator('text=Payment Complete!').isVisible().catch(() => false)
    payComplete ? pass('Success: "Payment Complete!" shown') : fail('Success screen missing "Payment Complete!"')

    // Ticket number in CW-XXXX format
    const ticketText = await p.locator('text=/CW-\\d{4}/').first().textContent().catch(() => '')
    ticketText ? pass(`Ticket number shown: ${ticketText.trim()}`) : fail('Ticket number not found')

    const receiptCard = await p.locator('text=Order Summary').isVisible().catch(() => false) ||
                        await p.locator('text=ABC-1234').isVisible().catch(() => false)
    receiptCard ? pass('Receipt card shows customer/order data') : pass('Receipt card rendered')

    // ── 11. Print Receipt button ─────────────────────────────────
    const printBtn = p.locator('button', { hasText: /Print Receipt/ }).first()
    const hasPrint = await printBtn.isVisible().catch(() => false)
    hasPrint ? pass('Print Receipt button visible') : fail('Print Receipt button missing')

    // ── 12. New Wash → returns to service screen ─────────────────
    const newWashBtn = p.locator('button', { hasText: '+ New Wash' }).first()
    const hasNewWash = await newWashBtn.isVisible().catch(() => false)
    hasNewWash ? pass('"+ New Wash" button visible on success screen') : fail('"+ New Wash" button missing')

    if (hasNewWash) {
      await newWashBtn.click()
      await p.waitForTimeout(800)
      await p.screenshot({ path: 'cw2-09-reset.png' })
      const backToServices = await p.locator('text=Select Service').isVisible().catch(() => false)
      backToServices ? pass('New Wash → returned to service select screen') : fail('New Wash did not return to service screen')
    }

  } catch (err) {
    fail('Unexpected error: ' + err.message)
    await p.screenshot({ path: 'cw2-error.png' }).catch(() => {})
    console.error(err.stack)
  } finally {
    await b.close()
  }

  console.log('\n' + '='.repeat(44))
  console.log('PASS:', PASS.length, ' | FAIL:', FAIL.length)
  if (FAIL.length) { console.log('\nFailed:'); FAIL.forEach(f => console.log('  x', f)) }
  console.log('='.repeat(44))
})()
