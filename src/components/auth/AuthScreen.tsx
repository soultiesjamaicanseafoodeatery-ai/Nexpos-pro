'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { User, Shift } from '@/types'
import { ROLES } from '@/lib/data/seed'
import { hashPin } from '@/lib/utils/hash'

const WEAK_PINS = ['1234', '2222', '3333', '4444', '5555', '6666', '0000', '1111', '9999', '1212']

const MOD_TAG_CLS: Record<string, string> = {
  restaurant: 'mod-rest',
  bar:        'mod-bar',
  carwash:    'mod-wash',
}
const MOD_TAG_LBL: Record<string, string> = {
  restaurant: 'Rest',
  bar:        'Bar',
  carwash:    'Wash',
}


// â”€â”€ PIN lockout helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MAX_PIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 10 * 60 * 1000

function getLockoutKey(userId: string) { return `pinLockout_${userId}` }
function getAttemptsKey(userId: string) { return `pinAttempts_${userId}` }

function isLockedOut(userId: string): { locked: boolean; remaining: number } {
  try {
    const exp = parseInt(localStorage.getItem(getLockoutKey(userId)) ?? '0', 10)
    const now = Date.now()
    if (exp > now) return { locked: true, remaining: Math.ceil((exp - now) / 60000) }
    localStorage.removeItem(getLockoutKey(userId))
    localStorage.removeItem(getAttemptsKey(userId))
  } catch {}
  return { locked: false, remaining: 0 }
}

function recordFailedAttempt(userId: string): number {
  try {
    const key = getAttemptsKey(userId)
    const attempts = parseInt(localStorage.getItem(key) ?? '0', 10) + 1
    localStorage.setItem(key, String(attempts))
    if (attempts >= MAX_PIN_ATTEMPTS) {
      localStorage.setItem(getLockoutKey(userId), String(Date.now() + LOCKOUT_DURATION_MS))
      localStorage.removeItem(key)
    }
    return attempts
  } catch { return 0 }
}

