'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import EODWizard from './EODWizard'
import type { Transaction, HeldOrder, POSState } from '@/types'
import { supabase } from '@/lib/supabase'
import { jamaicaDateKey, isSameBusinessDay } from '@/lib/utils/businessDate'

function duration(start: string, end: string | null) {
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const mins = Math.round((e - s) / 60000)
  if (isNaN(mins)) return '—'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// A normal business shift shouldn't run longer than this — if it does,
// it likely spans a missed close and is mixing in a prior day's sales.
const STALE_SHIFT_HOURS = 20
function shiftAgeHours(start: string) {
  return (Date.now() - new Date(start).getTime()) / 3600000
}

function isCashTx(tx: Transaction) {
  if (tx.voided) return false
  if (tx.payments && tx.payments.length > 0)
    return tx.payments.some(p => p.method.toLowerCase().includes('cash'))
  return tx.pay.toLowerCase().includes('cash')
}

function cashAmount(tx: Transaction) {
  if (tx.payments && tx.payments.length > 0)
    return tx.payments.filter(p => p.method.toLowerCase().includes('cash')).reduce((s, p) => s + p.amount, 0)
  return tx.total
}

function sameDay(ts: string, isoDate: string) {
  return isSameBusinessDay(ts, isoDate)
}

function txDateKey(ts: string) {
  try { return jamaicaDateKey(ts) } catch { return ts }
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}

function fmtMins(m: number) {
  if (m < 1) return '0m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function minutesBetween(clockIn: string, clockOut: string) {
  const [ih, im] = clockIn.split(':').map(Number)
  const [oh, om] = clockOut.split(':').map(Number)
  let d = (oh * 60 + om) - (ih * 60 + im)
  if (d < 0) d += 1440
  return d
}

interface StatCardProps { label: string; value: string; sub?: string; color: string }
function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8, marginTop: 20 }}>
      {children}
    </div>
  )
}

function InfoRow({ label, value, valueColor = 'var(--txt)', mono = false, last = false }: {
  label: string; value: string; valueColor?: string; mono?: boolean; last?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '8px 0', borderBottom: last ? 'none' : '1px solid var(--bdr2)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--txt3)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: valueColor, fontFamily: mono ? 'var(--mono)' : undefined }}>{value}</div>
    </div>
  )
}

