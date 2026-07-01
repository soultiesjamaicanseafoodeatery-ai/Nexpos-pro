'use client'
import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { supabase } from '@/lib/supabase'
import { hashPin } from '@/lib/utils/hash'

// ── Types ────────────────────────────────────────────────────────
interface PayrollProfile {
  id: string; staffId: string; staffName: string; position: string
  payrollType: 'hourly' | 'salary'; hourlyRate: number; weeklySalary: number
  overtimeEligible: boolean; overtimeThreshold: number; overtimeMultiplier: number
  tipsEligible: boolean; active: boolean
}
interface TimeEntry {
  id: string; staffId: string; staffName: string; date: string
  clockIn: string; clockOut: string | null; breakMinutes: number; notes: string
}
interface PayrollEntry {
  staffId: string; staffName: string; position: string
  payrollType: 'hourly' | 'salary'; totalMinutes: number
  regularHours: number; overtimeHours: number
  hourlyRate: number; weeklySalary: number
  regularPay: number; overtimePay: number; tips: number; grossPay: number
}
interface PayrollRun {
  id: string; periodType: 'weekly' | 'biweekly' | 'monthly'
  periodStart: string; periodEnd: string
  processedAt: string; processedBy: string
  entries: PayrollEntry[]; totalGross: number
}
interface ShiftCorrection {
  id: string; entryId: string; staffId: string; staffName: string; shiftDate: string
  originalClockIn: string; originalClockOut: string | null; originalBreakMins: number
  newClockIn: string; newClockOut: string | null; newBreakMins: number
  reason: string; editedBy: string; editedById: string; editedAt: string
}
interface PeriodLock {
  id: string; runId: string; periodStart: string; periodEnd: string
  lockedBy: string; lockedAt: string; isLocked: boolean
  unlockedBy?: string; unlockedAt?: string
}

// ── Style constants ──────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--surf2)', border: '1px solid var(--bdr2)',
  borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13,
  color: 'var(--txt)', boxSizing: 'border-box' as const,
}
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--txt3)',
  textTransform: 'uppercase' as const, letterSpacing: '.5px',
  marginBottom: 4, display: 'block',
}

// ── Helpers ──────────────────────────────────────────────────────
const fmtJMD = (n: number) => 'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 })
const fmtHrs = (mins: number) => {
  const h = Math.floor(mins / 60), m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
const fmtDec = (mins: number) => (mins / 60).toFixed(2)
const todayStr = () => new Date().toISOString().slice(0, 10)
const nowHHMM = () => new Date().toTimeString().slice(0, 5)

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  let d = (bh * 60 + bm) - (ah * 60 + am)
  if (d < 0) d += 1440
  return d
}

function periodRange(type: 'weekly' | 'biweekly' | 'monthly'): [string, string] {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (type === 'weekly') {
    const day = now.getDay()
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return [fmt(mon), fmt(sun)]
  }
  if (type === 'biweekly') {
    const start = new Date(now); start.setDate(now.getDate() - 13)
    return [fmt(start), fmt(now)]
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return [fmt(start), fmt(end)]
}

function exportCSV(run: PayrollRun) {
  const header = ['Employee','Position','Pay Type','Total Hours','Regular Hours','OT Hours','Rate / Salary (J$)','Regular Pay (J$)','OT Pay (J$)','Tips (J$)','Gross Pay (J$)']
  const rows = run.entries.map(e => [
    e.staffName, e.position,
    e.payrollType === 'hourly' ? 'Hourly' : 'Weekly Salary',
    fmtDec(e.totalMinutes), e.regularHours.toFixed(2), e.overtimeHours.toFixed(2),
    e.payrollType === 'hourly' ? e.hourlyRate.toFixed(2) : e.weeklySalary.toFixed(2),
    e.regularPay.toFixed(2), e.overtimePay.toFixed(2), e.tips.toFixed(2), e.grossPay.toFixed(2),
  ])
  const totals = [
    'TOTAL','','','','','','',
    run.entries.reduce((s, e) => s + e.regularPay, 0).toFixed(2),
    run.entries.reduce((s, e) => s + e.overtimePay, 0).toFixed(2),
    run.entries.reduce((s, e) => s + e.tips, 0).toFixed(2),
    run.totalGross.toFixed(2),
  ]
  const csv = [header, ...rows, totals]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `payroll-${run.periodStart}-to-${run.periodEnd}.csv`,
  })
  a.click(); URL.revokeObjectURL(url)
}

