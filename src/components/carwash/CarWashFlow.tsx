'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import CarWashPackageSelect from './CarWashPackageSelect'
import CarWashPayment from './CarWashPayment'

export interface CwService {
  id: string; name: string; description: string; price: number; vehicle_type: string; is_available: boolean;
  qty?: number
}
export interface CwAddon {
  id: string; name: string; description: string; price: number; is_available: boolean
}
export type PayMethod = 'cash' | 'card' | 'mixed'
export const VEHICLE_TYPES = ['Car', 'SUV', 'Pickup', 'Van', 'Truck'] as const

export interface PaymentPrefill {
  plate?: string
  vehicleType?: string
  customerName?: string
  phone?: string
  payMethod?: PayMethod
}

export interface HeldCarWash {
  id: string
  services: CwService[]
  addons: CwAddon[]
  plate: string
  vehicleType: string
  customerName: string
  phone: string
  payMethod: PayMethod
  savedAt: string
  savedBy: string
}

function rowToHeld(r: Record<string, unknown>): HeldCarWash {
  return {
    id:           String(r.id),
    services:     Array.isArray(r.services) ? (r.services as CwService[]) : [],
    addons:       Array.isArray(r.addons) ? (r.addons as CwAddon[]) : [],
    plate:        (r.plate as string) ?? '',
    vehicleType:  (r.vehicle_type as string) ?? 'Car',
    customerName: (r.customer_name as string) ?? '',
    phone:        (r.phone as string) ?? '',
    payMethod:    (r.payment_method as PayMethod) ?? 'cash',
    savedAt:      (r.created_at as string) ?? new Date().toISOString(),
    savedBy:      (r.saved_by as string) ?? '',
  }
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

export default function CarWashFlow() {
  const { state } = useApp()
  const currentUser = state.currentUser

  const [step, setStep] = useState<'services' | 'payment'>('services')
  const [services, setServices] = useState<CwService[]>([])
  const [addons, setAddons] = useState<CwAddon[]>([])
  const [prefill, setPrefill] = useState<PaymentPrefill | null>(null)
  const [held, setHeld] = useState<HeldCarWash[]>([])
  const [showHeld, setShowHeld] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const loadHeld = useCallback(async () => {
    try {
      const r = await fetch('/api/carwash-held')
      if (r.ok) {
        const rows = await r.json()
        setHeld(Array.isArray(rows) ? rows.map(rowToHeld) : [])
      }
    } catch {
      // keep showing the last known list if a poll fails
    }
  }, [])

  useEffect(() => {
    loadHeld()
    const id = setInterval(loadHeld, 15000)
    return () => clearInterval(id)
  }, [loadHeld])

  const reset = () => { setServices([]); setAddons([]); setPrefill(null); setStep('services') }

  const holdDraft = async (draft: {
    services: CwService[]; addons: CwAddon[]
    plate?: string; vehicleType?: string; customerName?: string; phone?: string; payMethod?: PayMethod
  }) => {
    try {
      const res = await fetch('/api/carwash-held', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services:      draft.services,
          addons:        draft.addons,
          plate:         draft.plate ?? '',
          vehicleType:   draft.vehicleType ?? 'Car',
          customerName:  draft.customerName ?? '',
          phone:         draft.phone ?? '',
          paymentMethod: draft.payMethod ?? 'cash',
          savedBy:       currentUser?.name ?? '',
        }),
      })
      if (!res.ok) { console.error('[CarWash] Hold failed:', await res.text()); return }
      reset()
      loadHeld()
    } catch (e) {
      console.error('[CarWash] Hold failed:', e)
    }
  }

  const removeHeld = (id: string) => {
    setConfirmDelete(null)
    setHeld(list => list.filter(h => h.id !== id))
    fetch(`/api/carwash-held?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  }

  const resumeHeld = (h: HeldCarWash) => {
    setServices(h.services)
    setAddons(h.addons)
    setPrefill(h)
    setStep('payment')
    setShowHeld(false)
    setHeld(list => list.filter(x => x.id !== h.id))
    fetch(`/api/carwash-held?id=${encodeURIComponent(h.id)}`, { method: 'DELETE' }).catch(() => {})
  }

  const heldBadge = (
    <button onClick={() => setShowHeld(true)} style={{
      padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      border: `1.5px solid ${held.length > 0 ? 'var(--ora)' : 'var(--bdr)'}`,
      background: held.length > 0 ? '#78350f22' : 'transparent',
      color: held.length > 0 ? 'var(--ora)' : 'var(--txt3)',
      display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
    }}>
      Held{held.length > 0 && <span style={{ background: 'var(--ora)', color: '#fff', borderRadius: 6, fontSize: 9, padding: '0 4px', fontWeight: 800 }}>{held.length}</span>}
    </button>
  )

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {step === 'payment' && services.length > 0 ? (
        <CarWashPayment
          services={services}
          addons={addons}
          initial={prefill ?? undefined}
          onBack={() => setStep('services')}
          onComplete={reset}
          onHold={draft => holdDraft({ services, addons, ...draft })}
          heldBadge={heldBadge}
        />
      ) : (
        <CarWashPackageSelect
          onSelect={(svcs, adds, plate, vehicleType) => { setServices(svcs); setAddons(adds); setPrefill({ plate, vehicleType }); setStep('payment') }}
          onHold={(svcs, adds, plate, vehicleType) => holdDraft({ services: svcs, addons: adds, plate, vehicleType })}
          heldBadge={heldBadge}
        />
      )}

      {/* ── Held Car Washes Panel ── */}
      {showHeld && (
        <div onClick={() => setShowHeld(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Held Car Washes</span>
              <button onClick={() => setShowHeld(false)} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {held.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--txt3)', fontSize: 13 }}>No held car washes.</div>
              ) : held.map(h => {
                const label = h.services.map(s => (s.qty ?? 1) > 1 ? `${s.name} ×${s.qty}` : s.name).join(', ')
                const who = [h.plate, h.customerName].filter(Boolean).join(' · ')
                return (
                  <div key={h.id} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>{who || label}</div>
                      {who && <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>{label}</div>}
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                        Saved {timeAgo(h.savedAt)} by {h.savedBy}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => resumeHeld(h)} style={{ flex: 2, padding: '9px 0', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        Resume
                      </button>
                      <button onClick={() => {
                          if (confirmDelete !== h.id) { setConfirmDelete(h.id); return }
                          removeHeld(h.id)
                        }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 'var(--r)', background: 'transparent', color: confirmDelete === h.id ? '#fbbf24' : '#ef4444', border: `1px solid ${confirmDelete === h.id ? '#fbbf24' : '#ef444444'}`, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        {confirmDelete === h.id ? 'Sure?' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}