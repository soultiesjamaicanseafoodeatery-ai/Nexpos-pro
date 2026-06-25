'use client'
import React, { useState } from 'react'
import type { OrderTicket, User } from '@/types'
import { useApp } from '@/lib/hooks/useAppStore'

interface Props {
  onLogout: () => void
  onCancel: () => void
}

type Step = 'list' | 'pick-staff' | 'confirm'

export default function ShiftEndModal({ onLogout, onCancel }: Props) {
  const { state, dispatch } = useApp()
  const { currentUser, users, orderTickets, activeModule } = state
  const isManager = ['admin', 'manager'].includes(currentUser?.role ?? '')

  const activeOrders = orderTickets.filter(t =>
    !['paid', 'voided'].includes(t.status ?? '') &&
    (isManager || t.server === currentUser?.name)
  )

  const [step, setStep]         = useState<Step>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode]         = useState<'individual' | 'all'>('individual')
  const [destUser, setDestUser] = useState<User | null>(null)

  const eligibleStaff = users.filter(u => u.active && u.id !== currentUser?.id)
  const toTransfer = mode === 'all' ? activeOrders : activeOrders.filter(t => selected.has(t.id))

  function orderLabel(t: OrderTicket) {
    const type =
      t.orderType === 'dine-in'  ? (t.table ? `Table ${t.table}` : 'Dine-in')
      : t.orderType === 'delivery' ? 'Delivery'
      : t.orderType === 'takeout'  ? 'Takeout'
      : (t.orderType ?? 'Order')
    const name  = t.customerName ? ` · ${t.customerName}` : ''
    const count = t.items.filter(i => !i.voided).length
    return {
      main: `#${t.orderNum} · ${type}${name}`,
      sub:  `${count} item${count !== 1 ? 's' : ''} · ${t.status ?? 'open'}`,
    }
  }

  function doTransfer() {
    if (!currentUser || !destUser || toTransfer.length === 0) return
    const ts = new Date().toLocaleString()
    toTransfer.forEach(ticket => {
      dispatch({ type: 'TRANSFER_ORDER', ticketId: ticket.id, toUserName: destUser.name })
      dispatch({
        type: 'ADD_AUDIT',
        entry: {
          id: crypto.randomUUID(),
          ts,
          user: currentUser.name,
          userId: currentUser.id,
          action: 'ORDER_TRANSFER',
          detail: `Order #${ticket.orderNum} (${ticket.orderType}) transferred ${currentUser.name} → ${destUser.name}`,
          type: 'info',
          mod: activeModule,
        },
      })
    })
    setSelected(new Set())
    setMode('individual')
    setDestUser(null)
    setStep('list')
  }

  // ── Shared styles ─────────────────────────────────────────────
  const s = {
    overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 960,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: { background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)',
      width: '100%', maxWidth: 460, maxHeight: '86vh', display: 'flex', flexDirection: 'column' as const,
      overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.75)' },
    head: { padding: '16px 20px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 },
    body: { flex: 1, overflowY: 'auto' as const, padding: '12px 16px', display: 'flex',
      flexDirection: 'column' as const, gap: 8 },
    foot: { padding: '14px 16px', borderTop: '1px solid var(--bdr)', flexShrink: 0 },
    btnGhost: { width: '100%', padding: '9px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700,
      background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' } as const,
  }

  return (
    <div onClick={onCancel} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={s.card}>

        {/* ── LIST STEP ── */}
        {step === 'list' && <>
          <div style={s.head}>
            {activeOrders.length === 0 ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--grn)' }}>All Orders Transferred</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>No active orders remaining — safe to clock out</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ora)' }}>
                  You have {activeOrders.length} active order{activeOrders.length !== 1 ? 's' : ''} assigned
                </div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                  Transfer them before clocking out, or cancel to stay logged in
                </div>
              </>
            )}
          </div>

          {activeOrders.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
              <div style={{ fontSize: 13, color: 'var(--txt3)', marginBottom: 20 }}>
                You&apos;re clear to clock out.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={onCancel}
                  style={{ padding: '9px 20px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700,
                    background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>
                  Stay Logged In
                </button>
                <button onClick={onLogout}
                  style={{ padding: '9px 24px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 800,
                    background: 'var(--grn)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Clock Out
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={s.body}>
                {activeOrders.map(ticket => {
                  const { main, sub } = orderLabel(ticket)
                  const checked = selected.has(ticket.id)
                  return (
                    <div key={ticket.id}
                      onClick={() => {
                        const n = new Set(selected)
                        checked ? n.delete(ticket.id) : n.add(ticket.id)
                        setSelected(n)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        borderRadius: 'var(--r2)',
                        border: `1.5px solid ${checked ? 'var(--blue)' : 'var(--bdr)'}`,
                        background: checked ? 'rgba(59,130,246,.07)' : 'var(--surf)',
                        cursor: 'pointer', userSelect: 'none' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${checked ? 'var(--blue)' : 'var(--bdr)'}`,
                        background: checked ? 'var(--blue)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: '#fff', fontWeight: 800 }}>
                        {checked && '✓'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{main}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{sub}</div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', flexShrink: 0 }}>
                        {ticket.server}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ ...s.foot, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    disabled={selected.size === 0}
                    onClick={() => { setMode('individual'); setStep('pick-staff') }}
                    style={{ padding: '10px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 800,
                      border: 'none', cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
                      background: selected.size > 0 ? 'var(--blue)' : 'var(--surf3)',
                      color: selected.size > 0 ? '#fff' : 'var(--txt3)' }}>
                    Transfer Selected ({selected.size})
                  </button>
                  <button
                    onClick={() => { setMode('all'); setSelected(new Set()); setStep('pick-staff') }}
                    style={{ padding: '10px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 800,
                      border: 'none', cursor: 'pointer', background: 'var(--ora)', color: '#fff' }}>
                    Transfer All ({activeOrders.length})
                  </button>
                </div>
                <button onClick={onCancel} style={s.btnGhost}>Cancel Clock Out</button>
              </div>
            </>
          )}
        </>}

        {/* ── PICK STAFF STEP ── */}
        {step === 'pick-staff' && <>
          <div style={s.head}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Select Destination</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
              Transferring {mode === 'all' ? `all ${activeOrders.length}` : selected.size} order{(mode === 'all' ? activeOrders.length : selected.size) !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={s.body}>
            {eligibleStaff.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--txt3)', fontSize: 13 }}>
                No other active staff members to transfer to.
              </div>
            ) : (
              eligibleStaff.map(u => (
                <button key={u.id}
                  onClick={() => { setDestUser(u); setStep('confirm') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderRadius: 'var(--r2)', border: '1.5px solid var(--bdr)',
                    background: 'var(--surf)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: u.color + '33', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 13, fontWeight: 800, color: u.color }}>
                    {u.ini}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', textTransform: 'capitalize' }}>{u.role}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div style={s.foot}>
            <button onClick={() => setStep('list')} style={s.btnGhost}>← Back</button>
          </div>
        </>}

        {/* ── CONFIRM STEP ── */}
        {step === 'confirm' && destUser && <>
          <div style={s.head}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Confirm Transfer</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
              {toTransfer.length} order{toTransfer.length !== 1 ? 's' : ''} → {destUser.name}
            </div>
          </div>
          <div style={s.body}>
            {/* Destination badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderRadius: 'var(--r2)', background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: destUser.color + '33', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 13, fontWeight: 800, color: destUser.color }}>
                {destUser.ini}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>Transferring to {destUser.name}</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', textTransform: 'capitalize' }}>{destUser.role}</div>
              </div>
            </div>
            {/* Orders list */}
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', overflow: 'hidden' }}>
              {toTransfer.map((t, i) => {
                const { main, sub } = orderLabel(t)
                return (
                  <div key={t.id} style={{ padding: '10px 14px',
                    borderBottom: i < toTransfer.length - 1 ? '1px solid var(--bdr2)' : 'none' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{main}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{sub}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ ...s.foot, display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('pick-staff')}
              style={{ flex: 1, padding: '10px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700,
                background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={doTransfer}
              style={{ flex: 2, padding: '10px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 800,
                border: 'none', cursor: 'pointer', background: 'var(--grn)', color: '#fff' }}>
              Confirm Transfer
            </button>
          </div>
        </>}

      </div>
    </div>
  )
}
