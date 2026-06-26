'use client'

import { useState } from 'react'
import { useStore } from '@/store'
import type { CwService, CwAddon } from './CarWashFlow'

interface Props {
  services: CwService[]
  addons: CwAddon[]
  onBack: () => void
  onComplete: () => void
}

const fmtJ = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const METHODS = ['Cash', 'Card', 'Transfer'] as const
type Method = typeof METHODS[number]

export default function CarWashPayment({ services, addons, onBack, onComplete }: Props) {
  const { state, dispatch } = useStore()
  const currentUser = state.currentUser

  const [method, setMethod] = useState<Method>('Cash')
  const [cashGiven, setCashGiven] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const servicesTotal = services.reduce((acc, s) => acc + s.price, 0)
  const addonTotal = addons.reduce((acc, a) => acc + a.price, 0)
  const subtotal = servicesTotal + addonTotal
  const taxRate = 0
  const taxAmount = subtotal * taxRate
  const total = subtotal + taxAmount

  const cashGivenNum = parseFloat(cashGiven) || 0
  const change = cashGivenNum - total

  const serviceNames = services.map(s => s.name).join(', ')
  const itemLabel = addons.length > 0
    ? `${serviceNames} + ${addons.map(a => a.name).join(', ')}`
    : serviceNames

  async function handlePay() {
    if (busy) return
    if (method === 'Cash' && cashGivenNum < total) {
      setError('Cash given is less than total')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/carwash-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services: services.map(s => s.id),
          addons: addons.map(a => a.id),
          payment_method: method,
          amount_paid: method === 'Cash' ? cashGivenNum : total,
          customer_name: customerName.trim() || null,
          plate_number: plateNumber.trim() || null,
          cashier_id: currentUser?.id ?? null,
          cashier_name: currentUser?.name ?? 'Staff',
          total_amount: total,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const order = await res.json()

      dispatch({
        type: 'ADD_TRANSACTION',
        payload: {
          id: order.id ?? `cw-${Date.now()}`,
          timestamp: new Date().toISOString(),
          item: itemLabel,
          amount: total,
          paymentMethod: method,
          cashier: currentUser?.name ?? 'Staff',
          category: 'Car Wash',
        },
      })

      // Print receipt
      const receiptLines = [
        ...services.map(s => `<div class="row"><span>${s.name}</span><span>${fmtJ(s.price)}</span></div>`),
        ...addons.map(a => `<div class="row"><span>+ ${a.name}</span><span>${fmtJ(a.price)}</span></div>`),
        taxAmount > 0 ? `<div class="row"><span>GCT (15%)</span><span>${fmtJ(taxAmount)}</span></div>` : '',
        `<div class="row total"><span>TOTAL</span><span>${fmtJ(total)}</span></div>`,
        method === 'Cash' ? `<div class="row"><span>Cash Given</span><span>${fmtJ(cashGivenNum)}</span></div>` : '',
        method === 'Cash' ? `<div class="row"><span>Change</span><span>${fmtJ(change)}</span></div>` : '',
      ].filter(Boolean).join('')

      const receipt = `
        <html><head><style>
          body{font-family:monospace;font-size:13px;width:280px;margin:0 auto;padding:16px}
          .title{text-align:center;font-size:16px;font-weight:900;margin-bottom:4px}
          .sub{text-align:center;color:#666;font-size:11px;margin-bottom:12px}
          .row{display:flex;justify-content:space-between;margin:4px 0}
          .row.total{font-weight:900;border-top:1px solid #000;padding-top:6px;margin-top:6px}
          .footer{text-align:center;color:#888;font-size:11px;margin-top:12px}
        </style></head><body>
          <div class="title">Soulties Eatery</div>
          <div class="sub">Car Wash Receipt</div>
          ${customerName ? `<div class="row"><span>Customer</span><span>${customerName}</span></div>` : ''}
          ${plateNumber ? `<div class="row"><span>Plate</span><span>${plateNumber}</span></div>` : ''}
          <div class="row"><span>Payment</span><span>${method}</span></div>
          <div style="border-top:1px dashed #999;margin:8px 0"></div>
          ${receiptLines}
          <div class="footer">${new Date().toLocaleString()}<br>Thank you!</div>
        </body></html>`

      const w = window.open('', '_blank', 'width=340,height=520')
      if (w) { w.document.write(receipt); w.document.close(); setTimeout(() => { w.print(); w.close() }, 400) }

      onComplete()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      setBusy(false)
    }
  }

  const orderSummaryRows = [
    ...services.map(s => ({ l: s.name, v: fmtJ(s.price) })),
    ...addons.map(a => ({ l: `+ ${a.name}`, v: fmtJ(a.price) })),
    ...(taxAmount > 0 ? [{ l: 'GCT (15%)', v: fmtJ(taxAmount) }] : []),
  ]

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Left — order summary */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--bdr)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--bdr)' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 10 }}>
            ← Back
          </button>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--txt)' }}>Order Summary</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {orderSummaryRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14, color: 'var(--txt)' }}>
              <span style={{ color: row.l.startsWith('+') ? 'var(--txt3)' : 'var(--txt)' }}>{row.l}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{row.v}</span>
            </div>
          ))}
          <div style={{ borderTop: '2px solid var(--bdr)', paddingTop: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, color: 'var(--txt)' }}>
            <span>Total</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{fmtJ(total)}</span>
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bdr)' }}>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name (optional)"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r2)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }}
          />
          <input
            value={plateNumber}
            onChange={e => setPlateNumber(e.target.value.toUpperCase())}
            placeholder="Plate number (optional)"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r2)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}
          />
        </div>
      </div>

      {/* Right — payment */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--bdr)' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--txt)' }}>Payment</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Method buttons */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Payment Method
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            {METHODS.map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                style={{
                  flex: 1, padding: '14px 0',
                  border: method === m ? '2.5px solid var(--blue)' : '2px solid var(--bdr)',
                  background: method === m ? 'rgba(59,130,246,.08)' : 'var(--surf)',
                  borderRadius: 'var(--r3)', cursor: 'pointer',
                  fontSize: 14, fontWeight: 800, color: method === m ? 'var(--blue)' : 'var(--txt)',
                  transition: 'all .1s',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {method === 'Cash' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Cash Given
              </div>
              <input
                type="number"
                value={cashGiven}
                onChange={e => setCashGiven(e.target.value)}
                placeholder={fmtJ(total)}
                min={0}
                style={{ width: '100%', padding: '14px 16px', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r3)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 900, boxSizing: 'border-box' }}
              />
              {cashGivenNum > 0 && (
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: change < 0 ? 'var(--red)' : 'var(--grn)' }}>
                  <span>Change</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{fmtJ(Math.max(change, 0))}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,.1)', border: '1.5px solid var(--red)', borderRadius: 'var(--r2)', color: 'var(--red)', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              {error}
            </div>
          )}
        </div>

        {/* Pay button */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--bdr)', background: 'var(--surf)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: 'var(--txt3)' }}>Total due</span>
            <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{fmtJ(total)}</span>
          </div>
          <button
            onClick={handlePay}
            disabled={busy || (method === 'Cash' && cashGivenNum < total)}
            style={{
              width: '100%', padding: '16px 0',
              background: busy || (method === 'Cash' && cashGivenNum < total) ? 'var(--bdr)' : 'var(--grn)',
              color: busy || (method === 'Cash' && cashGivenNum < total) ? 'var(--txt3)' : '#fff',
              border: 'none', borderRadius: 'var(--r3)',
              fontSize: 17, fontWeight: 900,
              cursor: busy || (method === 'Cash' && cashGivenNum < total) ? 'not-allowed' : 'pointer',
              transition: 'background .15s',
            }}
          >
            {busy ? 'Processing...' : `Collect ${fmtJ(total)} & Print Receipt`}
          </button>
        </div>
      </div>
    </div>
  )
}
