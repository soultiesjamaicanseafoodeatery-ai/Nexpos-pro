'use client'

import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { qzConnect, qzIsConnected } from '@/lib/utils/qzTray'
import {
  smartPrint, printTicket,
  buildCustomerReceipt, buildKitchenTicket, buildBarTicket,
  buildCarwashWorkOrder, buildZReport,
  type PrintWidth,
} from '@/lib/utils/ticketPrinter'
import type { Transaction, CartItem } from '@/types'

// ── Diagnostics types ─────────────────────────────────────────────────────────
interface DiagResult {
  ts: string
  label: string
  raw: unknown
  error?: { name?: string; message: string; stack?: string }
  duration?: number
}

function getWindowQZ(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { qz?: Record<string, unknown> }
  return w.qz ?? null
}

function errObj(e: unknown): { name?: string; message: string; stack?: string } {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack }
  return { message: String(e) }
}

async function safeCall(fn: () => Promise<unknown>): Promise<unknown> {
  try { return await fn() } catch (e) { return { ERROR: e instanceof Error ? e.message : String(e) } }
}

// ── Print test suite ──────────────────────────────────────────────────────────
type TestKey = 'receipt' | 'kitchen' | 'bar' | 'carwash' | 'session' | 'eod'
type TestState = 'idle' | 'running' | 'pass' | 'fail'

interface TestResult {
  key: TestKey
  label: string
  state: TestState
  note: string
}

const TEST_DEFS: { key: TestKey; label: string; printer: string }[] = [
  { key: 'receipt', label: 'Customer Receipt',   printer: 'receipt' },
  { key: 'kitchen', label: 'Kitchen Ticket',     printer: 'kitchen' },
  { key: 'bar',     label: 'Bar Ticket',          printer: 'bar / kitchen' },
  { key: 'carwash', label: 'Car Wash Work Order', printer: 'kitchen' },
  { key: 'session', label: 'Session Report',      printer: 'browser dialog' },
  { key: 'eod',     label: 'End-of-Day Z-Report', printer: 'receipt' },
]

