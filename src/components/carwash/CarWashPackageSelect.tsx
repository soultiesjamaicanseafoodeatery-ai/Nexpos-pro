'use client'

import { useState, useEffect } from 'react'
import type { CwService, CwAddon } from './CarWashFlow'

const fmtJ = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  onSelect: (service: CwService, addons: CwAddon[]) => void
}

export default function CarWashPackageSelect({ onSelect }: Props) {
  const [services,  setServices]  = useState<CwService[]>([])
  const [addons,    setAddons]    = useState<CwAddon[]>([])
  const [selected,  setSelected]  = useState<CwService | null>(null)
  const [selAddons, setSelAddons] = useState<CwAddon[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/carwash-services').then(r => r.json()),
      fetch('/api/carwash-addons').then(r => r.json()),
    ]).then(([svcs, adds]) => {
      setServices(Array.isArray(svcs) ? svcs.filter((s: CwService) => s.is_available) : [])
      setAddons(Array.isArray(adds)   ? adds.filter((a: CwAddon)  => a.is_available)  : [])
    }).finally(() => setLoading(false))
  }, [])

  const toggleAddon = (a: CwAddon) =>
    setSelAddons(prev => prev.some(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a])

  const addonTotal = selAddons.reduce((s, a) => s + a.price, 0)
  const total      = (selected?.price ?? 0) + addonTotal

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)' }}>🚗 Car Wash</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 60, fontSize: 15 }}>
            Loading services…
          </div>
        ) : services.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🚿</div>
            <div style={{ fontSize: 15 }}>No services configured</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Add services in the Services &amp; Prices page</div>
          </div>
        ) : (
          <>
            {/* Services */}
            <div style={{ marginBottom: 12, fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
              Select Service
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 32 }}>
              {services.map(s => {
                const on = selected?.id === s.id
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelected(on ? null : s)}
                    style={{
                      position: 'relative',
                      background: on ? 'var(--blue-bg)' : 'var(--surf)',
                      border: `2.5px solid ${on ? 'var(--blue)' : 'var(--bdr)'}`,
                      borderRadius: 'var(--r3)',
                      padding: '20px 18px',
                      cursor: 'pointer',
                      transition: 'all .14s',
                      minHeight: 120,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    {on && (
                      <div style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: '50%', background: 'var(--blue)', color: '#fff', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ✓
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: on ? 'var(--blue)' : 'var(--txt)', marginBottom: 4, paddingRight: on ? 28 : 0 }}>
                        {s.name}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.4 }}>{s.description}</div>
                      )}
                      {s.vehicle_type && s.vehicle_type !== 'All' && (
                        <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: on ? 'var(--blue)' : 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                          {s.vehicle_type}
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 14, fontSize: 24, fontWeight: 900, color: on ? 'var(--blue)' : 'var(--txt)', fontFamily: 'var(--mono)' }}>
                      {fmtJ(s.price)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add-ons */}
            {addons.length > 0 && (
              <>
                <div style={{ marginBottom: 12, fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                  Add-Ons — Optional
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {addons.map(a => {
                    const checked = selAddons.some(x => x.id === a.id)
                    return (
                      <div
                        key={a.id}
                        onClick={() => toggleAddon(a)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '13px 16px',
                          borderRadius: 'var(--r2)',
                          border: `2px solid ${checked ? 'var(--blue)' : 'var(--bdr)'}`,
                          background: checked ? 'var(--blue-bg)' : 'var(--surf)',
                          cursor: 'pointer', transition: 'all .12s',
                        }}
                      >
                        <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked ? 'var(--blue)' : 'var(--bdr2)'}`, background: checked ? 'var(--blue)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>
                          {checked ? '✓' : ''}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{a.name}</div>
                          {a.description && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{a.description}</div>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: checked ? 'var(--blue)' : 'var(--txt2)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          +{fmtJ(a.price)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          {selected ? (
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 800, color: 'var(--txt)' }}>{selected.name}</span>
              {selAddons.length > 0 && (
                <span style={{ color: 'var(--txt3)' }}>
                  {' '}+ {selAddons.length} add-on{selAddons.length !== 1 ? 's' : ''}
                </span>
              )}
              <span style={{ marginLeft: 10, fontFamily: 'var(--mono)', fontWeight: 900, color: 'var(--blue)', fontSize: 18 }}>
                {fmtJ(total)}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--txt3)' }}>Select a service to get started</div>
          )}
        </div>
        <button
          onClick={() => selected && onSelect(selected, selAddons)}
          disabled={!selected}
          style={{
            padding: '13px 36px', borderRadius: 'var(--r2)', fontSize: 15, fontWeight: 800,
            background: selected ? 'var(--blue)' : 'var(--surf2)',
            color:      selected ? '#fff'        : 'var(--txt3)',
            border: 'none', cursor: selected ? 'pointer' : 'not-allowed',
            opacity: selected ? 1 : .55, transition: 'all .12s',
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
