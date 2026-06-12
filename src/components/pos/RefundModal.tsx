'use client'

import { useState } from 'react'
import type { Transaction } from '@/types'

interface Props {
  isOpen: boolean
  tx: Transaction | null
  sym: string
  onConfirm: (refundType: 'full' | 'partial', amount: number, reason: string) => void
  onClose: () => void
}

const REASONS = ['Customer Dissatisfied', 'Wrong Item Served', 'Duplicate Charge', 'Order Cancelled', 'Quality Issue', 'Other']

export default function RefundModal({ isOpen, tx, sym, onConfirm, onClose }: Props) {
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full')
  const [partialAmt, setPartialAmt] = useState('')
  const [reason,     setReason]     = useState(REASONS[0])
  const [otherText,  setOtherText]  = useState('')

  if (!isOpen || !tx) return null

  const fmtN = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const maxRefund = tx.total - (tx.refundAmount ?? 0)
  const partialNum = Math.min(parseFloat(partialAmt) || 0, maxRefund)
  const refundAmount = refundType === 'full' ? maxRefund : partialNum
  const finalReason = reason === 'Other' ? otherText.trim() : reason
  const canConfirm = refundAmount > 0 && finalReason.length > 0 && (reason !== 'Other' || otherText.trim().length > 0)

  const handleClose = () => {
    setRefundType('full'); setPartialAmt(''); setReason(REASONS[0]); setOtherText('')
    onClose()
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm(refundType, refundAmount, finalReason)
    handleClose()
  }

  return (
    <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1.5px solid var(--blue)44', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Process Refund</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>
              Tx #{tx.id} · {tx.item} · Paid: {fmtN(tx.total)}
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Refund type */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>Refund Type</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['full', 'partial'] as const).map(t => (
                <button key={t} onClick={() => setRefundType(t)} style={{
                  padding: '10px 0', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `2px solid ${refundType === t ? 'var(--blue)' : 'var(--bdr)'}`,
                  background: refundType === t ? 'var(--blue-bg, #1e3a5f33)' : 'var(--surf)',
                  color: refundType === t ? 'var(--blue)' : 'var(--txt3)',
                }}>
                  {t === 'full' ? `Full (${fmtN(maxRefund)})` : 'Partial'}
                </button>
              ))}
            </div>
          </div>

          {/* Partial amount */}
          {refundType === 'partial' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Amount to Refund (max {fmtN(maxRefund)})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--txt3)' }}>{sym}</span>
                <input type="number" min={0.01} max={maxRefund} step={0.01}
                  value={partialAmt} onChange={e => setPartialAmt(e.target.value)}
                  placeholder="0.00"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--r2)', border: `1.5px solid ${partialNum > 0 ? 'var(--blue)' : 'var(--bdr)'}`, background: 'var(--surf2)', color: 'var(--txt)', fontSize: 14, fontWeight: 700 }} />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>Reason</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 'var(--r2)', cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${reason === r ? 'var(--blue)' : 'var(--bdr)'}`,
                  background: reason === r ? 'var(--blue-bg, #1e3a5f22)' : 'var(--surf)',
                  color: reason === r ? 'var(--blue)' : 'var(--txt2)',
                  fontSize: 12, fontWeight: reason === r ? 700 : 500,
                }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, border: `2px solid ${reason === r ? 'var(--blue)' : 'var(--bdr2)'}`, background: reason === r ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {reason === r && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                  </span>
                  {r}
                </button>
              ))}
              {reason === 'Other' && (
                <input autoFocus value={otherText} onChange={e => setOtherText(e.target.value)}
                  placeholder="Describe reason…"
                  style={{ padding: '8px 12px', borderRadius: 'var(--r2)', border: '1.5px solid var(--blue)', background: 'var(--surf2)', color: 'var(--txt)', fontSize: 12, marginTop: 2 }} />
              )}
            </div>
          </div>

          {/* Summary */}
          {refundAmount > 0 && (
            <div style={{ background: 'var(--surf3)', borderRadius: 'var(--r2)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--txt2)' }}>Refund Amount</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{fmtN(refundAmount)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '0 18px 16px', display: 'flex', gap: 8 }}>
          <button onClick={handleClose} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--r2)', background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={!canConfirm} style={{
            flex: 2, padding: '10px 0', borderRadius: 'var(--r2)',
            background: canConfirm ? 'var(--blue)' : 'var(--surf3)',
            color: canConfirm ? '#fff' : 'var(--txt3)',
            border: 'none', fontWeight: 800, fontSize: 13,
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}>
            Process Refund {refundAmount > 0 ? fmtN(refundAmount) : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