export default function ShiftsPage() {
  const { state, dispatch } = useApp()
  const user = state.currentUser
  const isStaff = user?.role === 'staff'
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Live timer — re-renders every 30s so time-worked stays current
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const todayStr = jamaicaDateKey(new Date().toISOString())
  const [showEOD, setShowEOD] = useState(false)
  const [myOrdersFilter, setMyOrdersFilter] = useState<'today' | 'all'>('today')
  const [eodDate,      setEodDate]      = useState(todayStr)
  const [openingFloat, setOpeningFloat] = useState('')
  const [actualCash,   setActualCash]   = useState('')
  const [clockOutStep, setClockOutStep] = useState<'idle' | 'confirm' | 'saving'>('idle')
  const [clockOutError, setClockOutError] = useState('')

  // My Shift always defaults to the logged-in user's own shift, for every
  // role. Admins/managers can switch to the terminal-wide view to run EOD
  // or look up other staff via Shift History — but "mine" is always first.
  const [viewMode, setViewMode] = useState<'mine' | 'terminal'>('mine')
  const [shiftHistoryFilter, setShiftHistoryFilter] = useState('')

  // ── Admin/Manager: shift records ──────────────────────────────
  const allShifts    = [...state.shifts].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  const totalRevenue = allShifts.filter(s => s.end).reduce((sum, s) => sum + s.revenue, 0)

  // ── My Shift: transaction-based activity (any logged-in role) ──
  const myAllTxs = user
    ? [...state.transactions]
        .filter(tx => !tx.voided && tx.cashier === user.name)
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    : []
  const myOrdersAll = user
    ? [...state.transactions]
        .filter(tx => tx.cashier === user.name)
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    : []
  const myTodayTxs    = myAllTxs.filter(tx => txDateKey(tx.ts) === todayStr)
  const myTodayRevenue = myTodayTxs.reduce((s, tx) => s + tx.total, 0)

  // Group all transactions by date for activity table
  const myDayMap: Record<string, { count: number; revenue: number }> = {}
  for (const tx of myAllTxs) {
    const key = txDateKey(tx.ts)
    if (!myDayMap[key]) myDayMap[key] = { count: 0, revenue: 0 }
    myDayMap[key].count++
    myDayMap[key].revenue += tx.total
  }
  const myDays = Object.entries(myDayMap).sort((a, b) => b[0].localeCompare(a[0]))

  // ── EOD calculations (admin/manager only) ─────────────────────
  const dayTxs   = state.transactions.filter(tx => sameDay(tx.ts, eodDate))
  const cashTxs  = dayTxs.filter(isCashTx)
  const cashSales = cashTxs.reduce((s, tx) => s + cashAmount(tx), 0)
  const cardSales = dayTxs.filter(tx => !tx.voided && !isCashTx(tx)).reduce((s, tx) => s + tx.total, 0)
  const totalSales = dayTxs.filter(tx => !tx.voided).reduce((s, tx) => s + tx.total, 0)
  const floatNum  = parseFloat(openingFloat) || 0
  const actualNum = parseFloat(actualCash)   || 0
  const expected  = floatNum + cashSales
  const overShort = actualCash.trim() ? actualNum - expected : null

  const overShortColor = overShort === null ? 'var(--txt3)'
    : overShort === 0  ? 'var(--grn)'
    : '#ef4444'

  // ── Staff: clock-in / out ─────────────────────────────────────
  type ClockoutRec = { clockinAt: string; at: string }
  const clockinAt: string | null = (() => {
    try { return localStorage.getItem(`personal_clockin_${user?.id ?? ''}`) } catch { return null }
  })()
  const clockoutRecord: ClockoutRec | null = (() => {
    try {
      const raw = localStorage.getItem(`clockout_${user?.id ?? ''}`)
      return raw ? JSON.parse(raw) as ClockoutRec : null
    } catch { return null }
  })()

  // ── Staff: payroll profile ────────────────────────────────────
  type PayProfile = { staffId: string; payrollType: 'hourly' | 'salary'; active: boolean }
  const payrollProfile: PayProfile | null = (() => {
    try {
      const profiles: PayProfile[] = JSON.parse(localStorage.getItem('payroll_profiles') ?? '[]')
      return profiles.find(p => p.staffId === (user?.id ?? '') && p.active) ?? null
    } catch { return null }
  })()
  const isSalary = payrollProfile?.payrollType === 'salary'
  const breakMins = isSalary ? 0 : 30

  // ── Staff: time entries for hours-per-day ─────────────────────
  type TimeEntry = { id: string; staffId: string; date: string; clockIn: string; clockOut: string | null; breakMinutes: number }
  const myTimeEntries: TimeEntry[] = (() => {
    try {
      const all: TimeEntry[] = JSON.parse(localStorage.getItem('payroll_time_entries') ?? '[]')
      return all.filter(e => e.staffId === (user?.id ?? ''))
    } catch { return [] }
  })()

  // ── Staff: shift timing ───────────────────────────────────────
  const isCurrentlyClocked = !!clockinAt
  const shiftClockIn  = clockinAt ?? clockoutRecord?.clockinAt ?? null
  const shiftClockOut = isCurrentlyClocked ? null : (clockoutRecord?.at ?? null)

  const workedMinsTotal = (() => {
    if (!shiftClockIn) return 0
    const endMs = shiftClockOut ? new Date(shiftClockOut).getTime() : now.getTime()
    return Math.max(0, Math.round((endMs - new Date(shiftClockIn).getTime()) / 60000))
  })()

  // ── Staff: payment breakdown (today) ─────────────────────────
  const payTotals = { cash: 0, debit: 0, credit: 0, gift: 0, house: 0 }
  for (const tx of myTodayTxs) {
    const add = (method: string, amount: number) => {
      const m = method.toLowerCase()
      if      (m.includes('cash'))   payTotals.cash   += amount
      else if (m.includes('debit'))  payTotals.debit  += amount
      else if (m.includes('credit')) payTotals.credit += amount
      else if (m.includes('gift'))   payTotals.gift   += amount
      else if (m.includes('house'))  payTotals.house  += amount
      else                            payTotals.cash   += amount
    }
    if (tx.payments && tx.payments.length > 0) {
      tx.payments.forEach(p => add(p.method, p.amount))
    } else {
      add(tx.pay, tx.total)
    }
  }

  // ── Staff: order breakdown (today) ───────────────────────────
  const orderTotals = { restaurant: 0, bar: 0, takeout: 0, delivery: 0, carwash: 0 }
  for (const tx of myTodayTxs) {
    if      (tx.mod === 'carwash')          orderTotals.carwash++
    else if (tx.mod === 'bar')              orderTotals.bar++
    else if (tx.orderType === 'takeout')    orderTotals.takeout++
    else if (tx.orderType === 'delivery')   orderTotals.delivery++
    else                                    orderTotals.restaurant++
  }

  // ── Staff: active orders check ───────────────────────────────
  const activeHeld    = state.heldOrders.filter(h => h.savedBy === (user?.name ?? ''))
  const activeTickets = state.orderTickets.filter(t =>
    t.server === (user?.name ?? '') &&
    t.status !== undefined &&
    t.status !== 'paid' &&
    t.status !== 'voided'
  )
  const totalActiveOrders = activeHeld.length + activeTickets.length

  // ── Staff: avg sale ───────────────────────────────────────────
  const avgSale = myTodayTxs.length > 0 ? myTodayRevenue / myTodayTxs.length : 0

  // ── Staff: hours per day (from payroll time entries) ──────────
  const hoursMinPerDay: Record<string, number> = {}
  for (const e of myTimeEntries) {
    if (e.clockOut) {
      const net = Math.max(0, minutesBetween(e.clockIn, e.clockOut) - e.breakMinutes)
      hoursMinPerDay[e.date] = (hoursMinPerDay[e.date] ?? 0) + net
    }
  }
  // Overlay today's live clock-in if active
  if (shiftClockIn && txDateKey(shiftClockIn) === todayStr && isCurrentlyClocked) {
    hoursMinPerDay[todayStr] = Math.max(0, workedMinsTotal - breakMins)
  }

  // ── Clock-out helpers (staff) ─────────────────────────────────
  function handlePrintSummary() {
    if (!user) return
    const clockOutTime = new Date()
    const netMins = Math.max(0, workedMinsTotal - breakMins)
    const lines = [
      state.biz.name || 'NexPOS Pro',
      'Shift Report',
      '----------------------------',
      `Employee: ${user.name}`,
      `Date: ${clockOutTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      `Clock In:  ${shiftClockIn ? new Date(shiftClockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}`,
      `Clock Out: ${clockOutTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      `Duration:  ${fmtMins(workedMinsTotal)}`,
      ...(!isSalary ? [`Break:     -${breakMins}m`] : []),
      `Net Hours: ${fmtMins(netMins)}`,
      '----------------------------',
      `Orders:    ${myTodayTxs.length}`,
      `Revenue:   ${fmt(myTodayRevenue)}`,
      ...(myTodayTxs.length > 0 ? [`Avg Sale:  ${fmt(avgSale)}`] : []),
      ...(payTotals.cash   > 0 ? [`Cash:      ${fmt(payTotals.cash)}`]   : []),
      ...(payTotals.debit  > 0 ? [`Debit:     ${fmt(payTotals.debit)}`]  : []),
      ...(payTotals.credit > 0 ? [`Credit:    ${fmt(payTotals.credit)}`] : []),
      ...(payTotals.gift   > 0 ? [`Gift Card: ${fmt(payTotals.gift)}`]   : []),
      ...(payTotals.house  > 0 ? [`House Acc: ${fmt(payTotals.house)}`]  : []),
      '----------------------------',
    ].join('\n')
    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(`<html><head><title>Shift Report</title><style>body{font-family:monospace;font-size:13px;margin:20px;white-space:pre;color:#000;background:#fff;}</style></head><body>${lines}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  async function doClockOut() {
    if (!user || !shiftClockIn || !isCurrentlyClocked) return
    setClockOutStep('saving')
    setClockOutError('')
    const clockOutAt = new Date().toISOString()
    const netMins = Math.max(0, workedMinsTotal - breakMins)
    // Auto-save any open cart items as a held order so nothing is lost
    if (state.cart.length > 0) {
      const ps = state.posState[state.activeModule] as POSState
      const selTable = (state.posState['restaurant'] as POSState).selTable ?? (state.posState['bar'] as POSState).selTable ?? null
      const label = ps.customerName || (selTable ? `Table ${selTable}` : `Order ${Date.now().toString().slice(-4)}`)
      const held: HeldOrder = {
        id: crypto.randomUUID(),
        label: `${label} (auto-saved)`,
        cart: [...state.cart],
        orderType: state.cartOrderType,
        module: state.activeModule,
        selTable,
        guestCount: 1,
        customerName: ps.customerName,
        discPct: ps.manualDiscPct ?? 0,
        discFlat: ps.manualDiscFlat ?? 0,
        gratuityPct: ps.gratuityPct ?? 0,
        gratuityOverride: false,
        openedAt: new Date().toISOString(),
        savedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        savedBy: user.name,
      }
      dispatch({ type: 'HOLD_ORDER', order: held })
      dispatch({ type: 'CLEAR_CART' })
    }
    // Persist shift record to Supabase (non-blocking — clock-out proceeds even if Supabase is unavailable)
    try {
      await supabase.from('staff_shifts').insert({
        staff_id: user.id,
        staff_name: user.name,
        clock_in_at: shiftClockIn,
        clock_out_at: clockOutAt,
        break_minutes: breakMins,
        payroll_type: payrollProfile?.payrollType ?? 'hourly',
        net_worked_minutes: netMins,
        transaction_count: myTodayTxs.length,
        total_revenue: myTodayRevenue,
        payment_breakdown: payTotals,
        order_breakdown: orderTotals,
        notes: `auto · ${payrollProfile?.payrollType ?? 'hourly'} · ${breakMins}m break`,
      })
    } catch { /* intentionally silent — shift record is best-effort */ }
    // Audit trail
    dispatch({
      type: 'ADD_AUDIT',
      entry: {
        id: crypto.randomUUID(),
        ts: new Date().toLocaleString(),
        user: user.name,
        userId: user.id,
        action: 'CLOCK_OUT',
        detail: `${user.name} clocked out. ${fmtMins(netMins)} worked. ${myTodayTxs.length} orders · ${fmt(myTodayRevenue)}`,
        type: 'info',
        mod: state.activeModule,
      },
    })
    // Dispatch CLOCK_OUT: saves payroll time entry to localStorage, clears currentUser, returns to login
    dispatch({ type: 'CLOCK_OUT' })
  }

  // ── My Shift (personal view) — default for every role ──────────
  if (user && (isStaff || viewMode === 'mine')) {
    return (
      <>
      <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>

        {/* Header */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>My Shift</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>Activity tracked per transaction</div>
          </div>
          {!isStaff && (
            <button onClick={() => setViewMode('terminal')}
              style={{ padding: '8px 16px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)' }}>
              Terminal Overview &amp; EOD →
            </button>
          )}
        </div>

        {/* Session card */}
        <div style={{ background: '#14532d22', border: '1.5px solid var(--grn)', borderRadius: 'var(--r3)', padding: '14px 18px', marginBottom: 4, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--grn)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Session Active</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2, textTransform: 'capitalize' }}>
              {user.role} · {user.allowedModules.join(', ')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Today&apos;s Transactions</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{myTodayTxs.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Today&apos;s Revenue</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--grn)' }}>{fmt(myTodayRevenue)}</div>
          </div>
        </div>

        {/* ── CURRENT SHIFT ─────────────────────────────────────── */}
        <SectionLabel>Current Shift</SectionLabel>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '14px 16px', marginBottom: 4 }}>
          {!shiftClockIn ? (
            <div style={{ fontSize: 12, color: 'var(--txt3)', textAlign: 'center', padding: '8px 0' }}>
              No clock-in recorded for this session.
            </div>
          ) : (
            <>
              <InfoRow label="Clock In" value={fmtTime(shiftClockIn)} mono />
              {shiftClockOut && (
                <InfoRow label="Clock Out" value={fmtTime(shiftClockOut)} mono />
              )}
              {isCurrentlyClocked && (
                <InfoRow label="Time Worked" value={fmtMins(workedMinsTotal)} valueColor="var(--blue)" />
              )}
              {shiftClockOut && (
                <InfoRow label="Total Hours Worked" value={fmtMins(Math.max(0, workedMinsTotal - breakMins))} valueColor="var(--grn)" />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--txt3)', fontWeight: 600 }}>Status</div>
                <div style={{
                  fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                  background: isCurrentlyClocked ? '#14532d33' : 'var(--bg3)',
                  color: isCurrentlyClocked ? 'var(--grn)' : 'var(--txt3)',
                  border: `1px solid ${isCurrentlyClocked ? 'var(--grn)' : 'var(--bdr)'}`,
                }}>
                  {isCurrentlyClocked ? '🟢 Clocked In' : 'Shift Complete'}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── BREAKS ────────────────────────────────────────────── */}
        <SectionLabel>Breaks</SectionLabel>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '14px 16px', marginBottom: 4 }}>
          <InfoRow
            label="Break Deduction"
            value={isSalary ? 'Not Applicable (Salary Employee)' : `${breakMins} Minutes`}
            valueColor={isSalary ? 'var(--txt3)' : 'var(--txt)'}
            last
          />
        </div>

        {/* ── SESSION SUMMARY ───────────────────────────────────── */}
        <SectionLabel>Session Summary</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 4 }}>
          <StatCard label="Transactions"  value={String(myTodayTxs.length)} color="var(--txt)" />
          <StatCard label="Revenue"        value={fmt(myTodayRevenue)}         color="var(--grn)" />
          <StatCard label="Avg Sale"       value={myTodayTxs.length > 0 ? fmt(avgSale) : '—'} color="var(--blue)" />
        </div>

        {/* ── PAYMENT BREAKDOWN ─────────────────────────────────── */}
        <SectionLabel>Payment Breakdown</SectionLabel>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '14px 16px', marginBottom: 4 }}>
          {([
            { label: 'Cash',          value: payTotals.cash   },
            { label: 'Debit Card',    value: payTotals.debit  },
            { label: 'Credit Card',   value: payTotals.credit },
            { label: 'Gift Card',     value: payTotals.gift   },
            { label: 'House Account', value: payTotals.house  },
          ] as const).map(({ label, value }, i, arr) => (
            <InfoRow
              key={label}
              label={label}
              value={value > 0 ? fmt(value) : `${sym}0.00`}
              valueColor={value > 0 ? 'var(--grn)' : 'var(--txt3)'}
              mono
              last={i === arr.length - 1}
            />
          ))}
        </div>

        {/* ── ORDER BREAKDOWN ───────────────────────────────────── */}
        <SectionLabel>Order Breakdown</SectionLabel>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '14px 16px', marginBottom: 4 }}>
          {([
            { label: 'Restaurant', value: orderTotals.restaurant },
            { label: 'Bar',        value: orderTotals.bar        },
            { label: 'Takeout',    value: orderTotals.takeout    },
            { label: 'Delivery',   value: orderTotals.delivery   },
            { label: 'Car Wash',   value: orderTotals.carwash    },
          ] as const).map(({ label, value }, i, arr) => (
            <InfoRow
              key={label}
              label={label}
              value={String(value)}
              valueColor={value > 0 ? 'var(--txt)' : 'var(--txt3)'}
              last={i === arr.length - 1}
            />
          ))}
        </div>

        {/* ── END OF SHIFT WARNING / CLOCK OUT ─────────────────── */}
        {isCurrentlyClocked && totalActiveOrders > 0 && (
          <div style={{
            background: '#7c2d1222', border: '1.5px solid #f97316',
            borderRadius: 'var(--r3)', padding: '14px 16px', marginTop: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f97316', marginBottom: 4 }}>
              ⚠ You still have {totalActiveOrders} active order{totalActiveOrders > 1 ? 's' : ''} assigned.
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 12 }}>
              Please complete or transfer them before clocking out.
            </div>
            <button
              onClick={() => dispatch({ type: 'SET_PAGE', page: 'kitchen' })}
              style={{
                background: '#f97316', color: '#fff', border: 'none',
                borderRadius: 'var(--r2)', padding: '8px 16px',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              View Active Orders
            </button>
          </div>
        )}
        {isCurrentlyClocked && clockOutStep === 'idle' && totalActiveOrders === 0 && (
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <button
              onClick={() => setClockOutStep('confirm')}
              style={{
                width: '100%', padding: '14px', background: '#7f1d1d33',
                color: '#f87171', border: '1.5px solid rgba(248,113,113,.35)',
                borderRadius: 'var(--r3)', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', letterSpacing: '-.2px',
              }}
            >
              Clock Out
            </button>
          </div>
        )}

        {/* ── SHIFT ACTIVITY ────────────────────────────────────── */}
        <SectionLabel>Shift Activity</SectionLabel>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', marginBottom: 20 }}>
          {myDays.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
              No transactions recorded yet for your account.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                    {['Date', 'Transactions', 'Revenue', 'Hours Worked', 'Avg Sale'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myDays.map(([date, data]) => {
                    const hrsMin = hoursMinPerDay[date]
                    const avg    = data.count > 0 ? data.revenue / data.count : 0
                    return (
                      <tr key={date} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                          {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--txt)', fontWeight: 700, textAlign: 'center' }}>{data.count}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--grn)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(data.revenue)}</td>
                        <td style={{ padding: '9px 12px', color: hrsMin != null ? 'var(--blue)' : 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                          {hrsMin != null ? fmtMins(hrsMin) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', color: avg > 0 ? 'var(--txt2)' : 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                          {avg > 0 ? fmt(avg) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* My Orders — read-only transaction list */}
        {(() => {
          const ordersToShow = myOrdersFilter === 'today'
            ? myOrdersAll.filter(tx => txDateKey(tx.ts) === todayStr)
            : myOrdersAll
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>
                  My Orders
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt3)', marginLeft: 8 }}>
                    ({ordersToShow.length})
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['today', 'all'] as const).map(f => (
                    <button key={f} onClick={() => setMyOrdersFilter(f)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${myOrdersFilter === f ? 'var(--blue)' : 'var(--bdr)'}`,
                      background: myOrdersFilter === f ? 'var(--blue)' : 'transparent',
                      color: myOrdersFilter === f ? '#fff' : 'var(--txt3)',
                    }}>{f === 'today' ? 'Today' : 'All Time'}</button>
                  ))}
                </div>
              </div>
              <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                {ordersToShow.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                    No orders {myOrdersFilter === 'today' ? 'today' : 'found'}.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                          {['Time', 'Order #', 'Items', 'Type', 'Method', 'Total'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ordersToShow.map(tx => (
                          <tr key={tx.id} style={{ borderBottom: '1px solid var(--bdr2)', opacity: tx.voided ? 0.5 : 1 }}>
                            <td style={{ padding: '8px 12px', color: 'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                              {(() => { try { return new Date(tx.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) } catch { return tx.ts } })()}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--txt2)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                              {tx.orderNum ?? `#${tx.id}`}
                              {tx.voided && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#ef4444', background: '#7f1d1d22', border: '1px solid #ef444444', borderRadius: 4, padding: '1px 4px' }}>VOID</span>}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--txt)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tx.item}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--txt3)', textTransform: 'capitalize', fontSize: 11 }}>
                              {tx.orderType ?? '—'}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--txt3)', textTransform: 'capitalize', fontSize: 11 }}>
                              {tx.pay}
                            </td>
                            <td style={{ padding: '8px 12px', color: tx.voided ? 'var(--txt3)' : 'var(--grn)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                              {fmt(tx.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </div>

      {/* ── Clock Out Shift Summary Modal ─────────────────────── */}
      {clockOutStep !== 'idle' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 970, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.75)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Shift Summary</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{user.name} · Review before clocking out</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 8 }}>Shift Hours</div>
                <InfoRow label="Clock In"         value={shiftClockIn ? fmtTime(shiftClockIn) : '—'} mono />
                <InfoRow label="Clock Out"         value={fmtTime(new Date().toISOString())} mono />
                <InfoRow label="Total Time"        value={fmtMins(workedMinsTotal)} />
                {!isSalary && <InfoRow label="Break Deduction" value={`-${breakMins}m`} valueColor="var(--txt3)" />}
                <InfoRow label="Net Hours Worked"  value={fmtMins(Math.max(0, workedMinsTotal - breakMins))} valueColor="var(--grn)" last />
              </div>
              <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 8 }}>Session Performance</div>
                <InfoRow label="Orders Completed" value={String(myTodayTxs.length)} />
                <InfoRow label="Total Revenue"    value={fmt(myTodayRevenue)} valueColor="var(--grn)" mono />
                <InfoRow label="Avg Sale"         value={myTodayTxs.length > 0 ? fmt(avgSale) : '—'} mono last />
              </div>
              {myTodayTxs.length > 0 && (
                <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 8 }}>Payment Breakdown</div>
                  {payTotals.cash   > 0 && <InfoRow label="Cash"          value={fmt(payTotals.cash)}   mono />}
                  {payTotals.debit  > 0 && <InfoRow label="Debit Card"    value={fmt(payTotals.debit)}  mono />}
                  {payTotals.credit > 0 && <InfoRow label="Credit Card"   value={fmt(payTotals.credit)} mono />}
                  {payTotals.gift   > 0 && <InfoRow label="Gift Card"     value={fmt(payTotals.gift)}   mono />}
                  {payTotals.house  > 0 && <InfoRow label="House Account" value={fmt(payTotals.house)}  mono last />}
                  {Object.values(payTotals).every(v => v === 0) && (
                    <InfoRow label="No payments recorded this session" value="—" last />
                  )}
                </div>
              )}
              {clockOutError && (
                <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 12px', background: '#7f1d1d22', borderRadius: 'var(--r2)', border: '1px solid rgba(239,68,68,.3)' }}>
                  {clockOutError}
                </div>
              )}
            </div>
            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--bdr)', flexShrink: 0, display: 'flex', gap: 8 }}>
              <button
                onClick={handlePrintSummary}
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}
              >
                Print
              </button>
              <button
                onClick={() => { setClockOutStep('idle'); setClockOutError('') }}
                disabled={clockOutStep === 'saving'}
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={doClockOut}
                disabled={clockOutStep === 'saving'}
                style={{ flex: 2, padding: '10px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 800, border: 'none', cursor: clockOutStep === 'saving' ? 'default' : 'pointer', background: clockOutStep === 'saving' ? 'var(--bdr)' : '#dc2626', color: '#fff', opacity: clockOutStep === 'saving' ? 0.7 : 1 }}
              >
                {clockOutStep === 'saving' ? 'Saving...' : 'Confirm Clock Out'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    )
  }

  // ── Terminal Overview (admin/manager only) — EOD, active shift, history ──
  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>

      {/* Page header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Terminal Overview</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {allShifts.length} recorded · {fmt(totalRevenue)} total revenue
          </div>
        </div>
        <button onClick={() => setViewMode('mine')}
          style={{ padding: '8px 16px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)' }}>
          ← My Shift
        </button>
      </div>

      {/* Active shift */}
      {state.currentShift && (() => {
        const ageHrs = shiftAgeHours(state.currentShift.start)
        const stale = ageHrs > STALE_SHIFT_HOURS
        return (
          <div style={{ background: stale ? '#7f1d1d22' : '#14532d22', border: `1.5px solid ${stale ? 'var(--red)' : 'var(--grn)'}`, borderRadius: 'var(--r3)', padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: stale ? 'var(--red)' : 'var(--grn)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Active Shift</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{state.currentShift.userName}</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2, textTransform: 'capitalize' }}>{state.currentShift.role} · {state.currentShift.modules.join(', ')}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Started</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{new Date(state.currentShift.start).toLocaleTimeString()}</div>
                <div style={{ fontSize: 11, fontWeight: stale ? 700 : 400, color: stale ? 'var(--red)' : 'var(--txt3)' }}>{duration(state.currentShift.start, null)} ago</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Transactions</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{state.currentShift.txCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Revenue</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--grn)' }}>{fmt(state.currentShift.revenue)}</div>
              </div>
            </div>
            {stale && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(239,68,68,.25)', fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
                ⚠️ This shift has been open {duration(state.currentShift.start, null)} — longer than a normal business day. It likely still includes a previous day&apos;s sales because End of Day was never run. Start End of Day below and use Force Close if needed to reset it before counting cash.
              </div>
            )}
          </div>
        )
      })()}

      <button
        onClick={() => setShowEOD(true)}
        style={{
          background: 'var(--grn)', color: '#fff', border: 'none',
          borderRadius: 'var(--r2)', padding: '12px 22px',
          fontWeight: 700, fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 16, minHeight: 44,
        }}
      >
        📋 Start End of Day
      </button>

      {showEOD && <EODWizard onClose={() => setShowEOD(false)} />}

      {/* ── EOD Cash Reconciliation ───────────────────────────── */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', marginBottom: 18 }}>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>EOD Cash Reconciliation</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
              {dayTxs.length} transactions on {new Date(eodDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <input
            type="date"
            value={eodDate}
            onChange={e => setEodDate(e.target.value)}
            style={{
              background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)',
              padding: '6px 10px', fontSize: 12, color: 'var(--txt)', cursor: 'pointer',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--bdr)' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
              Opening Float (cash in drawer at start)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--txt3)', flexShrink: 0 }}>{sym}</span>
              <input
                type="number" min={0} step={0.01}
                value={openingFloat}
                onChange={e => setOpeningFloat(e.target.value)}
                placeholder="0.00"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 700,
                  border: `1.5px solid ${openingFloat ? 'var(--blue)' : 'var(--bdr)'}`,
                  background: 'var(--bg3)', color: 'var(--txt)',
                }}
              />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
              Actual Cash Counted (physical count)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--txt3)', flexShrink: 0 }}>{sym}</span>
              <input
                type="number" min={0} step={0.01}
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                placeholder="0.00"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 700,
                  border: `1.5px solid ${actualCash ? 'var(--grn)' : 'var(--bdr)'}`,
                  background: 'var(--bg3)', color: 'var(--txt)',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bdr)' }}>
          <StatCard label="Total Sales (all methods)"  value={fmt(totalSales)}  color="var(--txt)"  sub={`${dayTxs.filter(t=>!t.voided).length} transactions`} />
          <StatCard label="Card / Other Sales"         value={fmt(cardSales)}   color="var(--blue)" sub={`${dayTxs.filter(t=>!t.voided && !isCashTx(t)).length} transactions`} />
          <StatCard label="Cash Sales"                 value={fmt(cashSales)}   color="var(--ora)"  sub={`${cashTxs.length} cash transactions`} />
          <StatCard label="Expected Cash in Drawer"    value={fmt(expected)}    color="var(--pur)"  sub={`Float ${fmt(floatNum)} + Cash ${fmt(cashSales)}`} />
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>
              Over / Short
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
              {overShort === null
                ? 'Enter actual cash counted above to see variance'
                : overShort === 0
                  ? 'Drawer balanced perfectly'
                  : overShort > 0
                    ? `Drawer is over by ${fmt(overShort)} — extra cash in drawer`
                    : `Drawer is short by ${fmt(Math.abs(overShort))} — missing cash`}
            </div>
          </div>
          <div style={{
            fontSize: 24, fontWeight: 900, fontFamily: 'var(--mono)', color: overShortColor,
            background: overShort === null ? 'var(--bg3)' : overShort === 0 ? '#14532d22' : '#7f1d1d22',
            border: `2px solid ${overShortColor}44`,
            borderRadius: 'var(--r3)', padding: '8px 18px', whiteSpace: 'nowrap',
          }}>
            {overShort === null ? '—'
              : overShort === 0  ? 'BALANCED'
              : overShort > 0    ? `+${fmt(overShort)}`
              :                    `-${fmt(Math.abs(overShort))}`}
          </div>
        </div>

        <div style={{ padding: '12px 16px 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
            Cash Transactions ({cashTxs.length})
          </div>
          {cashTxs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--txt3)', padding: '10px 0 12px', textAlign: 'center' }}>
              No cash transactions on this date
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)' }}>
                    {['Time', 'Cashier', 'Items', 'Total', 'Cash Received'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cashTxs.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--txt3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{tx.ts.split(',')[1]?.trim() ?? tx.ts}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--txt2)', fontWeight: 600 }}>{tx.cashier}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--txt2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.item}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--grn)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(tx.total)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--ora)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(cashAmount(tx))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--bdr)' }}>
                    <td colSpan={3} style={{ padding: '7px 8px', fontWeight: 700, color: 'var(--txt3)', fontSize: 11 }}>TOTAL</td>
                    <td style={{ padding: '7px 8px', fontWeight: 800, color: 'var(--grn)', fontFamily: 'var(--mono)' }}>{fmt(cashTxs.reduce((s,t)=>s+t.total,0))}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 800, color: 'var(--ora)', fontFamily: 'var(--mono)' }}>{fmt(cashSales)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Shift History ─────────────────────────────────────── */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Shift History</div>
        <input
          type="text"
          value={shiftHistoryFilter}
          onChange={e => setShiftHistoryFilter(e.target.value)}
          placeholder="Filter by employee name…"
          style={{ padding: '7px 12px', borderRadius: 'var(--r2)', fontSize: 12, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', minWidth: 200 }}
        />
      </div>
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        {(() => {
          const q = shiftHistoryFilter.trim().toLowerCase()
          const filteredShifts = q ? allShifts.filter(s => s.userName.toLowerCase().includes(q)) : allShifts
          return filteredShifts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
            {allShifts.length === 0 ? 'No shifts recorded yet.' : 'No shifts match that filter.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                  {['Staff','Role','Modules','Start','End','Duration','Transactions','Revenue'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredShifts.map(s => {
                  const isActive = !s.end
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--txt)' }}>{s.userName}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', textTransform: 'capitalize' }}>{s.role}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)' }}>{s.modules.join(', ')}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {new Date(s.start).toLocaleString()}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {isActive ? <span style={{ color: 'var(--grn)', fontWeight: 700 }}>Active</span> : new Date(s.end!).toLocaleString()}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt2)', fontFamily: 'var(--mono)' }}>{duration(s.start, s.end)}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--txt)', fontWeight: 700, textAlign: 'center' }}>{s.txCount}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--grn)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(s.revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )
        })()}
      </div>
    </div>
  )
}
