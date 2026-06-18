'use client'

import { useState, useEffect, useCallback } from 'react'

interface AddonRef { name: string; price: number }

interface Order {
  id: string
  ticket_no: string
  status: string
  service_name: string
  plate: string
  customer_name: string
  vehicle_type: string
  phone: string
  notes: string
  addons: AddonRef[]
  total: number
  payment_method: string
  employee_name: string
  created_at: string
  completed_at?: string
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  waiting:     { label: 'Waiting',     color: '#f97316', bg: 'rgba(249,115,22,.1)',   border: 'rgba(249,115,22,.3)' },
  in_progress: { label: 'In Progress', color: '#4f8ef7', bg: 'rgba(79,142,247,.1)',   border: 'rgba(79,142,247,.3)' },
  ready:       { label: 'Ready',       color: '#3ecf8e', bg: 'rgba(62,207,142,.1)',   border: 'rgba(62,207,142,.3)' },
  completed:   { label: 'Completed',   color: '#6b7280', bg: 'rgba(107,114,128,.07)', border: 'rgba(107,114,128,.2)' },
}

const NEXT_STATUS: Record<string, string | null> = {
  waiting: 'in_progress', in_progress: 'ready', ready: 'completed', completed: null
}
const NEXT_LABEL: Record<string, string> = {
  waiting: '▶ Start Wash', in_progress: '✓ Mark Ready', ready: '✅ Complete'
}

const fmtJMD = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

type Filter = 'active' | 'completed' | 'all'

export default function CarWashQueue() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('active')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/carwash-orders')
      if (r.ok) setOrders(await r.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const updateStatus = async (id: string, status: string) => {
    await fetch('/api/carwash-orders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  const displayed = orders.filter(o => {
    if (filter === 'active') return o.status !== 'completed'
    if (filter === 'completed') return o.status === 'completed'
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Wash Queue</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['active', 'completed', 'all'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: filter === f ? 'var(--blue)' : 'var(--surf2)', color: filter === f ? '#fff' : 'var(--txt2)', textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
          <button onClick={load}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt3)' }}>
            ↻
          </button>
        </div>
      </div>

      {/* Status counters */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        {(['waiting', 'in_progress', 'ready', 'completed'] as const).map(s => {
          const count = orders.filter(o => o.status === s).length
          const meta = STATUS_META[s]
          return (
            <div key={s} style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderRight: '1px solid var(--bdr)', background: count > 0 ? meta.bg : 'transparent' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: count > 0 ? meta.color : 'var(--txt3)' }}>{count}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>{meta.label}</div>
            </div>
          )
        })}
      </div>

      {/* Queue list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 48 }}>Loading queue...</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🚗</div>
            {filter === 'active' ? 'No active washes' : 'No orders found for today'}
          </div>
        ) : (
          displayed.map(o => {
            const meta = STATUS_META[o.status] ?? STATUS_META.waiting
            const next = NEXT_STATUS[o.status]
            return (
              <div key={o.id} style={{ background: 'var(--surf)', border: `1.5px solid ${meta.border}`, borderRadius: 'var(--r3)', overflow: 'hidden' }}>

                {/* Card header row */}
                <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 14, color: 'var(--blue)', letterSpacing: '.5px' }}>{o.ticket_no}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--txt)', fontFamily: 'monospace', letterSpacing: '2px' }}>{o.plate}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{o.vehicle_type}</div>
                  {o.customer_name && <div style={{ fontSize: 12, color: 'var(--txt3)' }}>· {o.customer_name}</div>}
                  {o.phone && <div style={{ fontSize: 12, color: 'var(--txt3)' }}>· {o.phone}</div>}
                  <div style={{ flex: 1 }} />
                  <div style={{ padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{fmtTime(o.created_at)}</div>
                </div>

                {/* Card body row */}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{o.service_name}</div>
                    {Array.isArray(o.addons) && o.addons.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                        + {o.addons.map(a => a.name).join(', ')}
                      </div>
                    )}
                    {o.notes && (
                      <div style={{ fontSize: 11, color: '#f97316', fontWeight: 600, marginTop: 4 }}>{o.notes}</div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>
                      {timeAgo(o.created_at)}{o.employee_name ? ` · ${o.employee_name}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 900, color: 'var(--txt)' }}>{fmtJMD(o.total)}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2, textTransform: 'capitalize' }}>{o.payment_method}</div>
                  </div>
                  {next && (
                    <button
                      onClick={() => updateStatus(o.id, next)}
                      style={{ padding: '9px 18px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: next === 'completed' ? 'rgba(62,207,142,.15)' : 'var(--blue-bg)', color: next === 'completed' ? '#3ecf8e' : 'var(--blue)', border: `1.5px solid ${next === 'completed' ? 'rgba(62,207,142,.3)' : 'rgba(79,142,247,.3)'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {NEXT_LABEL[o.status]}
                    </button>
                  )}
                </div>

                {/* Completed footer */}
                {o.status === 'completed' && o.completed_at && (
                  <div style={{ padding: '6px 16px', background: 'rgba(107,114,128,.05)', borderTop: '1px solid var(--bdr)', fontSize: 11, color: 'var(--txt3)' }}>
                    Completed at {fmtTime(o.completed_at)}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
