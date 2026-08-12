'use client'

import { useState, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { User } from '@/types'
import { calculateRevenue, filterTransactionsByScope, groupRevenueByModuleSplit, groupRevenueByCashier } from '@/lib/utils/revenue'
import { getRecoveryDays, formatBusinessDate, type RecoveryDay } from '@/lib/utils/eodRecovery'

const fmtJ = (n: number) => 'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const Card = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)',
    overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.7)' }}>
    {children}
  </div>
)
const CardHead = ({ title, sub, warn }: { title: string; sub?: string; warn?: boolean }) => (
  <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--bdr)', background: warn ? '#7f1d1d18' : undefined }}>
    <div style={{ fontSize: 16, fontWeight: 800, color: warn ? 'var(--red)' : 'var(--txt)' }}>{title}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{sub}</div>}
  </div>
)
const CardBody = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: '20px 24px' }}>{children}</div>
)
const CardFoot = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: '14px 24px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
    {children}
  </div>
)
const Btn = ({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '10px 22px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
    border: primary ? 'none' : '1px solid var(--bdr)', background: primary ? 'var(--blue)' : 'var(--surf)',
    color: primary ? '#fff' : 'var(--txt)', opacity: disabled ? 0.55 : 1,
  }}>{children}</button>
)
const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 9999,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 24, gap: 16, backdropFilter: 'blur(6px)' }}>{children}</div>
)

interface Props {
  allDays: RecoveryDay[]
  onAllRecovered: () => void
  onCancel: () => void
}

