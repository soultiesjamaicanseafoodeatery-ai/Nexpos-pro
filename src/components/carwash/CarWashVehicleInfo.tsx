'use client'

import { useState } from 'react'
import type { CwService, CwAddon, CwVehicle } from './CarWashFlow'

interface Props {
  service: CwService
  addons: CwAddon[]
  onBack: () => void
  onContinue: (v: CwVehicle) => void
}

const VEHICLE_TYPES = ['Car', 'SUV', 'Pickup', 'Van', 'Truck']
const NOTE_PRESETS = ['Heavy Dirt', 'Pet Hair']

const fmtJMD = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CarWashVehicleInfo({ service, addons, onBack, onContinue }: Props) {
  const [plate, setPlate] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleType, setVehicleType] = useState('Car')
  const [notePresets, setNotePresets] = useState<string[]>([])
  const [freeNote, setFreeNote] = useState('')

  const addonTotal = addons.reduce((s, a) => s + a.price, 0)
  const canContinue = plate.trim().length >= 2

  const togglePreset = (n: string) =>
    setNotePresets(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])

  const buildNotes = () =>
    [...notePresets, ...(freeNote.trim() ? [freeNote.trim()] : [])].join('; ')

  const inp: React.CSSProperties = {
    width: '100%',
    background: 'var(--surf2)',
    border: '1.5px solid var(--bdr2)',
    borderRadius: 'var(--r2)',
    padding: '12px 14px',
    fontSize: 15,
    color: 'var(--txt)',
    boxSizing: 'border-box',
    outline: 'none',
  }

  const lbl: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--txt3)',
    textTransform: 'uppercase',
    letterSpacing: '.5px',
    marginBottom: 6,
    display: 'block',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ padding: '8px 14px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer' }}>
          ← Back
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Vehicle Information</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>
            {service.name} · {fmtJMD(service.price + addonTotal)}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>

        {/* License plate — large and prominent */}
        <div>
          <label style={lbl}>License Plate <span style={{ color: '#ef4444' }}>*</span></label>
          <input
            type="text"
            value={plate}
            onChange={e => setPlate(e.target.value.toUpperCase())}
            placeholder="e.g. ABC-1234"
            autoFocus
            style={{ ...inp, fontSize: 28, fontWeight: 900, letterSpacing: '4px', textAlign: 'center', fontFamily: 'monospace', height: 72 }}
          />
        </div>

        {/* Vehicle type */}
        <div>
          <label style={lbl}>Vehicle Type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {VEHICLE_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setVehicleType(t)}
                style={{ padding: '10px 20px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: vehicleType === t ? 'var(--blue)' : 'var(--bdr)', background: vehicleType === t ? 'var(--blue-bg)' : 'var(--surf)', color: vehicleType === t ? 'var(--blue)' : 'var(--txt2)', transition: 'all .12s' }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Customer name */}
        <div>
          <label style={lbl}>Customer Name <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--txt3)' }}>(optional)</span></label>
          <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. John Smith" style={inp} />
        </div>

        {/* Phone */}
        <div>
          <label style={lbl}>Phone Number <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--txt3)' }}>(optional)</span></label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 876-555-0000" style={inp} />
        </div>

        {/* Notes */}
        <div>
          <label style={lbl}>Notes</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {NOTE_PRESETS.map(n => {
              const on = notePresets.includes(n)
              return (
                <button
                  key={n}
                  onClick={() => togglePreset(n)}
                  style={{ padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: on ? '#f97316' : 'var(--bdr)', background: on ? 'rgba(249,115,22,.1)' : 'var(--surf)', color: on ? '#f97316' : 'var(--txt2)', transition: 'all .12s' }}
                >
                  {on ? '✓ ' : ''}{n}
                </button>
              )
            })}
          </div>
          <input type="text" value={freeNote} onChange={e => setFreeNote(e.target.value)} placeholder="Special instructions..." style={inp} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button
          onClick={() => canContinue && onContinue({ plate: plate.trim(), customerName: customerName.trim(), phone: phone.trim(), vehicleType, notes: buildNotes() })}
          disabled={!canContinue}
          style={{ width: '100%', padding: '14px', borderRadius: 'var(--r2)', fontSize: 16, fontWeight: 800, background: canContinue ? 'var(--blue)' : 'var(--surf2)', color: canContinue ? '#fff' : 'var(--txt3)', border: 'none', cursor: canContinue ? 'pointer' : 'not-allowed', opacity: canContinue ? 1 : .6 }}
        >
          Continue to Payment →
        </button>
        {!canContinue && (
          <div style={{ fontSize: 11, color: 'var(--txt3)', textAlign: 'center', marginTop: 6 }}>License plate is required to continue</div>
        )}
      </div>
    </div>
  )
}
