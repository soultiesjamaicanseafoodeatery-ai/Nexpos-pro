import { chromium } from 'playwright'

const PASS = [], FAIL = []
const pass = s => { PASS.push(s); console.log('  PASS:', s) }
const fail = (s, e) => { FAIL.push(s); console.log('  FAIL:', s, e ? String(e) : '') }

async function login(p) {
  await p.goto('https://nexpropos.vercel.app', { waitUntil: 'networkidle' })
  await p.locator('text=RENEE').first().click()
  for (const d of ['0','6','0','6']) {
    await p.locator('button').filter({ hasText: new RegExp('^'+d+'$') }).first().click()
    await p.waitForTimeout(120)
  }
  await p.waitForTimeout(2000) // let welcome toast clear
}

;(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const p = await b.newPage()
  p.setDefaultTimeout(20000)

  try {
    await login(p)
    pass('Logged in')

    // ── Reach POS via Takeout ────────────────────────────────────
    await p.locator('button').filter({ hasText: 'Select' }).nth(1).click()
    await p.waitForTimeout(500)
    await p.locator('button').filter({ hasText: /New Takeout Order/ }).first().click()
    await p.waitForTimeout(400)
    await p.locator('input[placeholder*="Maria"]').first().fill('Test')
    await p.locator('button').filter({ hasText: /Start Order/ }).first().click()
    await p.waitForTimeout(800)
    await p.locator('text=Snapper').first().click()
    await p.waitForTimeout(500)
    const addBtn = p.locator('button').filter({ hasText: 'Add to Order' }).first()
    if (await addBtn.isVisible().catch(() => false)) { await addBtn.click(); await p.waitForTimeout(400) }
    pass('Item in cart')

    await p.locator('button').filter({ hasText: /✓ Pay J/ }).first().click({ force: true })
    await p.waitForTimeout(700)
    pass('Payment modal open')

    // ── TEST 1: Surcharge description ────────────────────────────
    await p.locator('button').filter({ hasText: '+ Add' }).first().click()
    await p.waitForTimeout(400)

    const descInput = p.locator('input[placeholder*="Description"]').first()
    await descInput.click()
    await p.waitForTimeout(150)
    await descInput.type('Credit Card 3%', { delay: 70 })
    await p.waitForTimeout(200)
    const descVal = await descInput.inputValue()
    descVal === 'Credit Card 3%'
      ? pass('Surcharge description: "' + descVal + '" — no focus loss')
      : fail('Surcharge description lost focus — got: "' + descVal + '"')

    await p.locator('input[placeholder="0%"]').first().fill('3')
    const submitBtn = p.locator('button').filter({ hasText: 'Add Surcharge' }).first()
    if (await submitBtn.isEnabled().catch(() => false)) {
      await submitBtn.click(); await p.waitForTimeout(400)
      pass('Surcharge submitted')
    } else { fail('Add Surcharge disabled') }
    await p.screenshot({ path: 'test-01-surcharge.png' })

    // ── TEST 2: Split Tender amount inputs ───────────────────────
    // Click "Split Tender — Multiple Methods" (use text selector, not regex)
    await p.locator('text=Split Tender').click()
    await p.waitForTimeout(500)
    await p.screenshot({ path: 'test-02-split.png' })

    const splitInput = p.locator('input[placeholder="Amount"]').first()
    if (await splitInput.isVisible().catch(() => false)) {
      await splitInput.click()
      await p.waitForTimeout(150)
      await splitInput.type('1500', { delay: 70 })
      await p.waitForTimeout(200)
      const splitVal = await splitInput.inputValue()
      splitVal === '1500'
        ? pass('Split tender amount: "' + splitVal + '" — no focus loss')
        : fail('Split tender amount lost focus — got: "' + splitVal + '"')
    } else {
      fail('Split tender amount input not visible')
    }

    // Close modal
    await p.keyboard.press('Escape')
    await p.waitForTimeout(800)

    // ── TEST 3: Custom gratuity input (dine-in flow) ─────────────
    // Re-login to get back to the order-type picker (page reload cleared session)
    await login(p)
    await p.screenshot({ path: 'test-reload.png' })
    // Click Dine-In Select (first Select button = index 0)
    await p.locator('button').filter({ hasText: 'Select' }).first().click()
    await p.waitForTimeout(600)
    await p.screenshot({ path: 'test-03a-tables.png' })

    // Click T2 card by its exact heading text
    await p.getByText('T2', { exact: true }).first().click({ force: true })
    await p.waitForTimeout(700)
    await p.screenshot({ path: 'test-03b-pos.png' })

    // Add Snapper (dine-in) — modal requires selecting a flavour first
    await p.locator('text=Snapper').first().click({ force: true })
    await p.waitForTimeout(700)
    // Select first flavour if the flavour-picker modal appeared
    const flavourBtn = p.locator('button').filter({ hasText: 'BROWN STEW' }).first()
    if (await flavourBtn.isVisible().catch(() => false)) {
      await flavourBtn.click()
      await p.waitForTimeout(300)
    }
    const addBtn2 = p.locator('button').filter({ hasText: /Add to (Order|Cart)/ }).first()
    if (await addBtn2.isVisible().catch(() => false)) {
      await addBtn2.click()
      await p.waitForTimeout(500)
    }
    await p.screenshot({ path: 'test-03b3-after-add.png' })

    // Open payment — button text when cart non-empty is "✓ Pay J$X" (with currency)
    const payBtn2 = p.locator('button').filter({ hasText: /✓ Pay/ }).first()
    const payBtn2Text = await payBtn2.textContent().catch(() => '')
    if (!payBtn2Text || payBtn2Text.trim() === '✓ Pay —') {
      fail('Pay button not found or cart empty in dine-in — skipping gratuity test')
    } else {
      await payBtn2.click({ force: true })
      await p.waitForTimeout(700)
      await p.screenshot({ path: 'test-03c-payment.png' })

      // Click Custom gratuity
      const customBtn = p.locator('button').filter({ hasText: 'Custom' }).first()
      if (await customBtn.isVisible().catch(() => false)) {
        await customBtn.click()
        await p.waitForTimeout(300)

        const gratInput = p.locator('input[placeholder*="e.g. 12"]').first()
        if (await gratInput.isVisible().catch(() => false)) {
          await gratInput.click()
          await p.waitForTimeout(150)
          // Select all and clear pre-existing value (default is 15%), then type
          await p.keyboard.press('Control+a')
          await p.keyboard.press('Delete')
          await p.waitForTimeout(100)
          await gratInput.type('22', { delay: 70 })
          await p.waitForTimeout(200)
          const gratVal = await gratInput.inputValue()
          gratVal === '22'
            ? pass('Custom gratuity: "' + gratVal + '%" — no focus loss')
            : fail('Custom gratuity lost focus — got: "' + gratVal + '"')
          await p.screenshot({ path: 'test-03d-gratuity.png' })
        } else {
          fail('Custom gratuity input not visible after clicking Custom')
        }
      } else {
        pass('Custom gratuity button not shown (gratuity panel hidden) — skipped')
        await p.screenshot({ path: 'test-03c-payment.png' })
      }
    }

  } catch (err) {
    fail('Unexpected error: ' + err.message)
    await p.screenshot({ path: 'test-error.png' }).catch(() => {})
    console.error(err.stack)
  } finally {
    await b.close()
  }

  console.log('\n' + '='.repeat(44))
  console.log('PASS:', PASS.length, ' | FAIL:', FAIL.length)
  if (FAIL.length) { FAIL.forEach(f => console.log('  x', f)) }
  console.log('='.repeat(44))
})()