// Historical EOD Recovery — shown instead of CloseShiftWizard when business
// days exist with transactions but no eod_snapshots row (see eodRecovery.ts).
// Every recovery close is: computed with the SAME shared revenue engine used
// everywhere else in the app (calendarDay scope, not the shift-capped scope
// Close Shift uses — that "today only" protection is completely untouched by
// this file), authorized by a live-verified admin/manager PIN, and never asks
// for a physical cash count (there is no drawer to count for a day that
// happened weeks ago) — /api/recovery-close stores cashVariance as literal
// null and marks the record system-calculated, never a guess.
export default function HistoricalRecoveryWizard({ allDays, onAllRecovered, onCancel }: Props) {
  const { state } = useApp()
  const { users, currentUser } = state

  const [days, setDays] = useState(allDays)
  const [step, setStep] = useState<'dashboard' | 'auth' | 'closing'>('dashboard')
  const [pinUser, setPinUser] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [authorizedUser, setAuthorizedUser] = useState<User | null>(null)
  const [pinAuthToken, setPinAuthToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // A blocking notice the user must actively dismiss — distinct from `err`
  // (an inline message that can be missed). Set only on a genuine
  // authorization failure (expired/invalid PIN token, or a dead login
  // session), never on a real network/validation error, which still uses the
  // ordinary inline `err` path.
  const [authNotice, setAuthNotice] = useState<{ title: string; body: string } | null>(null)

  const mgrs = users.filter(u => u.active && (u.role === 'admin' || u.role === 'manager'))
  const missing = days.filter(d => !d.recovered)
  const current = missing[0] ?? null

  const refreshDays = useCallback(async () => {
    const fresh = await getRecoveryDays(state.transactions)
    setDays(fresh)
    return fresh
  }, [state.transactions])

  const pressPin = useCallback(async (d: string) => {
    if (!pinUser || pin.length >= 4) return
    setPinErr('')
    const np = pin + d
    setPin(np)
    if (np.length === 4) {
      try {
        const res = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // context:'historical_recovery' gets a longer-lived token (20min vs
          // Close Shift's 5min) — server-decided, not something this request
          // can stretch further just by asking.
          body: JSON.stringify({ id: pinUser.id, pin: np, pool: 'privileged', context: 'historical_recovery' }),
        })
        if (res.ok) {
          const u = await res.json()
          setAuthorizedUser({ id: u.id, name: u.name, ini: u.ini, role: u.role, color: u.color, allowedModules: u.allowedModules ?? ['restaurant'], active: true })
          setPinAuthToken(u.pinAuthToken)
          setStep('closing')
        } else {
          setPinErr('Incorrect PIN'); setPin('')
        }
      } catch { setPinErr('Network error'); setPin('') }
    }
  }, [pinUser, pin])

  const recoverCurrentDay = useCallback(async () => {
    if (!current || !authorizedUser || !pinAuthToken) return
    setBusy(true); setErr('')
    try {
      const scoped = filterTransactionsByScope(state.transactions, { type: 'calendarDay', date: current.businessDate })
      const totals = calculateRevenue(scoped)
      // Authoritative module split (src/lib/utils/revenue.ts) — a mixed
      // transaction's active items are attributed to their own module
      // instead of the whole transaction landing in one unused bucket.
      const byModule = groupRevenueByModuleSplit(scoped)
      const byCashier = groupRevenueByCashier(scoped)
      const res = await fetch('/api/recovery-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDate: current.businessDate, pinAuthToken, totals, byModule, byCashier }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if (res.status === 401) {
          // Authorization failed — this must be unmistakable, not a quiet
          // reset. Clearing the token/step happens only once the user
          // acknowledges the notice below (see acknowledgeAuthNotice), so
          // nothing changes on screen until they've actually seen why.
          setAuthNotice({
            title: 'Recovery authorization expired',
            body: 'Recovery authorization expired. Please verify your PIN again before continuing.',
          })
          setBusy(false)
          return
        }
        throw new Error(j.error || 'Recovery close failed')
      }
      const fresh = await refreshDays()
      if (fresh.every(d => d.recovered)) onAllRecovered()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Recovery close failed')
    } finally {
      setBusy(false)
    }
  }, [current, authorizedUser, pinAuthToken, state.transactions, refreshDays, onAllRecovered])

  const acknowledgeAuthNotice = useCallback(() => {
    setAuthNotice(null)
    setStep('auth')
    setPinAuthToken(null)
    setAuthorizedUser(null)
  }, [])

  // Blocking notice takes over the entire wizard regardless of which step
  // triggered it — the user must click through it before anything else is
  // reachable, so an authorization failure can never be mistaken for success.
  if (authNotice) {
    return (
      <Overlay>
        <Card>
          <CardHead title={authNotice.title} warn />
          <CardBody>
            <div style={{ fontSize: 14, color: 'var(--txt)', lineHeight: 1.5 }}>{authNotice.body}</div>
          </CardBody>
          <CardFoot>
            <Btn primary onClick={acknowledgeAuthNotice}>OK, re-enter PIN</Btn>
          </CardFoot>
        </Card>
      </Overlay>
    )
  }

  if (step === 'dashboard') {
    return (
      <Overlay>
        <Card>
          <CardHead title="EOD Recovery Required" warn
            sub={`${missing.length} business day${missing.length === 1 ? '' : 's'} have sales but no completed End of Day. These must be closed in order, oldest first, before today's Close Shift can run.`} />
          <CardBody>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surf)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>Business Date</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>Tx</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>Gross</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>Net</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(d => (
                    <tr key={d.businessDate} style={{ borderTop: '1px solid var(--bdr)', opacity: d.recovered ? 0.55 : 1 }}>
                      <td style={{ padding: '7px 10px' }}>{formatBusinessDate(d.businessDate)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{d.transactionCount}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmtJ(d.grossSales)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmtJ(d.netSales)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: d.recovered ? 'var(--grn,#16a34a)22' : 'var(--red)22',
                          color: d.recovered ? 'var(--grn,#16a34a)' : 'var(--red)' }}>
                          {d.recovered ? 'Closed' : 'Open'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
          <CardFoot>
            <Btn onClick={onCancel}>Cancel</Btn>
            <Btn primary onClick={() => setStep('auth')} disabled={missing.length === 0}>Begin Recovery →</Btn>
          </CardFoot>
        </Card>
      </Overlay>
    )
  }

  if (step === 'auth') {
    return (
      <Overlay>
        <Card>
          <CardHead title="Manager Authorization" sub="Select your name and enter your PIN to authorize historical EOD recovery" />
          <div style={{ padding: '20px 24px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mgrs.map(m => (
                <button key={m.id} onClick={() => { setPinUser(m); setPin(''); setPinErr('') }}
                  style={{ padding: '10px 12px', borderRadius: 'var(--r2)', textAlign: 'left', cursor: 'pointer',
                    border: pinUser?.id === m.id ? '2px solid var(--blue)' : '1px solid var(--bdr)',
                    background: 'var(--surf)', color: 'var(--txt)', fontWeight: 700, fontSize: 13 }}>
                  {m.name} <span style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 400 }}>({m.role})</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--bdr)',
                    background: pin.length > i ? 'var(--blue)' : 'transparent' }} />
                ))}
              </div>
              {pinErr && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{pinErr}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => d === '' ? <div key={i} /> : (
                  <button key={i} onClick={() => d === '⌫' ? setPin(p => p.slice(0, -1)) : pressPin(d)} disabled={!pinUser}
                    style={{ padding: '10px 0', borderRadius: 'var(--r2)', border: '1px solid var(--bdr)', background: 'var(--surf)',
                      color: 'var(--txt)', fontWeight: 700, cursor: pinUser ? 'pointer' : 'not-allowed', opacity: pinUser ? 1 : 0.4 }}>{d}</button>
                ))}
              </div>
            </div>
          </div>
          <CardFoot>
            <Btn onClick={() => setStep('dashboard')}>Back</Btn>
          </CardFoot>
        </Card>
      </Overlay>
    )
  }

  // step === 'closing'
  if (!current) {
    // Safety net — shouldn't normally render, onAllRecovered fires as soon as
    // the last day clears, but guards against a render in between.
    return (
      <Overlay>
        <Card><CardBody><div style={{ textAlign: 'center', color: 'var(--txt3)' }}>All historical days recovered.</div></CardBody></Card>
      </Overlay>
    )
  }
  return (
    <Overlay>
      <Card>
        <CardHead title="Recovery Close" warn
          sub={`${missing.length} day${missing.length === 1 ? '' : 's'} remaining — closing oldest first. Authorized by ${authorizedUser?.name ?? currentUser?.name ?? 'Manager'}.`} />
        <CardBody>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)' }}>{formatBusinessDate(current.businessDate)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <div style={{ background: 'var(--surf)', borderRadius: 'var(--r2)', padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Transactions</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{current.transactionCount}</div>
            </div>
            <div style={{ background: 'var(--surf)', borderRadius: 'var(--r2)', padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Gross Sales</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtJ(current.grossSales)}</div>
            </div>
            <div style={{ background: 'var(--surf)', borderRadius: 'var(--r2)', padding: '12px 14px', gridColumn: 'span 2' }}>
              <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Expected Cash (system-calculated — no physical count for historical days)</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtJ(current.netSales)}</div>
            </div>
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 12 }}>{err}</div>}
        </CardBody>
        <CardFoot>
          <Btn onClick={onCancel} disabled={busy}>Pause Recovery</Btn>
          <Btn primary onClick={recoverCurrentDay} disabled={busy}>{busy ? 'Closing…' : 'Recovery Close →'}</Btn>
        </CardFoot>
      </Card>
    </Overlay>
  )
}
