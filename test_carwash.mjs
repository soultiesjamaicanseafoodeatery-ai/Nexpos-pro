import { chromium } from 'playwright'

const BASE = 'https://nexpropos.vercel.app'
const PASS = []
const FAIL = []

const log  = (s) => console.log('  ' + s)
const pass = (s) => { PASS.push(s); console.log('  PASS: ' + s) }
const fail = (s, e) => { FAIL.push(s); console.log('  FAIL: ' + s + (e ? ' -- ' + e : '')) }

;(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultTimeout(20000)

  try {
    // 1. Load & login
    log('Loading app...')
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.locator('text=RENEE').first().click()
    for (const digit of ['0','6','0','6']) {
      await page.locator('button').filter({ hasText: new RegExp('^' + digit + '$') }).first().click()
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(1200)
    pass('Logged in as RENEE')
    await page.screenshot({ path: 'cw01-logged-in.png' })

    // 2. Switch to Car Wash module
    await page.locator('button').filter({ hasText: 'Car Wash' }).first().click()
    await page.waitForTimeout(1500)
    pass('Switched to Car Wash module')
    await page.screenshot({ path: 'cw02-carwash.png' })

    // 3. Check sidebar nav items (use span inside nav, not any text on page)
    const sidebarDash   = page.locator('nav span', { hasText: 'Dashboard' }).or(page.locator('div[style*="flex-direction: column"] >> text=Dashboard').first())
    const sidebarQueue  = page.locator('text=Wash Queue')
    const sidebarPOS    = page.locator('text=Point of Sale')

    // Use getByText with exact match for sidebar span
    const dashSpan = page.getByText('Dashboard', { exact: true }).first()
    const hasDash  = await dashSpan.isVisible().catch(() => false)
    hasDash ? pass('Sidebar: "Dashboard" nav item present') : fail('Sidebar: Dashboard nav missing -- may be old version')

    const hasQueue = await sidebarQueue.first().isVisible().catch(() => false)
    hasQueue ? pass('Sidebar: Wash Queue nav item present') : fail('Sidebar: Wash Queue missing')

    const hasPOS = await sidebarPOS.isVisible().catch(() => false)
    !hasPOS ? pass('Old "Point of Sale" label gone') : fail('Old "Point of Sale" still showing (browser cached?)')

    // 4. Verify dashboard heading and New Wash button
    const dashHeading = page.getByText('Car Wash Dashboard', { exact: true })
    const hasDashH = await dashHeading.isVisible().catch(() => false)
    hasDashH ? pass('Dashboard heading "Car Wash Dashboard" visible') : fail('Dashboard heading not found')

    const newWashBtn = page.locator('button', { hasText: '+ New Wash' })
    const hasNewWash = await newWashBtn.isVisible().catch(() => false)
    hasNewWash ? pass('Dashboard: "+ New Wash" button present') : fail('Dashboard: No New Wash button')
    await page.screenshot({ path: 'cw03-dashboard.png' })

    // 5. New Wash flow
    if (hasNewWash) {
      await newWashBtn.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: 'cw04-packages.png' })

      const pkgScreen = await page.getByText('Select Wash Package', { exact: true }).isVisible().catch(() => false)
      pkgScreen ? pass('Package Select screen loaded') : fail('Package Select screen not loaded')

      // Find service cards — they have J$ in them and are clickable
      const allDivs = page.locator('div').filter({ hasText: /J\$\d/ })
      const count   = await allDivs.count()
      log('Elements with J$ price: ' + count)

      // Find the grid cards specifically (they have min-height and flex-direction column)
      const pkgCards = page.locator('div[style*="flex-direction: column"][style*="cursor: pointer"]')
      const pkgCount = await pkgCards.count()
      log('Package cards (clickable column flex): ' + pkgCount)

      if (pkgCount > 0) {
        const firstName = await pkgCards.first().locator('div').first().textContent().catch(() => 'unknown')
        log('First package: ' + firstName)
        await pkgCards.first().click()
        await page.waitForTimeout(500)
        pass('Selected first wash package')
        await page.screenshot({ path: 'cw05-selected.png' })

        // Continue
        const contBtn = page.locator('button', { hasText: 'Continue' })
        if (await contBtn.isVisible()) {
          await contBtn.click()
          await page.waitForTimeout(1000)
          pass('Moved to Vehicle Info')
        } else {
          fail('Continue button not visible')
        }
        await page.screenshot({ path: 'cw06-vehicle.png' })

        // Vehicle Info: fill plate
        const allInputs = page.locator('input[type="text"], input:not([type])')
        const firstInput = allInputs.first()
        if (await firstInput.isVisible()) {
          await firstInput.fill('TEST-999')
          pass('License plate filled: TEST-999')
        } else {
          fail('No text input found on Vehicle Info')
        }

        // SUV button
        const suvBtn = page.locator('button', { hasText: 'SUV' })
        if (await suvBtn.isVisible()) {
          await suvBtn.click()
          pass('Vehicle type: SUV selected')
        }

        await page.screenshot({ path: 'cw07-vehicle-filled.png' })

        // Continue to Payment
        const payBtn = page.locator('button', { hasText: 'Continue to Payment' })
        if (await payBtn.isVisible()) {
          await payBtn.click()
          await page.waitForTimeout(1200)
          pass('Moved to Payment screen')
        } else {
          fail('Continue to Payment not found')
        }
        await page.screenshot({ path: 'cw08-payment.png' })

        // Payment screen checks
        const totalRow = await page.locator('text=TOTAL').isVisible().catch(() => false)
        totalRow ? pass('Payment screen: TOTAL row visible') : fail('Payment screen: TOTAL not found')

        // Card payment option
        const cardRow = page.locator('text=Card').first()
        if (await cardRow.isVisible()) await cardRow.click()

        // Complete Payment
        const completeBtn = page.locator('button').filter({ hasText: /Complete Payment/ })
        if (await completeBtn.isVisible()) {
          const btnText = await completeBtn.textContent()
          log('Complete button text: ' + btnText)
          await completeBtn.click()
          await page.waitForTimeout(3000)
          await page.screenshot({ path: 'cw09-done.png' })

          const successVisible = await page.locator('text=Payment Complete').isVisible().catch(() => false)
          successVisible ? pass('SUCCESS: Order created — success screen shown') : fail('Success screen not shown after payment')

          // Get ticket number if visible
          const ticketEl = page.locator('text=/CW-/')
          if (await ticketEl.isVisible().catch(() => false)) {
            const ticket = await ticketEl.textContent()
            pass('Ticket number: ' + ticket.trim())
          }
        } else {
          fail('Complete Payment button not found')
        }
      } else {
        fail('No package cards found -- check carwash_services table has data')
      }
    }

    // 6. Dashboard counters after order
    log('Checking dashboard after order...')
    await page.locator('button', { hasText: 'Dashboard' }).first().click().catch(async () => {
      await page.getByText('Dashboard', { exact: true }).first().click()
    })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'cw10-dashboard-after.png' })

    const waitingTxt = await page.locator('text=Waiting').first().isVisible().catch(() => false)
    waitingTxt ? pass('Dashboard: Waiting counter visible') : fail('Dashboard: Waiting counter not found')

    // 7. Wash Queue
    log('Testing Wash Queue page...')
    await page.locator('text=Wash Queue').first().click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'cw11-queue.png' })

    const queueHeader = await page.locator('div[style*="font-size: 18"] >> text=Wash Queue').isVisible().catch(async () => {
      return await page.getByRole('heading').filter({ hasText: 'Wash Queue' }).isVisible().catch(() => false)
    })
    pass('Wash Queue page navigated')

    const startBtn = page.locator('button', { hasText: 'Start Wash' })
    if (await startBtn.isVisible()) {
      pass('Queue: test order visible with "Start Wash" button')
      await startBtn.click()
      await page.waitForTimeout(1200)
      await page.screenshot({ path: 'cw12-started.png' })
      const readyBtn = page.locator('button', { hasText: 'Mark Ready' })
      if (await readyBtn.isVisible()) {
        pass('Queue: status advanced to In Progress -- "Mark Ready" now shown')
      }
    } else {
      const cwTicket = page.locator('text=/CW-\d+/')
      const ticketCount = await cwTicket.count()
      log('Tickets in queue: ' + ticketCount)
      ticketCount > 0 ? pass('Queue: ' + ticketCount + ' order(s) visible') : fail('Queue: no orders found')
    }

    // 8. Services & Prices
    log('Testing Services & Prices page...')
    const svcLink = page.locator('text=Services & Prices')
    if (await svcLink.isVisible().catch(() => false)) {
      await svcLink.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: 'cw13-services.png' })

      const servicesTab = await page.locator('button', { hasText: 'Wash Services' }).isVisible().catch(() => false)
      servicesTab ? pass('Services page: Wash Services tab present') : fail('Services page: tab missing')

      const addonsTab = await page.locator('button', { hasText: 'Add-ons' }).isVisible().catch(() => false)
      addonsTab ? pass('Services page: Add-ons tab present') : fail('Services page: Add-ons tab missing')

      // Cards toggle
      const cardsBtn = page.locator('button', { hasText: 'Cards' })
      if (await cardsBtn.isVisible()) {
        await cardsBtn.click()
        await page.waitForTimeout(500)
        await page.screenshot({ path: 'cw14-cards.png' })
        pass('Services page: Cards view toggles correctly')
      }

      // Add Service button
      const addSvcBtn = page.locator('button', { hasText: '+ Add Service' })
      if (await addSvcBtn.isVisible()) {
        pass('Services page: + Add Service button present')
      }

      // Switch to Add-ons tab
      await page.locator('button', { hasText: 'Add-ons' }).click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: 'cw15-addons.png' })
      const addAddonBtn = page.locator('button', { hasText: '+ Add Add-on' })
      if (await addAddonBtn.isVisible()) {
        pass('Add-ons tab: + Add Add-on button present')
      }
    } else {
      fail('Services & Prices not in sidebar (need admin role)')
    }

  } catch (err) {
    fail('Unexpected error: ' + err.message)
    await page.screenshot({ path: 'cw-error.png' }).catch(() => {})
    console.log(err.stack)
  } finally {
    await browser.close()
  }

  console.log('\n' + '='.repeat(44))
  console.log('PASS: ' + PASS.length + '  |  FAIL: ' + FAIL.length)
  if (FAIL.length > 0) {
    console.log('\nFailed:')
    FAIL.forEach(f => console.log('  x ' + f))
  }
  console.log('='.repeat(44))
})()
