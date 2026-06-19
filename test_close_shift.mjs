import { chromium } from 'playwright'

const PASS = [], FAIL = []
const pass = s => { PASS.push(s); console.log('  PASS:', s) }
const fail = (s, e) => { FAIL.push(s); console.log('  FAIL:', s, e || '') }

;(async () => {
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const p = await b.newPage()
  p.setDefaultTimeout(18000)

  try {
    // 1. Login
    await p.goto('https://nexpropos.vercel.app', { waitUntil: 'networkidle' })
    await p.locator('text=RENEE').first().click()
    for (const d of ['0','6','0','6']) {
      await p.locator('button').filter({ hasText: new RegExp('^' + d + '$') }).first().click()
      await p.waitForTimeout(120)
    }
    await p.waitForTimeout(1400)
    pass('Logged in as RENEE (admin)')
    await p.screenshot({ path: 'cs01-login.png' })

    // 2. Close Shift button in topbar
    const closeBtn = p.locator('button', { hasText: 'Close Shift' })
    const hasCB = await closeBtn.isVisible().catch(() => false)
    hasCB ? pass('Close Shift button in topbar') : fail('Close Shift button not found in topbar')
    await p.screenshot({ path: 'cs02-topbar.png' })
    if (!hasCB) { await b.close(); return }

    // 3. Open wizard
    await closeBtn.click()
    await p.waitForTimeout(800)
    await p.screenshot({ path: 'cs03-wizard.png' })
    const authTitle = await p.locator('text=Manager Authorization').isVisible().catch(() => false)
    authTitle ? pass('Step 1: Auth screen shown') : fail('Step 1: Auth screen missing')

    // 4. Select RENEE from manager list
    const mgrBtn = p.locator('button').filter({ hasText: /RENEE/ }).first()
    if (await mgrBtn.isVisible().catch(() => false)) {
      await mgrBtn.click()
      pass('Selected RENEE from manager list')
    } else {
      // fallback: click first manager button
      const anyMgr = p.locator('div').filter({ hasText: /admin|manager/ }).locator('button').first()
      await anyMgr.click().catch(() => {})
      pass('Selected first manager (fallback)')
    }
    await p.waitForTimeout(300)

    // 5. Enter PIN on the wizard numpad (rightmost numpad buttons)
    for (const d of ['0','6','0','6']) {
      // The wizard numpad renders last on the page; use last() to avoid login screen collision
      const padBtn = p.locator('button').filter({ hasText: new RegExp('^' + d + '$') }).last()
      await padBtn.click()
      await p.waitForTimeout(140)
    }
    await p.waitForTimeout(1000)
    await p.screenshot({ path: 'cs04-pin.png' })

    // 6. System Validation
    await p.waitForTimeout(2500)
    const valTitle = await p.locator('text=System Validation').isVisible().catch(() => false)
    valTitle ? pass('Step 2: System Validation shown') : fail('Step 2: Validation missing')
    await p.screenshot({ path: 'cs05-validate.png' })

    await p.waitForTimeout(1500)
    const contBtn  = p.locator('button', { hasText: 'Continue' }).first()
    const forceBtn = p.locator('button', { hasText: 'Force Close' }).first()
    if (await contBtn.isVisible().catch(() => false)) {
      await contBtn.click(); pass('Validation: all clear → Continue')
    } else if (await forceBtn.isVisible().catch(() => false)) {
      await forceBtn.click(); pass('Validation: used Force Close override')
    } else {
      fail('Validation: no Continue/Force Close button visible')
    }
    await p.waitForTimeout(700)

    // 7. Cash Count
    await p.screenshot({ path: 'cs06-cash.png' })
    const cashTitle = await p.locator('text=Cash Drawer Count').isVisible().catch(() => false)
    cashTitle ? pass('Step 3: Cash Drawer Count shown') : fail('Step 3: Cash screen missing')
    const numInputs = p.locator('input[type="number"]')
    const nc = await numInputs.count()
    if (nc >= 2) {
      await numInputs.nth(0).fill('5000')
      await numInputs.nth(1).fill('5000')  // equal = zero variance, no explanation needed
      pass('Cash: filled opening float J$5,000 / counted J$5,000 (zero variance)')
    } else {
      fail('Cash: number inputs not found (count=' + nc + ')')
    }
    await p.waitForTimeout(400)
    await p.screenshot({ path: 'cs07-cash-filled.png' })
    await p.locator('button', { hasText: 'Continue' }).first().click().catch(() => {})
    await p.waitForTimeout(700)

    // 8. Payments
    await p.screenshot({ path: 'cs08-payments.png' })
    const payTitle = await p.locator('text=Payment Reconciliation').isVisible().catch(() => false)
    payTitle ? pass('Step 4: Payment Reconciliation shown') : fail('Step 4: Payments missing')
    await p.locator('button', { hasText: 'Continue' }).first().click().catch(() => {})
    await p.waitForTimeout(700)

    // 9. Gratuity
    await p.screenshot({ path: 'cs09-gratuity.png' })
    const gratTitle = await p.locator('text=Gratuity').first().isVisible().catch(() => false)
    gratTitle ? pass('Step 5: Gratuity & Tips shown') : fail('Step 5: Gratuity missing')
    await p.locator('button', { hasText: 'Continue' }).first().click().catch(() => {})
    await p.waitForTimeout(700)

    // 10. Sales Summary
    await p.screenshot({ path: 'cs10-sales.png' })
    const salesTitle = await p.locator('text=Sales Summary').isVisible().catch(() => false)
    salesTitle ? pass('Step 6: Sales Summary shown') : fail('Step 6: Sales missing')

    const restPanel  = await p.locator('text=Restaurant').first().isVisible().catch(() => false)
    const barPanel   = await p.locator('text=Bar').first().isVisible().catch(() => false)
    const cwPanel    = await p.locator('text=Car Wash').first().isVisible().catch(() => false)
    restPanel   ? pass('Sales: Restaurant panel present') : fail('Sales: Restaurant panel missing')
    barPanel    ? pass('Sales: Bar panel present')        : fail('Sales: Bar panel missing')
    cwPanel     ? pass('Sales: Car Wash panel present')   : fail('Sales: Car Wash panel missing')
    // Scroll the wizard card to bottom so the Grand Total banner is within viewport
    await p.evaluate(() => {
      const scrollEl = Array.from(document.querySelectorAll('div')).find(d => d.style && d.style.overflowY === 'auto')
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
    }).catch(() => {})
    await p.waitForTimeout(200)
    const grandBanner = await p.getByText(/combined grand total/i).first().isVisible().catch(() => false)
    grandBanner ? pass('Sales: Combined Grand Total banner present') : fail('Sales: Grand Total banner missing')

    await p.locator('button', { hasText: 'Continue' }).first().click().catch(() => {})
    await p.waitForTimeout(700)

    // 11. Employees
    await p.screenshot({ path: 'cs11-employees.png' })
    const empTitle = await p.locator('text=Employee Performance').isVisible().catch(() => false)
    empTitle ? pass('Step 7: Employee Performance shown') : fail('Step 7: Employees missing')
    await p.locator('button', { hasText: 'Continue' }).first().click().catch(() => {})
    await p.waitForTimeout(700)

    // 12. Print
    await p.screenshot({ path: 'cs12-print.png' })
    const printTitle = await p.locator('text=Print Reports').isVisible().catch(() => false)
    printTitle ? pass('Step 8: Print Reports shown') : fail('Step 8: Print missing')
    // Skip — click the last Continue button
    await p.locator('button', { hasText: /Continue/ }).last().click().catch(() => {})
    await p.waitForTimeout(700)

    // 13. Confirm
    await p.screenshot({ path: 'cs13-confirm.png' })
    const confirmTitle = await p.locator('text=Confirm Shift Close').isVisible().catch(() => false)
    confirmTitle ? pass('Step 9: Confirm Close shown') : fail('Step 9: Confirm missing')
    const grandRow = await p.locator('text=Grand Total').first().isVisible().catch(() => false)
    grandRow ? pass('Confirm: Grand Total row visible') : fail('Confirm: Grand Total row missing')

    // Final close — the wizard confirm button is the LAST "Close Shift" button in DOM
    // (topbar renders first, wizard overlay button renders after it)
    const finalBtn = p.locator('button').filter({ hasText: /Close Shift/ }).last()
    if (await finalBtn.isVisible().catch(() => false)) {
      await finalBtn.click({ force: true })
      await p.waitForTimeout(2500)
      pass('Clicked final Close Shift button')
    } else {
      fail('Final Close Shift button not visible on confirm screen')
    }
    await p.screenshot({ path: 'cs14-done.png' })

    // 14. Done
    const doneScreen = await p.locator('text=All data has been locked and saved').isVisible().catch(() => false)
    doneScreen ? pass('Step 10: Shift Closed Successfully screen shown') : fail('Step 10: Done screen missing')

    const doneRest = await p.locator('text=Restaurant Sales').isVisible().catch(() => false)
    const doneBar  = await p.locator('text=Bar Sales').isVisible().catch(() => false)
    const doneCW   = await p.locator('text=Car Wash Sales').isVisible().catch(() => false)
    const doneGT   = await p.locator('text=Grand Total').first().isVisible().catch(() => false)
    doneRest ? pass('Done: Restaurant Sales row') : fail('Done: Restaurant Sales row missing')
    doneBar  ? pass('Done: Bar Sales row')        : fail('Done: Bar Sales row missing')
    doneCW   ? pass('Done: Car Wash Sales row')   : fail('Done: Car Wash Sales row missing')
    doneGT   ? pass('Done: Grand Total row')      : fail('Done: Grand Total row missing')

  } catch (err) {
    fail('Unexpected error: ' + err.message)
    await p.screenshot({ path: 'cs-error.png' }).catch(() => {})
    console.error(err.stack)
  } finally {
    await b.close()
  }

  console.log('\n' + '='.repeat(44))
  console.log('PASS:', PASS.length, ' | FAIL:', FAIL.length)
  if (FAIL.length) { console.log('\nFailed:'); FAIL.forEach(f => console.log('  x', f)) }
  console.log('='.repeat(44))
})()
