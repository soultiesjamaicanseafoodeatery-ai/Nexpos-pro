'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { Transaction } from '@/types'
import { smartPrint, buildCarwashReceipt } from '@/lib/utils/ticketPrinter'
import { qzOpenDrawer } from '@/lib/utils/qzTray'
import { shouldOpenDrawer } from '@/lib/utils/payments'
import type { CwService, CwAddon, PaymentPrefill, PayMethod } from './CarWashFlow'

const fmtJ = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const QUICK_AMTS = [500, 1000, 2000, 5000, 10000, 20000]

type SplitMethod = 'cash' | 'debit' | 'credit'
interface SplitRow { method: SplitMethod; amount: string }
interface PaymentComponent { method: string; amount: number }

interface Props {
  services: CwService[]
  addons: CwAddon[]
  initial?: PaymentPrefill
  onBack: () => void
  onComplete: () => void
  onHold: (draft: { plate: string; vehicleType: string; customerName: string; phone: string; payMethod: PayMethod }) => void
  heldBadge: ReactNode
}

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--surf2)', border: '1.5px solid var(--bdr2)',
  borderRadius: 'var(--r2)', padding: '10px 12px', fontSize: 14, color: 'var(--txt)',
  boxSizing: 'border-box', outline: 'none',
}

export default function CarWashPayment({ services, addons, initial, onBack, onComplete, onHold, heldBadge }: Props) {
  const { state, dispatch } = useApp()
  const { currentUser, biz } = state

  const [step,         setStep]         = useState<'method' | 'cash' | 'card' | 'split'>('method')
  const [payMethod,    setPayMethod]    = useState<PayMethod>(initial?.payMethod ?? 'cash')
  const [cashTendered, setCashTendered] = useState('')
  const [splits,       setSplits]       = useState<SplitRow[]>([{ method: 'cash', amount: '' }])
  const plate        = initial?.plate ?? ''
  const vehicleType  = initial?.vehicleType ?? 'Car'
  const customerName = initial?.customerName ?? ''
  const phone        = initial?.phone ?? ''
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [ticket,       setTicket]       = useState<string | null>(null)
  const [completedAt,  setCompletedAt]  = useState('')

  // What was actually charged on the completed transaction — used for the success screen
  // and manual reprints, since `cashTendered`/`splits` are input state that doesn't apply
  // uniformly across the cash/card/split paths.
  const [completedPayMethod, setCompletedPayMethod] = useState<PayMethod>('cash')
  const [completedPayments,  setCompletedPayments]  = useState<PaymentComponent[] | undefined>(undefined)
  const [completedTender,    setCompletedTender]    = useState<number | undefined>(undefined)
  const [completedChange,    setCompletedChange]    = useState<number | undefined>(undefined)

  const servicesTotal = services.reduce((s, svc) => s + svc.price * (svc.qty ?? 1), 0)
  const addonTotal    = addons.reduce((s, a) => s + a.price, 0)
  const subtotal      = servicesTotal + addonTotal
  const taxRate       = 0
  const taxAmount     = Math.round(subtotal * taxRate * 100) / 100
  const total         = subtotal + taxAmount
  const tendered      = parseFloat(cashTendered || '0')
  const change        = tendered - total
  const serviceNames  = services
    .map(s => (s.qty ?? 1) > 1 ? `${s.name} ×${s.qty}` : s.name)
    .join(', ')

  const splitTotal = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const splitDiff  = Math.round((total - splitTotal) * 100) / 100
  const splitBalanced = Math.abs(splitDiff) <= 0.01

  // ── Complete payment ──────────────────────────────────────
  const complete = async () => {
    setSaving(true); setError('')
    try {
      // Build the payment breakdown up front so a bad split is rejected before anything is saved.
      let paymentsForTx: PaymentComponent[] | undefined
      let tenderForTx: number | undefined
      let changeForTx: number | undefined

      if (payMethod === 'split') {
        const entries = splits
          .filter(p => (parseFloat(p.amount) || 0) > 0)
          .map(p => ({ method: p.method, amount: Math.round((parseFloat(p.amount) || 0) * 100) / 100 }))
        const sum = entries.reduce((s, p) => s + p.amount, 0)
        if (entries.length === 0 || Math.abs(sum - total) > 0.01) {
          throw new Error(`Split amounts (${fmtJ(sum)}) must equal the total (${fmtJ(total)})`)
        }
        paymentsForTx = entries
      } else if (payMethod === 'cash') {
        if (tendered < total - 0.005) throw new Error('Cash tendered is less than the total due')
        tenderForTx = tendered
        changeForTx = change
      }
      // debit/credit: single-method payment, no tender/change, no payments breakdown needed

      const res = await fetch('/api/carwash-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName, phone, vehicleType,
          plate: plate.trim().toUpperCase(),
          services: services.map(s => ({ id: s.id, name: s.name, price: s.price, qty: s.qty ?? 1 })),
          addons: addons.map(a => ({ id: a.id, name: a.name, price: a.price })),
          addonsTotal:   addonTotal,
          paymentMethod: payMethod,
          total,
          employeeName:  currentUser?.name ?? '',
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error?.message ?? JSON.stringify(e.error) ?? 'Failed to save')
      }
      const order = await res.json()
      setTicket(order.ticket_no)
      const nowTs = new Date()
      setCompletedAt(nowTs.toISOString())
      setCompletedPayMethod(payMethod)
      setCompletedPayments(paymentsForTx)
      setCompletedTender(tenderForTx)
      setCompletedChange(changeForTx)

      const cwTx: Transaction = {
        id:          Date.now() + Math.floor(Math.random() * 1000),
        ts:          nowTs.toISOString(),
        mod:         'carwash',
        cashier:     currentUser?.name ?? 'Staff',
        userId:      currentUser?.id ?? '',
        customer:    customerName || plate || 'Walk-in',
        item:        serviceNames,
        addons:      addons.map(a => a.name),
        sub:         subtotal,
        disc:        0,
        tax:         taxAmount,
        total,
        pay:         payMethod,
        orderType:   'walk-in',
        gct:         taxAmount,
        serviceCharge: 0,
        gratuity:    0,
        items:       [],
        orderNum:    order.ticket_no,
        tender:      tenderForTx,
        changeDue:   changeForTx,
        payments:    paymentsForTx,
      }
      dispatch({ type: 'ADD_TRANSACTION', tx: cwTx })
      if (shouldOpenDrawer(payMethod, paymentsForTx) && biz?.printers?.drawerEnabled && biz?.printers?.receipt)
        qzOpenDrawer(biz.printers.receipt)
      if (biz?.printers?.receipt) {
        const pw = (biz.printers?.width ?? 80) as 58 | 80
        const html = buildCarwashReceipt({
          ticket: order.ticket_no,
          ts: nowTs.toISOString(),
          plate, vehicleType, customerName, phone,
          services, addons,
          subtotal, taxAmount, total,
          payMethod,
          tendered: tenderForTx,
          change: changeForTx,
          payments: paymentsForTx,
          staffName: currentUser?.name,
        }, biz, { width: pw })
        smartPrint(html, 'Car Wash Receipt', biz.printers.receipt, pw, true)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Print receipt — same silent QZ Tray path as every other receipt in the app ──
  const printReceipt = () => {
    if (!biz) return
    const pw = (biz.printers?.width ?? 80) as 58 | 80
    const html = buildCarwashReceipt({
      ticket: ticket ?? '',
      ts: completedAt || new Date().toISOString(),
      plate, vehicleType, customerName, phone,
      services, addons,
      subtotal, taxAmount, total,
      payMethod: completedPayMethod,
      tendered: completedTender,
      change: completedChange,
      payments: completedPayments,
      staffName: currentUser?.name,
    }, biz, { width: pw })
    smartPrint(html, 'Car Wash Receipt', biz.printers?.receipt, pw)
  }

  const payMethodLabel = (m: string) =>
    m === 'debit' ? 'Debit Card' : m === 'credit' ? 'Credit Card' : m === 'split' ? 'Split' : 'Cash'

  // ── Success / receipt screen ──────────────────────────────
  if (ticket) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20, padding: 40, background: 'var(--bg)', textAlign: 'center' }}>
        <div style={{ fontSize: 72 }}>✅</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--txt)' }}>Payment Complete!</div>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 900, color: 'var(--blue)', background: 'var(--blue-bg)', padding: '10px 32px', borderRadius: 'var(--r2)', border: '2px solid rgba(79,142,247,.3)', letterSpacing: '2px' }}>
          {ticket}
        </div>

        <div style={{ fontSize: 13, color: 'var(--txt3)' }}>Order marked as <strong>Completed</strong></div>

        <div style={{ width: '100%', maxWidth: 420, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', textAlign: 'left' }}>
          {[
            ...(plate       ? [{ l: 'Plate',    v: plate }]       : []),
            ...(vehicleType ? [{ l: 'Vehicle',  v: vehicleType }] : []),
            ...(customerName? [{ l: 'Customer', v: customerName }] : []),
            ...services.map(s => ({
              l: (s.qty ?? 1) > 1 ? `${s.name} ×${s.qty}` : s.name,
              v: fmtJ(s.price * (s.qty ?? 1)),
            })),
            ...addons.map(a => ({ l: `+ ${a.name}`, v: fmtJ(a.price) })),
            { l: 'Total',   v: fmtJ(total),   bold: true },
            { l: 'Payment', v: payMethodLabel(completedPayMethod) },
            ...(completedPayments ?? []).map(p => ({ l: '  ' + payMethodLabel(p.method), v: fmtJ(p.amount) })),
            ...(completedTender != null ? [{ l: 'Tendered', v: fmtJ(completedTender) }] : []),
            ...(completedChange != null && completedChange > 0 ? [{ l: 'Change', v: fmtJ(completedChange), bold: true }] : []),
            ...(currentUser?.name ? [{ l: 'Staff', v: currentUser.name }] : []),
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', borderBottom: '1px solid var(--bdr2)' }}>
              <span style={{ fontSize: 13, color: 'var(--txt3)' }}>{row.l}</span>
              <span style={{ fontSize: 13, fontWeight: row.bold ? 900 : 600, color: row.bold ? 'var(--grn)' : 'var(--txt)', fontFamily: row.bold ? 'var(--mono)' : undefined }}>{row.v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button
            onClick={printReceipt}
            style={{ padding: '12px 28px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 700, background: 'var(--surf)', color: 'var(--txt)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}
          >
            Reprint Receipt
          </button>
          <button
            onClick={onComplete}
            style={{ padding: '12px 32px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 800, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            + New Wash
          </button>
        </div>
      </div>
    )
  }

  // ── Payment screen ────────────────────────────────────────
  const backBtnStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer' }
  const headerBar: React.CSSProperties = { padding: '14px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }
  const footerBar: React.CSSProperties = { padding: '14px 24px', borderTop: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', gap: 10 }
  const holdBtnStyle: React.CSSProperties = { flex: '0 0 auto', padding: '16px 22px', borderRadius: 'var(--r2)', fontSize: 15, fontWeight: 700, background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', cursor: saving ? 'not-allowed' : 'pointer' }
  const subInfo = [plate, customerName].filter(Boolean).join(' · ')
  const holdNow = () => onHold({ plate, vehicleType, customerName, phone, payMethod })

  const OrderSummaryCard = () => (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>
        Order Summary
      </div>
      {services.map(s => (
        <div key={s.id} style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bdr)' }}>
          <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{(s.qty ?? 1) > 1 ? `${s.name} ×${s.qty}` : s.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{fmtJ(s.price * (s.qty ?? 1))}</span>
        </div>
      ))}
      {addons.map(a => (
        <div key={a.id} style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bdr)' }}>
          <span style={{ fontSize: 12, color: 'var(--txt3)' }}>+ {a.name}</span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>{fmtJ(a.price)}</span>
        </div>
      ))}
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--blue-bg)' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>TOTAL</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtJ(total)}</span>
      </div>
    </div>
  )

  // ── Step: choose payment method ────────────────────────────
  if (step === 'method') {
    const METHODS: { key: PayMethod; label: string; icon: string; color: string }[] = [
      { key: 'cash',   label: 'Cash',        icon: '💵', color: 'var(--grn)' },
      { key: 'debit',  label: 'Debit Card',  icon: '💳', color: 'var(--blue)' },
      { key: 'credit', label: 'Credit Card', icon: '💳', color: 'var(--pur)' },
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={headerBar}>
          <button onClick={onBack} style={backBtnStyle}>Back</button>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)' }}>Payment</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>
              {serviceNames}{addons.length > 0 ? ` + ${addons.length} add-on${addons.length !== 1 ? 's' : ''}` : ''}
            </div>
            {subInfo && <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>{subInfo}</div>}
          </div>
          {heldBadge}
          <div style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 900, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtJ(total)}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10, textAlign: 'center' }}>
              Select Payment Method
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              {METHODS.map(({ key, label, icon, color }) => (
                <button
                  key={key}
                  onClick={() => { setPayMethod(key); setStep(key === 'cash' ? 'cash' : 'card') }}
                  style={{
                    padding: '16px 10px', borderRadius: 'var(--r3)',
                    border: `2px solid ${color}44`, background: `${color}11`,
                    color: 'var(--txt)', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    fontWeight: 700, fontSize: 12, transition: 'all .12s',
                  }}
                >
                  <span style={{ fontSize: 24 }}>{icon}</span>
                  <span style={{ color }}>{label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setPayMethod('split'); setStep('split') }}
              style={{
                width: '100%', padding: '13px 12px', borderRadius: 'var(--r3)',
                border: '2px dashed var(--bdr)', background: 'transparent', color: 'var(--txt2)',
                cursor: 'pointer', fontWeight: 700, fontSize: 13,
              }}
            >
              + Split / Multi-Tender Payment
            </button>
          </div>
        </div>

        <div style={footerBar}>
          <button onClick={holdNow} disabled={saving} style={{ ...holdBtnStyle, flex: 1 }}>
            Hold for Later
          </button>
        </div>
      </div>
    )
  }

  // ── Step: debit/credit confirmation ──────────────────────────
  if (step === 'card') {
    const label = payMethodLabel(payMethod)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={headerBar}>
          <button onClick={() => setStep('method')} style={backBtnStyle}>Back</button>
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>{label}</span>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtJ(total)}</div>
        </div>
        <OrderSummaryCard />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '28px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>💳</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Run {label} on terminal</div>
          <div style={{ background: 'var(--blue-bg)', border: '2px solid rgba(79,142,247,.3)', borderRadius: 'var(--r3)', padding: '16px 32px' }}>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Amount to charge</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: 'var(--blue)' }}>{fmtJ(total)}</div>
          </div>
          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', padding: '10px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, border: '1px solid rgba(239,68,68,.2)' }}>
              {error}
            </div>
          )}
        </div>
        <div style={footerBar}>
          <button onClick={holdNow} disabled={saving} style={holdBtnStyle}>Hold</button>
          <button
            onClick={complete}
            disabled={saving}
            style={{ flex: 1, padding: '16px', borderRadius: 'var(--r2)', fontSize: 17, fontWeight: 800, background: saving ? 'var(--surf2)' : '#16a34a', color: saving ? 'var(--txt3)' : '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', transition: 'background .15s' }}
          >
            {saving ? 'Processing…' : `Confirm ${label} — ${fmtJ(total)}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Step: split / multi-tender ───────────────────────────────
  if (step === 'split') {
    const SPLIT_METHODS: { value: SplitMethod; label: string }[] = [
      { value: 'cash',   label: 'Cash' },
      { value: 'debit',  label: 'Debit Card' },
      { value: 'credit', label: 'Credit Card' },
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={headerBar}>
          <button onClick={() => { setSplits([{ method: 'cash', amount: '' }]); setStep('method') }} style={backBtnStyle}>Back</button>
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Split Payment</span>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtJ(total)}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>

            <OrderSummaryCard />

            {/* Running total */}
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Total Due</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: 'var(--txt)' }}>{fmtJ(total)}</span>
              </div>
              <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Entered</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: splitBalanced ? 'var(--grn)' : 'var(--ora)' }}>{fmtJ(splitTotal)}</span>
              </div>
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--bdr)', background: splitBalanced ? 'rgba(34,197,94,.08)' : 'rgba(245,158,11,.08)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: splitBalanced ? 'var(--grn)' : 'var(--ora)' }}>
                  {splitBalanced ? '✓ Balanced' : splitDiff > 0 ? 'Remaining' : 'Over by'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 15, color: splitBalanced ? 'var(--grn)' : 'var(--ora)' }}>
                  {splitBalanced ? '' : fmtJ(Math.abs(splitDiff))}
                </span>
              </div>
            </div>

            {/* Payment rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {splits.map((sp, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={sp.method}
                    onChange={e => setSplits(prev => prev.map((p, j) => j === i ? { ...p, method: e.target.value as SplitMethod } : p))}
                    style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 8px', fontSize: 12, color: 'var(--txt)', flex: '0 0 134px' }}
                  >
                    {SPLIT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input
                    type="number" min={0} step="0.01" value={sp.amount}
                    onChange={e => setSplits(prev => prev.map((p, j) => j === i ? { ...p, amount: e.target.value } : p))}
                    placeholder="Amount"
                    style={{ flex: 1, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px', fontSize: 13, color: 'var(--txt)' }}
                  />
                  {splits.length > 1 && (
                    <button onClick={() => setSplits(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, padding: '0 4px' }}>×</button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setSplits(prev => [...prev, { method: 'cash', amount: splitDiff > 0.005 ? splitDiff.toFixed(2) : '' }])}
                style={{ padding: '9px 0', borderRadius: 'var(--r)', border: '1.5px dashed var(--bdr)', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                + Add Payment Method
              </button>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', padding: '10px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, border: '1px solid rgba(239,68,68,.2)' }}>
                {error}
              </div>
            )}
          </div>
        </div>

        <div style={footerBar}>
          <button onClick={holdNow} disabled={saving} style={holdBtnStyle}>Hold</button>
          <button
            onClick={complete}
            disabled={saving || !splitBalanced}
            style={{ flex: 1, padding: '16px', borderRadius: 'var(--r2)', fontSize: 17, fontWeight: 800, background: (saving || !splitBalanced) ? 'var(--surf2)' : '#16a34a', color: (saving || !splitBalanced) ? 'var(--txt3)' : '#fff', border: 'none', cursor: (saving || !splitBalanced) ? 'not-allowed' : 'pointer', transition: 'background .15s' }}
          >
            {saving ? 'Processing…' : splitBalanced ? '✓  Complete Payment' : splitDiff > 0 ? `Remaining: ${fmtJ(splitDiff)}` : `Over by ${fmtJ(-splitDiff)}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Step: cash tendering ──────────────────────────────────────
  const tenderOk = tendered >= total - 0.005
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={headerBar}>
        <button onClick={() => { setCashTendered(''); setStep('method') }} style={backBtnStyle}>Back</button>
        <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Cash Payment</span>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtJ(total)}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>

          <OrderSummaryCard />

          {/* Cash tendered + change */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>
              Cash Tendered
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Total Due</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: 'var(--txt)' }}>{fmtJ(total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Cash Received</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: tendered >= total && cashTendered ? 'var(--grn)' : tendered > 0 ? 'var(--ora)' : 'var(--txt3)' }}>
                  {tendered > 0 ? fmtJ(tendered) : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  onClick={() => setCashTendered(total.toFixed(2))}
                  style={{ padding: '7px 14px', borderRadius: 'var(--r)', border: `1.5px solid ${tendered === total ? 'var(--blue)' : 'var(--bdr)'}`, background: tendered === total ? 'var(--blue-bg)' : 'var(--surf2)', color: tendered === total ? 'var(--blue)' : 'var(--txt2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Exact
                </button>
                {QUICK_AMTS.filter(a => a >= Math.floor(total)).map(a => (
                  <button
                    key={a}
                    onClick={() => setCashTendered(String(a))}
                    style={{ padding: '7px 14px', borderRadius: 'var(--r)', border: `1.5px solid ${tendered === a ? 'var(--blue)' : 'var(--bdr)'}`, background: tendered === a ? 'var(--blue-bg)' : 'var(--surf2)', color: tendered === a ? 'var(--blue)' : 'var(--txt2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {a >= 1000 ? `${(a / 1000).toFixed(0)}K` : a}
                  </button>
                ))}
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={cashTendered}
                onChange={e => setCashTendered(e.target.value)}
                placeholder={fmtJ(total)}
                style={{ ...inp, fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 18 }}
              />
              {cashTendered && tendered >= total && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(34,197,94,.08)', borderRadius: 'var(--r2)', border: '1px solid rgba(34,197,94,.3)' }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)' }}>Change Due</span>
                  <span style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{fmtJ(change)}</span>
                </div>
              )}
              {cashTendered && tendered < total && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.08)', borderRadius: 'var(--r2)', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                  Short by {fmtJ(total - tendered)}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', padding: '10px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, border: '1px solid rgba(239,68,68,.2)' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      <div style={footerBar}>
        <button onClick={holdNow} disabled={saving} style={holdBtnStyle}>Hold</button>
        <button
          onClick={complete}
          disabled={saving || !tenderOk}
          style={{ flex: 1, padding: '16px', borderRadius: 'var(--r2)', fontSize: 17, fontWeight: 800, background: (saving || !tenderOk) ? 'var(--surf2)' : '#16a34a', color: (saving || !tenderOk) ? 'var(--txt3)' : '#fff', border: 'none', cursor: (saving || !tenderOk) ? 'not-allowed' : 'pointer', transition: 'background .15s' }}
        >
          {saving ? 'Processing…' : tenderOk ? `✓  Complete — Change ${fmtJ(change)}` : `Need ${fmtJ(Math.max(0, total - tendered))} more`}
        </button>
      </div>
    </div>
  )
}
