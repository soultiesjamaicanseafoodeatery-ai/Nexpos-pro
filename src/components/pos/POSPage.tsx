'use client'

import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { MenuItem, Addon, Transaction } from '@/types'
import { calcOrder, fmt } from '@/lib/utils/tax'
import OutsideOrders from './OutsideOrders'
import { MODULE_DATA } from '@/lib/data/seed'

export default function POSPage() {
  const { state, dispatch, toast, audit } = useApp()
  const { activeModule, posState, currentUser, biz } = state
  const ps  = posState[activeModule]
  const mod = MODULE_DATA[activeModule]
  const calc = calcOrder(ps, activeModule)
  const sym  = biz.currencySymbol ?? 'J$'

  const [cwTab,        setCwTab]        = useState<'pos' | 'orders'>('pos')
  const [pendingCount, setPendingCount] = useState(0)

  const cats          = ['All', ...mod.categories.filter((c: string) => c !== 'All')]
  const filteredItems = ps.cat === 'All'
    ? mod.items.filter((i: MenuItem) => i.active)
    : mod.items.filter((i: MenuItem) => i.active && i.cat === ps.cat)

  const setPOS = (patch: Partial<typeof ps>) =>
    dispatch({ type: 'SET_POS_STATE', mod: activeModule, patch })

  const toggleItem = (item: MenuItem) => {
    if (ps.selItem?.id === item.id) { setPOS({ selItem: null, selAddons: [] }) }
    else { setPOS({ selItem: item, selAddons: [], qty: 1 }) }
  }

  const toggleAddon = (addon: Addon) => {
    const exists = ps.selAddons.find(a => a.id === addon.id)
    setPOS({ selAddons: exists ? ps.selAddons.filter(a => a.id !== addon.id) : [...ps.selAddons, addon] })
  }

  const checkout = () => {
    if (!ps.selItem) { toast('Select an item first', 'warn'); return }
    if (!currentUser) return

    const customer = activeModule === 'carwash'
      ? `${ps.plate || 'Unknown'}${ps.selTable ? ` · ${ps.selTable}` : ''}`
      : (ps.selTable ? `Table ${ps.selTable}` : ps.customerName || 'Walk-in')

    const tx: Transaction = {
      id: Date.now(),
      ts: new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit' }) + ' ' +
          new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }),
      mod: activeModule,
      cashier: currentUser.name,
      userId:  currentUser.id,
      customer,
      item:    `${ps.selItem.name}${ps.qty > 1 ? ` ×${ps.qty}` : ''}`,
      addons:  ps.selAddons.map(a => a.name),
      sub:     calc.sub,
      disc:    calc.disc,
      tax:     calc.gct + calc.legacyTax,
      total:   calc.total,
      pay:     ps.payMethod,
      orderType:    ps.orderType,
      gct:          calc.gct,
      serviceCharge: calc.serviceCharge,
      note:    ps.note,
    }

    dispatch({ type: 'ADD_TRANSACTION', tx })
    audit('CHECKOUT', `${tx.item} — ${fmt(tx.total, sym)}`)
    toast(`✓ Sale complete — ${fmt(tx.total, sym)}`, 'success')
    setPOS({ selItem: null, selAddons: [], qty: 1, note: '', selTable: null, customerName: '', plate: '' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Carwash toolbar (bay, plate, tabs) ── */}
      {activeModule === 'carwash' && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg2)' }}>
          {/* Tab switcher */}
          {(['pos','orders'] as const).map(t => (
            <button key={t} onClick={() => setCwTab(t)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${cwTab === t ? 'transparent' : 'var(--bdr)'}`,
              background: cwTab === t ? 'var(--blue)' : 'transparent',
              color: cwTab === t ? '#fff' : 'var(--txt2)',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .12s', minHeight: 36,
            }}>
              {t === 'pos' ? '🛒 New Sale' : '📋 Outside Orders'}
              {t === 'orders' && pendingCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 800, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}

          {/* Bay selector + plate input (POS tab only) */}
          {cwTab === 'pos' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={ps.selTable ?? ''}
                onChange={e => setPOS({ selTable: e.target.value || null })}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minWidth: 110 }}
              >
                <option value="">— Bay —</option>
                {(mod.bays as string[])?.map((b: string) => (
                  <option key={b} value={b}>{b} {mod.bayStatus?.[b] === 'occupied' ? '🔴' : '🟢'}</option>
                ))}
              </select>
              <input
                value={ps.plate}
                onChange={e => setPOS({ plate: e.target.value.toUpperCase() })}
                placeholder="PLATE-000"
                maxLength={10}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12, fontWeight: 700, width: 105, fontFamily: 'var(--mono)', letterSpacing: 1 }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Outside orders panel ── */}
      {activeModule === 'carwash' && cwTab === 'orders' ? (
        <OutsideOrders onCountChange={setPendingCount} />
      ) : (

        /* ── Main POS grid ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 268px 308px', flex: 1, overflow: 'hidden' }}>

          {/* Col 1 — Item browser */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--bdr)' }}>
            {/* Category tabs */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
              {cats.map((cat: string) => (
                <button key={cat} onClick={() => setPOS({ cat })} style={{
                  padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', border: `1.5px solid ${ps.cat === cat ? 'transparent' : 'var(--bdr)'}`,
                  color: ps.cat === cat ? '#fff' : 'var(--txt2)', whiteSpace: 'nowrap', minHeight: 40,
                  background: ps.cat === cat ? mod.color : 'transparent', transition: 'all .12s',
                }}>{cat}</button>
              ))}
            </div>

            {/* Item grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {filteredItems.map((item: MenuItem) => {
                  const selected = ps.selItem?.id === item.id
                  return (
                    <div key={item.id} onClick={() => toggleItem(item)} style={{
                      background: item.gradient ?? 'var(--surf)',
                      border: `2px solid ${selected ? mod.color : 'var(--bdr)'}`,
                      borderRadius: 'var(--r3)', cursor: 'pointer', position: 'relative',
                      overflow: 'hidden', transition: 'all .18s', minHeight: 160,
                      display: 'flex', flexDirection: 'column',
                      boxShadow: selected ? `0 0 0 3px ${mod.color}40` : undefined,
                    }}>
                      <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 40%,rgba(0,0,0,.5))', zIndex: 1 }} />
                        <span style={{ fontSize: 44, zIndex: 2, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.5))' }}>{item.emoji}</span>
                        {selected && (
                          <div style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%', background: mod.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', zIndex: 10 }}>✓</div>
                        )}
                        {item.duration && (
                          <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, zIndex: 2 }}>{item.duration}</div>
                        )}
                      </div>
                      <div style={{ padding: '10px 11px 11px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', lineHeight: 1.2 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.35, flex: 1 }}>{item.desc}</div>
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: '-.5px', color: item.accent ?? mod.color }}>{fmt(item.price, sym)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Col 2 — Add-ons */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--bdr)' }}>
            <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--bdr)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>Add-ons</span>
              {ps.selItem && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Qty</span>
                  <button onClick={() => setPOS({ qty: Math.max(1, ps.qty - 1) })} style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>−</button>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{ps.qty}</span>
                  <button onClick={() => setPOS({ qty: ps.qty + 1 })} style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>+</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {mod.addons.filter((a: Addon) => a.active).map((addon: Addon) => {
                const sel = ps.selAddons.find(a => a.id === addon.id)
                return (
                  <div key={addon.id} onClick={() => ps.selItem && toggleAddon(addon)} style={{
                    background: sel ? 'var(--surf2)' : 'var(--surf)',
                    border: `2px solid ${sel ? mod.color : 'var(--bdr)'}`,
                    borderRadius: 'var(--r)', padding: '12px 13px', cursor: ps.selItem ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', gap: 11, marginBottom: 8, transition: 'all .14s',
                    opacity: ps.selItem ? 1 : .5, minHeight: 58,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--surf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{addon.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{addon.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{addon.desc}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: addon.price === 0 ? 'var(--grn)' : 'var(--txt)' }}>
                      {addon.price === 0 ? 'Free' : `+${fmt(addon.price, sym)}`}
                    </div>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${sel ? mod.color : 'var(--bdr2)'}`, background: sel ? mod.color : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>{sel ? '✓' : ''}</div>
                  </div>
                )
              })}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 5 }}>Order Note</div>
                <textarea value={ps.note} onChange={e => setPOS({ note: e.target.value })}
                  placeholder="Special instructions..."
                  style={{ width: '100%', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 12, color: 'var(--txt)', resize: 'none', minHeight: 60 }} />
              </div>
            </div>
          </div>

          {/* Col 3 — Order summary + checkout */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>Order Summary</div>
              {activeModule === 'carwash' && (ps.plate || ps.selTable) && (
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3, display: 'flex', gap: 10 }}>
                  {ps.plate    && <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>🚗 {ps.plate}</span>}
                  {ps.selTable && <span>📍 {ps.selTable}</span>}
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              {!ps.selItem ? (
                <div style={{ textAlign: 'center', padding: '28px 10px', color: 'var(--txt3)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8, opacity: .4 }}>🧾</div>
                  <div style={{ fontSize: 12 }}>No items selected</div>
                </div>
              ) : (
                <div style={{ background: 'var(--surf)', borderRadius: 'var(--r)', padding: '11px 12px', marginBottom: 7, display: 'flex', gap: 9 }}>
                  <div style={{ width: 4, borderRadius: 4, background: mod.color, alignSelf: 'stretch', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>
                      {ps.selItem.name} {ps.qty > 1 && <span style={{ color: 'var(--txt3)' }}>×{ps.qty}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{fmt(ps.selItem.price, sym)} each</div>
                    {ps.selAddons.map(a => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: '1px solid var(--bdr)', fontSize: 12 }}>
                        <span style={{ fontSize: 13 }}>{a.icon}</span>
                        <span style={{ flex: 1, color: 'var(--txt2)' }}>{a.name}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>+{fmt(a.price, sym)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Totals + payment */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--bdr)', background: 'var(--bg3)', flexShrink: 0 }}>
              {([
                { label: 'Subtotal',                                         value: fmt(calc.sub, sym) },
                calc.disc > 0           && { label: 'Discount',              value: `-${fmt(calc.disc, sym)}` },
                calc.gct > 0            && { label: `GCT (${(calc.gctRate*100).toFixed(0)}%)`, value: fmt(calc.gct, sym) },
                calc.serviceCharge > 0  && { label: `Service (${(calc.scRate*100).toFixed(0)}%)`, value: fmt(calc.serviceCharge, sym) },
                calc.legacyTax > 0      && { label: 'Tax',                   value: fmt(calc.legacyTax, sym) },
              ].filter(Boolean) as { label: string; value: string }[]).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: 'var(--txt3)' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--txt2)', fontFamily: 'var(--mono)' }}>{row.value}</span>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', fontSize: 18, fontWeight: 800 }}>
                <span style={{ color: 'var(--txt)' }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--mono)', color: mod.color }}>{fmt(calc.total, sym)}</span>
              </div>

              {/* Payment method */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, margin: '10px 0' }}>
                {[['cash','💵','Cash'],['card','💳','Card'],['tab','📑','Tab'],['qr','📱','QR Pay']].map(([key, ic, lbl]) => (
                  <button key={key} onClick={() => setPOS({ payMethod: key })} style={{
                    padding: '13px 4px', borderRadius: 'var(--r)',
                    border: `2px solid ${ps.payMethod === key ? 'var(--blue)' : 'var(--bdr2)'}`,
                    background: ps.payMethod === key ? 'var(--blue-bg)' : 'var(--surf)',
                    color: ps.payMethod === key ? 'var(--blue)' : 'var(--txt2)',
                    fontSize: 12, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    cursor: 'pointer', transition: 'all .12s', minHeight: 60,
                  }}>
                    <span style={{ fontSize: 16 }}>{ic}</span>
                    <span style={{ fontSize: 10 }}>{lbl}</span>
                  </button>
                ))}
              </div>

              {/* Checkout */}
              <button onClick={checkout} disabled={!ps.selItem} style={{
                width: '100%', padding: 16, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
                color: mod.cobText, background: ps.selItem ? mod.color : 'var(--surf3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                cursor: ps.selItem ? 'pointer' : 'not-allowed', border: 'none', transition: 'all .15s', minHeight: 54,
              }}>
                ✓ Charge {ps.selItem ? fmt(calc.total, sym) : '—'}
              </button>

              <button onClick={() => setPOS({ selItem: null, selAddons: [], qty: 1, note: '', selTable: null, customerName: '', plate: '' })} style={{
                width: '100%', padding: 10, borderRadius: 'var(--r2)', fontSize: 12.5, fontWeight: 700,
                background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', marginTop: 7,
                cursor: 'pointer', transition: 'all .12s', minHeight: 42,
              }}>
                🗑 Clear Order
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
