'use client'
import React, { useState, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { OrderCalc, PaymentEntry, Surcharge, SurchargeType } from '@/types'

const SURCHARGE_LABELS: Record<SurchargeType, string> = {
  credit_card_fee: 'Credit Card Fee',
  service_charge:  'Service Charge',
  delivery_fee:    'Delivery Fee',
  other:           'Other',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  calc: OrderCalc
  gratuityPct: number
  onGratuityChange: (pct: number) => void
  isManager: boolean
  sym: string
  selTable: string | null
  guestCount: number
  customerName: string
  surcharges: Surcharge[]
  onSurchargesChange: (s: Surcharge[]) => void
  onComplete: (data: { method: string; tender?: number; changeDue?: number; payments?: PaymentEntry[] }) => void
}

type Step = 'choose' | 'cash' | 'debit' | 'credit' | 'gift' | 'tab' | 'split'

const QUICK_AMTS = [500, 1000, 2000, 5000, 10000, 20000]

const PAYMENT_METHODS = [
  { key: 'cash',   label: 'Cash',          icon: '💵', color: 'var(--grn)'  },
  { key: 'debit',  label: 'Debit Card',    icon: '💳', color: 'var(--blue)' },
  { key: 'credit', label: 'Credit Card',   icon: '💳', color: 'var(--pur)'  },
  { key: 'gift',   label: 'Gift Card',     icon: '🎁', color: 'var(--ora)'  },
  { key: 'tab',    label: 'House Account', icon: '📋', color: '#94a3b8'     },
]

const SPLIT_METHODS = [
  { value: 'cash',     label: 'Cash' },
  { value: 'debit',    label: 'Debit Card' },
  { value: 'credit',   label: 'Credit Card' },
  { value: 'gift_card',label: 'Gift Card' },
  { value: 'tab',      label: 'House Account' },
]

export default function PaymentModal({
  isOpen, onClose, calc, gratuityPct, onGratuityChange, isManager,
  sym, selTable, guestCount, customerName,
  surcharges, onSurchargesChange, onComplete,
}: Props) {
  const [step, setStep]             = useState<Step>('choose')
  const [submitting, setSubmitting] = useState(false)
  const [giftCardNumber, setGiftCardNumber] = useState('')
  const [tender, setTender]         = useState('')
  const [splits, setSplits]         = useState<{ method: string; amount: string }[]>([{ method: 'cash', amount: '' }])

  const [showCustomGrat,  setShowCustomGrat]  = useState(false)
  const [customGratInput, setCustomGratInput] = useState('')
  const [showAddSurcharge,    setShowAddSurcharge]    = useState(false)
  const [newSurchargeType,    setNewSurchargeType]    = useState<SurchargeType>('credit_card_fee')
  const [newSurchargeDesc,    setNewSurchargeDesc]    = useState('')
  const [newSurchargeAmtType, setNewSurchargeAmtType] = useState<'percentage' | 'fixed'>('percentage')
  const [newSurchargeValue,   setNewSurchargeValue]   = useState('')

  const { dispatch: appDispatch, state: appState, toast: appToast } = useApp()

  const changeGratuity = useCallback((newPct: number) => {
    if (isManager) {
      appDispatch({
        type: 'ADD_AUDIT',
        entry: {
          id: String(Date.now()),
          ts: new Date().toISOString(),
          user: appState.currentUser?.name ?? 'Manager',
          userId: appState.currentUser?.id ?? '',
          action: newPct === 0 ? 'Gratuity Removed' : ('Gratuity Set to ' + newPct + '%'),
          detail: selTable ? ('Table ' + selTable) : (customerName || 'Current order'),
          type: 'warn',
          mod: 'restaurant',
        },
      })
    }
    onGratuityChange(newPct)
  }, [appDispatch, appState.currentUser, isManager, selTable, customerName, onGratuityChange])

  const total     = calc.total
  const fmtN      = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const tenderNum = parseFloat(tender) || 0
  const changeNum = Math.max(0, tenderNum - total)

  const reset = useCallback(() => {
    setStep('choose'); setSubmitting(false); setTender(''); setGiftCardNumber('')
    setSplits([{ method: 'cash', amount: '' }])
    setShowCustomGrat(false); setCustomGratInput('')
    setShowAddSurcharge(false); setNewSurchargeType('credit_card_fee')
    setNewSurchargeDesc(''); setNewSurchargeAmtType('percentage'); setNewSurchargeValue('')
  }, [])

  const handleClose = () => { reset(); onClose() }

  const finish = (data: { method: string; tender?: number; changeDue?: number; payments?: PaymentEntry[] }) => {
    if (submitting) return
    setSubmitting(true)
    onComplete(data)
    if ((data.method === 'cash' || data.method === 'split') && (data.changeDue ?? 0) > 0.005) {
      appToast(`Change due: ${fmtN(data.changeDue!)}`, 'info')
    }
    handleClose()
  }

  const pressKey = (k: string) => {
    setTender(prev => {
      if (k === 'C') return ''
      if (k === '00') return prev === '' ? '' : prev + '00'
      if (k === '.' && prev.includes('.')) return prev
      const parts = (prev + '').split('.')
      if (parts.length === 2 && parts[1].length >= 2 && k !== '.') return prev
      return prev + k
    })
  }

  const splitTotal     = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const splitRemaining = Math.max(0, total - splitTotal)

  const addSurcharge = () => {
    const val = parseFloat(newSurchargeValue)
    if (!newSurchargeDesc.trim() || !val || val <= 0) return
    onSurchargesChange([...surcharges, {
      id: crypto.randomUUID(), type: newSurchargeType,
      description: newSurchargeDesc.trim(), amountType: newSurchargeAmtType, value: val,
    }])
    setNewSurchargeType('credit_card_fee'); setNewSurchargeDesc('')
    setNewSurchargeAmtType('percentage'); setNewSurchargeValue('')
    setShowAddSurcharge(false)
  }

  if (!isOpen) return null

  // ── Shared styles ─────────────────────────────────────────────
  const over: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }
  const box: React.CSSProperties = {
    background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)',
    width: '100%', maxWidth: 420, maxHeight: '92vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
  }
  const hdr: React.CSSProperties = {
    padding: '14px 18px', borderBottom: '1px solid var(--bdr)',
    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
  }
  const backBtn = (cb: () => void) => (
    <button onClick={cb} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>‹</button>
  )
  const closeBtn = (
    <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 22, lineHeight: 1, marginLeft: 'auto' }}>×</button>
  )
  const summaryRow = (label: string, value: string, opts?: { color?: string; bold?: boolean; large?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <span style={{ fontSize: opts?.large ? 16 : 12, color: opts?.color ?? 'var(--txt3)', fontWeight: opts?.bold ? 800 : 400 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: opts?.large ? 20 : 12, fontWeight: opts?.bold ? 800 : 600, color: opts?.color ?? 'var(--txt2)' }}>{value}</span>
    </div>
  )

  const OrderSummary = () => (
    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)', flexShrink: 0 }}>
      {summaryRow('Subtotal', fmtN(calc.sub))}
      {calc.disc > 0 && summaryRow('Discount', `−${fmtN(calc.disc)}`, { color: 'var(--grn)' })}
      {calc.gct > 0 && summaryRow(`GCT (${(calc.gctRate * 100).toFixed(0)}%)`, fmtN(calc.gct))}
      {calc.serviceCharge > 0 && summaryRow(`Service (${(calc.scRate * 100).toFixed(0)}%)`, fmtN(calc.serviceCharge))}
      {calc.gratuity > 0 && summaryRow(`Gratuity (${gratuityPct}%)`, fmtN(calc.gratuity))}
      {surcharges.map(s => {
        const amt = s.amountType === 'percentage' ? calc.taxableBase * s.value / 100 : s.value
        return <div key={s.id}>{summaryRow(`${SURCHARGE_LABELS[s.type]}: ${s.description}${s.amountType === 'percentage' ? ` (${s.value}%)` : ''}`, fmtN(amt), { color: 'var(--ora)' })}</div>
      })}
      <div style={{ borderTop: '1px solid var(--bdr)', marginTop: 8, paddingTop: 8 }}>
        {summaryRow('TOTAL', fmtN(total), { bold: true, large: true, color: 'var(--blue)' })}
      </div>
    </div>
  )

  const gratuityPanel = (calc.orderType === 'dine-in' || gratuityPct > 0) ? (
    <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isManager ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Gratuity</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: gratuityPct > 0 ? 'var(--txt2)' : 'var(--txt3)', fontWeight: 600 }}>
          {gratuityPct > 0 ? `${gratuityPct}% · ${fmtN(calc.gratuity)}` : 'None'}
        </span>
      </div>
      {isManager && !showCustomGrat && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {gratuityPct > 0 && (
            <button onClick={() => changeGratuity(0)} style={{ padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid #ef444444', background: '#ef444411', color: '#ef4444' }}>Remove</button>
          )}
          {([10, 15, 18] as const).map(pct => (
            <button key={pct} onClick={() => changeGratuity(pct)} style={{ padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${gratuityPct === pct ? 'var(--blue)' : 'var(--bdr)'}`, background: gratuityPct === pct ? 'var(--blue-bg, #1e40af22)' : 'var(--surf)', color: gratuityPct === pct ? 'var(--blue)' : 'var(--txt2)' }}>{pct}%</button>
          ))}
          <button onClick={() => { setCustomGratInput(String(gratuityPct || '')); setShowCustomGrat(true) }} style={{ padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)' }}>Custom</button>
        </div>
      )}
      {isManager && showCustomGrat && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 4 }}>
          <input type="number" min={0} max={50} value={customGratInput} onChange={e => setCustomGratInput(e.target.value)} placeholder="e.g. 12" autoFocus
            style={{ flex: 1, background: 'var(--surf2)', border: '1.5px solid var(--blue)', borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 13, color: 'var(--txt)' }} />
          <span style={{ fontSize: 12, color: 'var(--txt3)' }}>%</span>
          <button onClick={() => { const v = parseFloat(customGratInput); if (v >= 0) changeGratuity(v); setShowCustomGrat(false) }} style={{ padding: '6px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--blue)', color: '#fff', border: 'none' }}>Apply</button>
          <button onClick={() => setShowCustomGrat(false)} style={{ padding: '6px 10px', borderRadius: 'var(--r)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)' }}>✕</button>
        </div>
      )}
    </div>
  ) : null

  const surchargePanel = (
    <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: surcharges.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Surcharges</span>
        {!showAddSurcharge && (
          <button onClick={() => setShowAddSurcharge(true)} style={{ padding: '4px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)' }}>+ Add</button>
        )}
      </div>
      {surcharges.map(s => {
        const amt = s.amountType === 'percentage' ? calc.taxableBase * s.value / 100 : s.value
        return (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--txt2)', flex: 1, marginRight: 8 }}>
              {SURCHARGE_LABELS[s.type]}: {s.description}
              {s.amountType === 'percentage' && <span style={{ color: 'var(--txt3)', fontSize: 11 }}> ({s.value}%)</span>}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--ora)', marginRight: 6 }}>{fmtN(amt)}</span>
            <button onClick={() => onSurchargesChange(surcharges.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
        )
      })}
      {showAddSurcharge && (
        <div style={{ marginTop: surcharges.length > 0 ? 8 : 0, padding: '10px 12px', borderRadius: 'var(--r3)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <select value={newSurchargeType} onChange={e => setNewSurchargeType(e.target.value as SurchargeType)}
            style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 8px', fontSize: 12, color: 'var(--txt)' }}>
            <option value="credit_card_fee">Credit Card Fee</option>
            <option value="service_charge">Service Charge</option>
            <option value="delivery_fee">Delivery Fee</option>
            <option value="other">Other</option>
          </select>
          <input type="text" value={newSurchargeDesc} onChange={e => setNewSurchargeDesc(e.target.value)} placeholder="Description (required)"
            style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 10px', fontSize: 12, color: 'var(--txt)' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={newSurchargeAmtType} onChange={e => setNewSurchargeAmtType(e.target.value as 'percentage' | 'fixed')}
              style={{ flex: '0 0 120px', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 8px', fontSize: 12, color: 'var(--txt)' }}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount</option>
            </select>
            <input type="number" min={0} step="0.01" value={newSurchargeValue} onChange={e => setNewSurchargeValue(e.target.value)}
              placeholder={newSurchargeAmtType === 'percentage' ? '0%' : '0.00'}
              style={{ flex: 1, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 10px', fontSize: 12, color: 'var(--txt)' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={addSurcharge} disabled={!newSurchargeDesc.trim() || !newSurchargeValue} style={{
              flex: 1, padding: '8px 0', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: newSurchargeDesc.trim() && newSurchargeValue ? 'var(--blue)' : 'var(--surf3)',
              color: newSurchargeDesc.trim() && newSurchargeValue ? '#fff' : 'var(--txt3)', border: 'none',
            }}>Add Surcharge</button>
            <button onClick={() => setShowAddSurcharge(false)} style={{ padding: '8px 12px', borderRadius: 'var(--r)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Method selection ──────────────────────────────────────────
  if (step === 'choose') {
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Process Payment</div>
              {(selTable || customerName || guestCount > 1) && (
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                  {selTable ? `Table ${selTable}` : ''}{guestCount > 1 ? ` · ${guestCount} guests` : ''}{customerName ? ` · ${customerName}` : ''}
                </div>
              )}
            </div>
            {closeBtn}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <OrderSummary />
            {gratuityPanel}
            {surchargePanel}
            <div style={{ padding: '16px 18px' }}>
              {calc.orderType === 'delivery' && !surcharges.some(s => s.type === 'delivery_fee') && (
                <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 'var(--r3)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--ora)', flex: 1 }}>No delivery fee added</span>
                  {[500, 1000, 1500].map(amt => (
                    <button key={amt} onClick={() => onSurchargesChange([...surcharges, { id: crypto.randomUUID(), type: 'delivery_fee' as const, description: 'Delivery', amountType: 'fixed' as const, value: amt }])}
                      style={{ padding: '4px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)' }}>
                      +{sym}{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Select Payment Method</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                {PAYMENT_METHODS.map(({ key, label, icon, color }) => (
                  <button key={key} onClick={() => setStep(key as Step)} style={{
                    padding: '16px 10px', borderRadius: 'var(--r3)',
                    border: `2px solid ${color}44`, background: `${color}11`,
                    color: 'var(--txt)', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    fontWeight: 700, fontSize: 12, transition: 'all .12s',
                  }}>
                    <span style={{ fontSize: 24 }}>{icon}</span>
                    <span style={{ color }}>{label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep('split')} style={{
                width: '100%', padding: '13px 12px', borderRadius: 'var(--r3)',
                border: '2px dashed var(--bdr)', background: 'transparent', color: 'var(--txt2)',
                cursor: 'pointer', fontWeight: 700, fontSize: 13,
              }}>
                + Split / Multi-Tender Payment
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Cash ──────────────────────────────────────────────────────
  if (step === 'cash') {
    const tenderOk = tenderNum >= total - 0.005
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            {backBtn(() => { setTender(''); setStep('choose') })}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Cash Payment</span>
            {closeBtn}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ padding: '12px 18px', background: 'var(--bg3)', borderBottom: '1px solid var(--bdr)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Total Due</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: 'var(--txt)' }}>{fmtN(total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: tenderOk ? 8 : 0 }}>
                <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Cash Received</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: tenderOk ? 'var(--grn)' : tenderNum > 0 ? 'var(--ora)' : 'var(--txt3)' }}>
                  {tenderNum > 0 ? fmtN(tenderNum) : '—'}
                </span>
              </div>
              {tenderOk && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #16a34a44' }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--grn)' }}>Change Due</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 28, color: 'var(--grn)' }}>{fmtN(changeNum)}</span>
                </div>
              )}
            </div>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => setTender(total.toFixed(2))}
                style={{ padding: '7px 14px', borderRadius: 'var(--r)', border: `1.5px solid ${tenderNum === total ? 'var(--blue)' : 'var(--bdr)'}`, background: tenderNum === total ? 'var(--blue-bg)' : 'var(--surf)', color: tenderNum === total ? 'var(--blue)' : 'var(--txt2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Exact
              </button>
              {QUICK_AMTS.filter(a => a >= Math.floor(total)).map(a => (
                <button key={a} onClick={() => setTender(String(a))}
                  style={{ padding: '7px 14px', borderRadius: 'var(--r)', border: `1.5px solid ${tenderNum === a ? 'var(--blue)' : 'var(--bdr)'}`, background: tenderNum === a ? 'var(--blue-bg)' : 'var(--surf)', color: tenderNum === a ? 'var(--blue)' : 'var(--txt2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {a >= 1000 ? `${(a / 1000).toFixed(0)}K` : a}
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 18px', background: 'var(--surf2)', borderBottom: '1px solid var(--bdr)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 800, color: 'var(--txt)', textAlign: 'right', minHeight: 40 }}>
                {sym}{tender || '0'}
              </div>
            </div>
            <div style={{ padding: '10px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {['7','8','9','4','5','6','1','2','3','0','00','C'].map(k => (
                <button key={k} onClick={() => pressKey(k)} style={{
                  padding: '13px 0', borderRadius: 'var(--r)', border: '1px solid var(--bdr)',
                  background: k === 'C' ? '#7f1d1d22' : 'var(--surf)',
                  color: k === 'C' ? '#ef4444' : 'var(--txt)',
                  fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, cursor: 'pointer',
                }}>{k}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: '10px 18px 16px', flexShrink: 0, borderTop: '1px solid var(--bdr)' }}>
            <button onClick={() => finish({ method: 'cash', tender: tenderNum, changeDue: changeNum })} disabled={!tenderOk} style={{
              width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
              background: tenderOk ? 'var(--grn)' : 'var(--surf3)',
              color: tenderOk ? '#fff' : 'var(--txt3)',
              border: 'none', cursor: tenderOk ? 'pointer' : 'not-allowed',
            }}>
              {tenderOk ? `Complete — Change ${fmtN(changeNum)}` : `Need ${fmtN(Math.max(0, total - tenderNum))} more`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Debit / Credit Card ───────────────────────────────────────
  if (step === 'debit' || step === 'credit') {
    const isDebit = step === 'debit'
    const cardLabel = isDebit ? 'Debit Card' : 'Credit Card'
    const cardColor = isDebit ? 'var(--blue)' : 'var(--pur)'
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            {backBtn(() => setStep('choose'))}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>{cardLabel}</span>
            {closeBtn}
          </div>
          <OrderSummary />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 52 }}>💳</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Run {cardLabel} on terminal</div>
            <div style={{ background: `${cardColor}15`, border: `2px solid ${cardColor}44`, borderRadius: 'var(--r3)', padding: '16px 32px' }}>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Amount to charge</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 800, color: cardColor }}>{fmtN(total)}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', maxWidth: 260 }}>
              Charge {fmtN(total)} on your card terminal, then tap Confirm once approved.
            </div>
          </div>
          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button onClick={() => finish({ method: step })} disabled={submitting} style={{
              width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
              background: cardColor, color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              Confirm {cardLabel} — {fmtN(total)}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Gift Card ─────────────────────────────────────────────────
  if (step === 'gift') {
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            {backBtn(() => setStep('choose'))}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Gift Card</span>
            {closeBtn}
          </div>
          <OrderSummary />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '24px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 52 }}>🎁</div>
            <div style={{ fontSize: 14, color: 'var(--txt3)' }}>Swipe or scan gift card</div>
            <input type="text" placeholder="Gift Card Number (required)" value={giftCardNumber}
              onChange={e => setGiftCardNumber(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 14, boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button disabled={!giftCardNumber.trim() || submitting} onClick={() => finish({ method: 'gift_card' })} style={{
              width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
              background: giftCardNumber.trim() ? 'var(--ora)' : 'var(--surf3)',
              color: giftCardNumber.trim() ? '#fff' : 'var(--txt3)',
              border: 'none', cursor: giftCardNumber.trim() ? 'pointer' : 'not-allowed',
            }}>
              Complete Gift Card Payment
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── House Account ─────────────────────────────────────────────
  if (step === 'tab') {
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            {backBtn(() => setStep('choose'))}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>House Account</span>
            {closeBtn}
          </div>
          <OrderSummary />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '28px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 52 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Charge to Account</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', maxWidth: 280, lineHeight: 1.6 }}>
              For customer charge accounts, corporate accounts, staff accounts, and accounts receivable.
            </div>
            <div style={{ background: '#94a3b815', border: '2px solid #94a3b844', borderRadius: 'var(--r3)', padding: '14px 32px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 800, color: '#94a3b8' }}>{fmtN(total)}</div>
            </div>
          </div>
          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button onClick={() => finish({ method: 'tab' })} disabled={submitting} style={{
              width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
              background: '#475569', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              Confirm — Charge to Account
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Split / Multi-Tender ──────────────────────────────────────
  if (step === 'split') {
    const splitChangeDue = Math.max(0, splitTotal - total)
    const paid = splitRemaining <= 0.01
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            {backBtn(() => { setSplits([{ method: 'cash', amount: '' }]); setStep('choose') })}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Split / Multi-Tender</span>
            {closeBtn}
          </div>

          {/* Running totals */}
          <div style={{ padding: '12px 18px', background: 'var(--bg3)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
            {summaryRow('Total Due', fmtN(total), { bold: true, color: 'var(--blue)' })}
            {splitTotal > 0 && summaryRow('Payments Applied', fmtN(Math.min(splitTotal, total)), { color: 'var(--grn)' })}
            {splitChangeDue > 0.005 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '2px solid #16a34a44' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--grn)' }}>Change Due</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 24, color: 'var(--grn)' }}>{fmtN(splitChangeDue)}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: paid ? 'var(--grn)' : 'var(--ora)' }}>
                  {paid ? '✓ Paid in Full' : 'Remaining'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 24, color: paid ? 'var(--grn)' : 'var(--ora)' }}>
                  {paid ? '' : fmtN(splitRemaining)}
                </span>
              </div>
            )}
          </div>

          {/* Payment rows */}
          <div style={{ padding: '12px 18px', flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {splits.map((sp, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={sp.method}
                  onChange={e => setSplits(prev => prev.map((p, j) => j === i ? { ...p, method: e.target.value } : p))}
                  style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 8px', fontSize: 12, color: 'var(--txt)', flex: '0 0 134px' }}>
                  {SPLIT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input type="number" min={0} step="0.01" value={sp.amount}
                  onChange={e => setSplits(prev => prev.map((p, j) => j === i ? { ...p, amount: e.target.value } : p))}
                  placeholder="Amount"
                  style={{ flex: 1, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px', fontSize: 13, color: 'var(--txt)' }} />
                {splits.length > 1 && (
                  <button onClick={() => setSplits(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, padding: '0 4px' }}>×</button>
                )}
              </div>
            ))}
            <button
              onClick={() => setSplits(prev => [...prev, {
                method: 'cash',
                amount: splitRemaining > 0.005 ? splitRemaining.toFixed(2) : '',
              }])}
              style={{ padding: '9px 0', borderRadius: 'var(--r)', border: '1.5px dashed var(--bdr)', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              + Add Payment Method
            </button>
          </div>

          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button
              onClick={() => {
                if (!paid || submitting) return
                const payments: PaymentEntry[] = splits
                  .filter(p => parseFloat(p.amount) > 0)
                  .map(p => ({ method: p.method, amount: parseFloat(p.amount) }))
                const method = payments.length === 1 ? payments[0].method : 'split'
                finish({ method, payments, changeDue: splitChangeDue > 0.005 ? splitChangeDue : undefined })
              }}
              disabled={!paid}
              style={{
                width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
                background: paid ? 'var(--grn)' : 'var(--surf3)',
                color: paid ? '#fff' : 'var(--txt3)',
                border: 'none', cursor: paid ? 'pointer' : 'not-allowed',
              }}>
              {paid ? 'Complete Payment' : `Remaining: ${fmtN(splitRemaining)}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