function clearFailedAttempts(userId: string) {
  try {
    localStorage.removeItem(getAttemptsKey(userId))
    localStorage.removeItem(getLockoutKey(userId))
  } catch {}
}
export default function AuthScreen() {
  const { state, dispatch, toast } = useApp()
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [pinState, setPinState] = useState<'idle' | 'error' | 'success'>('idle')
  const [showWeakPinWarning, setShowWeakPinWarning] = useState(false)
  const [lockoutInfo, setLockoutInfo] = useState<{ locked: boolean; remaining: number }>({ locked: false, remaining: 0 })

  const activeUsers = state.users.filter(u => u.active)

  const selectUser = useCallback((user: User) => {
    setSelectedUser(user)
    setPin('')
    setError('')
    setPinState('idle')
    setLockoutInfo(isLockedOut(user.id))
  }, [])

  const resetAuth = useCallback(() => {
    setSelectedUser(null)
    setPin('')
    setError('')
    setPinState('idle')
  }, [])

  const pressKey = useCallback((digit: string) => {
    if (!selectedUser) { toast('Tap your name first', 'warn'); return }
    const lockout = isLockedOut(selectedUser.id)
    if (lockout.locked) { setLockoutInfo(lockout); setError(`Account locked â€” try again in \ min`); return }
    if (pin.length >= 4) return
    setError('')
    const newPin = pin + digit
    setPin(newPin)

    if (newPin.length === 4) {
      setTimeout(async () => {
        let correct = false
        if (selectedUser.pin_hash) {
          const h = await hashPin(newPin)
          correct = h === selectedUser.pin_hash
        } else {
          correct = newPin === (selectedUser.pin ?? '')
        }

        if (correct) {
          setPinState('success')
          setTimeout(() => {
            const shift: Shift = {
              id: 'SH' + Date.now(),
              userId: selectedUser.id,
              userName: selectedUser.name,
              role: selectedUser.role,
              modules: selectedUser.allowedModules,
              start: new Date().toISOString(),
              end: null,
              txCount: 0,
              revenue: 0,
            }
            clearFailedAttempts(selectedUser.id)
            dispatch({ type: 'LOGIN', user: selectedUser, shift })
            if (WEAK_PINS.includes(newPin)) setShowWeakPinWarning(true)
            toast(`Welcome ${selectedUser.name.split(' ')[0]}!`, 'success')
          }, 280)
        } else {
          const attempts = recordFailedAttempt(selectedUser.id)
          const lockout = isLockedOut(selectedUser.id)
          setLockoutInfo(lockout)
          setPinState('error')
          setError(lockout.locked ? `Account locked for \ min â€” too many failed attempts` : `Incorrect PIN â€” try again (\/\)`)
          setTimeout(() => {
            setPin('')
            setPinState('idle')
            if (!lockout.locked) setError('')
          }, 1000)
        }
      }, 200)
    }
  }, [selectedUser, pin, dispatch, toast])

  const delKey = useCallback(() => {
    setPin(p => p.slice(0, -1))
  }, [])

  const clearKey = useCallback(() => {
    setPin('')
    setError('')
    setPinState('idle')
  }, [])

  // Keyboard support â€” digits, Backspace, Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        pressKey(e.key)
      } else if (e.key === 'Backspace') {
        delKey()
      } else if (e.key === 'Escape') {
        resetAuth()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [pressKey, delKey, resetAuth])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bdr)',
        borderRadius: 'var(--r4)', width: '100%', maxWidth: 700,
        overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.6)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 500,
      }}>
        {/* LEFT â€” name list */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--bdr)' }}>
          <div style={{
            padding: '20px 20px 14px', textAlign: 'center',
            borderBottom: '1px solid var(--bdr)',
            background: 'linear-gradient(180deg,var(--bg3),var(--bg2))',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>NexPOS Pro</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>Select your name to begin</div>
          </div>

          <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {activeUsers.map(user => {
              const role = ROLES[user.role]
              const isSelected = selectedUser?.id === user.id
              return (
                <button
                  key={user.id}
                  onClick={() => selectUser(user)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                    padding: '11px 13px', borderRadius: 'var(--r)',
                    background: isSelected ? 'var(--blue-bg)' : 'var(--surf)',
                    border: `1.5px solid ${isSelected ? 'var(--blue)' : 'var(--bdr)'}`,
                    cursor: 'pointer', transition: 'all .15s', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, flexShrink: 0,
                    background: `${user.color}22`, color: user.color,
                  }}>{user.ini}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>{role?.label}</div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                      {user.allowedModules.length === 3
                        ? <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: 'var(--grn-bg)', color: 'var(--grn)' }}>All Modules</span>
                        : user.allowedModules.map(m => (
                            <span key={m} className={`nb-mod ${MOD_TAG_CLS[m]}`} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>
                              {MOD_TAG_LBL[m]}
                            </span>
                          ))
                      }
                    </div>
                  </div>
                  <span style={{ fontSize: 16, color: isSelected ? 'var(--blue)' : 'var(--txt3)', opacity: isSelected ? 1 : 0, transition: 'opacity .15s' }}>â†’</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT â€” PIN entry */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: 20 }}>
          {!selectedUser ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', textAlign: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Select a user to continue</div>
            </div>
          ) : (
            <>
              {/* User card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', padding: '10px 13px', marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: `${selectedUser.color}22`, color: selectedUser.color }}>
                  {selectedUser.ini}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>{selectedUser.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 1 }}>{ROLES[selectedUser.role]?.label}</div>
                </div>
                <button onClick={resetAuth} style={{ background: 'transparent', border: 'none', color: 'var(--txt3)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>Ã—</button>
              </div>

              {/* PIN dots */}
              <div style={{ fontSize: 11, color: 'var(--txt3)', textAlign: 'center', marginBottom: 8 }}>Enter your 4-digit PIN</div>
              {showWeakPinWarning && (
                <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, marginBottom: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span>⚠️ Weak PIN detected. Ask your manager to update your PIN in Staff settings.</span>
                  <button onClick={() => setShowWeakPinWarning(false)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid var(--bdr2)',
                    background: pinState === 'error' ? 'var(--red)'
                      : pinState === 'success' ? 'var(--grn)'
                      : i < pin.length ? 'var(--blue)' : 'transparent',
                    borderColor: pinState === 'error' ? 'var(--red)'
                      : pinState === 'success' ? 'var(--grn)'
                      : i < pin.length ? 'var(--blue)' : 'var(--bdr2)',
                    transform: i < pin.length ? 'scale(1.1)' : 'scale(1)',
                    transition: 'all .15s',
                    animation: pinState === 'error' ? 'shake .3s ease' : 'none',
                  }} />
                ))}
              </div>
              {/* Keyboard hint */}
              <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--txt3)', opacity: .6, marginBottom: 12, letterSpacing: '.2px' }}>
                Type PIN on keyboard
              </div>

              {/* PIN pad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, flex: 1 }}>
                {['1','2','3','4','5','6','7','8','9'].map(d => (
                  <button key={d} onClick={() => pressKey(d)} style={{
                    padding: '15px 8px', borderRadius: 'var(--r)',
                    background: 'var(--surf)', border: '1px solid var(--bdr)',
                    fontSize: 19, fontWeight: 700, color: 'var(--txt)',
                    cursor: 'pointer', textAlign: 'center', transition: 'all .12s',
                    fontFamily: 'var(--mono)',
                  }}>{d}</button>
                ))}
                <button onClick={clearKey} style={{ padding: '15px 8px', borderRadius: 'var(--r)', background: 'var(--surf)', border: '1px solid var(--bdr)', fontSize: 12, color: 'var(--txt3)', cursor: 'pointer', transition: 'all .12s' }}>CLR</button>
                <button onClick={() => pressKey('0')} style={{ padding: '15px 8px', borderRadius: 'var(--r)', background: 'var(--surf)', border: '1px solid var(--bdr)', fontSize: 19, fontWeight: 700, color: 'var(--txt)', cursor: 'pointer', textAlign: 'center', transition: 'all .12s', fontFamily: 'var(--mono)' }}>0</button>
                <button onClick={delKey} style={{ padding: '15px 8px', borderRadius: 'var(--r)', background: 'var(--surf)', border: '1px solid var(--bdr)', fontSize: 15, color: 'var(--txt3)', cursor: 'pointer', transition: 'all .12s' }}>âŒ«</button>
              </div>

              <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, minHeight: 18, textAlign: 'center', marginTop: 8 }}>{error}</div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--bdr)', textAlign: 'center', fontSize: 10.5, color: 'var(--txt3)', gridColumn: '1 / -1' }}>
          NexPOS Pro Â· Multi-module POS System
        </div>
      </div>
    </div>
  )
}
