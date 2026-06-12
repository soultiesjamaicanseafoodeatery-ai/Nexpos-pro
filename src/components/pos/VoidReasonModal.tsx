'use client'

import { useState } from 'react'
import type { VoidReason } from '@/types'
import { VOID_REASON_LABELS } from '@/types'

interface Props {
  isOpen: boolean
  itemName: string
  itemQty?: number
  onConfirm: (reason: VoidReason, reasonText: string) => void
  onClose: () => void
}

const REASONS = Object.entries(VOID_REASON_LABELS) as [VoidReason, string][]

export default function VoidReasonModal({ isOpen, itemName, itemQty, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<VoidReason>('wrong_item')
  const [otherText, setOtherText] = useState('')

  if (!isOpen) return null

  const handleConfirm = () => {
    if (selected === 'other' && !otherText.trim()) return
    onConfirm(selected, selected === 'other' ? otherText.trim() : VOID_REASON_LABELS[selected])
    setSelected('wrong_item')
    setOtherText('')
  }

  const handleClose = () => {
    setSelected('wrong_item')
    setOtherText('')
    onClose()
  }

  return (
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg2)', border: '1.5px solid #ef444455', borderRadius: 'var(--r4)', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#7f1d1d33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
            🚫
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>Void Item</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 1 }}>
              {itemQty && itemQty > 1 ? `${itemQty}× ` : ''}{itemName}
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Reason selector */}
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>
            Select Void Reason
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REASONS.map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSelected(val)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 'var(--r2)', cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${selected === val ? '#ef4444' : 'var(--bdr)'}`,
                  background: selected === val ? '#7f1d1d22' : 'var(--surf)',
                  color: selected === val ? '#ef4444' : 'var(--txt2)',
                  fontSize: 13, fontWeight: selected === val ? 700 : 500,
                  transition: 'all .1s',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${selected === val ? '#ef4444' : 'var(--bdr2)'}`,
                  background: selected === val ? '#ef4444' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected === val && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </span>
                {label}
              </button>
            ))}
          </div>

          {selected === 'other' && (
            <input
              autoFocus
              value={otherText}
              onChange={e => setOtherText(e.target.value)}
              placeholder="Describe reason…"
              style={{
                width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 'var(--r2)',
                border: `1.5px solid ${otherText.trim() ? '#ef4444' : 'var(--bdr)'}`,
                background: 'var(--surf2)', color: 'var(--txt)', fontSize: 13,
              }}
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '0 18px 16px', display: 'flex', gap: 8 }}>
          <button
            onClick={handleClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--r2)', background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected === 'other' && !otherText.trim()}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 'var(--r2)',
              background: selected === 'other' && !otherText.trim() ? 'var(--surf3)' : '#ef4444',
              color: selected === 'other' && !otherText.trim() ? 'var(--txt3)' : '#fff',
              border: 'none', fontWeight: 800, fontSize: 13,
              cursor: selected === 'other' && !otherText.trim() ? 'not-allowed' : 'pointer',
              transition: 'all .15s',
            }}
          >
            Confirm Void
          </button>
        </div>
      </div>
    </div>
  )
}
