'use client'

import { useState, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { User, Shift } from '@/types'
import { ROLES } from '@/lib/data/seed'

const MOD_TAG_CLS: Record<string, string> = {
  restaurant: 'mod-rest',
  bar:        'mod-bar',
  carwash:    'mod-wash',
}
const MOD_TAG_LBL: Record<string, string> = {
  restaurant: '🍽️ Rest',
  bar:        '🍺 Bar',
  carwash:    '🚗 Wash',
}

export default function AuthScreen() {
  const { state, dispatch, toast } = useApp()
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [pinState, setPinState] = useState<'idle' | 'error' | 'success'>('idle')

  const activeUsers = state.users.filter(u => u.active)

  const selectUser = useCallback((user: User) => {
    setSelectedUser(user)
    setPin('')
    setError('')
    setPinState('idle')
  }, [])

  const resetAuth = useCallback(() => {
    setSelectedUser(null)
    setPin('')
    setError('')
    setPinState('idle')
  }, [])

  const pressKey = useCallback((digit: string) => {
    if (!selectedUser) { toast('Tap your name first', 'warn'); return }
    if (pin.length >= 4) return
    setError('')
    const newPin = pin + digit
    setPin(newPin)

    if (newPin.length === 4) {
      setTimeout(() => {
        if (newPin === selectedUser.pin) {
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
            dispatch({ type: 'LOGIN', user: selectedUser, shift })
            toast(`Welcome ${selectedUser.name.split(' ')[0]}!`, 'success')
          }, 280)
        } else {
          setPinState('error')
          setError('Incorrect PIN — try again')
          setTimeout(() => {
            setPin('')
            setPinState('idle')
            setError('')
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
            <div style={{ fontSize: 30, marginBottom: 6 }}>🏢</div>
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
                  <span style={{ fontSize: 16, color: isSelected ? 'var(--blue)' : 'var(--txt3)', opacity: isSelected ? 1 : 0, transition: 'opacity .15s' }}>→</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT — PIN entry */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: 20 }}>
          {!selectedUser ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', textAlign: 'center', gap: 12 }}>
              <div style={{ fontSize: 40, opacity: .4 }}>👈</div>
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
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 18 }}>
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