// ── Profile Modal ─────────────────────────────────────────────────
function ProfileModal({ profile, users, existingStaffIds, onSave, onClose }: {
  profile: PayrollProfile | null
  users: { id: string; name: string; role: string }[]
  existingStaffIds: Set<string>
  onSave: (p: PayrollProfile) => void
  onClose: () => void
}) {
  const available = users.filter(u => !existingStaffIds.has(u.id) || u.id === profile?.staffId)
  const [form, setForm] = useState({
    staffId:            profile?.staffId ?? (available[0]?.id ?? ''),
    staffName:          profile?.staffName ?? (available[0]?.name ?? ''),
    position:           profile?.position ?? '',
    payrollType:        (profile?.payrollType ?? 'hourly') as 'hourly' | 'salary',
    hourlyRate:         profile?.hourlyRate ?? 700,
    weeklySalary:       profile?.weeklySalary ?? 25000,
    overtimeEligible:   profile?.overtimeEligible ?? true,
    overtimeThreshold:  profile?.overtimeThreshold ?? 40,
    overtimeMultiplier: profile?.overtimeMultiplier ?? 1.5,
    tipsEligible:       profile?.tipsEligible ?? false,
    active:             profile?.active ?? true,
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))
  const valid = !!form.staffId && form.position.trim().length > 0

  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{profile ? 'Edit Payroll Profile' : 'New Payroll Profile'}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {profile ? (
            <div style={{ padding: '9px 13px', background: 'var(--surf)', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
              {profile.staffName}
            </div>
          ) : (
            <div>
              <label style={lbl}>Staff Member *</label>
              <select style={inp} value={form.staffId} onChange={e => {
                const u = users.find(x => x.id === e.target.value)
                set('staffId', e.target.value)
                if (u) set('staffName', u.name)
              }}>
                {available.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
              {available.length === 0 && <div style={{ fontSize: 11, color: 'var(--ora)', marginTop: 4 }}>All staff already have profiles.</div>}
            </div>
          )}

          <div>
            <label style={lbl}>Position / Job Title *</label>
            <input style={inp} value={form.position} onChange={e => set('position', e.target.value)} placeholder="e.g. Server, Chef, Cashier" autoFocus={!!profile} />
          </div>

          <div>
            <label style={lbl}>Payroll Type *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['hourly', 'salary'] as const).map(t => (
                <button key={t} onClick={() => set('payrollType', t)} style={{
                  flex: 1, padding: '10px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                  border: `2px solid ${form.payrollType === t ? 'var(--blue)' : 'var(--bdr)'}`,
                  background: form.payrollType === t ? 'var(--blue-bg)' : 'transparent',
                  color: form.payrollType === t ? 'var(--blue)' : 'var(--txt3)',
                }}>
                  {t === 'hourly' ? '⏱ Hourly' : '📅 Weekly Salary'}
                </button>
              ))}
            </div>
          </div>

          {form.payrollType === 'hourly' ? (
            <div>
              <label style={lbl}>Hourly Rate (J$)</label>
              <input style={inp} type="number" min={0} step={50} value={form.hourlyRate} onChange={e => set('hourlyRate', Number(e.target.value))} />
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>
                Example: J${Number(form.hourlyRate).toLocaleString()} × 40 hrs = {fmtJMD(form.hourlyRate * 40)} regular weekly pay
              </div>
            </div>
          ) : (
            <div>
              <label style={lbl}>Weekly Salary (J$)</label>
              <input style={inp} type="number" min={0} step={1000} value={form.weeklySalary} onChange={e => set('weeklySalary', Number(e.target.value))} />
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Fixed weekly salary regardless of hours worked.</div>
            </div>
          )}

          {form.payrollType === 'hourly' && (
            <div style={{ padding: 12, background: 'var(--surf)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>Overtime Settings</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--txt2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.overtimeEligible} onChange={e => set('overtimeEligible', e.target.checked)} />
                Eligible for overtime pay
              </label>
              {form.overtimeEligible && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={lbl}>OT Threshold (hrs/week)</label>
                    <input style={inp} type="number" min={1} max={80} value={form.overtimeThreshold} onChange={e => set('overtimeThreshold', Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={lbl}>OT Multiplier (e.g. 1.5×)</label>
                    <input style={inp} type="number" min={1} max={3} step={0.25} value={form.overtimeMultiplier} onChange={e => set('overtimeMultiplier', Number(e.target.value))} />
                  </div>
                </div>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--txt2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.tipsEligible} onChange={e => set('tipsEligible', e.target.checked)} />
            Tips eligible — gratuity from transactions automatically included in gross pay
          </label>

          <div>
            <label style={lbl}>Status</label>
            <button onClick={() => set('active', !form.active)} style={{
              padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', border: 'none',
              background: form.active ? 'var(--grn-bg)' : 'var(--red-bg)',
              color: form.active ? 'var(--grn)' : 'var(--red)',
            }}>{form.active ? 'Active' : 'Inactive'}</button>
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" disabled={!valid} onClick={() => {
            if (!valid) return
            onSave({
              id: profile?.id ?? `PP-${form.staffId}`,
              staffId: form.staffId, staffName: form.staffName,
              position: form.position.trim(),
              payrollType: form.payrollType,
              hourlyRate: Number(form.hourlyRate),
              weeklySalary: Number(form.weeklySalary),
              overtimeEligible: form.overtimeEligible,
              overtimeThreshold: Number(form.overtimeThreshold),
              overtimeMultiplier: Number(form.overtimeMultiplier),
              tipsEligible: form.tipsEligible,
              active: form.active,
            })
          }}>
            {profile ? 'Save Changes' : 'Create Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Clock In Modal ───────────────────────────────────────────────
function ClockInModal({ users, onSave, onClose }: {
  users: { id: string; name: string }[]
  onSave: (e: Omit<TimeEntry, 'id'>) => void
  onClose: () => void
}) {
  const [staffId,   setStaffId]   = useState(users[0]?.id ?? '')
  const [staffName, setStaffName] = useState(users[0]?.name ?? '')
  const [date,      setDate]      = useState(todayStr())
  const [time,      setTime]      = useState(nowHHMM())
  const [notes,     setNotes]     = useState('')
  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">Clock In</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Staff Member</label>
            <select style={inp} value={staffId} onChange={e => {
              const u = users.find(x => x.id === e.target.value)
              setStaffId(e.target.value); if (u) setStaffName(u.name)
            }}>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Date</label>
              <input style={inp} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Clock In Time</label>
              <input style={inp} type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={lbl}>Notes (optional)</label>
            <input style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Opening shift" />
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" disabled={!staffId} onClick={() => {
            onSave({ staffId, staffName, date, clockIn: time, clockOut: null, breakMinutes: 0, notes })
            onClose()
          }}>Clock In</button>
        </div>
      </div>
    </div>
  )
}

// ── Clock Out Modal ──────────────────────────────────────────────
function ClockOutModal({ entry, defaultBreakMins, onSave, onClose }: {
  entry: TimeEntry
  defaultBreakMins: number
  onSave: (clockOut: string, breakMinutes: number) => void
  onClose: () => void
}) {
  const [time,      setTime]      = useState(nowHHMM())
  const [breakMins, setBreakMins] = useState(defaultBreakMins)
  const netMins = useMemo(() => {
    const gross = minutesBetween(entry.clockIn, time)
    return Math.max(0, gross - breakMins)
  }, [time, breakMins, entry.clockIn])
  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">Clock Out — {entry.staffName}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '9px 13px', background: 'var(--surf)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--txt2)' }}>
            Clocked in at <strong>{entry.clockIn}</strong> on <strong>{entry.date}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Clock Out Time</label>
              <input style={inp} type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Break (minutes)</label>
              <input style={inp} type="number" min={0} max={480} value={breakMins} onChange={e => setBreakMins(Number(e.target.value))} />
            </div>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--grn-bg)', borderRadius: 'var(--r)', textAlign: 'center', fontWeight: 700, color: 'var(--grn)', fontSize: 14 }}>
            Net Hours: {fmtHrs(netMins)} ({(netMins / 60).toFixed(2)}h)
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" onClick={() => { onSave(time, breakMins); onClose() }}>Confirm Clock Out</button>
        </div>
      </div>
    </div>
  )
}

// ── Manual / Edit Entry Modal ────────────────────────────────────
function EntryModal({ entry, users, onSave, onClose }: {
  entry: TimeEntry | null
  users: { id: string; name: string }[]
  onSave: (e: TimeEntry) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    staffId:      entry?.staffId ?? (users[0]?.id ?? ''),
    staffName:    entry?.staffName ?? (users[0]?.name ?? ''),
    date:         entry?.date ?? todayStr(),
    clockIn:      entry?.clockIn ?? '08:00',
    clockOut:     entry?.clockOut ?? '16:00',
    breakMinutes: entry?.breakMinutes ?? 30,
    notes:        entry?.notes ?? '',
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))
  const netMins = useMemo(() => {
    if (!form.clockOut) return 0
    const gross = minutesBetween(form.clockIn, form.clockOut)
    return Math.max(0, gross - form.breakMinutes)
  }, [form.clockIn, form.clockOut, form.breakMinutes])
  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{entry ? 'Edit Time Entry' : 'Manual Time Entry'}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Staff Member</label>
            <select style={inp} value={form.staffId} onChange={e => {
              const u = users.find(x => x.id === e.target.value)
              set('staffId', e.target.value); if (u) set('staffName', u.name)
            }}>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Date</label>
            <input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Clock In</label>
              <input style={inp} type="time" value={form.clockIn} onChange={e => set('clockIn', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Clock Out</label>
              <input style={inp} type="time" value={form.clockOut ?? ''} onChange={e => set('clockOut', e.target.value || null as unknown as string)} />
            </div>
            <div>
              <label style={lbl}>Break (min)</label>
              <input style={inp} type="number" min={0} value={form.breakMinutes} onChange={e => set('breakMinutes', Number(e.target.value))} />
            </div>
          </div>
          {form.clockOut && (
            <div style={{ padding: '9px 14px', background: 'var(--surf)', borderRadius: 'var(--r)', textAlign: 'center', fontSize: 12, color: 'var(--txt2)' }}>
              Net Hours: <strong style={{ color: 'var(--grn)', fontSize: 14 }}>{fmtHrs(netMins)}</strong>
              <span style={{ marginLeft: 6 }}>({(netMins / 60).toFixed(2)}h)</span>
            </div>
          )}
          <div>
            <label style={lbl}>Notes</label>
            <input style={inp} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" onClick={() => {
            onSave({ id: entry?.id ?? `TE-${Date.now()}`, ...form })
            onClose()
          }}>Save Entry</button>
        </div>
      </div>
    </div>
  )
}

