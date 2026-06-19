'use client'
import { useState, useCallback } from 'react'
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

type Step = 'choose' | 'cash' | 'card' | 'gift' | 'tab' | 'split' | 'success'

const QUICK_AMTS = [500, 1000, 2000, 5000, 10000, 20000]

export default function PaymentModal({
  isOpen, onClose, calc, gratuityPct, onGratuityChange, isManager,
  sym, selTable, guestCount, customerName,
  surcharges, onSurchargesChange, onComplete,
}: Props) {
  const [step, setStep]               = useState<Step>('choose')
  const [submitting, setSubmitting]   = useState(false)
  const [tender, setTender]           = useState('')
  const [cardProcessing, setCardProcessing] = useState(false)
  const [cardDone, setCardDone]       = useState(false)
  const [splits, setSplits]           = useState<{ method: string; amount: string }[]>([{ method: 'cash', amount: '' }])
  const [successData, setSuccessData] = useState<{ method: string; tender?: number; changeDue?: number; payments?: PaymentEntry[] } | null>(null)

  // Gratuity custom input
  const [showCustomGrat,  setShowCustomGrat]  = useState(false)
  const [customGratInput, setCustomGratInput] = useState('')

  // Surcharge form
  const [showAddSurcharge,    setShowAddSurcharge]    = useState(false)
  const [newSurchargeType,    setNewSurchargeType]    = useState<SurchargeType>('credit_card_fee')
  const [newSurchargeDesc,    setNewSurchargeDesc]    = useState('')
  const [newSurchargeAmtType, setNewSurchargeAmtType] = useState<'percentage' | 'fixed'>('percentage')
  const [newSurchargeValue,   setNewSurchargeValue]   = useState('')

  const total    = calc.total
  const fmtN     = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const tenderNum = parseFloat(tender) || 0
  const changeNum = Math.max(0, tenderNum - total)

  const reset = useCallback(() => {
    setStep('choose')
    setSubmitting(false)
    setTender('')
    setCardProcessing(false)
    setCardDone(false)
    setSplits([{ method: 'cash', amount: '' }])
    setSuccessData(null)
    setShowCustomGrat(false)
    setCustomGratInput('')
    setShowAddSurcharge(false)
    setNewSurchargeType('credit_card_fee')
    setNewSurchargeDesc('')
    setNewSurchargeAmtType('percentage')
    setNewSurchargeValue('')
  }, [])

  const handleClose = () => { reset(); onClose() }

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

  const completeCash = () => {
    if (tenderNum < total || submitting) return
    setSubmitting(true)
    const data = { method: 'cash', tender: tenderNum, changeDue: changeNum }
    setSuccessData(data)
    setStep('success')
    onComplete(data)
  }

  const processCard = async () => {
    setCardProcessing(true)
    await new Promise(r => setTimeout(r, 1100))
    setCardProcessing(false)
    setCardDone(true)
  }

  const completeCard = () => {
    if (!cardDone || submitting) return
    setSubmitting(true)
    const data = { method: 'card' }
    setSuccessData(data)
    setStep('success')
    onComplete(data)
  }

  const splitTotal     = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const splitRemaining = Math.max(0, total - splitTotal)

  const completeSplit = () => {
    if (splitRemaining > 0.01 || submitting) return
    setSubmitting(true)
    const payments: PaymentEntry[] = splits
      .filter(p => parseFloat(p.amount) > 0)
      .map(p => ({ method: p.method, amount: parseFloat(p.amount) }))
    const primaryMethod = payments.length === 1 ? payments[0].method : 'split'
    const data = { method: primaryMethod, payments }
    setSuccessData(data)
    setStep('success')
    onComplete(data)
  }

  const addSurcharge = () => {
    const val = parseFloat(newSurchargeValue)
    if (!newSurchargeDesc.trim() || !val || val <= 0) return
    const s: Surcharge = {
      id: crypto.randomUUID(),
      type: newSurchargeType,
      description: newSurchargeDesc.trim(),
      amountType: newSurchargeAmtType,
      value: val,
    }
    onSurchargesChange([...surcharges, s])
    setNewSurchargeType('credit_card_fee')
    setNewSurchargeDesc('')
    setNewSurchargeAmtType('percentage')
    setNewSurchargeValue('')
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
        const label = `${SURCHARGE_LABELS[s.type]}: ${s.description}${s.amountType === 'percentage' ? ` (${s.value}%)` : ''}`
        return <div key={s.id}>{summaryRow(label, fmtN(amt), { color: 'var(--ora)' })}</div>
      })}
      <div style={{ borderTop: '1px solid var(--bdr)', marginTop: 8, paddingTop: 8 }}>
        {summaryRow('TOTAL', fmtN(total), { bold: true, large: true, color: 'var(--blue)' })}
      </div>
    </div>
  )

  // ── Gratuity panel (manager-controlled, dine-in or when gratuity active) ─
  const GratuityPanel = () => {
    const show = calc.orderType === 'dine-in' || gratuityPct > 0
    if (!show) return null
    return (
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isManager ? 8 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Gratuity
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: gratuityPct > 0 ? 'var(--txt2)' : 'var(--txt3)', fontWeight: 600 }}>
            {gratuityPct > 0 ? `${gratuityPct}% · ${fmtN(calc.gratuity)}` : 'None'}
          </span>
        </div>
        {isManager && !showCustomGrat && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {gratuityPct > 0 && (
              <button onClick={() => onGratuityChange(0)} style={{
                padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: '1.5px solid #ef444444', background: '#ef444411', color: '#ef4444',
              }}>Remove</button>
            )}
            {([10, 15, 18] as const).map(pct => (
              <button key={pct} onClick={() => onGratuityChange(pct)} style={{
                padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${gratuityPct === pct ? 'var(--blue)' : 'var(--bdr)'}`,
                background: gratuityPct === pct ? 'var(--blue-bg, #1e40af22)' : 'var(--surf)',
                color: gratuityPct === pct ? 'var(--blue)' : 'var(--txt2)',
              }}>{pct}%</button>
            ))}
            <button onClick={() => { setCustomGratInput(String(gratuityPct || '')); setShowCustomGrat(true) }} style={{
              padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)',
            }}>Custom</button>
          </div>
        )}
        {isManager && showCustomGrat && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 4 }}>
            <input
              type="number" min={0} max={50} value={customGratInput}
              onChange={e => setCustomGratInput(e.target.value)}
              placeholder="e.g. 12"
              autoFocus
              style={{ flex: 1, background: 'var(--surf2)', border: '1.5px solid var(--blue)', borderRadius: 'var(--r)', padding: '6px 10px', fontSize: 13, color: 'var(--txt)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--txt3)' }}>%</span>
            <button onClick={() => { const v = parseFloat(customGratInput); if (v >= 0) onGratuityChange(v); setShowCustomGrat(false) }} style={{
              padding: '6px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'var(--blue)', color: '#fff', border: 'none',
            }}>Apply</button>
            <button onClick={() => setShowCustomGrat(false)} style={{
              padding: '6px 10px', borderRadius: 'var(--r)', fontSize: 12, cursor: 'pointer',
              background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)',
            }}>✕</button>
          </div>
        )}
      </div>
    )
  }

  // ── Surcharge panel ───────────────────────────────────────────
  const SurchargePanel = () => (
    <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: surcharges.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Surcharges</span>
        {!showAddSurcharge && (
          <button onClick={() => setShowAddSurcharge(true)} style={{
            padding: '4px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)',
          }}>+ Add</button>
        )}
      </div>

      {surcharges.map(s => {
        const amt = s.amountType === 'percentage' ? calc.taxableBase * s.value / 100 : s.value
        return (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--txt2)', flex: 1, marginRight: 8 }}>
              {SURCHARGE_LABELS[s.type]}: {s.description}
              {s.amountType === 'percentage' ? <span style={{ color: 'var(--txt3)', fontSize: 11 }}> ({s.value}%)</span> : null}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--ora)', marginRight: 6 }}>{fmtN(amt)}</span>
            <button onClick={() => onSurchargesChange(surcharges.filter(x => x.id !== s.id))} style={{
              background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px',
            }}>×</button>
          </div>
        )
      })}

      {showAddSurcharge && (
        <div style={{ marginTop: surcharges.length > 0 ? 8 : 0, padding: '10px 12px', borderRadius: 'var(--r3)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={newSurchargeType} onChange={e => setNewSurchargeType(e.target.value as SurchargeType)}
              style={{ flex: 1, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 8px', fontSize: 12, color: 'var(--txt)' }}>
              <option value="credit_card_fee">Credit Card Fee</option>
              <option value="service_charge">Service Charge</option>
              <option value="delivery_fee">Delivery Fee</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input
            type="text" value={newSurchargeDesc}
            onChange={e => setNewSurchargeDesc(e.target.value)}
            placeholder="Description (required)"
            style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 10px', fontSize: 12, color: 'var(--txt)' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={newSurchargeAmtType} onChange={e => setNewSurchargeAmtType(e.target.value as 'percentage' | 'fixed')}
              style={{ flex: '0 0 120px', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 8px', fontSize: 12, color: 'var(--txt)' }}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount</option>
            </select>
            <input
              type="number" min={0} step="0.01" value={newSurchargeValue}
              onChange={e => setNewSurchargeValue(e.target.value)}
              placeholder={newSurchargeAmtType === 'percentage' ? '0%' : '0.00'}
              style={{ flex: 1, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '7px 10px', fontSize: 12, color: 'var(--txt)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={addSurcharge} disabled={!newSurchargeDesc.trim() || !newSurchargeValue} style={{
              flex: 1, padding: '8px 0', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: newSurchargeDesc.trim() && newSurchargeValue ? 'var(--blue)' : 'var(--surf3)',
              color: newSurchargeDesc.trim() && newSurchargeValue ? '#fff' : 'var(--txt3)',
              border: 'none',
            }}>Add Surcharge</button>
            <button onClick={() => setShowAddSurcharge(false)} style={{
              padding: '8px 12px', borderRadius: 'var(--r)', fontSize: 12, cursor: 'pointer',
              background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)',
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Success ───────────────────────────────────────────────────
  if (step === 'success' && successData) {
    return (
      <div style={over} onClick={handleClose}>
        <div style={{ ...box, alignItems: 'center', padding: 32, textAlign: 'center', gap: 0 }} onClick={e => e.stopPropagation()}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#14532d33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 14 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--grn)', marginBottom: 4 }}>Payment Complete</div>
          <div style={{ fontSize: 13, color: 'var(--txt3)', marginBottom: 24, textTransform: 'capitalize' }}>
            {successData.method === 'gift_card' ? 'Gift Card' : successData.method === 'tab' ? 'House Account' : successData.method}
          </div>

          {successData.tender != null && (
            <div style={{ width: '100%', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: 'var(--txt3)', fontSize: 13 }}>Order Total</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{fmtN(total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: 'var(--txt3)', fontSize: 13 }}>Tendered</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{fmtN(successData.tender)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--grn)' }}>Change Due</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 800, color: 'var(--grn)' }}>{fmtN(successData.changeDue ?? 0)}</span>
              </div>
            </div>
          )}

          {successData.payments && successData.payments.length > 1 && (
            <div style={{ width: '100%', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 16px', marginBottom: 20 }}>
              {successData.payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--txt3)', fontSize: 13, textTransform: 'capitalize' }}>{p.method}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtN(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleClose} style={{ width: '100%', padding: 14, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    )
  }

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
          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <OrderSummary />
            <GratuityPanel />
            <SurchargePanel />
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Select Payment Method</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {([
                  ['cash', 'Cash',          '💵', 'var(--grn)'],
                  ['card', 'Card',          '💳', 'var(--blue)'],
                  ['gift', 'Gift Card',     '🎁', 'var(--pur)'],
                  ['tab',  'House Account', '📋', 'var(--ora)'],
                ] as const).map(([key, lbl, icon, color]) => (
                  <button key={key} onClick={() => setStep(key as Step)} style={{
                    padding: '18px 12px', borderRadius: 'var(--r3)', border: `2px solid ${color}44`,
                    background: `${color}11`, color: 'var(--txt)', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    fontWeight: 700, fontSize: 13, transition: 'all .12s',
                  }}>
                    <span style={{ fontSize: 24 }}>{icon}</span>
                    <span style={{ color }}>{lbl}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep('split')} style={{
                width: '100%', padding: '13px 12px', borderRadius: 'var(--r3)',
                border: '2px dashed var(--bdr)', background: 'transparent', color: 'var(--txt2)',
                cursor: 'pointer', fontWeight: 700, fontSize: 13,
              }}>
                Split Tender — Multiple Methods
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

          {/* Live totals */}
          <div style={{ padding: '12px 18px', background: 'var(--bg3)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Order Total</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: 'var(--txt)' }}>{fmtN(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: tenderOk ? 6 : 0 }}>
              <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Tendered</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: tenderOk ? 'var(--grn)' : tenderNum > 0 ? 'var(--ora)' : 'var(--txt3)' }}>
                {tenderNum > 0 ? fmtN(tenderNum) : '—'}
              </span>
            </div>
            {tenderOk && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--grn)' }}>Change Due</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 22, color: 'var(--grn)' }}>{fmtN(changeNum)}</span>
              </div>
            )}
          </div>

          {/* Quick amounts */}
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
            <button onClick={() => setTender(total.toFixed(2))}
              style={{ padding: '7px 14px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Exact
            </button>
            {QUICK_AMTS.filter(a => a >= Math.floor(total)).map(a => (
              <button key={a} onClick={() => setTender(String(a))}
                style={{ padding: '7px 14px', borderRadius: 'var(--r)', border: `1.5px solid ${tenderNum === a ? 'var(--blue)' : 'var(--bdr)'}`, background: tenderNum === a ? 'var(--blue-bg)' : 'var(--surf)', color: tenderNum === a ? 'var(--blue)' : 'var(--txt2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {a >= 1000 ? `${(a / 1000).toFixed(0)}K` : a}
              </button>
            ))}
          </div>

          {/* Tender display */}
          <div style={{ padding: '10px 18px', background: 'var(--surf2)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 800, color: 'var(--txt)', textAlign: 'right', minHeight: 40 }}>
              {sym}{tender || '0'}
            </div>
          </div>

          {/* Keypad */}
          <div style={{ padding: '10px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, flexShrink: 0 }}>
            {['7','8','9','4','5','6','1','2','3','0','00','C'].map(k => (
              <button key={k} onClick={() => pressKey(k)} style={{
                padding: '15px 0', borderRadius: 'var(--r)', border: '1px solid var(--bdr)',
                background: k === 'C' ? '#7f1d1d22' : 'var(--surf)',
                color: k === 'C' ? '#ef4444' : 'var(--txt)',
                fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, cursor: 'pointer',
              }}>{k}</button>
            ))}
          </div>

          {/* Complete */}
          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button onClick={completeCash} disabled={!tenderOk} style={{
              width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
              background: tenderOk ? 'var(--grn)' : 'var(--surf3)',
              color: tenderOk ? '#fff' : 'var(--txt3)',
              border: 'none', cursor: tenderOk ? 'pointer' : 'not-allowed',
            }}>
              {tenderOk ? `Complete · Change ${fmtN(changeNum)}` : `Need ${fmtN(Math.max(0, total - tenderNum))} more`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Card ──────────────────────────────────────────────────────
  if (step === 'card') {
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            {backBtn(() => { setCardProcessing(false); setCardDone(false); setStep('choose') })}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Card Payment</span>
            {closeBtn}
          </div>
          <OrderSummary />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '24px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>💳</div>
            {!cardProcessing && !cardDone && <div style={{ fontSize: 14, color: 'var(--txt3)' }}>Present or swipe card to terminal</div>}
            {cardProcessing && <div style={{ fontSize: 14, color: 'var(--ora)', fontWeight: 700, animation: 'pulse 1s infinite' }}>Processing...</div>}
            {cardDone && <div style={{ fontSize: 15, color: 'var(--grn)', fontWeight: 800 }}>Approved ✓</div>}
          </div>
          <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            {!cardDone && (
              <button onClick={processCard} disabled={cardProcessing} style={{
                width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
                background: cardProcessing ? 'var(--surf3)' : 'var(--blue)',
                color: cardProcessing ? 'var(--txt3)' : '#fff',
                border: 'none', cursor: cardProcessing ? 'not-allowed' : 'pointer',
              }}>
                {cardProcessing ? 'Processing...' : 'Process Card'}
              </button>
            )}
            {cardDone && (
              <button onClick={completeCard} style={{
                width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
                background: 'var(--grn)', color: '#fff', border: 'none', cursor: 'pointer',
              }}>
                Complete Sale
              </button>
            )}
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
            <div style={{ fontSize: 48 }}>🎁</div>
            <div style={{ fontSize: 14, color: 'var(--txt3)' }}>Swipe or scan gift card</div>
          </div>
          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button onClick={() => {
              if (submitting) return
              setSubmitting(true)
              const data = { method: 'gift_card' }
              setSuccessData(data)
              setStep('success')
              onComplete(data)
            }} style={{ width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800, background: 'var(--pur)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Complete Gift Card Payment
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── House Account / Tab ───────────────────────────────────────
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '24px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>📋</div>
            <div style={{ fontSize: 14, color: 'var(--txt3)' }}>Charge to house account or open tab</div>
          </div>
          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button onClick={() => {
              if (submitting) return
              setSubmitting(true)
              const data = { method: 'tab' }
              setSuccessData(data)
              setStep('success')
              onComplete(data)
            }} style={{ width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800, background: 'var(--ora)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Charge to Account
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Split Tender ──────────────────────────────────────────────
  if (step === 'split') {
    return (
      <div style={over} onClick={handleClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={hdr}>
            {backBtn(() => { setSplits([{ method: 'cash', amount: '' }]); setStep('choose') })}
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Split Tender</span>
            {closeBtn}
          </div>
          <div style={{ padding: '12px 18px', background: 'var(--bg3)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
            {summaryRow('Bill Total', fmtN(total), { bold: true })}
            {summaryRow('Paid', fmtN(splitTotal))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 13, color: splitRemaining > 0.01 ? 'var(--ora)' : 'var(--grn)', fontWeight: 700 }}>Remaining</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, color: splitRemaining > 0.01 ? 'var(--ora)' : 'var(--grn)' }}>{fmtN(splitRemaining)}</span>
            </div>
          </div>
          <div style={{ padding: '12px 18px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {splits.map((sp, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={sp.method}
                  onChange={e => setSplits(prev => prev.map((p, j) => j === i ? { ...p, method: e.target.value } : p))}
                  style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '9px 8px', fontSize: 12, color: 'var(--txt)', flex: '0 0 110px' }}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="gift_card">Gift Card</option>
                </select>
                <input type="number" min={0} step="0.01" value={sp.amount}
                  onChange={e => setSplits(prev => prev.map((p, j) => j === i ? { ...p, amount: e.target.value } : p))}
                  placeholder="Amount"
                  style={{ flex: 1, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '9px 10px', fontSize: 13, color: 'var(--txt)' }} />
                {splits.length > 1 && (
                  <button onClick={() => setSplits(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, padding: '0 4px' }}>×</button>
                )}
              </div>
            ))}
            <button onClick={() => setSplits(prev => [...prev, { method: 'cash', amount: '' }])}
              style={{ padding: '9px 0', borderRadius: 'var(--r)', border: '1.5px dashed var(--bdr)', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              + Add Payment Method
            </button>
          </div>
          <div style={{ padding: '0 18px 16px', flexShrink: 0 }}>
            <button onClick={completeSplit} disabled={splitRemaining > 0.01} style={{
              width: '100%', padding: 15, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
              background: splitRemaining <= 0.01 ? 'var(--grn)' : 'var(--surf3)',
              color: splitRemaining <= 0.01 ? '#fff' : 'var(--txt3)',
              border: 'none', cursor: splitRemaining <= 0.01 ? 'pointer' : 'not-allowed',
            }}>
              {splitRemaining <= 0.01 ? 'Complete Payment' : `Remaining: ${fmtN(splitRemaining)}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
