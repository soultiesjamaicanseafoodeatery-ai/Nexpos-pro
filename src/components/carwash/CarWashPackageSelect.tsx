'use client'

import { useState, useEffect } from 'react'
import type { CwService, CwAddon } from './CarWashFlow'

interface Props {
  onBack: () => void
  onSelect: (service: CwService, addons: CwAddon[]) => void
}

const fmtJMD = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CarWashPackageSelect({ onBack, onSelect }: Props) {
  const [services, setServices] = useState<CwService[]>([])
  const [addons, setAddons] = useState<CwAddon[]>([])
  const [selected, setSelected] = useState<CwService | null>(null)
  const [selAddons, setSelAddons] = useState<CwAddon[]>([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('All')

  useEffect(() => {
    Promise.all([
      fetch('/api/carwash-services').then(r => r.json()),
      fetch('/api/carwash-addons').then(r => r.json()),
    ]).then(([svcs, adds]) => {
      setServices(Array.isArray(svcs) ? svcs.filter((s: CwService) => s.is_available) : [])
      setAddons(Array.isArray(adds) ? adds.filter((a: CwAddon) => a.is_available) : [])
    }).finally(() => setLoading(false))
  }, [])

  const cats = ['All', ...Array.from(new Set(services.map(s => s.vehicle_type).filter(Boolean)))]
  const filtered = catFilter === 'All' ? services : services.filter(s => s.vehicle_type === catFilter)

  const toggleAddon = (a: CwAddon) =>
    setSelAddons(prev => prev.find(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a])

  const addonTotal = selAddons.reduce((s, a) => s + a.price, 0)
  const grandTotal = (selected?.price ?? 0) + addonTotal

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ padding: '8px 14px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer' }}>
          ← Back
        </button>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Select Wash Package</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Category filter */}
        {cats.length > 2 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cats.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                style={{ padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: catFilter === c ? 'var(--blue)' : 'var(--surf2)', color: catFilter === c ? '#fff' : 'var(--txt2)' }}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Packages grid */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 48 }}>Loading services...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 48 }}>No services available</div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Wash Packages
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {filtered.map(s => {
                const on = selected?.id === s.id
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelected(on ? null : s)}
                    style={{ background: on ? 'var(--blue-bg)' : 'var(--surf)', border: `2.5px solid ${on ? 'var(--blue)' : 'var(--bdr)'}`, borderRadius: 'var(--r3)', padding: '20px 18px', cursor: 'pointer', transition: 'border-color .14s, background .14s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 130, position: 'relative' }}
                  >
                    {on && (
                      <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: '50%', background: 'var(--blue)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
                    )}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: on ? 'var(--blue)' : 'var(--txt)', marginBottom: 6 }}>{s.name}</div>
                      {s.description && <div style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.5 }}>{s.description}</div>}
                      {s.vehicle_type && (
                        <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{s.vehicle_type}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: on ? 'var(--blue)' : 'var(--txt)', marginTop: 14, fontFamily: 'monospace' }}>
                      {fmtJMD(s.price)}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Add-ons */}
        {!loading && addons.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
              Add-ons (Optional)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {addons.map(a => {
                const checked = selAddons.some(x => x.id === a.id)
                return (
                  <div
                    key={a.id}
                    onClick={() => toggleAddon(a)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 'var(--r2)', border: `2px solid ${checked ? 'var(--blue)' : 'var(--bdr)'}`, background: checked ? 'var(--blue-bg)' : 'var(--surf)', cursor: 'pointer', transition: 'border-color .12s, background .12s' }}
                  >
                    <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked ? 'var(--blue)' : 'var(--bdr2)'}`, background: checked ? 'var(--blue)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>
                      {checked ? '✓' : ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{a.name}</div>
                      {a.description && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{a.description}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: checked ? 'var(--blue)' : 'var(--txt2)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      +{fmtJMD(a.price)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          {selected ? (
            <div style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: 'var(--txt)' }}>{selected.name}</span>
              {selAddons.length > 0 && (
                <span style={{ color: 'var(--txt3)' }}> + {selAddons.length} add-on{selAddons.length !== 1 ? 's' : ''}</span>
              )}
              <span style={{ marginLeft: 10, fontFamily: 'monospace', fontWeight: 900, color: 'var(--blue)', fontSize: 16 }}>
                {fmtJMD(grandTotal)}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--txt3)' }}>Select a wash package to continue</div>
          )}
        </div>
        <button
          onClick={() => selected && onSelect(selected, selAddons)}
          disabled={!selected}
          style={{ padding: '12px 32px', borderRadius: 'var(--r2)', fontSize: 15, fontWeight: 800, background: selected ? 'var(--blue)' : 'var(--surf2)', color: selected ? '#fff' : 'var(--txt3)', border: 'none', cursor: selected ? 'pointer' : 'not-allowed', opacity: selected ? 1 : .6 }}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
