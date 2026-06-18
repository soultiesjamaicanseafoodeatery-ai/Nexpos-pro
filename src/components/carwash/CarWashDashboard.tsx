'use client'

import { useState, useEffect, useCallback } from 'react'

interface Order {
  id: string
  ticket_no: string
  status: string
  service_name: string
  plate: string
  customer_name: string
  vehicle_type: string
  created_at: string
  total: number
}

interface Props { onNewWash: () => void }

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  waiting:     { label: 'Waiting',     color: '#f97316', bg: 'rgba(249,115,22,.1)' },
  in_progress: { label: 'In Progress', color: '#4f8ef7', bg: 'rgba(79,142,247,.1)' },
  ready:       { label: 'Ready',       color: '#3ecf8e', bg: 'rgba(62,207,142,.1)' },
  completed:   { label: 'Completed',   color: '#6b7280', bg: 'rgba(107,114,128,.1)' },
}

const NEXT_STATUS: Record<string, string | null> = {
  waiting: 'in_progress', in_progress: 'ready', ready: 'completed', completed: null
}
const NEXT_LABEL: Record<string, string> = {
  waiting: '▶ Start', in_progress: '✓ Ready', ready: '✅ Complete'
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

const fmtJMD = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CarWashDashboard({ onNewWash }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

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

  const active = orders.filter(o => o.status !== 'completed')
  const waiting = orders.filter(o => o.status === 'waiting').length
  const inProgress = orders.filter(o => o.status === 'in_progress').length
  const readyCount = orders.filter(o => o.status === 'ready').length
  const completedToday = orders.filter(o => o.status === 'completed').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)' }}>Car Wash Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <button
          onClick={onNewWash}
          style={{ padding: '12px 28px', borderRadius: 'var(--r2)', fontSize: 15, fontWeight: 800, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          + New Wash
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Counter cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {([
            { label: 'Waiting',         count: waiting,       color: '#f97316', bg: 'rgba(249,115,22,.08)' },
            { label: 'In Progress',     count: inProgress,    color: '#4f8ef7', bg: 'rgba(79,142,247,.08)' },
            { label: 'Ready',           count: readyCount,    color: '#3ecf8e', bg: 'rgba(62,207,142,.08)' },
            { label: 'Completed Today', count: completedToday,color: '#6b7280', bg: 'rgba(107,114,128,.08)' },
          ] as const).map(({ label, count, color, bg }) => (
            <div key={label} style={{ background: bg, border: `1.5px solid ${color}44`, borderRadius: 'var(--r3)', padding: '18px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Active queue label */}
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Active Washes ({active.length})</span>
          <button onClick={load} style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer' }}>↻ Refresh</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 40 }}>Loading...</div>
        ) : active.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 60, fontSize: 15 }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🚗</div>
            No active washes — tap <strong>+ New Wash</strong> to get started
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map(o => {
              const meta = STATUS_META[o.status] ?? STATUS_META.waiting
              const next = NEXT_STATUS[o.status]
              return (
                <div key={o.id} style={{ background: 'var(--surf)', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'var(--blue)', minWidth: 86 }}>{o.ticket_no}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--txt)', fontSize: 14 }}>{o.service_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                      {o.plate} · {o.vehicle_type}{o.customer_name ? ` · ${o.customer_name}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{timeAgo(o.created_at)}</div>
                  </div>
                  <div style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
                    {meta.label}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: 'var(--txt)', minWidth: 90, textAlign: 'right' }}>
                    {fmtJMD(o.total)}
                  </div>
                  {next && (
                    <button
                      onClick={() => updateStatus(o.id, next)}
                      style={{ padding: '8px 16px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: next === 'completed' ? 'rgba(62,207,142,.15)' : 'var(--blue-bg)', color: next === 'completed' ? '#3ecf8e' : 'var(--blue)', border: `1.5px solid ${next === 'completed' ? '#3ecf8e44' : 'rgba(79,142,247,.3)'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {NEXT_LABEL[o.status]}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
