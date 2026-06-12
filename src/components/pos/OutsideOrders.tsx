'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { OutsideOrder } from '@/lib/supabase'
import { useApp } from '@/lib/hooks/useAppStore'
import { fmt } from '@/lib/utils/tax'

interface Props {
  onCountChange?: (n: number) => void
}

export default function OutsideOrders({ onCountChange }: Props) {
  const { state, toast } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const [orders, setOrders] = useState<OutsideOrder[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = async () => {
    if (!supabase) { setLoading(false); return }
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .in('type', ['carwash', 'mixed', 'restaurant'])
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as OutsideOrder[]
    setOrders(rows)
    onCountChange?.(rows.length)
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    if (!supabase) return

    const ch = supabase.channel('outside_orders_panel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => { fetchOrders() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload => {
        const updated = payload.new as OutsideOrder
        if (updated.status !== 'pending') {
          setOrders(prev => {
            const next = prev.filter(x => x.id !== updated.id)
            onCountChange?.(next.length)
            return next
          })
        }
      })
      .subscribe()

    return () => { supabase!.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markReady = async (order: OutsideOrder) => {
    if (!supabase) return
    await supabase.from('orders').update({ status: 'ready' }).eq('id', order.id)
    toast(`✓ Ready — ${order.customer_name}`, 'success')
  }

  const cancel = async (order: OutsideOrder) => {
    if (!supabase) return
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    toast('Order cancelled', 'warn')
  }

  if (!supabase) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--txt3)', padding: 32 }}>
      <div style={{ fontSize: 36 }}>🔌</div>
      <div style={{ fontWeight: 800, color: 'var(--txt)', fontSize: 15 }}>Supabase not connected</div>
      <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
        Add <code style={{ background: 'var(--surf2)', padding: '1px 5px', borderRadius: 4 }}>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
        <code style={{ background: 'var(--surf2)', padding: '1px 5px', borderRadius: 4 }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your Vercel environment variables.
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
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>No pending orders</div>
      <div style={{ fontSize: 12 }}>Online orders from the website will appear here in real-time</div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {orders.map(order => {
        const plateItem = order.order_items?.find(i => i.item_name.match(/\[([A-Z0-9-]+)\]/))
        const plate = plateItem?.item_name.match(/\[([A-Z0-9-]+)\]/)?.[1]
        const lineItems = order.order_items?.filter(i => !i.item_name.startsWith('  ↳')) ?? []

        return (
          <div key={order.id} style={{ background: 'var(--surf)', border: '1.5px solid var(--blue)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ background: 'var(--blue-bg)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bdr)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  {order.type === 'carwash' ? '🚗' : order.type === 'mixed' ? '🚗🍽️' : '🍽️'}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>
                    {plate ?? order.customer_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                    {plate ? order.customer_name : ''} · {order.type.toUpperCase()} order
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmt(order.final_amount, sym)}</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {/* Items */}
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
                {lineItems.map((item, i) => (
                  <span key={i} style={{ background: 'var(--surf2)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: item.item_name.startsWith('🚿') || item.item_name.includes('[') ? 700 : 400, color: 'var(--txt)' }}>
                    {item.item_name.replace(/\s*\[[^\]]*\]/, '')} {item.quantity > 1 ? `×${item.quantity}` : ''}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 2 }}>
                👤 {order.customer_name}
                {order.customer_phone && <> · 📞 {order.customer_phone}</>}
              </div>
              {order.discount_amount > 0 && (
                <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                  Discount applied: -{fmt(order.discount_amount, sym)}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 8 }}>
              <button
                onClick={() => markReady(order)}
                style={{ flex: 1, padding: '10px', background: 'var(--grn)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                ✓ Mark Ready
              </button>
              <button
                onClick={() => cancel(order)}
                style={{ padding: '10px 14px', background: 'var(--surf2)', color: 'var(--txt2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
