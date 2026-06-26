'use client'

import { useEffect, useState, useCallback } from 'react'
import type { CwService, CwAddon } from './CarWashFlow'

interface Props {
  onSelect: (services: CwService[], addons: CwAddon[]) => void
}

const fmtJ = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CarWashPackageSelect({ onSelect }: Props) {
  const [services, setServices] = useState<CwService[]>([])
  const [addons, setAddons] = useState<CwAddon[]>([])
  const [selServices, setSelServices] = useState<CwService[]>([])
  const [selAddons, setSelAddons] = useState<CwAddon[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/carwash-services').then(r => r.json()),
      fetch('/api/carwash-addons').then(r => r.json()),
    ]).then(([svcs, adds]) => {
      setServices(svcs.filter((s: CwService) => s.is_available))
      setAddons(adds.filter((a: CwAddon) => a.is_available))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const toggleService = useCallback((s: CwService) => {
    setSelServices(prev =>
      prev.some(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : [...prev, s]
    )
  }, [])

  const toggleAddon = useCallback((a: CwAddon) => {
    setSelAddons(prev =>
      prev.some(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a]
    )
  }, [])

  const servicesTotal = selServices.reduce((acc, s) => acc + s.price, 0)
  const addonsTotal = selAddons.reduce((acc, a) => acc + a.price, 0)
  const total = servicesTotal + addonsTotal

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt3)' }}>
        Loading services...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--txt)' }}>Car Wash</div>
        <div style={{ fontSize: 13, color: 'var(--txt3)', marginTop: 2 }}>Select one or more services</div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

        {/* Services */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Services
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {services.map(s => {
            const checked = selServices.some(x => x.id === s.id)
            return (
              <button
                key={s.id}
                onClick={() => toggleService(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px',
                  border: checked ? '2.5px solid var(--blue)' : '2px solid var(--bdr)',
                  background: checked ? 'rgba(59,130,246,.08)' : 'var(--surf)',
                  borderRadius: 'var(--r3)', cursor: 'pointer',
                  textAlign: 'left', transition: 'border .1s, background .1s',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: checked ? '2px solid var(--blue)' : '2px solid var(--bdr)',
                  background: checked ? 'var(--blue)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 900, transition: 'all .1s',
                }}>
                  {checked ? '✓' : ''}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{s.name}</div>
                  {s.description && (
                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{s.description}</div>
                  )}
                  {s.vehicle_type && (
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                      {s.vehicle_type}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 15, color: 'var(--txt)', flexShrink: 0 }}>
                  {fmtJ(s.price)}
                </div>
              </button>
            )
          })}
        </div>

        {/* Add-ons */}
        {addons.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Add-Ons
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {addons.map(a => {
                const checked = selAddons.some(x => x.id === a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAddon(a)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 16px',
                      border: checked ? '2.5px solid var(--grn)' : '2px solid var(--bdr)',
                      background: checked ? 'rgba(34,197,94,.08)' : 'var(--surf)',
                      borderRadius: 'var(--r3)', cursor: 'pointer',
                      textAlign: 'left', transition: 'border .1s, background .1s',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: checked ? '2px solid var(--grn)' : '2px solid var(--bdr)',
                      background: checked ? 'var(--grn)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 13, fontWeight: 900, transition: 'all .1s',
                    }}>
                      {checked ? '✓' : ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{a.name}</div>
                      {a.description && (
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{a.description}</div>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: 'var(--txt)', flexShrink: 0 }}>
                      {fmtJ(a.price)}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--bdr)', padding: '16px 24px', flexShrink: 0, background: 'var(--surf)' }}>
        {selServices.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13, color: 'var(--txt3)' }}>
            <span>{selServices.length} service{selServices.length !== 1 ? 's' : ''}{selAddons.length > 0 ? ` + ${selAddons.length} add-on${selAddons.length !== 1 ? 's' : ''}` : ''}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 15, color: 'var(--txt)' }}>{fmtJ(total)}</span>
          </div>
        )}
        <button
          disabled={selServices.length === 0}
          onClick={() => onSelect(selServices, selAddons)}
          style={{
            width: '100%', padding: '15px 0',
            background: selServices.length > 0 ? 'var(--blue)' : 'var(--bdr)',
            color: selServices.length > 0 ? '#fff' : 'var(--txt3)',
            border: 'none', borderRadius: 'var(--r3)',
            fontSize: 16, fontWeight: 900, cursor: selServices.length > 0 ? 'pointer' : 'not-allowed',
            transition: 'background .15s',
          }}
        >
          {selServices.length === 0 ? 'Select at least one service' : 'Proceed to Payment →'}
        </button>
      </div>
    </div>
  )
}
