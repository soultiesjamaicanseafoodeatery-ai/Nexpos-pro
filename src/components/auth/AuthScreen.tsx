'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { User, Shift } from '@/types'
import { ROLES } from '@/lib/data/seed'
import { hashPin } from '@/lib/utils/hash'

const WEAK_PINS = ['1234', '2222', '3333', '4444', '5555', '6666', '0000', '1111', '9999', '1212']
const GRACE_MS  = 40 * 60 * 1000  // 40-minute resume window after clock-out
const FRESH_PIN_TIMEOUT_MS = 1500 // cap on the fresh-PIN network check before falling back to cached data

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


// ── PIN lockout helpers ───────────────────────────────────────
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

// ── Grace period helpers ──────────────────────────────────────
interface ClockoutRecord { clockinAt: string; at: string }

function getGraceRecord(userId: string): ClockoutRecord | null {
  try {
    const raw = localStorage.getItem(`clockout_${userId}`)
    if (!raw) return null
    const rec: ClockoutRecord = JSON.parse(raw)
    if (Date.now() - new Date(rec.at).getTime() < GRACE_MS) return rec
    localStorage.removeItem(`clockout_${userId}`)
  } catch {}
  return null
}

export default function AuthScreen() {
  const { state, dispatch, toast } = useApp()
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [pinState, setPinState] = useState<'idle' | 'error' | 'success'>('idle')
  const [showWeakPinWarning, setShowWeakPinWarning] = useState(false)
  const [lockoutInfo, setLockoutInfo] = useState<{ locked: boolean; remaining: number }>({ locked: false, remaining: 0 })
  const [screenLocked, setScreenLocked] = useState(true)
  const [clockTime, setClockTime] = useState(() => new Date())
  // Grace period resume dialog
  const [graceRecord, setGraceRecord]   = useState<ClockoutRecord | null>(null)
  const [pendingUser, setPendingUser]   = useState<User | null>(null)

  // Use a ref so doLogin always has the latest dispatch/state without stale closures
  const dispatchRef = useRef(dispatch)
  useEffect(() => { dispatchRef.current = dispatch }, [dispatch])
  const moduleRef = useRef(state.activeModule)
  useEffect(() => { moduleRef.current = state.activeModule }, [state.activeModule])

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

  const doLogin = useCallback((user: User, isResume: boolean, clockinAt?: string) => {
    const now = new Date().toISOString()
    const nowStr = new Date().toLocaleString()
    clearFailedAttempts(user.id)

    if (isResume && clockinAt) {
      // Restore original clock-in time so session duration is continuous
      try { localStorage.setItem(`personal_clockin_${user.id}`, clockinAt) } catch {}
      try { localStorage.removeItem(`clockout_${user.id}`) } catch {}
    } else {
      // Fresh clock-in — only set if no existing session (coming from LOGOUT, not CLOCK_OUT)
      try {
        if (!localStorage.getItem(`personal_clockin_${user.id}`)) {
          localStorage.setItem(`personal_clockin_${user.id}`, now)
        }
      } catch {}
    }

    const shift: Shift = {
      id: 'SH' + Date.now(),
      userId: user.id,
      userName: user.name,
      role: user.role,
      modules: user.allowedModules,
      start: now,
      end: null,
      txCount: 0,
      revenue: 0,
    }

    setScreenLocked(true)
    dispatchRef.current({ type: 'LOGIN', user, shift })
    dispatchRef.current({
      type: 'ADD_AUDIT',
      entry: {
        id: crypto.randomUUID(), ts: nowStr,
        user: user.name, userId: user.id,
        action: isResume ? 'SHIFT_RESUME' : 'CLOCK_IN',
        detail: isResume
          ? `${user.name} resumed shift (clocked back in within grace period)`
          : `${user.name} clocked in`,
        type: 'info',
        mod: moduleRef.current,
      },
    })
  }, [])

  const pressKey = useCallback((digit: string) => {
    if (!selectedUser) { toast('Tap your name first', 'warn'); return }
    const lockout = isLockedOut(selectedUser.id)
    if (lockout.locked) { setLockoutInfo(lockout); setError(`Account locked — try again in ${lockout.remaining} min`); return }
    if (pin.length >= 4) return
    setError('')
    const newPin = pin + digit
    setPin(newPin)

    if (newPin.length === 4) {
      (async () => {
        // Always fetch fresh user data from Supabase so PIN changes take effect immediately on all
        // devices — but cap the wait so a slow connection doesn't stall login; fall back to cached
        // PIN data (same fallback already used when the request fails outright) if it's too slow.
        let freshPinHash: string | undefined = selectedUser.pin_hash
        let freshPin: string | undefined = selectedUser.pin
        try {
          const rows: unknown = await Promise.race([
            fetch('/api/staff').then(r => r.ok ? r.json() : null),
            new Promise<null>(resolve => setTimeout(() => resolve(null), FRESH_PIN_TIMEOUT_MS)),
          ])
          if (Array.isArray(rows)) {
            const fresh = rows.find((r: Record<string, unknown>) => r.id === selectedUser.id)
            if (fresh) { freshPinHash = fresh.pin_hash as string | undefined; freshPin = fresh.pin as string | undefined }
          }
        } catch { /* use cached if network fails */ }

        let correct = false
        if (freshPinHash) {
          const h = await hashPin(newPin)
          correct = h === freshPinHash
        } else {
          correct = newPin === (freshPin ?? '')
        }

        if (correct) {
          setPinState('success')
          const wasWeakPin = WEAK_PINS.includes(newPin)
          setTimeout(() => {
            // Check if this user clocked out recently — offer to resume
            const rec = getGraceRecord(selectedUser.id)
            if (rec) {
              setPendingUser(selectedUser)
              setGraceRecord(rec)
              if (wasWeakPin) setShowWeakPinWarning(true)
            } else {
              doLogin(selectedUser, false)
              if (wasWeakPin) setShowWeakPinWarning(true)
            }
          }, 150)
        } else {
          const attempts = recordFailedAttempt(selectedUser.id)
          const lockout2 = isLockedOut(selectedUser.id)
          setLockoutInfo(lockout2)
          setPinState('error')
          setError(lockout2.locked
            ? `Account locked for ${lockout2.remaining} min — too many failed attempts`
            : `Incorrect PIN — try again (${attempts}/${MAX_PIN_ATTEMPTS})`)
          setTimeout(() => {
            setPin('')
            setPinState('idle')
            if (!lockout2.locked) setError('')
          }, 1000)
        }
      })()
    }
  }, [selectedUser, pin, toast, doLogin])

  const delKey = useCallback(() => {
    setPin(p => p.slice(0, -1))
  }, [])

  const clearKey = useCallback(() => {
    setPin('')
    setError('')
    setPinState('idle')
  }, [])

  // Keyboard support — digits, Backspace, Escape
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

  // Live clock for lock screen
  useEffect(() => {
    const t = setInterval(() => setClockTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const bizName = state.biz?.name || 'NexPOS Pro'

  // ── Grace period resume dialog ───────────────────────────────
  if (graceRecord && pendingUser) {
    const minsAgo   = Math.max(0, Math.floor((Date.now() - new Date(graceRecord.at).getTime()) / 60000))
    const minsLeft  = Math.floor(GRACE_MS / 60000) - minsAgo
    const user      = pendingUser
    const rec       = graceRecord
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}>
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--bdr)',
          borderRadius: 'var(--r4)', width: '100%', maxWidth: 400,
          overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.6)',
          padding: 28,
        }}>
          <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 16 }}>⏱</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', textAlign: 'center', marginBottom: 8 }}>
            Resume Your Shift?
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt3)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
            You clocked out {minsAgo} minute{minsAgo !== 1 ? 's' : ''} ago.
            <br />You have {minsLeft} minute{minsLeft !== 1 ? 's' : ''} left to resume.
          </div>
          <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
            <button
              onClick={() => {
                setGraceRecord(null)
                setPendingUser(null)
                doLogin(user, true, rec.clockinAt)
              }}
              style={{ width: '100%', padding: '13px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 800,
                background: 'var(--grn)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Resume My Shift
            </button>
            <button
              onClick={() => {
                try { localStorage.removeItem(`clockout_${user.id}`) } catch {}
                setGraceRecord(null)
                setPendingUser(null)
                doLogin(user, false)
              }}
              style={{ width: '100%', padding: '11px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 700,
                background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}
            >
              Start New Session
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screenLocked) return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, gap: 0,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 42, fontWeight: 900, color: 'var(--txt)', letterSpacing: '-1px', marginBottom: 8 }}>{bizName}</div>
        <div style={{ fontSize: 56, fontWeight: 300, color: 'var(--txt)', fontFamily: 'var(--mono)', letterSpacing: '2px', marginBottom: 4 }}>
          {clockTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div style={{ fontSize: 14, color: 'var(--txt3)', fontWeight: 500 }}>
          {clockTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
      <button
        onClick={() => setScreenLocked(false)}
        style={{
          padding: '16px 48px', borderRadius: 'var(--r)', fontSize: 16, fontWeight: 800,
          background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer',
          letterSpacing: '.3px', boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        }}
      >Login</button>
      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--txt3)', opacity: .5 }}>NexPOS Pro · Multi-module POS System</div>
    </div>
  )

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
        {/* LEFT — name list */}
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
              let hasGrace = false
              try { hasGrace = !!getGraceRecord(user.id) } catch {}
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
                      {hasGrace && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: 'rgba(251,146,60,.15)', color: 'var(--ora)' }}>
                          ⏱ Resume?
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — PIN entry */}
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
                <button onClick={resetAuth} style={{ background: 'transparent', border: 'none', color: 'var(--txt3)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
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
                <button onClick={delKey} style={{ padding: '15px 8px', borderRadius: 'var(--r)', background: 'var(--surf)', border: '1px solid var(--bdr)', fontSize: 15, color: 'var(--txt3)', cursor: 'pointer', transition: 'all .12s' }}>⌫</button>
              </div>

              <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, minHeight: 18, textAlign: 'center', marginTop: 8 }}>{error}</div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--bdr)', textAlign: 'center', fontSize: 10.5, color: 'var(--txt3)', gridColumn: '1 / -1' }}>
          NexPOS Pro · Multi-module POS System
        </div>
      </div>
    </div>
  )
}
