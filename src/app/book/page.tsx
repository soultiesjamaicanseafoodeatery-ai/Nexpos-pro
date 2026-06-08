'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MODULE_DATA } from '@/lib/data/seed'

const packages = MODULE_DATA.carwash.items.filter(i => i.active)
const addons   = MODULE_DATA.carwash.addons.filter(a => a.active)

const jmd = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Form {
  name: string; phone: string; plate: string
  make: string; model: string; color: string; notes: string
}

export default function BookPage() {
  const [selSvc,     setSelSvc]     = useState<string | null>(null)
  const [selAddons,  setSelAddons]  = useState<string[]>([])
  const [form,       setForm]       = useState<Form>({ name:'', phone:'', plate:'', make:'', model:'', color:'', notes:'' })
  const [loading,    setLoading]    = useState(false)
  const [bookingRef, setBookingRef] = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  const service      = packages.find(p => p.id === selSvc)
  const addonObjs    = addons.filter(a => selAddons.includes(a.id))
  const addonsTotal  = addonObjs.reduce((s, a) => s + a.price, 0)
  const total        = (service?.price ?? 0) + addonsTotal

  const toggleAddon = (id: string) =>
    setSelAddons(p => p.includes(id) ? p.filter(a => a !== id) : [...p, id])

  const setField = (k: keyof Form, v: string) =>
    setForm(p => ({ ...p, [k]: k === 'plate' ? v.toUpperCase() : v }))

  const submit = async () => {
    if (!service)          { setError('Please select a wash package'); return }
    if (!form.name.trim()) { setError('Please enter your name'); return }
    if (!form.phone.trim()){ setError('Please enter your phone number'); return }
    if (!form.plate.trim()){ setError('Please enter your license plate'); return }

    setLoading(true); setError(null)

    try {
      if (supabase) {
        const { data, error: err } = await supabase.from('outside_orders').insert({
          customer_name:  form.name.trim(),
          customer_phone: form.phone.trim(),
          vehicle_plate:  form.plate.trim(),
          vehicle_make:   form.make.trim(),
          vehicle_model:  form.model.trim(),
          vehicle_color:  form.color.trim(),
          service_name:   service.name,
          service_price:  service.price,
          addons:         addonObjs.map(a => ({ name: a.name, price: a.price, icon: a.icon })),
          addons_total:   addonsTotal,
          total,
          notes:          form.notes.trim(),
          status:         'pending',
        }).select('id').single()
        if (err) throw err
        setBookingRef((data?.id as string | undefined)?.slice(0, 8).toUpperCase() ?? 'CONFIRMED')
      } else {
        setBookingRef('SW' + Math.random().toString(36).slice(2, 6).toUpperCase())
      }
    } catch {
      setError('Something went wrong. Please call us at 876-389-5343.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Confirmation screen ── */
  if (bookingRef) return (
    <div style={{ minHeight: '100vh', background: '#f0faf8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0a6558', margin: '0 0 8px' }}>Booking Received!</h2>
        <p style={{ color: '#64748b', margin: '0 0 24px' }}>Your booking is confirmed. Our team will be ready for you.</p>

        <div style={{ background: '#fff', border: '2px solid #0f9d82', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Booking Reference</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: '#0a6558', fontFamily: 'monospace' }}>{bookingRef}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'left' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: '#334155' }}>{service?.name}</div>
          {addonObjs.map(a => <div key={a.id} style={{ fontSize: 13, color: '#64748b', marginBottom: 3 }}>+ {a.name}</div>)}
          <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#0a6558' }}>
            <span>Total</span><span style={{ fontFamily: 'monospace' }}>{jmd(total)}</span>
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#64748b' }}>📍 15 Milford Road, Ocho Rios, Jamaica</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>📞 876-389-5343</div>
      </div>
    </div>
  )

  /* ── Booking form ── */
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0a6558 0%, #0f9d82 100%)', padding: '20px 20px 28px', color: '#fff' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>🚗</span>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.3px' }}>Soulties Car Wash</div>
              <div style={{ fontSize: 12, opacity: .85 }}>Ocho Rios, Jamaica · 876-389-5343</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '22px 16px 48px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Book a Car Wash</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>Select a package, pick your add-ons, and we&apos;ll have your car looking its best.</p>

        {/* Packages */}
        <SectionLabel>Choose Package</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {packages.map(pkg => {
            const sel = selSvc === pkg.id
            return (
              <div key={pkg.id} onClick={() => setSelSvc(pkg.id)} style={{
                background: sel ? '#ecfdf5' : '#fff',
                border: `2px solid ${sel ? '#0f9d82' : '#e2e8f0'}`,
                borderRadius: 12, padding: '13px 12px', cursor: 'pointer', position: 'relative', transition: 'all .15s',
              }}>
                {sel && <CheckMark />}
                <div style={{ fontSize: 26, marginBottom: 5 }}>{pkg.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>{pkg.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{pkg.duration}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0a6558', marginTop: 6, fontFamily: 'monospace' }}>{jmd(pkg.price)}</div>
              </div>
            )
          })}
        </div>

        {/* Add-ons */}
        <SectionLabel>Add-Ons (Optional)</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {addons.map(addon => {
            const sel = selAddons.includes(addon.id)
            return (
              <div key={addon.id} onClick={() => toggleAddon(addon.id)} style={{
                background: sel ? '#ecfdf5' : '#fff',
                border: `1.5px solid ${sel ? '#0f9d82' : '#e2e8f0'}`,
                borderRadius: 10, padding: '11px 14px', cursor: 'pointer', transition: 'all .14s',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: sel ? '#d1fae5' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{addon.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{addon.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{addon.desc}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0a6558', fontFamily: 'monospace', flexShrink: 0 }}>+{jmd(addon.price)}</div>
                <Radio checked={sel} />
              </div>
            )
          })}
        </div>

        {/* Details form */}
        <SectionLabel>Your Details</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {([
            { k: 'name',  label: 'Full Name *',        ph: 'John Smith',   type: 'text' },
            { k: 'phone', label: 'Phone Number *',      ph: '876-555-0100', type: 'tel'  },
            { k: 'plate', label: 'License Plate *',     ph: 'ABC-1234',     type: 'text' },
          ] as { k: keyof Form; label: string; ph: string; type: string }[]).map(f => (
            <Field key={f.k} label={f.label}>
              <input type={f.type} value={form[f.k]} onChange={e => setField(f.k, e.target.value)}
                placeholder={f.ph} style={inputStyle} />
            </Field>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([
              { k: 'make',  label: 'Make',  ph: 'Toyota' },
              { k: 'model', label: 'Model', ph: 'Camry'  },
            ] as { k: keyof Form; label: string; ph: string }[]).map(f => (
              <Field key={f.k} label={f.label}>
                <input value={form[f.k]} onChange={e => setField(f.k, e.target.value)} placeholder={f.ph} style={inputStyle} />
              </Field>
            ))}
          </div>
          <Field label="Vehicle Color">
            <input value={form.color} onChange={e => setField('color', e.target.value)} placeholder="Silver" style={inputStyle} />
          </Field>
          <Field label="Special Instructions">
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
              placeholder="Anything we should know about your vehicle?" rows={3}
              style={{ ...inputStyle, resize: 'none' } as React.CSSProperties} />
          </Field>
        </div>

        {/* Order summary */}
        {service && (
          <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 10, fontSize: 14 }}>Order Summary</div>
            <Row label={service.name} value={jmd(service.price)} />
            {addonObjs.map(a => <Row key={a.id} label={`+ ${a.name}`} value={jmd(a.price)} />)}
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
              <span style={{ color: '#1e293b' }}>Total</span>
              <span style={{ color: '#0a6558', fontFamily: 'monospace', fontSize: 16 }}>{jmd(total)}</span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        <button onClick={submit} disabled={loading} style={{
          width: '100%', padding: 16,
          background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0a6558, #0f9d82)',
          color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box',
        }}>
          {loading ? '⏳ Submitting…' : '🚗 Book Now →'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
          Questions? Call us at 876-389-5343
        </div>
      </div>
    </div>
  )
}

/* ── Small helpers ─────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#1e293b',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
      <span style={{ color: '#475569' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', color: '#1e293b' }}>{value}</span>
    </div>
  )
}

function CheckMark() {
  return (
    <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: '#0f9d82', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 800 }}>✓</div>
  )
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${checked ? '#0f9d82' : '#cbd5e1'}`, background: checked ? '#0f9d82' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 800 }}>
      {checked ? '✓' : ''}
    </div>
  )
}
