'use client'
import { useState, useMemo } from 'react'
import type { CartItem, OrderCalc } from '@/types'
import { calcCart } from '@/lib/utils/tax'

interface SplitBill {
  id: string
  label: string
  items: CartItem[]
  calc: OrderCalc
}

interface Props {
  isOpen: boolean
  onClose: () => void
  cart: CartItem[]
  orderType: string
  gratuityPct: number
  sym: string
  onPaySplit: (split: SplitBill) => void
  onPayAll: () => void
  onAllPaid?: () => void
}

type Mode = 'equal' | 'items'

export default function SplitBillModal({
  isOpen, onClose, cart, orderType, gratuityPct, sym, onPaySplit, onPayAll, onAllPaid,
}: Props) {
  const [mode, setMode]         = useState<Mode>('equal')
  const [numSplits, setNumSplits] = useState(2)
  const [assignments, setAssignments] = useState<Record<string, number>>({}) // itemId → billIndex
  const [activeBill, setActiveBill]   = useState(0)
  const [paidSplits, setPaidSplits]   = useState<Set<number>>(new Set())

  const fmtN = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const totalCalc = calcCart(cart, { orderType, gratuityPct })

  // Equal split: simply divide total
  const equalAmount = totalCalc.total / numSplits
  const equalSub    = totalCalc.sub / numSplits
  const equalTax    = (totalCalc.gct + totalCalc.serviceCharge) / numSplits
  const equalGrat   = totalCalc.gratuity / numSplits

  // Item split: group cart items by assignment
  const splitBills = useMemo<SplitBill[]>(() => {
    return Array.from({ length: numSplits }, (_, i) => {
      const billItems = cart.filter(ci => (assignments[ci.id] ?? 0) === i)
      const calc = calcCart(billItems, { orderType, gratuityPct })
      return {
        id: `bill-${i}`,
        label: `Bill ${i + 1}`,
        items: billItems,
        calc,
      }
    })
  }, [cart, assignments, numSplits, orderType, gratuityPct])

  const unassigned = cart.filter(ci => !(ci.id in assignments))

  if (!isOpen) return null

  const over: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 710,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }

  return (
    <div style={over} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)',
        width: '100%', maxWidth: 520, maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Split Bill</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Total: {fmtN(totalCalc.total)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>

        {/* Mode tabs */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', gap: 6, flexShrink: 0 }}>
          {([['equal', 'Equal Split'], ['items', 'By Item']] as const).map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '8px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${mode === m ? 'transparent' : 'var(--bdr)'}`,
              background: mode === m ? 'var(--blue)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--txt2)',
            }}>{lbl}</button>
          ))}

          {/* Number of ways */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--txt3)' }}>Ways:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setNumSplits(n => Math.max(2, n - 1))}
                style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', fontWeight: 800 }}>−</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 800, minWidth: 24, textAlign: 'center' }}>{numSplits}</span>
              <button onClick={() => setNumSplits(n => Math.min(10, n + 1))}
                style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', fontWeight: 800 }}>+</button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

          {mode === 'equal' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {Array.from({ length: numSplits }, (_, i) => {
                  const paid = paidSplits.has(i)
                  return (
                    <div key={i} style={{ background: paid ? '#14532d22' : 'var(--surf)', border: `2px solid ${paid ? 'var(--grn)' : 'var(--bdr)'}`, borderRadius: 'var(--r3)', padding: '16px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: paid ? 'var(--grn)' : 'var(--txt)', marginBottom: 4 }}>Bill {i + 1}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: paid ? 'var(--grn)' : 'var(--blue)', marginBottom: 8 }}>{fmtN(equalAmount)}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 8 }}>
                        Sub {fmtN(equalSub)}<br />
                        Tax {fmtN(equalTax)}<br />
                        {equalGrat > 0 && <>Grat {fmtN(equalGrat)}</>}
                      </div>
                      {!paid ? (
                        <button onClick={() => {
                          const splitCalc: OrderCalc = {
                            sub: equalSub, disc: totalCalc.disc / numSplits, memberDiscAmt: 0, manualDiscAmt: totalCalc.disc / numSplits,
                            taxableBase: totalCalc.taxableBase / numSplits, gct: totalCalc.gct / numSplits, gctRate: totalCalc.gctRate, gctApplies: totalCalc.gctApplies,
                            serviceCharge: totalCalc.serviceCharge / numSplits, scRate: totalCalc.scRate,
                            gratuity: equalGrat, deliveryFee: 0, legacyTax: 0, surchargeTotal: 0,
                            total: equalAmount, orderType,
                          }
                          const splitItem: CartItem = {
                            id: crypto.randomUUID(),
                            itemId: `split-${i}`,
                            name: `Bill ${i + 1} / ${numSplits}`,
                            price: equalAmount,
                            qty: 1,
                            addons: [],
                            module: cart[0]?.module ?? 'restaurant',
                          }
                          onPaySplit({ id: `bill-${i}`, label: `Bill ${i + 1} of ${numSplits}`, items: [splitItem], calc: splitCalc })
                          setPaidSplits(prev => {
                            const next = new Set(Array.from(prev))
                            next.add(i)
                            if (next.size === numSplits && onAllPaid) onAllPaid()
                            return next
                          })
                        }} style={{ width: '100%', padding: '8px 0', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          Pay This Bill
                        </button>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--grn)' }}>Paid ✓</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {mode === 'items' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16 }}>
              {/* Item list */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                  Assign Items to Bill
                </div>
                {unassigned.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ora)', marginBottom: 8, fontWeight: 600 }}>
                    {unassigned.length} item{unassigned.length > 1 ? 's' : ''} unassigned
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cart.map(ci => {
                    const assigned = assignments[ci.id] ?? -1
                    const lineTotal = (ci.price + ci.addons.reduce((s, a) => s + a.price, 0)) * ci.qty
                    return (
                      <div key={ci.id} style={{
                        background: 'var(--surf)', border: `1.5px solid ${assigned >= 0 ? 'var(--blue)' : 'var(--bdr)'}`,
                        borderRadius: 'var(--r)', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{ci.name} ×{ci.qty}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{fmtN(lineTotal)}</div>
                        </div>
                        <select value={assigned}
                          onChange={e => {
                            const val = Number(e.target.value)
                            setAssignments(prev => val >= 0 ? { ...prev, [ci.id]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== ci.id)))
                          }}
                          style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '5px 6px', fontSize: 11, color: 'var(--txt)' }}>
                          <option value={-1}>— Unassigned</option>
                          {Array.from({ length: numSplits }, (_, i) => (
                            <option key={i} value={i}>Bill {i + 1}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bill summaries */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                  Bill Totals
                </div>
                {/* Bill selector tabs */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {splitBills.map((b, i) => (
                    <button key={i} onClick={() => setActiveBill(i)} style={{
                      padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${activeBill === i ? 'transparent' : 'var(--bdr)'}`,
                      background: activeBill === i ? 'var(--blue)' : 'transparent',
                      color: activeBill === i ? '#fff' : 'var(--txt3)',
                    }}>B{i + 1}</button>
                  ))}
                </div>
                {splitBills[activeBill] && (
                  <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', marginBottom: 8 }}>Bill {activeBill + 1}</div>
                    {splitBills[activeBill].items.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--txt3)' }}>No items assigned</div>
                    ) : (
                      <>
                        {splitBills[activeBill].items.map(ci => (
                          <div key={ci.id} style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{ci.name} ×{ci.qty}</span>
                            <span style={{ fontFamily: 'var(--mono)' }}>{fmtN((ci.price + ci.addons.reduce((s, a) => s + a.price, 0)) * ci.qty)}</span>
                          </div>
                        ))}
                        <div style={{ borderTop: '1px dashed var(--bdr)', marginTop: 8, paddingTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 13, color: 'var(--blue)' }}>
                            <span>Total</span>
                            <span style={{ fontFamily: 'var(--mono)' }}>{fmtN(splitBills[activeBill].calc.total)}</span>
                          </div>
                        </div>
                        <button onClick={() => onPaySplit(splitBills[activeBill])} style={{
                          width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 'var(--r)',
                          background: splitBills[activeBill].calc.total === 0 ? 'var(--surf3)' : 'var(--blue)',
                          color: splitBills[activeBill].calc.total === 0 ? 'var(--txt3)' : '#fff',
                          border: 'none', fontWeight: 700, fontSize: 12, cursor: splitBills[activeBill].calc.total > 0 ? 'pointer' : 'not-allowed',
                        }}>
                          Pay Bill {activeBill + 1}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onPayAll} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Pay Full Bill Together
          </button>
        </div>
      </div>
    </div>
  )
}
