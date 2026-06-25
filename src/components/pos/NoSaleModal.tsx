'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { NoSaleLog, NoSaleReason, User } from '@/types'
import { NO_SALE_REASON_LABELS } from '@/types'
import { qzOpenDrawer } from '@/lib/utils/qzTray'
import { supabase } from '@/lib/supabase'

const REASONS = Object.entries(NO_SALE_REASON_LABELS) as [NoSaleReason, string][]

type Step = 'reason' | 'pin' | 'processing' | 'success' | 'denied'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function NoSaleModal({ isOpen, onClose }: Props) {
  const { state, dispatch, audit } = useApp()
  const { currentUser, biz, users, currentShift, activeModule } = state

  const [step, setStep]             = useState<Step>('reason')
  const [reason, setReason]         = useState<NoSaleReason>('making_change')
  const [reasonText, setReasonText] = useState('')
  const [pin, setPin]               = useState('')
  const [pinError, setPinError]     = useState('')

  const mode = (biz.printers?.noSaleMode ?? 'require_pin') as 'manager_only' | 'require_pin'
  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  const reset = () => {
    setStep('reason'); setReason('making_change'); setReasonText(''); setPin(''); setPinError('')
  }
  const handleClose = () => { reset(); onClose() }

  const hashPin = async (p: string): Promise<string> => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const findMgr = async (p: string): Promise<User | null> => {
    const eligible = users.filter(u => u.active && (u.role === 'admin' || u.role === 'manager'))
    const hash = await hashPin(p)
    return eligible.find(u =>
      (u.pin_hash && u.pin_hash.toLowerCase() === hash.toLowerCase()) ||
      (u.pin && u.pin === p)
    ) ?? null
  }

  const execute = async (approver: User) => {
    setStep('processing')
    const label = reason === 'other' ? reasonText.trim() : NO_SALE_REASON_LABELS[reason]

    let drawerOpened = false
    const printer = biz.printers?.receipt?.trim()
    if (printer) {
      try { drawerOpened = await qzOpenDrawer(printer) } catch {}
    }

    const log: NoSaleLog = {
      id: crypto.randomUUID(),
      ts: new Date().toLocaleString(),
      requestedBy: currentUser?.name ?? 'Unknown',
      requestedById: currentUser?.id ?? '',
      requestedByRole: currentUser?.role ?? 'staff',
      approvedBy: approver.name,
      approvedById: approver.id,
      reason,
      reasonText: reason === 'other' ? reasonText.trim() : undefined,
      drawerOpened,
      shiftId: currentShift?.id ?? '',
      mod: activeModule,
    }

    dispatch({ type: 'ADD_NO_SALE_LOG', entry: log })
    audit('NO_SALE', `${label} — Approved by ${approver.name}${drawerOpened ? '' : ' (drawer offline)'}`, 'info')

    ;(async () => {
      try {
        await supabase.from('no_sale_events').insert({
          id: log.id, ts: log.ts,
          requested_by: log.requestedBy, requested_by_id: log.requestedById, requested_by_role: log.requestedByRole,
          approved_by: log.approvedBy, approved_by_id: log.approvedById,
          reason: log.reason, reason_text: log.reasonText ?? null,
          drawer_opened: log.drawerOpened, shift_id: log.shiftId, mod: log.mod,
        })
      } catch {}
    })()

    setStep('success')
    setTimeout(() => { reset(); onClose() }, 1500)
  }

  const onReasonNext = () => {
    if (reason === 'other' && !reasonText.trim()) return
    if (mode === 'manager_only') {
      if (!isPrivileged) { setStep('denied'); return }
      execute(currentUser!)
    } else {
      setStep('pin')
    }
  }

  const onPinSubmit = async () => {
    if (pin.length < 4) { setPinError('Enter a 4-digit manager PIN'); return }
    const mgr = await findMgr(pin)
    if (!mgr) { setPinError('Incorrect PIN — manager or admin PIN required'); setPin(''); return }
    execute(mgr)
  }

  if (!isOpen) return null

  const reasonDisabled = reason === 'other' && !reasonText.trim()

  return (
    <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1e3a5f33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            &#128275;
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>No Sale</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>Open cash drawer without a sale</div>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>&#215;</button>
        </div>

        {/* Reason selection */}
        {step === 'reason' && (
          <>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>Select Reason</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {REASONS.map(([val, label]) => (
                  <button key={val} onClick={() => setReason(val)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 'var(--r2)', cursor: 'pointer', textAlign: 'left',
                    border: `1.5px solid ${reason === val ? 'var(--blue)' : 'var(--bdr)'}`,
                    background: reason === val ? '#1e3a5f22' : 'var(--surf)',
                    color: reason === val ? 'var(--blue)' : 'var(--txt2)',
                    fontSize: 13, fontWeight: reason === val ? 700 : 500,
                  }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${reason === val ? 'var(--blue)' : 'var(--bdr2)'}`, background: reason === val ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {reason === val && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
              {reason === 'other' && (
                <input
                  autoFocus value={reasonText} onChange={e => setReasonText(e.target.value)}
                  placeholder="Describe reason&#8230;"
                  style={{ width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 'var(--r2)', border: `1.5px solid ${reasonText.trim() ? 'var(--blue)' : 'var(--bdr)'}`, background: 'var(--surf2)', color: 'var(--txt)', fontSize: 13, boxSizing: 'border-box' }}
                />
              )}
            </div>
            <div style={{ padding: '0 18px 16px', display: 'flex', gap: 8 }}>
              <button onClick={handleClose} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--r2)', background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={onReasonNext} disabled={reasonDisabled} style={{ flex: 2, padding: '10px 0', borderRadius: 'var(--r2)', background: reasonDisabled ? 'var(--surf3)' : 'var(--blue)', color: reasonDisabled ? 'var(--txt3)' : '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: reasonDisabled ? 'not-allowed' : 'pointer' }}>
                {mode === 'require_pin' ? 'Next — Enter PIN' : 'Open Drawer'}
              </button>
            </div>
          </>
        )}

        {/* PIN entry — custom pad avoids browser save-password dialog */}
        {step === 'pin' && (
          <>
            <div style={{ padding: '16px 18px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>Manager PIN Required</div>
              {/* Dot indicators */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 10 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${pinError ? '#ef4444' : 'var(--blue)'}`, background: pin.length > i ? (pinError ? '#ef4444' : 'var(--blue)') : 'transparent', transition: 'background .15s' }} />
                ))}
              </div>
              {pinError && <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', marginBottom: 8 }}>{pinError}</div>}
              {/* PIN pad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, idx) => (
                  k === '' ? <div key={idx} /> :
                  <button key={idx} onClick={() => {
                    if (k === '⌫') { setPin(p => p.slice(0,-1)); setPinError(''); }
                    else if (pin.length < 4) { const next = pin + k; setPin(next); setPinError(''); if (next.length === 4) setTimeout(() => {}, 0); }
                  }} style={{ padding: '14px 0', fontSize: k === '⌫' ? 18 : 20, fontWeight: 700, borderRadius: 'var(--r2)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', cursor: 'pointer', userSelect: 'none' }}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '8px 18px 16px', display: 'flex', gap: 8 }}>
              <button onClick={() => { setStep('reason'); setPin(''); setPinError('') }} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--r2)', background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Back</button>
              <button onClick={onPinSubmit} disabled={pin.length < 4} style={{ flex: 2, padding: '10px 0', borderRadius: 'var(--r2)', background: pin.length < 4 ? 'var(--surf3)' : 'var(--blue)', color: pin.length < 4 ? 'var(--txt3)' : '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: pin.length < 4 ? 'not-allowed' : 'pointer' }}>
                Confirm
              </button>
            </div>
          </>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>&#9203;</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)' }}>Opening drawer&#8230;</div>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--grn, #22c55e)', fontWeight: 900 }}>&#10003;</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--grn, #22c55e)' }}>Drawer Opened</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 6 }}>
              {reason === 'other' ? reasonText : NO_SALE_REASON_LABELS[reason]}
            </div>
          </div>
        )}

        {/* Denied (staff + manager_only mode) */}
        {step === 'denied' && (
          <>
            <div style={{ padding: 28, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>&#128683;</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>Not Authorized</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 8, lineHeight: 1.5 }}>No Sale requires a manager or admin. Ask your supervisor to open the drawer.</div>
            </div>
            <div style={{ padding: '0 18px 16px' }}>
              <button onClick={handleClose} style={{ width: '100%', padding: '10px 0', borderRadius: 'var(--r2)', background: 'var(--surf)', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}