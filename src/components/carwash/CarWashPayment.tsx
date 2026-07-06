'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { Transaction } from '@/types'
import type { CwService, CwAddon, HeldCarWash, PayMethod } from './CarWashFlow'

const fmtJ = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const VEHICLE_TYPES = ['Car', 'SUV', 'Pickup', 'Van', 'Truck'] as const

interface Props {
  services: CwService[]
  addons: CwAddon[]
  initial?: HeldCarWash
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

  const [payMethod,    setPayMethod]    = useState<PayMethod>(initial?.payMethod ?? 'cash')
  const [cashTendered, setCashTendered] = useState('')
  const [plate,        setPlate]        = useState(initial?.plate ?? '')
  const [vehicleType,  setVehicleType]  = useState(initial?.vehicleType ?? 'Car')
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '')
  const [phone,        setPhone]        = useState(initial?.phone ?? '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [ticket,       setTicket]       = useState<string | null>(null)

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

  // ── Complete payment ──────────────────────────────────────
  const complete = async () => {
    setSaving(true); setError('')
    try {
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
      }
      dispatch({ type: 'ADD_TRANSACTION', tx: cwTx })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Print receipt via Blob URL (avoids about:blank / CSP issues) ──
  const printReceipt = () => {
    const bizName = biz?.name ?? 'Car Wash'
    const printChange = payMethod === 'cash' && cashTendered && tendered >= total ? change : null

    const infoRows = [
      plate        ? `<div class="row"><span>Plate</span><span>${plate}</span></div>` : '',
      vehicleType  ? `<div class="row"><span>Vehicle</span><span>${vehicleType}</span></div>` : '',
      customerName ? `<div class="row"><span>Customer</span><span>${customerName}</span></div>` : '',
      phone        ? `<div class="row"><span>Phone</span><span>${phone}</span></div>` : '',
    ].filter(Boolean).join('')

    const serviceRows = services
      .map(s => {
        const qty = s.qty ?? 1
        const label = qty > 1 ? `${s.name} ×${qty}` : s.name
        return `<div class="row"><span>${label}</span><span>${fmtJ(s.price * qty)}</span></div>`
      })
      .join('')

    const addonRows = addons
      .map(a => `<div class="row"><span>+ ${a.name}</span><span>${fmtJ(a.price)}</span></div>`)
      .join('')

    const changeRow = printChange !== null
      ? `<div class="row"><span>Cash Tendered</span><span>${fmtJ(tendered)}</span></div>` +
        `<div class="row total"><span>Change</span><span>${fmtJ(printChange)}</span></div>`
      : ''

    const html = [
      '<!DOCTYPE html><html><head>',
      `<title>${ticket ?? ''}</title>`,
      '<style>',
      '*{margin:0;padding:0;box-sizing:border-box}',
      'body{font-family:"Courier New",monospace;font-size:12px;padding:16px;max-width:300px}',
      '.c{text-align:center}.biz{font-size:15px;font-weight:700;margin-bottom:2px}',
      '.d{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between;margin:3px 0}',
      '.ticket{font-size:20px;font-weight:700;letter-spacing:2px;margin:8px 0}',
      '.total{font-size:15px;font-weight:700}.cap{text-transform:capitalize}',
      '</style></head><body>',
      `<div class="c"><div class="biz">${bizName}</div>`,
      `<div>${new Date().toLocaleString()}</div>`,
      `<div class="ticket">${ticket}</div></div>`,
      '<div class="d"></div>',
      infoRows,
      infoRows ? '<div class="d"></div>' : '',
      serviceRows,
      addonRows,
      '<div class="d"></div>',
      `<div class="row"><span>Subtotal</span><span>${fmtJ(subtotal)}</span></div>`,
      taxAmount > 0 ? `<div class="row"><span>GCT (15%)</span><span>${fmtJ(taxAmount)}</span></div>` : '',
      `<div class="row total"><span>TOTAL</span><span>${fmtJ(total)}</span></div>`,
      `<div class="row"><span>Payment</span><span class="cap">${payMethod}</span></div>`,
      changeRow,
      currentUser?.name ? `<div class="row"><span>Staff</span><span>${currentUser.name}</span></div>` : '',
      '<div class="d"></div>',
      '<div class="c" style="margin-top:8px">Thank you!</div>',
      '</body></html>',
    ].join('')

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:340px;height:600px;visibility:hidden'
    iframe.src = url
    document.body.appendChild(iframe)
    iframe.onload = () => {
      iframe.contentWindow?.print()
      setTimeout(() => {
        try { document.body.removeChild(iframe) } catch { /* already removed */ }
        URL.revokeObjectURL(url)
      }, 1000)
    }
  }

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
            { l: 'Payment', v: payMethod[0].toUpperCase() + payMethod.slice(1) },
            ...(change >= 0 && cashTendered && payMethod === 'cash' ? [{ l: 'Change', v: fmtJ(change), bold: true }] : []),
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
            Print Receipt
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ padding: '8px 14px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer' }}>
          Back
        </button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)' }}>Payment</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>
            {serviceNames}{addons.length > 0 ? ` + ${addons.length} add-on${addons.length !== 1 ? 's' : ''}` : ''}
          </div>
        </div>
        {heldBadge}
        <div style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 900, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtJ(total)}</div>
      </div>

      {/* Main — two columns */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Left: Order summary */}
        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>
            Order Summary
          </div>
          {services.map(s => (
            <div key={s.id} style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bdr)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>
                  {(s.qty ?? 1) > 1 ? `${s.name} ×${s.qty}` : s.name}
                </div>
                {s.vehicle_type && s.vehicle_type !== 'All' && (
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{s.vehicle_type}</div>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>
                {fmtJ(s.price * (s.qty ?? 1))}
              </div>
            </div>
          ))}
          {addons.map(a => (
            <div key={a.id} style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bdr)' }}>
              <div style={{ fontSize: 13, color: 'var(--txt2)' }}>+ {a.name}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>{fmtJ(a.price)}</div>
            </div>
          ))}
          <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--blue-bg)', borderTop: '1px solid var(--bdr)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>TOTAL</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtJ(total)}</div>
          </div>
        </div>

        {/* Right: Customer + Payment method */}
        <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Customer details */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>
              Customer Details — Optional
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                value={plate}
                onChange={e => setPlate(e.target.value.toUpperCase())}
                placeholder="License Plate (e.g. ABC-1234)"
                style={{ ...inp, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '2px', fontSize: 15 }}
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {VEHICLE_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setVehicleType(t)}
                    style={{ padding: '6px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: vehicleType === t ? 'var(--blue)' : 'var(--bdr)', background: vehicleType === t ? 'var(--blue-bg)' : 'var(--surf2)', color: vehicleType === t ? 'var(--blue)' : 'var(--txt2)', transition: 'all .12s' }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer Name" style={inp} />
              <input type="tel"  value={phone}        onChange={e => setPhone(e.target.value)}        placeholder="Phone Number"   style={inp} />
            </div>
          </div>

          {/* Payment method */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>
              Payment Method
            </div>
            {(['cash', 'card', 'mixed'] as PayMethod[]).map(m => (
              <div
                key={m}
                onClick={() => setPayMethod(m)}
                style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: '1px solid var(--bdr)', background: payMethod === m ? 'var(--blue-bg)' : 'transparent', transition: 'background .1s' }}
              >
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2.5px solid ${payMethod === m ? 'var(--blue)' : 'var(--bdr2)'}`, background: payMethod === m ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {payMethod === m && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: payMethod === m ? 'var(--blue)' : 'var(--txt)', textTransform: 'capitalize' }}>
                  {m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : 'Mixed'}
                </span>
              </div>
            ))}
          </div>

          {/* Cash tendered + change */}
          {(payMethod === 'cash' || payMethod === 'mixed') && (
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>
                Cash Tendered
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>Change</span>
                    <span style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{fmtJ(change)}</span>
                  </div>
                )}
                {cashTendered && tendered < total && (
                  <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.08)', borderRadius: 'var(--r2)', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                    Short by {fmtJ(total - tendered)}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', padding: '10px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, border: '1px solid rgba(239,68,68,.2)' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', gap: 10 }}>
        <button
          onClick={() => onHold({ plate, vehicleType, customerName, phone, payMethod })}
          disabled={saving}
          style={{ flex: '0 0 auto', padding: '16px 22px', borderRadius: 'var(--r2)', fontSize: 15, fontWeight: 700, background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          Hold
        </button>
        <button
          onClick={complete}
          disabled={saving}
          style={{ flex: 1, padding: '16px', borderRadius: 'var(--r2)', fontSize: 17, fontWeight: 800, background: saving ? 'var(--surf2)' : '#16a34a', color: saving ? 'var(--txt3)' : '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', transition: 'background .15s' }}
        >
          {saving ? 'Processing…' : `✓  Complete Payment  ·  ${fmtJ(total)}`}
        </button>
      </div>
    </div>
  )
}
