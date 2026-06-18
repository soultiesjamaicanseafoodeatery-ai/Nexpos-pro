'use client'

import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { CwService, CwAddon, CwVehicle } from './CarWashFlow'

interface Props {
  service: CwService
  addons: CwAddon[]
  vehicle: CwVehicle
  onBack: () => void
  onComplete: () => void
}

const fmtJMD = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type PayMethod = 'cash' | 'card' | 'mixed'

const PAY_OPTIONS: { id: PayMethod; label: string; icon: string }[] = [
  { id: 'cash',  label: 'Cash',  icon: '💵' },
  { id: 'card',  label: 'Card',  icon: '💳' },
  { id: 'mixed', label: 'Mixed', icon: '🔄' },
]

export default function CarWashPayment({ service, addons, vehicle, onBack, onComplete }: Props) {
  const { state } = useApp()
  const { currentUser } = state
  const [payMethod, setPayMethod] = useState<PayMethod>('cash')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ ticketNo: string; total: number } | null>(null)
  const [error, setError] = useState('')

  const addonTotal = addons.reduce((s, a) => s + a.price, 0)
  const total = service.price + addonTotal

  const complete = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/carwash-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: vehicle.customerName,
          phone: vehicle.phone,
          vehicleType: vehicle.vehicleType,
          plate: vehicle.plate,
          serviceId: service.id,
          serviceName: service.name,
          servicePrice: service.price,
          addons: addons.map(a => ({ id: a.id, name: a.name, price: a.price })),
          addonsTotal: addonTotal,
          notes: vehicle.notes,
          paymentMethod: payMethod,
          total,
          employeeName: currentUser?.name ?? '',
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error?.message ?? JSON.stringify(e.error) ?? 'Failed to save order')
      }
      const order = await res.json()
      setDone({ ticketNo: order.ticket_no, total: order.total })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 18, padding: 48, background: 'var(--bg)', textAlign: 'center' }}>
        <div style={{ fontSize: 72 }}>✅</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--txt)' }}>Payment Complete!</div>
        <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: 'var(--blue)', background: 'var(--blue-bg)', padding: '12px 32px', borderRadius: 'var(--r2)', border: '2px solid rgba(79,142,247,.3)', letterSpacing: '1px' }}>
          {done.ticketNo}
        </div>
        <div style={{ fontSize: 15, color: 'var(--txt2)', lineHeight: 1.7 }}>
          <strong>{vehicle.plate}</strong> · {vehicle.vehicleType}<br />
          {service.name}{addons.length > 0 ? ` + ${addons.length} add-on${addons.length !== 1 ? 's' : ''}` : ''}<br />
          <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--txt)', fontFamily: 'monospace' }}>{fmtJMD(done.total)}</span>
          {' · '}
          <span style={{ textTransform: 'capitalize' }}>{payMethod}</span>
        </div>
        {vehicle.notes && <div style={{ fontSize: 13, color: '#f97316', background: 'rgba(249,115,22,.08)', padding: '6px 16px', borderRadius: 'var(--r)' }}>{vehicle.notes}</div>}
        <div style={{ fontSize: 13, color: 'var(--txt3)', marginTop: 4 }}>Vehicle added to wash queue.</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button onClick={onComplete} style={{ padding: '14px 36px', borderRadius: 'var(--r2)', fontSize: 15, fontWeight: 800, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + New Wash
          </button>
          <button onClick={onComplete} style={{ padding: '14px 36px', borderRadius: 'var(--r2)', fontSize: 15, fontWeight: 800, background: 'var(--surf2)', color: 'var(--txt)', border: '1px solid var(--bdr)', cursor: 'pointer' }}>
            Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Payment screen ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ padding: '8px 14px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer' }}>
          ← Back
        </button>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Payment</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 860, margin: '0 auto', width: '100%' }}>

        {/* Left: Order summary */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Vehicle card */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Vehicle</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--txt)', fontFamily: 'monospace', letterSpacing: '3px' }}>{vehicle.plate}</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginTop: 4 }}>
              {vehicle.vehicleType}
              {vehicle.customerName && ` · ${vehicle.customerName}`}
              {vehicle.phone && ` · ${vehicle.phone}`}
            </div>
            {vehicle.notes && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#f97316', fontWeight: 600 }}>{vehicle.notes}</div>
            )}
          </div>

          {/* Order lines */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 18px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>Order Summary</div>

            {/* Package */}
            <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: addons.length > 0 ? '1px solid var(--bdr)' : undefined }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>{service.name}</div>
                {service.vehicle_type && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{service.vehicle_type}</div>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: 'var(--txt)' }}>{fmtJMD(service.price)}</div>
            </div>

            {/* Add-ons */}
            {addons.map((a, i) => (
              <div key={a.id} style={{ padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < addons.length - 1 ? '1px solid var(--bdr)' : '1px solid var(--bdr)' }}>
                <div style={{ fontSize: 13, color: 'var(--txt2)' }}>+ {a.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--txt2)' }}>{fmtJMD(a.price)}</div>
              </div>
            ))}

            {/* Total */}
            <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--blue-bg)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>TOTAL</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--blue)', fontFamily: 'monospace' }}>{fmtJMD(total)}</div>
            </div>
          </div>
        </div>

        {/* Right: Payment method */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 18px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--bdr)' }}>Payment Method</div>
            {PAY_OPTIONS.map(({ id, label, icon }) => (
              <div
                key={id}
                onClick={() => setPayMethod(id)}
                style={{ padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: '1px solid var(--bdr)', background: payMethod === id ? 'var(--blue-bg)' : 'transparent', transition: 'background .1s' }}
              >
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2.5px solid ${payMethod === id ? 'var(--blue)' : 'var(--bdr2)'}`, background: payMethod === id ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {payMethod === id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: payMethod === id ? 'var(--blue)' : 'var(--txt)' }}>{icon} {label}</span>
              </div>
            ))}
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444', padding: '10px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, border: '1px solid rgba(239,68,68,.2)' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button
          onClick={complete}
          disabled={saving}
          style={{ width: '100%', padding: '16px', borderRadius: 'var(--r2)', fontSize: 17, fontWeight: 800, background: saving ? 'var(--surf2)' : '#16a34a', color: saving ? 'var(--txt3)' : '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Processing...' : `✓ Complete Payment · ${fmtJMD(total)}`}
        </button>
      </div>
    </div>
  )
}