// ── Correction Modal ──────────────────────────────────────────────
function CorrectionModal({ entry, currentUser, isLocked, isAdmin, onSave, onClose }: {
  entry: TimeEntry
  currentUser: { id: string; name: string; role: string; pin_hash: string } | null
  isLocked: boolean
  isAdmin: boolean
  onSave: (newEntry: TimeEntry, correction: ShiftCorrection) => void
  onClose: () => void
}) {
  const [newClockIn,   setNewClockIn]   = useState(entry.clockIn)
  const [newClockOut,  setNewClockOut]  = useState(entry.clockOut ?? '')
  const [newBreakMins, setNewBreakMins] = useState(entry.breakMinutes)
  const [reason,       setReason]       = useState('')
  const [pin,          setPin]          = useState('')
  const [pinError,     setPinError]     = useState('')
  const [saving,       setSaving]       = useState(false)

  const originalNet = useMemo(() => {
    if (!entry.clockOut) return 0
    return Math.max(0, minutesBetween(entry.clockIn, entry.clockOut) - entry.breakMinutes)
  }, [entry])

  const newNet = useMemo(() =>
    newClockOut ? Math.max(0, minutesBetween(newClockIn, newClockOut) - newBreakMins) : 0,
    [newClockIn, newClockOut, newBreakMins]
  )

  const diff = newNet - originalNet
  const hasChanges = newClockIn !== entry.clockIn || newClockOut !== (entry.clockOut ?? '') || newBreakMins !== entry.breakMinutes

  async function handleSave() {
    if (!reason.trim()) { setPinError('Reason for change is required'); return }
    if (!pin)            { setPinError('Your PIN is required to authorize this change'); return }
    if (!hasChanges)     { setPinError('No changes detected'); return }
    if (!currentUser)    return
    setSaving(true)
    try {
      const hashed = await hashPin(pin)
      if (hashed !== currentUser.pin_hash) {
        setPinError('Incorrect PIN — please try again')
        setSaving(false)
        return
      }
    } catch {
      setPinError('PIN verification failed'); setSaving(false); return
    }
    const now = new Date().toISOString()
    const newEntry: TimeEntry = { ...entry, clockIn: newClockIn, clockOut: newClockOut || entry.clockOut, breakMinutes: newBreakMins }
    const correction: ShiftCorrection = {
      id: `SC-${Date.now()}`,
      entryId: entry.id, staffId: entry.staffId, staffName: entry.staffName, shiftDate: entry.date,
      originalClockIn: entry.clockIn, originalClockOut: entry.clockOut, originalBreakMins: entry.breakMinutes,
      newClockIn, newClockOut: newClockOut || entry.clockOut, newBreakMins,
      reason: reason.trim(), editedBy: currentUser.name, editedById: currentUser.id, editedAt: now,
    }
    onSave(newEntry, correction)
  }

  if (isLocked && !isAdmin) {
    return (
      <div className="mo-bg" onClick={onClose}>
        <div className="mo" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
          <div className="mh"><span className="mt">Period Locked</span><button className="mx" onClick={onClose}>×</button></div>
          <div className="mb-c" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>This shift is in a locked payroll period</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Only an Administrator can unlock this period to allow corrections.</div>
          </div>
          <div className="mf"><button className="btn btn-gh" onClick={onClose}>Close</button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <div>
            <span className="mt">Correct Shift — {entry.staffName}</span>
            {isLocked && <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 10, fontWeight: 700 }}>🔓 Admin Override</span>}
          </div>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {isLocked && isAdmin && (
            <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
              ⚠ This shift is in an approved locked payroll period. You are editing as Administrator.
            </div>
          )}

          {/* Original values — read-only */}
          <div style={{ background: 'var(--surf)', borderRadius: 'var(--r)', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase' as const, letterSpacing: '.6px', marginBottom: 10 }}>Original Values</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
              {([['Clock In', entry.clockIn], ['Clock Out', entry.clockOut ?? '—'], ['Break', `${entry.breakMinutes}m`]] as [string, string][]).map(([label2, val]) => (
                <div key={label2}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase' as const, marginBottom: 4 }}>{label2}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--txt2)' }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Net hours: <strong style={{ color: 'var(--txt2)' }}>{fmtHrs(originalNet)}</strong></div>
          </div>

          {/* New values — editable */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase' as const, letterSpacing: '.6px', marginBottom: 8 }}>Corrected Values</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><label style={lbl}>New Clock In *</label><input style={inp} type="time" value={newClockIn} onChange={e => setNewClockIn(e.target.value)} /></div>
              <div><label style={lbl}>New Clock Out</label><input style={inp} type="time" value={newClockOut} onChange={e => setNewClockOut(e.target.value)} /></div>
              <div><label style={lbl}>Break (min)</label><input style={inp} type="number" min={0} max={480} value={newBreakMins} onChange={e => setNewBreakMins(Number(e.target.value))} /></div>
            </div>
          </div>

          {/* Hours comparison */}
          {newClockOut && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Original', value: fmtHrs(originalNet), color: 'var(--txt2)', bg: 'var(--surf)' },
                { label: 'New',      value: fmtHrs(newNet),      color: 'var(--grn)',  bg: 'var(--grn-bg)' },
                {
                  label: 'Difference',
                  value: `${diff >= 0 ? '+' : ''}${fmtHrs(Math.abs(diff))}`,
                  color: diff > 0 ? 'var(--grn)' : diff < 0 ? 'var(--red)' : 'var(--txt3)',
                  bg:    diff > 0 ? 'var(--grn-bg)' : diff < 0 ? 'var(--red-bg)' : 'var(--surf)',
                },
              ].map(item => (
                <div key={item.label} style={{ padding: '9px 12px', background: item.bg, borderRadius: 'var(--r)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 700, textTransform: 'uppercase' as const, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Reason */}
          <div>
            <label style={lbl}>Reason for Change *</label>
            <textarea
              style={{ ...inp, minHeight: 64, resize: 'vertical' as const, fontFamily: 'inherit' }}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe why this correction is needed (required)"
            />
          </div>

          {/* PIN */}
          <div>
            <label style={lbl}>{currentUser?.role === 'admin' ? 'Admin' : 'Manager'} PIN (to authorize) *</label>
            <input style={inp} type="password" value={pin} onChange={e => { setPin(e.target.value); setPinError('') }} placeholder="Enter your PIN" maxLength={6} autoComplete="off" />
          </div>

          {pinError && (
            <div style={{ color: 'var(--red)', fontSize: 12, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 'var(--r)', border: '1px solid rgba(239,68,68,.25)' }}>
              {pinError}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-pr" onClick={handleSave} disabled={saving || !reason.trim() || !pin || !hasChanges}>
            {saving ? 'Verifying...' : 'Save Correction'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Type badge helper ─────────────────────────────────────────────
function TypeBadge({ type }: { type: 'hourly' | 'salary' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: type === 'hourly' ? 'rgba(79,142,247,.15)' : 'rgba(246,153,63,.15)',
      color: type === 'hourly' ? 'var(--blue)' : 'var(--ora)',
    }}>
      {type === 'hourly' ? '⏱ Hourly' : '📅 Salary'}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────
export default function PayrollPage() {
  const { state, dispatch, toast } = useApp()
  const { users, currentUser, transactions } = state
  const activeUsers = users.filter(u => u.active)

  const canEdit = ['admin', 'manager'].includes(currentUser?.role ?? '')
  const isAdmin  = currentUser?.role === 'admin'

  // ── Persisted state ─────────────────────────────────────────────
  const [profiles, setProfiles] = useState<PayrollProfile[]>(() => {
    try { return JSON.parse(localStorage.getItem('payroll_profiles') ?? '[]') } catch { return [] }
  })
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('payroll_time_entries') ?? '[]') } catch { return [] }
  })
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>(() => {
    try { return JSON.parse(localStorage.getItem('payroll_runs') ?? '[]') } catch { return [] }
  })
  const [periodLocks, setPeriodLocks] = useState<PeriodLock[]>(() => {
    try { return JSON.parse(localStorage.getItem('payroll_period_locks') ?? '[]') } catch { return [] }
  })

  useEffect(() => { try { localStorage.setItem('payroll_profiles',      JSON.stringify(profiles))    } catch {} }, [profiles])
  useEffect(() => { try { localStorage.setItem('payroll_time_entries',  JSON.stringify(timeEntries)) } catch {} }, [timeEntries])
  useEffect(() => { try { localStorage.setItem('payroll_runs',          JSON.stringify(payrollRuns)) } catch {} }, [payrollRuns])
  useEffect(() => { try { localStorage.setItem('payroll_period_locks',  JSON.stringify(periodLocks)) } catch {} }, [periodLocks])

  // ── Tab ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'profiles' | 'timeclock' | 'process' | 'reports' | 'corrections'>('profiles')

  // ── Profiles ────────────────────────────────────────────────────
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [editProfile, setEditProfile] = useState<PayrollProfile | null>(null)
  const existingStaffIds = useMemo(() => new Set(profiles.map(p => p.staffId)), [profiles])

  const saveProfile = (p: PayrollProfile) => {
    setProfiles(prev => {
      const idx = prev.findIndex(x => x.id === p.id)
      return idx >= 0 ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]
    })
    setShowProfileModal(false); setEditProfile(null)
  }

  // ── Time Clock ──────────────────────────────────────────────────
  const [clockDate,      setClockDate]      = useState(todayStr())
  const [showClockIn,    setShowClockIn]    = useState(false)
  const [clockOutEntry,  setClockOutEntry]  = useState<TimeEntry | null>(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [editEntry,      setEditEntry]      = useState<TimeEntry | null>(null)

  // Correction state
  const [correctEntry,  setCorrectEntry]  = useState<TimeEntry | null>(null)
  const [corrections,   setCorrections]   = useState<ShiftCorrection[]>([])
  const [corrLoading,   setCorrLoading]   = useState(false)

  // Reports state
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [deleteRunId,   setDeleteRunId]   = useState<string | null>(null)
  const [unlockRunId,   setUnlockRunId]   = useState<string | null>(null)

  const activeEntries = timeEntries.filter(e => e.clockOut === null)
  const dateEntries   = timeEntries.filter(e => e.date === clockDate && e.clockOut !== null)

  // Load corrections from Supabase when corrections tab opens
  useEffect(() => {
    if (tab !== 'corrections') return
    setCorrLoading(true)
    supabase.from('shift_corrections').select('*').order('edited_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCorrections(data as unknown as ShiftCorrection[])
        setCorrLoading(false)
      })
  }, [tab])

  const doClockIn = (data: Omit<TimeEntry, 'id'>) => {
    const already = timeEntries.find(e => e.staffId === data.staffId && e.clockOut === null)
    if (already) { toast(`${data.staffName} is already clocked in`, 'warn'); return }
    setTimeEntries(prev => [{ id: `TE-${Date.now()}`, ...data }, ...prev])
  }

  const doClockOut = (entryId: string, clockOut: string, breakMinutes: number) => {
    setTimeEntries(prev => prev.map(e => e.id === entryId ? { ...e, clockOut, breakMinutes } : e))
    const e = timeEntries.find(x => x.id === entryId)
    if (e) {
      const net = Math.max(0, minutesBetween(e.clockIn, clockOut) - breakMinutes)
      void net
    }
  }

  const saveEntry = (e: TimeEntry) => {
    setTimeEntries(prev => {
      const idx = prev.findIndex(x => x.id === e.id)
      return idx >= 0 ? prev.map(x => x.id === e.id ? e : x) : [e, ...prev]
    })
  }

  const deleteEntry = (id: string) => {
    setTimeEntries(prev => prev.filter(e => e.id !== id))
  }

  // ── Period lock helpers ─────────────────────────────────────────
  function isDateLocked(date: string) {
    return periodLocks.some(l => l.isLocked && date >= l.periodStart && date <= l.periodEnd)
  }

  async function saveLock(runId: string) {
    if (!currentUser) return
    const run = payrollRuns.find(r => r.id === runId)
    if (!run) return
    const lock: PeriodLock = {
      id: `PL-${Date.now()}`, runId,
      periodStart: run.periodStart, periodEnd: run.periodEnd,
      lockedBy: currentUser.name, lockedAt: new Date().toISOString(), isLocked: true,
    }
    try {
      await supabase.from('payroll_period_locks').insert({
        run_id: lock.runId, period_start: lock.periodStart, period_end: lock.periodEnd,
        locked_by: lock.lockedBy, is_locked: true,
      })
    } catch {}
    setPeriodLocks(prev => [...prev.filter(l => l.runId !== runId), lock])
    dispatch({
      type: 'ADD_AUDIT',
      entry: {
        id: crypto.randomUUID(), ts: new Date().toLocaleString(),
        user: currentUser.name, userId: currentUser.id,
        action: 'PAYROLL_LOCK',
        detail: `Payroll period ${run.periodStart}→${run.periodEnd} locked by ${currentUser.name}`,
        type: 'info' as const, mod: state.activeModule,
      },
    })
    toast(`Period ${run.periodStart} → ${run.periodEnd} locked`, 'success')
  }

  async function doUnlock(runId: string) {
    if (!currentUser) return
    const run = payrollRuns.find(r => r.id === runId)
    if (!run) return
    try {
      await supabase.from('payroll_period_locks').update({
        is_locked: false, unlocked_by: currentUser.name, unlocked_at: new Date().toISOString(),
      }).eq('run_id', runId)
    } catch {}
    setPeriodLocks(prev => prev.map(l => l.runId === runId
      ? { ...l, isLocked: false, unlockedBy: currentUser.name, unlockedAt: new Date().toISOString() }
      : l
    ))
    dispatch({
      type: 'ADD_AUDIT',
      entry: {
        id: crypto.randomUUID(), ts: new Date().toLocaleString(),
        user: currentUser.name, userId: currentUser.id,
        action: 'PAYROLL_UNLOCK',
        detail: `Payroll period ${run.periodStart}→${run.periodEnd} UNLOCKED by ${currentUser.name}`,
        type: 'warn' as const, mod: state.activeModule,
      },
    })
    setUnlockRunId(null)
    toast(`Period ${run.periodStart} → ${run.periodEnd} unlocked`, 'success')
  }

  async function saveCorrection(newEntry: TimeEntry, correction: ShiftCorrection) {
    setTimeEntries(prev => prev.map(e => e.id === newEntry.id ? newEntry : e))
    try {
      await supabase.from('shift_corrections').insert({
        entry_id: correction.entryId, staff_id: correction.staffId, staff_name: correction.staffName,
        shift_date: correction.shiftDate,
        original_clock_in: correction.originalClockIn, original_clock_out: correction.originalClockOut,
        original_break_mins: correction.originalBreakMins,
        new_clock_in: correction.newClockIn, new_clock_out: correction.newClockOut,
        new_break_mins: correction.newBreakMins,
        reason: correction.reason, edited_by: correction.editedBy, edited_by_id: correction.editedById,
        edited_at: correction.editedAt,
      })
    } catch {}
    dispatch({
      type: 'ADD_AUDIT',
      entry: {
        id: crypto.randomUUID(), ts: new Date().toLocaleString(),
        user: correction.editedBy, userId: correction.editedById,
        action: 'SHIFT_CORRECTION',
        detail: `${correction.staffName} ${correction.shiftDate}: ${correction.originalClockIn}–${correction.originalClockOut ?? '?'} → ${correction.newClockIn}–${correction.newClockOut ?? '?'}. Reason: ${correction.reason}`,
        type: 'info' as const, mod: state.activeModule,
      },
    })
    setCorrectEntry(null)
    toast(`Correction saved for ${correction.staffName}`, 'success')
  }

  // ── Process Payroll ─────────────────────────────────────────────
  const [periodType,  setPeriodType]  = useState<'weekly' | 'biweekly' | 'monthly'>('weekly')
  const [periodStart, setPeriodStart] = useState(() => periodRange('weekly')[0])
  const [periodEnd,   setPeriodEnd]   = useState(() => periodRange('weekly')[1])
  const [preview,     setPreview]     = useState<PayrollEntry[]>([])
  const [calculated,  setCalculated]  = useState(false)

  const handlePeriodType = (t: 'weekly' | 'biweekly' | 'monthly') => {
    setPeriodType(t)
    const [s, e] = periodRange(t)
    setPeriodStart(s); setPeriodEnd(e)
    setCalculated(false); setPreview([])
  }

  const generatePayroll = () => {
    const active = profiles.filter(p => p.active)
    if (!active.length) { toast('No active payroll profiles', 'warn'); return }
    const days = Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) + 1
    const weeks = days / 7

    const entries: PayrollEntry[] = active.map(profile => {
      const rangeEntries = timeEntries.filter(e =>
        e.staffId === profile.staffId &&
        e.date >= periodStart && e.date <= periodEnd &&
        e.clockOut !== null
      )
      const totalMinutes = rangeEntries.reduce((sum, e) => {
        const gross = minutesBetween(e.clockIn, e.clockOut!)
        return sum + Math.max(0, gross - e.breakMinutes)
      }, 0)
      const totalHours = totalMinutes / 60

      let regularHours = 0, overtimeHours = 0, regularPay = 0, overtimePay = 0

      if (profile.payrollType === 'hourly') {
        const threshold = profile.overtimeEligible ? profile.overtimeThreshold * weeks : Infinity
        regularHours   = Math.min(totalHours, threshold)
        overtimeHours  = Math.max(0, totalHours - threshold)
        regularPay     = regularHours * profile.hourlyRate
        overtimePay    = overtimeHours * profile.hourlyRate * profile.overtimeMultiplier
      } else {
        regularHours = totalHours
        regularPay   = profile.weeklySalary * weeks
      }

      const tips = profile.tipsEligible
        ? transactions
            .filter(tx =>
              tx.userId === profile.staffId &&
              tx.ts.slice(0, 10) >= periodStart &&
              tx.ts.slice(0, 10) <= periodEnd &&
              !tx.voided
            )
            .reduce((sum, tx) => sum + (tx.gratuity ?? 0), 0)
        : 0

      const round2 = (n: number) => Math.round(n * 100) / 100
      return {
        staffId: profile.staffId, staffName: profile.staffName,
        position: profile.position, payrollType: profile.payrollType,
        totalMinutes,
        regularHours:  round2(regularHours),
        overtimeHours: round2(overtimeHours),
        hourlyRate:    profile.hourlyRate,
        weeklySalary:  profile.weeklySalary,
        regularPay:    round2(regularPay),
        overtimePay:   round2(overtimePay),
        tips:          round2(tips),
        grossPay:      round2(regularPay + overtimePay + tips),
      }
    })

    setPreview(entries); setCalculated(true)
  }

  const saveRun = () => {
    if (!preview.length) return
    const run: PayrollRun = {
      id: `PR-${Date.now()}`, periodType, periodStart, periodEnd,
      processedAt: new Date().toISOString(),
      processedBy: currentUser?.name ?? 'Manager',
      entries: preview,
      totalGross: Math.round(preview.reduce((s, e) => s + e.grossPay, 0) * 100) / 100,
    }
    setPayrollRuns(prev => [run, ...prev])
    setPreview([]); setCalculated(false)
    setTab('reports')
  }

  const TABS = [
    { id: 'profiles'    as const, label: '👤 Profiles',        count: profiles.length },
    { id: 'timeclock'   as const, label: '⏱ Time Clock',       count: activeEntries.length },
    { id: 'process'     as const, label: '💰 Process Payroll',  count: 0 },
    { id: 'reports'     as const, label: '📊 Reports',          count: payrollRuns.length },
    { id: 'corrections' as const, label: '📋 Corrections',      count: 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)', padding: '0 20px', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '11px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t.id ? 'var(--blue)' : 'transparent'}`,
            color: tab === t.id ? 'var(--blue)' : 'var(--txt3)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 800, background: tab === t.id ? 'var(--blue)' : 'var(--surf2)', color: tab === t.id ? '#fff' : 'var(--txt3)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ══ PROFILES ══════════════════════════════════════════ */}
        {tab === 'profiles' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Employee Payroll Profiles</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
                  {profiles.filter(p => p.active).length} active ·{' '}
                  {activeUsers.filter(u => !existingStaffIds.has(u.id)).length} staff without profile
                </div>
              </div>
              <button className="btn btn-pr" onClick={() => { setEditProfile(null); setShowProfileModal(true) }}>+ Add Profile</button>
            </div>

            {activeUsers.filter(u => !existingStaffIds.has(u.id)).length > 0 && (
              <div style={{ background: 'rgba(255,124,76,.08)', border: '1px solid rgba(255,124,76,.25)', borderRadius: 'var(--r2)', padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--txt2)' }}>
                ⚠ {activeUsers.filter(u => !existingStaffIds.has(u.id)).length} active staff member(s) have no payroll profile and will be excluded from payroll runs.
              </div>
            )}

            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Position</th>
                    <th>Pay Type</th>
                    <th>Rate / Salary</th>
                    <th>Overtime</th>
                    <th>Tips</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: 'var(--txt3)', fontSize: 13 }}>
                      No payroll profiles yet. Click &quot;+ Add Profile&quot; to set up employee pay.
                    </td></tr>
                  ) : profiles.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700, color: 'var(--txt)' }}>{p.staffName}</td>
                      <td style={{ color: 'var(--txt2)', fontSize: 12 }}>{p.position}</td>
                      <td><TypeBadge type={p.payrollType} /></td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {p.payrollType === 'hourly' ? `${fmtJMD(p.hourlyRate)}/hr` : `${fmtJMD(p.weeklySalary)}/wk`}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--txt2)' }}>
                        {p.payrollType === 'salary' ? '—' :
                          p.overtimeEligible ? `>${p.overtimeThreshold}h @ ${p.overtimeMultiplier}×` : 'None'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`b ${p.tipsEligible ? 'b-gn' : 'b-rd'}`}>{p.tipsEligible ? 'Yes' : 'No'}</span>
                      </td>
                      <td><span className={`b ${p.active ? 'b-gn' : 'b-rd'}`}>{p.active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-gh btn-xs" onClick={() => { setEditProfile(p); setShowProfileModal(true) }}>Edit</button>
                          <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }}
                            onClick={() => { setProfiles(prev => prev.filter(x => x.id !== p.id)) }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ TIME CLOCK ════════════════════════════════════════ */}
        {tab === 'timeclock' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Time Clock</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={clockDate} onChange={e => setClockDate(e.target.value)} style={{ ...inp, width: 'auto', padding: '7px 10px' }} />
                <button className="btn btn-gh" onClick={() => setClockDate(todayStr())}>Today</button>
                <button className="btn btn-pr" onClick={() => setShowClockIn(true)}>+ Clock In</button>
                <button className="btn btn-gh" onClick={() => { setEditEntry(null); setShowEntryModal(true) }}>+ Manual Entry</button>
              </div>
            </div>

            {activeEntries.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--grn)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
                  🟢 Currently Clocked In ({activeEntries.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeEntries.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--grn-bg)', border: '1px solid rgba(62,207,142,.2)', borderRadius: 'var(--r)' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: 'var(--txt)', fontSize: 13 }}>{e.staffName}</span>
                        <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 10 }}>{e.date} · In at {e.clockIn}</span>
                        {e.notes && <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 8 }}>· {e.notes}</span>}
                      </div>
                      <button className="btn btn-pr btn-xs" onClick={() => setClockOutEntry(e)}>Clock Out</button>
                      <button className="btn btn-gh btn-xs" onClick={() => { setEditEntry(e); setShowEntryModal(true) }}>Edit</button>
                      <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} onClick={() => deleteEntry(e.id)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
              Completed Entries — {clockDate}
            </div>
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Break</th>
                    <th>Net Hours</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dateEntries.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--txt3)', fontSize: 13 }}>
                      No completed entries for {clockDate}.
                    </td></tr>
                  ) : dateEntries.map(e => {
                    const net = Math.max(0, minutesBetween(e.clockIn, e.clockOut!) - e.breakMinutes)
                    const locked = isDateLocked(e.date)
                    return (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 700, color: 'var(--txt)' }}>{e.staffName}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{e.clockIn}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{e.clockOut}</td>
                        <td>
                          {e.notes.startsWith('auto · salary')
                            ? <span style={{ fontSize: 11, color: 'var(--txt3)', fontStyle: 'italic' }}>Attendance</span>
                            : e.breakMinutes > 0 ? `${e.breakMinutes}m` : '—'}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--grn)', fontFamily: 'var(--mono)' }}>{fmtHrs(net)}</span>
                          <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 5 }}>({(net / 60).toFixed(2)}h)</span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--txt3)' }}>
                          {e.notes.startsWith('auto ·')
                            ? <><span style={{ display: 'inline-block', fontSize: 10, padding: '1px 5px', borderRadius: 8, background: 'var(--blue-bg)', color: 'var(--blue)', fontWeight: 800, marginRight: 5 }}>auto</span>{e.notes.replace(/^auto · /, '')}</>
                            : e.notes || '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {canEdit && (
                              <button className="btn btn-gh btn-xs" onClick={() => setCorrectEntry(e)}>
                                {locked ? '🔒 Correct' : 'Correct'}
                              </button>
                            )}
                            <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} onClick={() => deleteEntry(e.id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ PROCESS PAYROLL ═══════════════════════════════════ */}
        {tab === 'process' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Process Payroll</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 18 }}>Select a pay period, generate the preview, then save the run.</div>

            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>Pay Period</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {(['weekly', 'biweekly', 'monthly'] as const).map(t => (
                  <button key={t} onClick={() => handlePeriodType(t)} style={{
                    padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: `2px solid ${periodType === t ? 'var(--blue)' : 'var(--bdr)'}`,
                    background: periodType === t ? 'var(--blue-bg)' : 'transparent',
                    color: periodType === t ? 'var(--blue)' : 'var(--txt3)',
                  }}>
                    {t === 'weekly' ? 'Weekly' : t === 'biweekly' ? 'Bi-Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                <div>
                  <label style={lbl}>Period Start</label>
                  <input style={inp} type="date" value={periodStart} onChange={e => { setPeriodStart(e.target.value); setCalculated(false); setPreview([]) }} />
                </div>
                <div>
                  <label style={lbl}>Period End</label>
                  <input style={inp} type="date" value={periodEnd} onChange={e => { setPeriodEnd(e.target.value); setCalculated(false); setPreview([]) }} />
                </div>
                <button className="btn btn-pr" onClick={generatePayroll} style={{ padding: '9px 20px', whiteSpace: 'nowrap' }}>
                  Generate Preview
                </button>
              </div>
            </div>

            {calculated && preview.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>
                    Payroll Preview — {periodStart} → {periodEnd}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)', fontSize: 15 }}>
                    Total Gross: {fmtJMD(preview.reduce((s, e) => s + e.grossPay, 0))}
                  </div>
                </div>
                <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', marginBottom: 14 }}>
                  <table className="dt">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Position</th>
                        <th>Type</th>
                        <th>Hours</th>
                        <th>Regular Pay</th>
                        <th>OT Pay</th>
                        <th>Tips</th>
                        <th style={{ color: 'var(--grn)' }}>Gross Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map(e => (
                        <tr key={e.staffId}>
                          <td style={{ fontWeight: 700, color: 'var(--txt)' }}>{e.staffName}</td>
                          <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{e.position}</td>
                          <td><TypeBadge type={e.payrollType} /></td>
                          <td>
                            <div style={{ fontSize: 12 }}>
                              <div style={{ fontWeight: 700 }}>{fmtDec(e.totalMinutes)}h</div>
                              {e.overtimeHours > 0 && <div style={{ color: 'var(--ora)', fontSize: 11 }}>{e.overtimeHours.toFixed(2)}h OT</div>}
                              {e.totalMinutes === 0 && e.payrollType === 'salary' && <div style={{ color: 'var(--txt3)', fontSize: 11 }}>No entries</div>}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtJMD(e.regularPay)}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: e.overtimePay > 0 ? 'var(--ora)' : 'var(--txt3)' }}>
                            {e.overtimePay > 0 ? fmtJMD(e.overtimePay) : '—'}
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', color: e.tips > 0 ? 'var(--grn)' : 'var(--txt3)' }}>
                            {e.tips > 0 ? fmtJMD(e.tips) : '—'}
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)', fontSize: 14 }}>
                            {fmtJMD(e.grossPay)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--bg2)', borderTop: '2px solid var(--bdr)' }}>
                        <td colSpan={4} style={{ fontWeight: 800, color: 'var(--txt)', padding: '10px 12px' }}>TOTALS</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{fmtJMD(preview.reduce((s, e) => s + e.regularPay, 0))}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--ora)' }}>{fmtJMD(preview.reduce((s, e) => s + e.overtimePay, 0))}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)' }}>{fmtJMD(preview.reduce((s, e) => s + e.tips, 0))}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)', fontSize: 15 }}>{fmtJMD(preview.reduce((s, e) => s + e.grossPay, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn btn-gh" onClick={() => { setPreview([]); setCalculated(false) }}>Clear</button>
                  <button className="btn btn-pr" onClick={saveRun}>Save Payroll Run</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', textAlign: 'right', marginTop: 6 }}>
                  After saving, go to Reports to approve and lock this period.
                </div>
              </>
            )}
            {calculated && preview.length === 0 && (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                No active payroll profiles found. Add profiles in the Profiles tab first.
              </div>
            )}
          </div>
        )}

        {/* ══ REPORTS ═══════════════════════════════════════════ */}
        {tab === 'reports' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginBottom: 16 }}>Payroll Reports</div>
            {payrollRuns.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                No payroll runs yet. Use the &quot;Process Payroll&quot; tab to generate one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {payrollRuns.map(run => {
                  const isOpen = selectedRunId === run.id
                  const lock   = periodLocks.find(l => l.runId === run.id)
                  const locked = lock?.isLocked ?? false
                  return (
                    <div key={run.id} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: isOpen ? 'var(--bg2)' : 'transparent' }}
                        onClick={() => setSelectedRunId(isOpen ? null : run.id)}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: 'var(--txt)', fontSize: 13 }}>
                            {run.periodType === 'weekly' ? 'Weekly' : run.periodType === 'biweekly' ? 'Bi-Weekly' : 'Monthly'} Payroll
                            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--txt3)', marginLeft: 10 }}>
                              {run.periodStart} → {run.periodEnd}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                            Processed {new Date(run.processedAt).toLocaleString()} by {run.processedBy} · {run.entries.length} employees
                          </div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)', fontSize: 15, flexShrink: 0 }}>
                          {fmtJMD(run.totalGross)}
                        </div>
                        {/* Lock status badge */}
                        <span style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                          border: '1px solid',
                          background: locked ? 'var(--red-bg)' : 'var(--grn-bg)',
                          color:      locked ? 'var(--red)'    : 'var(--grn)',
                          borderColor: locked ? 'rgba(239,68,68,.25)' : 'rgba(62,207,142,.2)',
                        }}>
                          {locked ? '🔒 Locked' : '🔓 Open'}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {canEdit && !locked && (
                            <button className="btn btn-gh btn-xs" style={{ whiteSpace: 'nowrap' }}
                              onClick={ev => { ev.stopPropagation(); saveLock(run.id) }}>🔒 Lock</button>
                          )}
                          {locked && isAdmin && (
                            <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.25)', whiteSpace: 'nowrap' }}
                              onClick={ev => { ev.stopPropagation(); setUnlockRunId(run.id) }}>🔓 Unlock</button>
                          )}
                          <button className="btn btn-gh btn-xs" onClick={e => { e.stopPropagation(); exportCSV(run) }}>📥 CSV</button>
                          <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }}
                            onClick={e => { e.stopPropagation(); setDeleteRunId(run.id) }}>Del</button>
                        </div>
                        <span style={{ color: 'var(--txt3)', fontSize: 13 }}>{isOpen ? '▲' : '▼'}</span>
                      </div>

                      {isOpen && (
                        <div style={{ borderTop: '1px solid var(--bdr)' }}>
                          <table className="dt">
                            <thead>
                              <tr>
                                <th>Employee</th>
                                <th>Position</th>
                                <th>Type</th>
                                <th>Total Hrs</th>
                                <th>Reg Hrs</th>
                                <th>OT Hrs</th>
                                <th>Regular Pay</th>
                                <th>OT Pay</th>
                                <th>Tips</th>
                                <th>Gross Pay</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.entries.map(e => (
                                <tr key={e.staffId}>
                                  <td style={{ fontWeight: 700, color: 'var(--txt)' }}>{e.staffName}</td>
                                  <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{e.position}</td>
                                  <td><TypeBadge type={e.payrollType} /></td>
                                  <td style={{ fontFamily: 'var(--mono)' }}>{fmtDec(e.totalMinutes)}h</td>
                                  <td style={{ fontFamily: 'var(--mono)' }}>{e.regularHours.toFixed(2)}h</td>
                                  <td style={{ fontFamily: 'var(--mono)', color: e.overtimeHours > 0 ? 'var(--ora)' : 'var(--txt3)' }}>
                                    {e.overtimeHours > 0 ? `${e.overtimeHours.toFixed(2)}h` : '—'}
                                  </td>
                                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtJMD(e.regularPay)}</td>
                                  <td style={{ fontFamily: 'var(--mono)', color: e.overtimePay > 0 ? 'var(--ora)' : 'var(--txt3)' }}>
                                    {e.overtimePay > 0 ? fmtJMD(e.overtimePay) : '—'}
                                  </td>
                                  <td style={{ fontFamily: 'var(--mono)', color: e.tips > 0 ? 'var(--grn)' : 'var(--txt3)' }}>
                                    {e.tips > 0 ? fmtJMD(e.tips) : '—'}
                                  </td>
                                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)' }}>{fmtJMD(e.grossPay)}</td>
                                </tr>
                              ))}
                              <tr style={{ background: 'var(--bg2)', borderTop: '2px solid var(--bdr)' }}>
                                <td colSpan={6} style={{ fontWeight: 800, padding: '10px 12px', color: 'var(--txt)' }}>TOTALS</td>
                                <td style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{fmtJMD(run.entries.reduce((s, e) => s + e.regularPay, 0))}</td>
                                <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--ora)' }}>{fmtJMD(run.entries.reduce((s, e) => s + e.overtimePay, 0))}</td>
                                <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)' }}>{fmtJMD(run.entries.reduce((s, e) => s + e.tips, 0))}</td>
                                <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)', fontSize: 15 }}>{fmtJMD(run.totalGross)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ CORRECTIONS ═══════════════════════════════════════ */}
        {tab === 'corrections' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>Shift Corrections Audit</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
                Complete history of all clock-in/out corrections — every change is permanently recorded in Supabase.
              </div>
            </div>
            {corrLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>Loading corrections...</div>
            ) : corrections.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                No corrections recorded yet. All shift corrections made through this system will appear here.
              </div>
            ) : (
              <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employee</th>
                      <th>Original</th>
                      <th>Corrected</th>
                      <th>Reason</th>
                      <th>Edited By</th>
                      <th>Edited At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corrections.map(c => {
                      const origNet = c.originalClockOut ? Math.max(0, minutesBetween(c.originalClockIn, c.originalClockOut) - c.originalBreakMins) : 0
                      const newNet  = c.newClockOut      ? Math.max(0, minutesBetween(c.newClockIn, c.newClockOut) - c.newBreakMins) : 0
                      const diff2   = newNet - origNet
                      return (
                        <tr key={c.id}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{c.shiftDate}</td>
                          <td style={{ fontWeight: 700, color: 'var(--txt)' }}>{c.staffName}</td>
                          <td style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                            {c.originalClockIn}–{c.originalClockOut ?? '?'}<br />
                            <span style={{ fontSize: 10 }}>{fmtHrs(origNet)}</span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--grn)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                            {c.newClockIn}–{c.newClockOut ?? '?'}<br />
                            <span style={{ fontSize: 10 }}>{fmtHrs(newNet)}
                              {diff2 !== 0 && (
                                <span style={{ color: diff2 > 0 ? 'var(--grn)' : 'var(--red)', marginLeft: 4 }}>
                                  ({diff2 > 0 ? '+' : ''}{fmtHrs(Math.abs(diff2))})
                                </span>
                              )}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--txt2)', maxWidth: 200 }}>{c.reason}</td>
                          <td style={{ fontSize: 12, color: 'var(--txt2)', fontWeight: 600 }}>{c.editedBy}</td>
                          <td style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                            {new Date(c.editedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showProfileModal && (
        <ProfileModal
          profile={editProfile}
          users={activeUsers}
          existingStaffIds={existingStaffIds}
          onSave={saveProfile}
          onClose={() => { setShowProfileModal(false); setEditProfile(null) }}
        />
      )}
      {showClockIn && (
        <ClockInModal
          users={activeUsers}
          onSave={doClockIn}
          onClose={() => setShowClockIn(false)}
        />
      )}
      {clockOutEntry && (
        <ClockOutModal
          entry={clockOutEntry}
          defaultBreakMins={(() => {
            const prof = profiles.find(p => p.staffId === clockOutEntry.staffId && p.active)
            return prof?.payrollType === 'hourly' ? 30 : 0
          })()}
          onSave={(co, bm) => doClockOut(clockOutEntry.id, co, bm)}
          onClose={() => setClockOutEntry(null)}
        />
      )}
      {showEntryModal && (
        <EntryModal
          entry={editEntry}
          users={activeUsers}
          onSave={saveEntry}
          onClose={() => { setShowEntryModal(false); setEditEntry(null) }}
        />
      )}
      {correctEntry && (
        <CorrectionModal
          entry={correctEntry}
          currentUser={currentUser as { id: string; name: string; role: string; pin_hash: string } | null}
          isLocked={isDateLocked(correctEntry.date)}
          isAdmin={isAdmin}
          onSave={saveCorrection}
          onClose={() => setCorrectEntry(null)}
        />
      )}
      {unlockRunId && (
        <div className="mo-bg" onClick={() => setUnlockRunId(null)}>
          <div className="mo" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="mh">
              <span className="mt">Unlock Payroll Period</span>
              <button className="mx" onClick={() => setUnlockRunId(null)}>×</button>
            </div>
            <div className="mb-c">
              <p style={{ fontSize: 13, color: 'var(--txt2)' }}>
                This will unlock the approved payroll period, allowing shift corrections to be made. The unlock event will be recorded in the audit log.
              </p>
            </div>
            <div className="mf">
              <button className="btn btn-gh" onClick={() => setUnlockRunId(null)}>Cancel</button>
              <button className="btn btn-red" onClick={() => doUnlock(unlockRunId)}>Unlock Period</button>
            </div>
          </div>
        </div>
      )}
      {deleteRunId && (
        <div className="mo-bg" onClick={() => setDeleteRunId(null)}>
          <div className="mo" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="mh">
              <span className="mt">Delete Payroll Run</span>
              <button className="mx" onClick={() => setDeleteRunId(null)}>×</button>
            </div>
            <div className="mb-c">
              <p style={{ fontSize: 13, color: 'var(--txt2)' }}>This will permanently delete this payroll run and cannot be undone.</p>
            </div>
            <div className="mf">
              <button className="btn btn-gh" onClick={() => setDeleteRunId(null)}>Cancel</button>
              <button className="btn btn-red" onClick={() => {
                setPayrollRuns(prev => prev.filter(r => r.id !== deleteRunId))
                if (selectedRunId === deleteRunId) setSelectedRunId(null)
                setDeleteRunId(null)
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