function buildTestPayload() {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  const tsStr = `${dateStr} ${timeStr}`

  const foodItems: CartItem[] = [
    {
      id: 'ti1', itemId: 'mi1', qty: 2,
      name: "Jerk Chicken & Rice",
      price: 1200, module: 'restaurant',
      size: 'Large', sides: ["Rice & Peas", "Festival"],
      addons: [{ id: 'a1', name: "Extra Hot Sauce™", desc: '', price: 150, icon: '', active: true }],
    },
    {
      id: 'ti2', itemId: 'mi2', qty: 1,
      name: "Owner’s Special™",
      price: 1800, module: 'restaurant',
      flavour: 'Spicy (50% heat)',
      addons: [],
      note: 'Use “premium” seasoning & extra herbs',
    },
    {
      id: 'ti3', itemId: 'mi3', qty: 1,
      name: "Café Mocha — Daily Special",
      price: 350, module: 'restaurant',
      size: 'Small', addons: [],
      note: "José’s order — no sugar, please",
    },
  ]

  const barItems: CartItem[] = [
    {
      id: 'tb1', itemId: 'mb1', qty: 2,
      name: "Rum Punch (50° Proof)",
      price: 600, module: 'bar',
      size: 'Large',
      addons: [{ id: 'a2', name: "Extra Ice & Lime", desc: '', price: 0, icon: '', active: true }],
    },
    {
      id: 'tb2', itemId: 'mb2', qty: 1,
      name: "Owner’s Brew™",
      price: 850, module: 'bar',
      addons: [],
      note: "Birthday — add “Happy B’day” garnish",
    },
  ]

  const cwItems: CartItem[] = [
    {
      id: 'tc1', itemId: 'mc1', qty: 1,
      name: "Full Detail & Wax",
      price: 3500, module: 'carwash',
      addons: [{ id: 'a3', name: "Interior Shampoo & Condition", desc: '', price: 1500, icon: '', active: true }],
    },
    {
      id: 'tc2', itemId: 'mc2', qty: 1,
      name: "Tint (50% VLT) — Premium",
      price: 2000, module: 'carwash',
      addons: [],
      note: "José’s SUV — handle with care",
    },
  ]

  const tx: Transaction = {
    id: 9042, ts: tsStr,
    mod: 'restaurant',
    cashier: "Ana-Marie O’Brien",
    userId: 'test',
    customer: "José García",
    customerName: "José García",
    item: '', addons: [],
    tableNum: '5', guestCount: 3,
    orderType: 'dine-in',
    items: foodItems,
    sub: 5500, disc: 275,
    tax: 0, gct: 773,
    serviceCharge: 503,
    total: 6501,
    pay: 'cash', tender: 7000, changeDue: 499,
  }

  const kot = {
    orderNum: '0042', table: '5',
    server: "Ana-Marie O’Brien",
    guestCount: 3, orderType: 'dine-in',
    date: dateStr, time: timeStr,
    items: [...foodItems, ...barItems],
    orderNote: "Allergic to nuts & dairy. Use “clean” utensils. José’s order.",
  }

  const bot = {
    orderNum: '0042', table: '5',
    server: "Ana-Marie O’Brien",
    time: timeStr,
    items: barItems,
  }

  const cwo = {
    orderNum: '0042', plate: 'ABC-1234',
    customerName: "José García",
    items: cwItems, time: timeStr, date: dateStr,
  }

  const zRpt = {
    date: tsStr, closedBy: "Ana-Marie O’Brien",
    openingFloat: 5000,
    restaurantSales: 45250, barSales: 18300, carwashSales: 12500, totalSales: 76050,
    cashSales: 35200, cardSales: 28500, giftCardSales: 5000, tabSales: 4350, otherSales: 3000,
    totalDiscounts: 2100, totalVoids: 850, totalRefunds: 0,
    voidCount: 3, refundCount: 0,
    totalGCT: 10627, totalServiceCharge: 6935, totalGratuity: 2800,
    restaurantCount: 28, barCount: 15, carwashCount: 8, totalCount: 51,
    expectedCash: 40200, actualCash: 40000, variance: -200,
    denominations: [
      { label: 'J$5,000', qty: 5, value: 25000 },
      { label: 'J$1,000', qty: 10, value: 10000 },
      { label: 'J$500',   qty: 8,  value: 4000  },
      { label: 'J$100',   qty: 10, value: 1000  },
    ],
    gctRegNo: '12345678', trn: '987654321', sym: 'J$',
  }

  return { tx, kot, bot, cwo, zRpt, dateStr, timeStr }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PrinterDiagnosticsPage() {
  const { state } = useApp()
  const { biz } = state

  // Diagnostics state
  const [connecting, setConnecting] = useState(false)
  const [diagResults, setDiagResults] = useState<DiagResult[]>([])

  // Test suite state
  const initTests = (): TestResult[] =>
    TEST_DEFS.map(d => ({ key: d.key, label: d.label, state: 'idle', note: '' }))
  const [tests, setTests] = useState<TestResult[]>(initTests)
  const [running, setRunning] = useState(false)

  const nowTs = () =>
    new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const addDiag = (r: DiagResult) => setDiagResults(prev => [r, ...prev])

  const setTest = (key: TestKey, patch: Partial<TestResult>) =>
    setTests(prev => prev.map(t => t.key === key ? { ...t, ...patch } : t))

  const pw = (biz.printers?.width ?? 80) as PrintWidth

  // ── Individual test runners ───────────────────────────────────────────────
  async function runReceipt() {
    setTest('receipt', { state: 'running', note: '' })
    try {
      const { tx } = buildTestPayload()
      const html = buildCustomerReceipt(tx, biz, { width: pw })
      await smartPrint(html, 'TEST Customer Receipt', biz.printers?.receipt, pw, false)
      setTest('receipt', { state: 'pass', note: biz.printers?.receipt ? `→ ${biz.printers.receipt}` : 'browser dialog (no printer set)' })
    } catch (e) {
      setTest('receipt', { state: 'fail', note: e instanceof Error ? e.message : String(e) })
    }
  }

  async function runKitchen() {
    setTest('kitchen', { state: 'running', note: '' })
    try {
      const { kot } = buildTestPayload()
      const html = buildKitchenTicket(kot, { width: pw })
      if (!html) throw new Error('buildKitchenTicket returned empty — check items have module:"restaurant"')
      await smartPrint(html, 'TEST Kitchen Ticket', biz.printers?.kitchen, pw, false, true)
      setTest('kitchen', { state: 'pass', note: biz.printers?.kitchen ? `→ ${biz.printers.kitchen} (buzz on)` : 'browser dialog' })
    } catch (e) {
      setTest('kitchen', { state: 'fail', note: e instanceof Error ? e.message : String(e) })
    }
  }

  async function runBar() {
    setTest('bar', { state: 'running', note: '' })
    try {
      const { bot } = buildTestPayload()
      const html = buildBarTicket(bot, { width: pw })
      if (!html) throw new Error('buildBarTicket returned empty — check items have module:"bar"')
      const barPrinter = biz.printers?.bar || biz.printers?.kitchen
      await smartPrint(html, 'TEST Bar Ticket', barPrinter, pw, false, true)
      setTest('bar', { state: 'pass', note: barPrinter ? `→ ${barPrinter} (buzz on)` : 'browser dialog' })
    } catch (e) {
      setTest('bar', { state: 'fail', note: e instanceof Error ? e.message : String(e) })
    }
  }

  async function runCarwash() {
    setTest('carwash', { state: 'running', note: '' })
    try {
      const { cwo } = buildTestPayload()
      const html = buildCarwashWorkOrder(cwo, { width: pw })
      if (!html) throw new Error('buildCarwashWorkOrder returned empty — check items have module:"carwash"')
      await smartPrint(html, 'TEST Car Wash Order', biz.printers?.kitchen, pw, false)
      setTest('carwash', { state: 'pass', note: biz.printers?.kitchen ? `→ ${biz.printers.kitchen}` : 'browser dialog' })
    } catch (e) {
      setTest('carwash', { state: 'fail', note: e instanceof Error ? e.message : String(e) })
    }
  }

  async function runSession() {
    setTest('session', { state: 'running', note: '' })
    try {
      const { dateStr, timeStr } = buildTestPayload()
      const bizName = biz.name || 'NexPOS Pro'
      const html = `<div style="font-family:monospace;font-size:13px;line-height:1.6">
        <div style="text-align:center;font-weight:bold;font-size:15px">${bizName}</div>
        <div style="text-align:center">Session Report &mdash; TEST</div>
        <hr style="border:none;border-top:1px dashed #999;margin:6px 0"/>
        <div style="display:flex;justify-content:space-between"><span>Employee:</span><span>Ana-Marie O&apos;Brien</span></div>
        <div style="display:flex;justify-content:space-between"><span>Clock In:</span><span>08:00 AM</span></div>
        <div style="display:flex;justify-content:space-between"><span>Clock Out:</span><span>${timeStr}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Duration:</span><span>9h 0m</span></div>
        <div style="display:flex;justify-content:space-between"><span>Date:</span><span>${dateStr}</span></div>
        <hr style="border:none;border-top:1px dashed #999;margin:6px 0"/>
        <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Orders Completed:</span><span>28</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Total Revenue:</span><span>J$45,250.00</span></div>
        <div style="display:flex;justify-content:space-between"><span>Discounts Given:</span><span>(J$2,100.00)</span></div>
        <div style="display:flex;justify-content:space-between"><span>GCT Collected:</span><span>J$5,227.50</span></div>
        <hr style="border:none;border-top:1px dashed #999;margin:6px 0"/>
        <div style="display:flex;justify-content:space-between"><span>Cash:</span><span>J$20,000.00</span></div>
        <div style="display:flex;justify-content:space-between"><span>Card:</span><span>J$18,250.00</span></div>
        <div style="display:flex;justify-content:space-between"><span>Gift Card:</span><span>J$7,000.00</span></div>
        <hr style="border:none;border-top:1px dashed #999;margin:6px 0"/>
        <div style="display:flex;justify-content:space-between"><span>Voids (3):</span><span>(J$850.00)</span></div>
        <div style="display:flex;justify-content:space-between"><span>Refunds:</span><span>J$0.00</span></div>
        <hr style="border:none;border-top:1px dashed #999;margin:6px 0"/>
        <div style="text-align:center;margin-top:8px">Jos&eacute;&#39;s test &mdash; &amp; &quot;quotes&quot; &copy;</div>
      </div>`
      printTicket(html, 'TEST Session Report')
      setTest('session', { state: 'pass', note: 'browser dialog opened' })
    } catch (e) {
      setTest('session', { state: 'fail', note: e instanceof Error ? e.message : String(e) })
    }
  }

  async function runEOD() {
    setTest('eod', { state: 'running', note: '' })
    try {
      const { zRpt } = buildTestPayload()
      const html = buildZReport(zRpt, { width: pw })
      await smartPrint(html, 'TEST End-of-Day Z-Report', biz.printers?.receipt, pw, false)
      setTest('eod', { state: 'pass', note: biz.printers?.receipt ? `→ ${biz.printers.receipt}` : 'browser dialog' })
    } catch (e) {
      setTest('eod', { state: 'fail', note: e instanceof Error ? e.message : String(e) })
    }
  }

  async function runAll() {
    setRunning(true)
    setTests(initTests())
    await runReceipt()
    await runKitchen()
    await runBar()
    await runCarwash()
    await runSession()
    await runEOD()
    setRunning(false)
  }

  // ── Diagnostics handlers ─────────────────────────────────────────────────
  const handleConnect = async () => {
    setConnecting(true)
    const t0 = Date.now()
    try {
      const ok = await qzConnect()
      addDiag({ ts: nowTs(), label: 'Connect QZ', raw: { success: ok, isActive: qzIsConnected() }, duration: Date.now() - t0 })
    } catch (e) {
      addDiag({ ts: nowTs(), label: 'Connect QZ', raw: null, error: errObj(e), duration: Date.now() - t0 })
    }
    setConnecting(false)
  }

  const handleRefreshPrinters = async () => {
    const t0 = Date.now()
    const qz = getWindowQZ()
    if (!qz) {
      addDiag({ ts: nowTs(), label: 'Refresh Printers', raw: null, error: { message: 'window.qz is null — click Connect QZ first.' } })
      return
    }
    const ws = qz['websocket'] as { isActive?: () => boolean } | undefined
    if (!ws?.isActive?.()) {
      addDiag({ ts: nowTs(), label: 'Refresh Printers', raw: null, error: { message: 'WebSocket not active — click Connect QZ first.' } })
      return
    }
    try {
      const printers = qz['printers'] as { find?: (q?: string) => Promise<string | string[]> } | undefined
      if (typeof printers?.find !== 'function') throw new Error('qz.printers.find is not a function')
      const result = await printers.find()
      const list: string[] = Array.isArray(result) ? result : (result ? [result] : [])
      addDiag({ ts: nowTs(), label: 'Refresh Printers', raw: { count: list.length, printers: list }, duration: Date.now() - t0 })
    } catch (e) {
      addDiag({ ts: nowTs(), label: 'Refresh Printers', raw: null, error: errObj(e), duration: Date.now() - t0 })
    }
  }

  const handleTestSignAPI = async () => {
    const t0 = Date.now()
    try {
      const res = await fetch('/api/qz-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test-challenge-string' }),
      })
      const body = await res.text()
      addDiag({
        ts: nowTs(), label: `Test Sign API (HTTP ${res.status})`,
        raw: { status: res.status, ok: res.ok, body },
        error: res.ok ? undefined : { message: `HTTP ${res.status}: ${body}` },
        duration: Date.now() - t0,
      })
    } catch (e) {
      addDiag({ ts: nowTs(), label: 'Test Sign API', raw: null, error: errObj(e), duration: Date.now() - t0 })
    }
  }

  const handleTestEnumeration = async () => {
    const t0 = Date.now()
    const qz = getWindowQZ()
    if (!qz) {
      addDiag({ ts: nowTs(), label: 'Test Enumeration', raw: null, error: { message: 'window.qz is null. Click Connect QZ first.' } })
      return
    }
    const qzPrinters = qz['printers'] as Record<string, unknown> | undefined
    const findFn    = qzPrinters?.['find']
    const detailsFn = qzPrinters?.['details']
    const ws = qz['websocket'] as { isActive?: () => boolean } | undefined
    const [r1, r2, r3] = await Promise.all([
      safeCall(async () => {
        if (typeof findFn !== 'function') throw new Error('qz.printers.find is not a function')
        return (findFn as () => Promise<unknown>)()
      }),
      safeCall(async () => {
        if (typeof findFn !== 'function') throw new Error('qz.printers.find is not a function')
        return (findFn as (q: string) => Promise<unknown>)('')
      }),
      safeCall(async () => {
        if (typeof detailsFn !== 'function') throw new Error('qz.printers.details() does not exist on this QZ version')
        return (detailsFn as () => Promise<unknown>)()
      }),
    ])
    addDiag({
      ts: nowTs(), label: 'Test Enumeration',
      raw: {
        'find()': r1, "find('')": r2, 'printers.details()': r3,
        'window.qz keys': Object.keys(qz),
        'printers keys': qzPrinters ? Object.keys(qzPrinters) : null,
        'websocket active': ws?.isActive?.() ?? false,
        'user agent': typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      duration: Date.now() - t0,
    })
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  const connected = qzIsConnected()
  const qzLoaded  = typeof window !== 'undefined' && !!(window as unknown as { qz?: unknown }).qz

  const stateIcon = (s: TestState) =>
    s === 'idle'    ? { icon: '○', color: 'var(--txt3)' } :
    s === 'running' ? { icon: '…', color: '#f59e0b' }     :
    s === 'pass'    ? { icon: '✓', color: '#22c55e' }     :
                      { icon: '✗', color: '#ef4444' }

  const diagRows: [string, string, string, boolean][] = [
    ['QZ Connection Status',       connected ? 'Connected' : 'Disconnected',               connected ? 'var(--grn,#22c55e)' : 'var(--red,#ef4444)', false],
    ['window.qz present',          qzLoaded  ? 'Yes — script loaded' : 'No — not loaded', qzLoaded  ? 'var(--grn,#22c55e)' : 'var(--red,#ef4444)', false],
    ['Configured Receipt Printer', biz.printers?.receipt || '(not set)',                   'var(--txt)', true],
    ['Configured Kitchen Printer', biz.printers?.kitchen || '(not set)',                   'var(--txt)', true],
    ['Configured Bar Printer',     biz.printers?.bar     || '(not set)',                   'var(--txt)', true],
    ['Print Width',                `${biz.printers?.width ?? 80}mm`,                       'var(--txt)', false],
  ]

  const btn = (label: string, onClick: () => void, color: string, disabled = false) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '10px 20px', borderRadius: 'var(--r)', background: color,
      color: '#fff', border: 'none', fontWeight: 700, fontSize: 13,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .6 : 1,
    }}>{label}</button>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Print Test Suite ─────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', marginBottom: 2 }}>Print Test Suite</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>
            Prints all 6 ticket types with test data containing: <code style={{ background: 'var(--surf)', padding: '1px 6px', borderRadius: 4 }}>&amp; &apos; &quot; % é ™ ® © — …</code>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {btn(running ? 'Running…' : 'Run All Tests', runAll, '#7c3aed', running)}
              <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                Kitchen &amp; bar tickets will beep. All tickets use your configured printers (or browser dialog if no printer is set).
              </div>
            </div>

            {/* Test rows */}
            {tests.map((t, i) => {
              const def   = TEST_DEFS[i]
              const { icon, color } = stateIcon(t.state)
              const runFn = def.key === 'receipt' ? runReceipt :
                            def.key === 'kitchen' ? runKitchen :
                            def.key === 'bar'     ? runBar     :
                            def.key === 'carwash' ? runCarwash :
                            def.key === 'session' ? runSession : runEOD
              return (
                <div key={t.key} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 20px',
                  borderBottom: i < tests.length - 1 ? '1px solid var(--bdr)' : undefined,
                }}>
                  {/* Status icon */}
                  <div style={{ width: 20, textAlign: 'center', fontSize: 16, fontWeight: 800, color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  {/* Label + note */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: t.state === 'fail' ? '#ef4444' : 'var(--txt3)', marginTop: 1 }}>
                      {t.note || `Printer: ${def.printer}`}
                    </div>
                  </div>
                  {/* Individual print button */}
                  <button
                    onClick={runFn}
                    disabled={running || t.state === 'running'}
                    style={{
                      padding: '6px 14px', borderRadius: 'var(--r)', flexShrink: 0,
                      background: 'var(--surf)', border: '1px solid var(--bdr)',
                      color: 'var(--txt2)', fontSize: 12, fontWeight: 600,
                      cursor: (running || t.state === 'running') ? 'not-allowed' : 'pointer',
                      opacity: (running || t.state === 'running') ? .5 : 1,
                    }}
                  >
                    Print
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── QZ Tray Status ───────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Printer Diagnostics</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>Raw QZ Tray probe — no filtering or name modification applied</div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 12 }}>Current State</div>
            {diagRows.map(([label, value, color, mono]) => (
              <div key={label} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--bdr)', alignItems: 'flex-start' }}>
                <div style={{ width: 210, flexShrink: 0, fontSize: 12, color: 'var(--txt3)', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 12, color, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            {btn(connecting ? 'Connecting...' : 'Connect QZ', handleConnect, 'var(--blue)', connecting)}
            {btn('Refresh Printers', handleRefreshPrinters, 'var(--grn)')}
            {btn('Test Enumeration', handleTestEnumeration, '#7c3aed')}
            {btn('Test Sign API', handleTestSignAPI, '#b45309')}
          </div>

          {diagResults.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txt3)', fontSize: 13, background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)' }}>
              Click a button above to run diagnostics. Results appear here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {diagResults.map((r, i) => (
                <div key={i} style={{ background: 'var(--bg2)', border: `1px solid ${r.error ? 'var(--red,#ef4444)' : 'var(--bdr)'}`, borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: r.error ? 'rgba(239,68,68,.08)' : 'var(--surf2)', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.error ? 'var(--red,#ef4444)' : 'var(--grn,#22c55e)' }}>
                      {r.error ? 'FAIL' : 'OK'} — {r.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{r.ts}{r.duration !== undefined ? ` · ${r.duration}ms` : ''}</span>
                  </div>
                  {r.error && (
                    <div style={{ padding: 16, borderBottom: '1px solid var(--bdr)', background: 'rgba(239,68,68,.04)' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--red,#ef4444)', marginBottom: 6 }}>
                        {r.error.name ? `${r.error.name}: ` : ''}{r.error.message}
                      </div>
                      {r.error.stack && (
                        <pre style={{ fontSize: 10, color: 'var(--txt3)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: 'monospace', lineHeight: 1.5 }}>
                          {r.error.stack}
                        </pre>
                      )}
                    </div>
                  )}
                  <pre style={{ margin: 0, padding: 16, fontSize: 11, color: 'var(--txt2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', lineHeight: 1.6 }}>
                    {JSON.stringify(r.raw, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
