'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { OutsideOrder } from '@/lib/supabase'
import { useApp } from '@/lib/hooks/useAppStore'
import type { Transaction } from '@/types'
import { fmt } from '@/lib/utils/tax'

interface Props {
  onCountChange?: (n: number) => void
}

export default function OutsideOrders({ onCountChange }: Props) {
  const { state, dispatch, toast } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const [orders, setOrders] = useState<OutsideOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    supabase
      .from('outside_orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = data ?? []
        setOrders(rows)
        onCountChange?.(rows.length)
        setLoading(false)
      })

    const ch = supabase.channel('outside_orders_panel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'outside_orders' }, payload => {
        const o = payload.new as OutsideOrder
        setOrders(prev => {
          const next = [o, ...prev]
          onCountChange?.(next.length)
          return next
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'outside_orders' }, payload => {
        const o = payload.new as OutsideOrder
        setOrders(prev => {
          const next = o.status !== 'pending' ? prev.filter(x => x.id !== o.id) : prev.map(x => x.id === o.id ? o : x)
          onCountChange?.(next.length)
          return next
        })
      })
      .subscribe()

    return () => { supabase!.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accept = async (order: OutsideOrder) => {
    if (!supabase || !state.currentUser) return
    const tx: Transaction = {
      id: Date.now(),
      ts: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
          new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      mod: 'carwash',
      cashier: state.currentUser.name,
      userId: state.currentUser.id,
      customer: `${order.vehicle_plate}${order.vehicle_make ? ` · ${order.vehicle_make} ${order.vehicle_model}` : ''}`,
      item: order.service_name,
      addons: order.addons.map(a => a.name),
      sub: order.service_price + order.addons_total,
      disc: 0,
      tax: 0,
      total: order.total,
      pay: 'online',
      note: `${order.customer_name} · ${order.customer_phone}${order.notes ? ` · ${order.notes}` : ''}`,
    }
    dispatch({ type: 'ADD_TRANSACTION', tx })
    await supabase.from('outside_orders').update({ status: 'accepted' }).eq('id', order.id)
    toast(`✓ Order accepted — ${order.customer_name}`, 'success')
  }

  const reject = async (order: OutsideOrder) => {
    if (!supabase) return
    await supabase.from('outside_orders').update({ status: 'rejected' }).eq('id', order.id)
    toast('Order rejected', 'warn')
  }

  if (!supabase) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--txt3)', padding: 32 }}>
      <div style={{ fontSize: 36 }}>🔌</div>
      <div style={{ fontWeight: 800, color: 'var(--txt)', fontSize: 15 }}>Supabase not connected</div>
      <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
        Add <code style={{ background: 'var(--surf2)', padding: '1px 5px', borderRadius: 4 }}>NEXT_PUBLIC_SUPABASE_URL</code> and <code style={{ background: 'var(--surf2)', padding: '1px 5px', borderRadius: 4 }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your Vercel environment variables to enable online bookings.
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', fontSize: 13 }}>
      Loading orders…
    </div>
  )

  if (orders.length === 0) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--txt3)' }}>
      <div style={{ fontSize: 40 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>No pending bookings</div>
      <div style={{ fontSize: 12 }}>Online orders will appear here in real-time</div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {orders.map(order => (
        <div key={order.id} style={{ background: 'var(--surf)', border: '1.5px solid var(--blue)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
          {/* Card header */}
          <div style={{ background: 'var(--blue-bg)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bdr)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚗</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>{order.vehicle_plate}</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{[order.vehicle_color, order.vehicle_make, order.vehicle_model].filter(Boolean).join(' ') || 'No vehicle info'}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmt(order.total, sym)}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
          {/* Card body */}
          <div style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ background: 'var(--surf2)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>🚿 {order.service_name}</span>
              {order.addons.map(a => (
                <span key={a.name} style={{ background: 'var(--surf2)', padding: '3px 10px', borderRadius: 20, fontSize: 12, color: 'var(--txt2)' }}>+{a.name}</span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 3 }}>👤 {order.customer_name} · 📞 {order.customer_phone}</div>
            {order.notes && <div style={{ fontSize: 12, color: 'var(--txt3)', fontStyle: 'italic' }}>&ldquo;{order.notes}&rdquo;</div>}
          </div>
          {/* Actions */}
          <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 8 }}>
            <button onClick={() => accept(order)} style={{ flex: 1, padding: '10px', background: 'var(--grn)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>✓ Accept & Process</button>
            <button onClick={() => reject(order)} style={{ padding: '10px 14px', background: 'var(--surf2)', color: 'var(--txt2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✕ Reject</button>
          </div>
        </div>
      ))}
    </div>
  )
}
