'use client'
import { useApp } from '@/lib/hooks/useAppStore'
import type { OrderType } from '@/types'

interface Props {
  onSelect: (type: OrderType) => void
}

const SERVICES: { type: OrderType; icon: string; label: string; sub: string; color: string }[] = [
  { type: 'dine-in',  icon: '🍽',  label: 'Dine-In',  sub: 'Seat guests at a table',         color: 'var(--ora)' },
  { type: 'takeout',  icon: '🥡',  label: 'Takeout',  sub: 'Order for counter pickup',        color: 'var(--grn)' },
  { type: 'delivery', icon: '🚗',  label: 'Delivery', sub: 'Deliver to customer address',     color: 'var(--blue)' },
]

export default function ServiceSelect({ onSelect }: Props) {
  const { state, dispatch } = useApp()
  const { currentUser, biz, activeModule } = state

  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const allowedMods = currentUser?.allowedModules ?? []

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)',
      overflow: 'hidden',
    }}>

      {/* Top bar */}
      <div style={{
        padding: '14px 24px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>
            {biz.name || 'NexPOS Pro'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{today} · {now}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Module tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['restaurant', 'bar', 'carwash'] as const)
              .filter(m => allowedMods.includes(m))
              .map(m => {
                const labels = { restaurant: '🍴 Restaurant', bar: '🍸 Bar', carwash: '🚿 Car Wash' }
                const isActive = activeModule === m
                return (
                  <button key={m} onClick={() => dispatch({ type: 'SET_MODULE', mod: m })} style={{
                    padding: '7px 14px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', border: `1.5px solid ${isActive ? 'var(--blue)' : 'var(--bdr)'}`,
                    background: isActive ? 'var(--blue-bg)' : 'var(--surf)',
                    color: isActive ? 'var(--blue)' : 'var(--txt3)',
                  }}>{labels[m]}</button>
                )
              })}
          </div>
          {/* User chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surf)', border: '1px solid var(--bdr)',
            borderRadius: 'var(--r)', padding: '7px 12px',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${currentUser?.color ?? '#3b82f6'}22`, color: currentUser?.color ?? 'var(--blue)',
            }}>{currentUser?.ini}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{currentUser?.name?.split(' ')[0]}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'capitalize' }}>{currentUser?.role}</div>
            </div>
          </div>
          <button onClick={() => dispatch({ type: 'SET_PAGE', page: 'pos' })} style={{
            padding: '7px 14px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700,
            border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt3)', cursor: 'pointer',
          }}>Admin</button>
        </div>
      </div>

      {/* Hero text */}
      <div style={{ textAlign: 'center', padding: '40px 20px 24px', flexShrink: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.6px' }}>
          How is this order?
        </div>
        <div style={{ fontSize: 15, color: 'var(--txt3)', marginTop: 8 }}>
          Select a service type to begin
        </div>
      </div>

      {/* Service cards */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 40px 60px', gap: 24,
      }}>
        {SERVICES.map(s => (
          <button key={s.type} onClick={() => onSelect(s.type)} style={{
            flex: 1, maxWidth: 320, minHeight: 260,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: '40px 28px',
            background: 'var(--bg2)', border: `2px solid var(--bdr)`,
            borderRadius: 'var(--r4)', cursor: 'pointer',
            transition: 'all .16s', textAlign: 'center',
          }}
            onMouseEnter={e => {
              const el = e.currentTarget
              el.style.border = `2px solid ${s.color}`
              el.style.transform = 'translateY(-4px)'
              el.style.boxShadow = `0 12px 40px rgba(0,0,0,.3)`
            }}
            onMouseLeave={e => {
              const el = e.currentTarget
              el.style.border = '2px solid var(--bdr)'
              el.style.transform = 'translateY(0)'
              el.style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: 64, lineHeight: 1 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>
                {s.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--txt3)', marginTop: 6 }}>{s.sub}</div>
            </div>
            <div style={{
              marginTop: 8, padding: '10px 28px', borderRadius: 'var(--r)',
              background: s.color, color: '#fff', fontSize: 14, fontWeight: 800,
            }}>
              Select →
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
