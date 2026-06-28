use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { hashPin } from '@/lib/utils/hash'
import type { User } from '@/types'
import { supabase } from '@/lib/supabase'

type WStep = 'auth' | 'validate' | 'cash' | 'payments' | 'gratuity' | 'sales' | 'exceptions' | 'employees' | 'print' | 'confirm' | 'done'
const STEPS: WStep[] = ['auth','validate','cash','payments','gratuity','sales','exceptions','employees','print','confirm','done']
const STEP_LABELS: Record<WStep,string> = {
  auth:'Authorization', validate:'System Check', cash:'Cash Count', payments:'Payments',
  gratuity:'Gratuity', sales:'Sales', exceptions:'Exceptions', employees:'Employees', print:'Print', confirm:'Confirm', done:'Done',
}

const fmtJ = (n: number) => 'J$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})

interface CWData {
  authorizedUser: User | null
  openingFloat: string
  countedCash: string
  varianceNote: string
  override: boolean
}
interface Validation { heldOrders: number; openTickets: number; activeWashes: number; openTables: number }
interface CwOrder { id: string; ticket_no: string; customer_name: string; plate: string; service_name: string; service_price: number; addons_total: number; total: number; payment_method: string; status: string }

const SummaryRow = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) => (
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--bdr2)'}}>
    <span style={{fontSize:13,color:'var(--txt3)'}}>{label}</span>
    <span style={{fontSize:13,fontWeight:bold?800:600,color:color??'var(--txt)',fontFamily:bold?'var(--mono)':undefined}}>{value}</span>
  </div>
)

const Btn = ({ children, onClick, primary, danger, disabled, style: s }: {
  children: React.ReactNode; onClick?: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; style?: React.CSSProperties
}) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding:'10px 22px', borderRadius:'var(--r2)', fontSize:13, fontWeight:800, cursor:disabled?'not-allowed':'pointer',
    border: danger?'1px solid var(--red)':primary?'none':'1px solid var(--bdr)',
    background: danger?'var(--red)':primary?'var(--blue)':'var(--surf)',
    color: (primary||danger)?'#fff':'var(--txt)', opacity:disabled?.55:1, ...s,
  }}>{children}</button>
)

const Card = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--bdr)', borderRadius:'var(--r4)',
    overflow:'hidden', boxShadow:'0 32px 80px rgba(0,0,0,.7)' }}>
    {children}
  </div>
)
const CardHead = ({ title, sub, warn }: { title: string; sub?: string; warn?: boolean }) => (
  <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--bdr)', background: warn ? '#7f1d1d18' : undefined }}>
    <div style={{ fontSize:16, fontWeight:800, color: warn ? 'var(--red)' : 'var(--txt)' }}>{title}</div>
    {sub && <div style={{ fontSize:12, color:'var(--txt3)', marginTop:3 }}>{sub}</div>}
  </div>
)
const CardBody = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding:'20px 24px' }}>{children}</div>
)
const CardFoot = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding:'14px 24px', borderTop:'1px solid var(--bdr)', display:'flex', gap:10, justifyContent:'flex-end' }}>
    {children}
  </div>
)

export default function CloseShiftWizard() {
  const { state, dispatch, toast, audit } = useApp()
  const { currentUser, currentShift, users, transactions, heldOrders, orderTickets, isOnline, biz } = state
  const sym = biz.currencySymbol ?? 'J$'

  const [step,    setStep]    = useState<WStep>('auth')
  const [data,    setData]    = useState<CWData>({ authorizedUser:null, openingFloat:'', countedCash:'', varianceNote:'', override:false })
  const [val,     setVal]     = useState<Validation|null>(null)
  // Break overrides: keyed by payroll_time_entry id → approved break minutes
  const [breakOverrides, setBreakOverrides] = useState<Record<string, 0|15|30|45|60>>({})
  const [valLoading, setVL]   = useState(false)
  const [pinUser, setPinUser] = useState<User|null>(null)
  const [pin,     setPin]     = useState('')
  const [pinErr,  setPinErr]  = useState('')
  const [pinSt,   setPinSt]   = useState<'idle'|'error'|'success'>('idle')
  const openingFloatRef = useRef<HTMLInputElement>(null)
  const countedCashRef  = useRef<HTMLInputElement>(null)
  const [countedHasValue, setCountedHasValue] = useState(false)
  const [closing,  setClosing]  = useState(false)
  const [cwOrders, setCwOrders] = useState<CwOrder[]>([])
  const [cwActioning, setCwActioning] = useState<string | null>(null)
  const [savedShiftStart, setSavedShiftStart] = useState<string | null>(null)
  const [savedShiftId,    setSavedShiftId]    = useState<string | null>(null)
  const [countedSubmitted, setCountedSubmitted] = useState(false)

  // ── Shift transactions ────────────────────────────────────────
  const shiftStart = savedShiftStart ?? currentShift?.start ?? new Date(0).toISOString()
  const shiftTxs = transactions.filter(tx => {
    if (tx.voided) return false
    try { return new Date(tx.ts) >= new Date(shiftStart) } catch { return false }
  })

  // ── Payment breakdown ─────────────────────────────────────────
  const payMap: Record<string,number> = {}
  shiftTxs.filter(tx => !tx.refunded).forEach(tx => {
    const entries = (tx.payments && tx.payments.length > 0) ? tx.payments : [{ method: tx.pay, amount: tx.total }]
    entries.forEach(p => {
      const k = /cash/i.test(p.method) ? 'Cash' : /card|visa|master|debit|credit/i.test(p.method) ? 'Card' : 'Other'
      payMap[k] = (payMap[k] ?? 0) + p.amount
    })
  })

  const totalSales   = shiftTxs.reduce((s,tx)=>s+tx.total, 0)
  const totalRefunds = transactions
    .filter(tx => tx.refunded && new Date(tx.ts) >= new Date(shiftStart))
    .reduce((s,tx)=>s+(tx.refundAmount??0), 0)
  const totalDisc  = shiftTxs.reduce((s,tx)=>s+(tx.disc??0), 0)
  const totalTax   = shiftTxs.reduce((s,tx)=>s+(tx.gct??tx.tax??0), 0)
  const totalGrat  = shiftTxs.reduce((s,tx)=>s+(tx.gratuity??0), 0)
  const netSales   = totalSales - totalRefunds
  const avgTicket  = shiftTxs.length ? totalSales / shiftTxs.length : 0
  const openItemTotal = shiftTxs.reduce((s, tx) => s + (tx.items?.filter(ci => ci.openItem && !ci.voided).reduce((n, ci) => n + ci.price * ci.qty, 0) ?? 0), 0)
  const openItemCount = shiftTxs.reduce((s, tx) => s + (tx.items?.filter(ci => ci.openItem && !ci.voided).reduce((n, ci) => n + ci.qty, 0) ?? 0), 0)

  const modMap: Record<string,{count:number;total:number}> = {}
  shiftTxs.forEach(tx => {
    const m = (tx.mod === 'mixed' ? 'restaurant' : tx.mod) ?? 'restaurant'
    if (!modMap[m]) modMap[m] = { count:0, total:0 }
    modMap[m].count++; modMap[m].total += tx.total
  })

  const empMap: Record<string,{count:number;total:number;tips:number}> = {}
  shiftTxs.forEach(tx => {
    const n = tx.cashier ?? 'Unknown'
    if (!empMap[n]) empMap[n] = { count:0, total:0, tips:0 }
    empMap[n].count++; empMap[n].total += tx.total; empMap[n].tips += tx.gratuity ?? 0
  })

  const floatNum   = parseFloat(data.openingFloat) || 0
  const countedNum = parseFloat(data.countedCash)  || 0
  const cashSales  = payMap['Cash'] ?? 0
  const expected   = floatNum + cashSales
  const variance   = data.countedCash.trim() ? countedNum - expected : null
  const VAR_LIMIT  = 5000

  const mgrs = users.filter(u => u.active && (u.role === 'admin' || u.role === 'manager'))

  // ── PIN auth ──────────────────────────────────────────────────
  const pressPin = useCallback(async (d: string) => {
    if (!pinUser || pin.length >= 4) return
    setPinErr('')
    const np = pin + d
    setPin(np)
    if (np.length === 4) {
      setTimeout(async () => {
        let ok = false
        if (pinUser.pin_hash) { const h = await hashPin(np); ok = h === pinUser.pin_hash }
        else ok = np === (pinUser.pin ?? '')
        if (ok) {
          setPinSt('success')
          setTimeout(() => { setData(d => ({ ...d, authorizedUser: pinUser })); setStep('validate') }, 280)
        } else {
          setPinSt('error'); setPinErr('Incorrect PIN')
          setTimeout(() => { setPin(''); setPinSt('idle') }, 800)
        }
      }, 100)
    }
  }, [pinUser, pin])

  // Keyboard support for PIN pad — type digits or Backspace when a user is selected
  useEffect(() => {
    if (step !== 'auth') return
    const handler = (e: KeyboardEvent) => {
      if (!pinUser) return
      if (e.key >= '0' && e.key <= '9') pressPin(e.key)
      else if (e.key === 'Backspace') { setPin(p => p.slice(0, -1)); setPinErr('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, pinUser, pressPin])

  // Auto-logout 3 seconds after shift is closed
  useEffect(() => {
    if (step !== 'done') return
    const t = setTimeout(() => {
      dispatch({ type: 'LOGOUT' })
      dispatch({ type: 'HIDE_EOD' })
    }, 3000)
    return () => clearTimeout(t)
  }, [step, dispatch])

  // Auto-focus opening float when cash step loads
  useEffect(() => {
    if (step === 'cash') {
      const t = setTimeout(() => openingFloatRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [step])

  // ── System validation ─────────────────────────────────────────
  useEffect(() => {
    if (step !== 'validate') return
    setVL(true)
    const openTix  = orderTickets.filter(t => t.status == null || !['paid','voided'].includes(t.status)).length
    const cwFetch  = fetch('/api/carwash-orders').then(r => r.ok ? r.json() : []).catch(() => [])
    const tblFetch = (async (): Promise<number> => {
      if (!supabase) return 0
      try {
        const { count } = await supabase.from('table_owners').select('*', { count: 'exact', head: true })
        return count ?? 0
      } catch { return 0 }
    })()
    Promise.all([cwFetch, tblFetch])
      .then(([orders, openTables]: [(CwOrder & { status: string })[], number]) => {
        const aw = orders.filter(o => ['waiting','in_progress','ready'].includes(o.status)).length
        setCwOrders(orders)
        setVal({ heldOrders: heldOrders.length, openTickets: openTix, activeWashes: aw, openTables })
      })
      .catch(() => setVal({ heldOrders: heldOrders.length, openTickets: openTix, activeWashes: 0, openTables: 0 }))
      .finally(() => setVL(false))
  }, [step, heldOrders.length, orderTickets])

  // ── Execute close ─────────────────────────────────────────────
  const doClose = async () => {
    setClosing(true)
    const by = data.authorizedUser?.name ?? currentUser?.name ?? 'Manager'
    // Capture shift data before dispatch nulls out currentShift
    setSavedShiftStart(currentShift?.start ?? new Date(0).toISOString())
    setSavedShiftId(currentShift?.id ?? null)
    dispatch({ type: 'CLOSE_SHIFT_FORMAL', closedBy: by, closedAt: new Date().toISOString(),
      openingFloat: floatNum, countedCash: countedNum, variance: variance ?? 0,
      varianceNote: data.varianceNote, wasOverridden: data.override })
    audit('SHIFT_CLOSED', `Closed by ${by} — Net Sales ${fmtJ(netSales)}, Cash variance: ${variance != null ? fmtJ(variance) : 'N/A'}`, 'success')
    setClosing(false)
    setStep('done')
  }

  // ── Close from anywhere ───────────────────────────────────────
  const cancel = () => dispatch({ type: 'HIDE_EOD' })

  // ── Car wash ticket actions ───────────────────────────────────
  const cwAction = async (id: string, newStatus: 'completed' | 'voided') => {
    setCwActioning(id)
    try {
      await fetch('/api/carwash-orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: newStatus }) })
      setCwOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o))
      setVal(v => v ? { ...v, activeWashes: v.activeWashes - 1 } : v)
    } catch { /* ignore */ } finally {
      setCwActioning(null)
    }
  }

  // ── PIN pad ───────────────────────────────────────────────────
  const PAD = [['1','2','3'],['4','5','6'],['7','8','9'],['←','0','—']] as const

  // ── Progress ──────────────────────────────────────────────────
  const progressSteps = STEPS.filter(s => s !== 'done')
  const si = STEPS.indexOf(step)

  const Back = ({ to }: { to: WStep }) => (
    <Btn onClick={() => { if (step === 'payments') setCountedSubmitted(false); setStep(to) }}>← Back</Btn>
  )
  const Next = ({ to, label = 'Continue →', disabled }: { to: WStep; label?: string; disabled?: boolean }) => (
    <Btn primary onClick={() => setStep(to)} disabled={disabled}>{label}</Btn>
  )

  // ═══════════════════════════════════════════════════════════════
  // STEP RENDERS
  // ═══════════════════════════════════════════════════════════════

  const renderAuth = () => (
    <Card>
      <CardHead title="Manager Authorization" sub="Select your name and enter your PIN to proceed" />
      <div style={{ padding:'20px 24px', display:'flex', gap:24, flexWrap:'wrap' }}>

        {/* Manager list */}
        <div style={{ flex:'0 0 auto', minWidth:170 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:10 }}>Managers</div>
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {mgrs.length === 0 && (
              <div style={{ fontSize:12, color:'var(--txt3)' }}>No managers found</div>
            )}
            {mgrs.map(u => (
              <button key={u.id} onClick={() => { setPinUser(u); setPin(''); setPinErr(''); setPinSt('idle') }}
                style={{ padding:'10px 14px', borderRadius:'var(--r2)', fontSize:13, fontWeight:700, cursor:'pointer',
                  textAlign:'left', border:`2px solid ${pinUser?.id===u.id ? 'var(--blue)' : 'var(--bdr)'}`,
                  background: pinUser?.id===u.id ? 'var(--blue-bg)' : 'var(--surf)',
                  color: pinUser?.id===u.id ? 'var(--blue)' : 'var(--txt)' }}>
                <span style={{ color: u.color, marginRight:6 }}>●</span>
                {u.name.split(' ')[0]}
                <span style={{ fontSize:10, marginLeft:6, opacity:.6, textTransform:'capitalize' }}>{u.role}</span>
              </button>
            ))}
          </div>
        </div>

        {/* PIN entry */}
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:10 }}>Enter PIN</div>
          {/* Dots */}
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:12 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width:14, height:14, borderRadius:'50%', transition:'background .12s',
                background: i < pin.length
                  ? (pinSt==='error' ? 'var(--red)' : pinSt==='success' ? 'var(--grn)' : 'var(--blue)')
                  : 'var(--bdr2)' }} />
            ))}
          </div>
          {pinErr && <div style={{ textAlign:'center', fontSize:12, color:'var(--red)', marginBottom:8 }}>{pinErr}</div>}
          {!pinUser && <div style={{ textAlign:'center', fontSize:12, color:'var(--txt3)', marginBottom:8 }}>← Select a manager</div>}
          {/* Numpad */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
            {PAD.flat().map(d => (
              <button key={d} onClick={() => {
                if (d === '←') { setPin(p => p.slice(0,-1)); setPinErr('') }
                else if (d !== '—') pressPin(d)
              }} style={{ padding:'13px 0', borderRadius:'var(--r2)', fontSize:15, fontWeight:700,
                cursor: d==='—' ? 'default' : 'pointer',
                border:'1px solid var(--bdr)', background: d==='—' ? 'transparent' : 'var(--surf)',
                color: d==='—' ? 'transparent' : 'var(--txt)' }}>
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
      <CardFoot>
        <Btn onClick={cancel}>Cancel</Btn>
      </CardFoot>
    </Card>
  )

  const renderValidate = () => {
    const checks = [
      { label:'Held / Suspended Orders',      val: val?.heldOrders  ?? 0, note:'Recall and complete or void before closing' },
      { label:'Open Unpaid Tables / Tickets', val: val?.openTickets ?? 0, note:'Process payment or void open tickets' },
      { label:'Active Car Wash Tickets',      val: val?.activeWashes ?? 0, note:'Complete or cancel active wash queue' },
      { label:'Open Assigned Tables',         val: val?.openTables  ?? 0, note:'Transfer all tables to another staff member before closing' },
    ]
    const allClear = val && checks.every(c => c.val === 0)
    return (
      <Card>
        <CardHead title="System Validation" sub="Checking for open items before shift close" />
        <CardBody>
          {valLoading ? (
            <div style={{ textAlign:'center', padding:32, color:'var(--txt3)', fontSize:13 }}>Checking system…</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {checks.map(c => (
                <div key={c.label} style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px',
                  borderRadius:'var(--r2)', border:`1px solid ${c.val===0 ? '#16a34a44' : 'rgba(245,101,101,.3)'}`,
                  background: c.val===0 ? '#14532d18' : '#7f1d1d18' }}>
                  <span style={{ fontSize:18 }}>{c.val===0 ? '✅' : '⚠️'}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{c.label}</div>
                    {c.val > 0 && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{c.val} open — {c.note}</div>}
                  </div>
                  <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--mono)',
                    color: c.val===0 ? 'var(--grn)' : 'var(--red)' }}>
                    {c.val === 0 ? 'Clear' : c.val}
                  </div>
                </div>
              ))}
              {val && !allClear && (
                <div style={{ padding:'12px 14px', borderRadius:'var(--r2)', fontSize:12, color:'var(--ora)',
                  background:'#78350f18', border:'1px solid rgba(251,146,60,.3)', marginTop:4 }}>
                  ⚠️ Open transactions detected. Resolve them or use manager override to force-close.
                </div>
              )}
              {val && (val.activeWashes ?? 0) > 0 && (
                <div style={{ padding:'12px 14px', borderRadius:'var(--r2)', marginTop:4,
                  background:'#1e3a5f18', border:'1px solid rgba(59,130,246,.3)', display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--blue)' }}>Active Car Wash Tickets — complete or cancel each one:</div>
                  {cwOrders.filter(o => ['waiting','in_progress','ready'].includes(o.status)).map(o => (
                    <div key={o.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                      borderRadius:'var(--r)', background:'var(--surf)', border:'1px solid var(--bdr)', flexWrap:'wrap' }}>
                      <div style={{ flex:1, minWidth:120 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--txt)' }}>{o.ticket_no} — {o.service_name}</div>
                        {o.plate && <div style={{ fontSize:11, color:'var(--txt3)' }}>{o.plate}{o.customer_name ? ` · ${o.customer_name}` : ''}</div>}
                      </div>
                      <button disabled={cwActioning === o.id} onClick={() => cwAction(o.id, 'completed')}
                        style={{ padding:'5px 12px', borderRadius:'var(--r)', fontSize:11, fontWeight:700, cursor:'pointer',
                          background:'var(--grn)', color:'#fff', border:'none', opacity: cwActioning === o.id ? .5 : 1 }}>
                        Complete
                      </button>
                      <button disabled={cwActioning === o.id} onClick={() => cwAction(o.id, 'voided')}
                        style={{ padding:'5px 12px', borderRadius:'var(--r)', fontSize:11, fontWeight:700, cursor:'pointer',
                          background:'var(--red)', color:'#fff', border:'none', opacity: cwActioning === o.id ? .5 : 1 }}>
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {val && (val.openTables ?? 0) > 0 && (
                <div style={{ padding:'12px 14px', borderRadius:'var(--r2)', marginTop:4,
                  background:'#7f1d1d10', border:'1px solid rgba(245,101,101,.25)',
                  display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div style={{ flex:1, fontSize:12, color:'var(--red)', fontWeight:600 }}>
                    {val.openTables} table{val.openTables === 1 ? '' : 's'} still assigned to staff. Cancel and go to Admin &rarr; Tables to transfer or release them.
                  </div>
                  <button onClick={cancel}
                    style={{ padding:'7px 16px', borderRadius:'var(--r)', background:'var(--surf)', border:'1px solid var(--bdr)', color:'var(--txt)', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                    Cancel &amp; Manage Tables
                  </button>
                </div>
              )}
            </div>
          )}
        </CardBody>
        <CardFoot>
          <Back to="auth" />
          {!valLoading && !allClear && val && (
            <Btn danger onClick={() => { setData(d => ({ ...d, override:true })); setStep('cash') }}>
              Force Close (Override)
            </Btn>
          )}
          {!valLoading && allClear && (
            <Next to="cash" />
          )}
        </CardFoot>
      </Card>
    )
  }

  const renderCash = () => {
    const needsNote = variance !== null && Math.abs(variance) > VAR_LIMIT
    const canContinue = !needsNote || data.varianceNote.trim().length > 0
    const varColor = variance === null ? 'var(--txt3)' : variance === 0 ? 'var(--grn)' : variance > 0 ? 'var(--blue)' : 'var(--red)'
    return (
      <Card>
        <CardHead title="Cash Drawer Count" sub="Count the physical cash in the drawer and record it below" />
        <CardBody>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Opening Float */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:7 }}>
                Opening Float (cash at start of shift)
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, color:'var(--txt3)', flexShrink:0 }}>{sym}</span>
                <input
                  ref={openingFloatRef}
                  type="text" inputMode="decimal"
                  value={data.openingFloat}
                  onChange={e => setData(d => ({ ...d, openingFloat: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') countedCashRef.current?.focus() }}
                  placeholder="0.00"
                  style={{ flex:1, padding:'10px 14px', borderRadius:'var(--r2)', fontSize:15, fontWeight:700,
                    border:'1.5px solid var(--bdr)',
                    background:'var(--bg3)', color:'var(--txt)', outline:'none' }} />
              </div>
            </div>

            {/* Actual Cash Counted */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:7 }}>
                Actual Cash Counted (physical count)
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, color:'var(--txt3)', flexShrink:0 }}>{sym}</span>
                <input
                  ref={countedCashRef}
                  type="text" inputMode="decimal"
                  value={data.countedCash}
                  onChange={e => {
                    const v = e.target.value
                    setData(d => ({ ...d, countedCash: v }))
                    setCountedHasValue(!!v.trim())
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && data.countedCash.trim()) setCountedSubmitted(true) }}
                  placeholder="0.00"
                  style={{ flex:1, padding:'10px 14px', borderRadius:'var(--r2)', fontSize:15, fontWeight:700,
                    border:'1.5px solid var(--bdr)',
                    background:'var(--bg3)', color:'var(--txt)', outline:'none' }} />
              </div>
            </div>

            {/* Blind count: submit physical count first, then reveal expected */}
            {!countedSubmitted ? (
              <button
                onClick={() => { if (countedHasValue) setCountedSubmitted(true) }}
                disabled={!countedHasValue}
                style={{ marginTop:4, padding:'11px 0', borderRadius:'var(--r2)', fontSize:13, fontWeight:800,
                  cursor:countedHasValue?'pointer':'not-allowed',
                  background:countedHasValue?'var(--blue)':'var(--surf3)',
                  color:countedHasValue?'#fff':'var(--txt3)', border:'none', width:'100%' }}>
                Submit Count &amp; Reveal Expected
              </button>
            ) : (
              <div style={{ background:'var(--surf)', borderRadius:'var(--r2)', padding:'14px 16px', marginTop:4 }}>
                <SummaryRow label="Cash Sales This Shift" value={fmtJ(cashSales)} />
                <SummaryRow label="Expected Cash in Drawer" value={fmtJ(expected)} bold />
                {variance !== null && (
                  <SummaryRow
                    label={variance >= 0 ? 'Over' : 'Short'}
                    value={(variance > 0 ? '+' : '') + fmtJ(variance)}
                    bold color={varColor} />
                )}
              </div>
            )}

            {/* Variance note */}
            {needsNote && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:7 }}>
                  Variance exceeds {sym}{VAR_LIMIT.toLocaleString()} — explanation required
                </div>
                <textarea value={data.varianceNote}
                  onChange={e => setData(d => ({ ...d, varianceNote: e.target.value }))}
                  placeholder="Explain the variance (e.g., bank change, petty cash payout, etc.)"
                  rows={3}
                  style={{ width:'100%', padding:'10px 14px', borderRadius:'var(--r2)', fontSize:13, resize:'vertical',
                    border:`1.5px solid ${data.varianceNote ? 'var(--blue)' : 'var(--red)'}`,
                    background:'var(--bg3)', color:'var(--txt)', outline:'none' }} />
              </div>
            )}
          </div>
        </CardBody>
        <CardFoot>
          <Back to="validate" />
          <Next to="payments" disabled={!canContinue || !countedSubmitted} />
        </CardFoot>
      </Card>
    )
  }

  const renderPayments = () => {
    const payRows = [
      { label:'Cash 💵',  val: payMap['Cash']  ?? 0, color:'var(--grn)' },
      { label:'Card 💳',  val: payMap['Card']  ?? 0, color:'var(--blue)' },
      { label:'Other',    val: payMap['Other'] ?? 0, color:'var(--txt2)' },
    ]
    return (
      <Card>
        <CardHead title="Payment Reconciliation" sub={`${shiftTxs.length} transactions processed this shift`} />
        <CardBody>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {payRows.map(p => (
                <div key={p.label} style={{ background:'var(--surf)', border:'1px solid var(--bdr)',
                  borderRadius:'var(--r3)', padding:'14px 16px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>{p.label}</div>
                  <div style={{ fontSize:18, fontWeight:900, color:p.color, fontFamily:'var(--mono)' }}>{fmtJ(p.val)}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--surf)', borderRadius:'var(--r2)', padding:'14px 16px' }}>
              <SummaryRow label="Gross Sales"       value={fmtJ(totalSales)} />
              {totalRefunds > 0 && <SummaryRow label="Refunds"        value={'-'+fmtJ(totalRefunds)} color="var(--red)" />}
              <SummaryRow label="Net Sales"         value={fmtJ(netSales)} bold color="var(--blue)" />
              {totalDisc > 0 && <SummaryRow label="Discounts Given" value={'-'+fmtJ(totalDisc)} color="var(--ora)" />}
              <SummaryRow label="Tax Collected (GCT)" value={fmtJ(totalTax)} />
            </div>
          </div>
        </CardBody>
        <CardFoot>
          <Back to="cash" />
          <Next to="gratuity" />
        </CardFoot>
      </Card>
    )
  }

  const renderGratuity = () => {
    const empGrat = Object.entries(empMap).filter(([,v]) => v.tips > 0).sort((a,b) => b[1].tips - a[1].tips)
    return (
      <Card>
        <CardHead title="Gratuity & Tips" sub="Tips and automatic gratuity collected this shift" />
        <CardBody>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'Automatic Gratuity', val:totalGrat, color:'var(--grn)' },
                { label:'Total Tips',         val:totalGrat, color:'var(--blue)' },
              ].map(x => (
                <div key={x.label} style={{ background:'var(--surf)', border:'1px solid var(--bdr)', borderRadius:'var(--r3)', padding:'14px 16px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>{x.label}</div>
                  <div style={{ fontSize:22, fontWeight:900, color:x.val>0?x.color:'var(--txt3)', fontFamily:'var(--mono)' }}>{fmtJ(x.val)}</div>
                </div>
              ))}
            </div>
            {empGrat.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>Tips by Employee</div>
                {empGrat.map(([name,v]) => (
                  <div key={name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'10px 14px', borderRadius:'var(--r2)', background:'var(--surf)', border:'1px solid var(--bdr)', marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{name}</span>
                    <span style={{ fontSize:13, fontWeight:800, color:'var(--grn)', fontFamily:'var(--mono)' }}>{fmtJ(v.tips)}</span>
                  </div>
                ))}
              </div>
            )}
            {totalGrat === 0 && (
              <div style={{ textAlign:'center', color:'var(--txt3)', padding:'16px 0', fontSize:13 }}>No gratuity recorded this shift</div>
            )}
          </div>
        </CardBody>
        <CardFoot>
          <Back to="payments" />
          <Next to="sales" />
        </CardFoot>
      </Card>
    )
  }

  const renderSales = () => {
    // ── Per-module aggregates from POS transactions ────────────
    type ModStats = { count:number; sub:number; disc:number; tax:number; grat:number; total:number }
    const modStats: Record<string, ModStats> = {
      restaurant: { count:0, sub:0, disc:0, tax:0, grat:0, total:0 },
      bar:        { count:0, sub:0, disc:0, tax:0, grat:0, total:0 },
    }
    // car wash transactions tracked separately — do not fold into restaurant
    const cwShiftTxs = shiftTxs.filter(tx => tx.mod === 'carwash')
    shiftTxs.filter(tx => tx.mod !== 'carwash').forEach(tx => {
      const m = (tx.mod === 'bar') ? 'bar' : 'restaurant'
      modStats[m].count++
      modStats[m].sub   += tx.sub   ?? tx.total
      modStats[m].disc  += tx.disc  ?? 0
      modStats[m].tax   += tx.gct   ?? tx.tax ?? 0
      modStats[m].grat  += tx.gratuity ?? 0
      modStats[m].total += tx.total
    })

    // ── Car wash from shift transactions (actual paid amounts) ─
    const cwTotal = cwShiftTxs.reduce((s,tx) => s + tx.total, 0)
    const cwCount = cwShiftTxs.length

    // ── Combined grand total ───────────────────────────────────
    const posTotal       = modStats.restaurant.total + modStats.bar.total
    const grandTotal     = posTotal + cwTotal
    const grandOrders    = shiftTxs.filter(tx => tx.mod !== 'carwash').length + cwCount
    const grandDisc      = modStats.restaurant.disc + modStats.bar.disc
    const grandTax       = modStats.restaurant.tax  + modStats.bar.tax
    const grandGrat      = modStats.restaurant.grat + modStats.bar.grat

    const ModPanel = ({ id, label, icon, color, stats, note }: {
      id: string; label: string; icon: string; color: string
      stats: { count:number; sub:number; disc:number; tax:number; grat:number; total:number } | null
      note?: React.ReactNode
    }) => (
      <div style={{ background:'var(--surf)', border:`1.5px solid ${stats && stats.total > 0 ? color+'55' : 'var(--bdr)'}`,
        borderRadius:'var(--r3)', overflow:'hidden' }}>
        {/* Module header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--bdr)', display:'flex', alignItems:'center', gap:10,
          background: stats && stats.total > 0 ? color+'0d' : undefined }}>
          <span style={{ fontSize:18 }}>{icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:800, color: stats && stats.total > 0 ? color : 'var(--txt3)' }}>{label}</div>
            <div style={{ fontSize:11, color:'var(--txt3)' }}>{stats?.count ?? 0} {id === 'carwash' ? 'tickets' : 'orders'}</div>
          </div>
          <div style={{ fontSize:18, fontWeight:900, color: stats && stats.total > 0 ? color : 'var(--txt3)',
            fontFamily:'var(--mono)' }}>{fmtJ(stats?.total ?? 0)}</div>
        </div>
        {/* Detail rows */}
        {stats && stats.total > 0 && (
          <div style={{ padding:'10px 16px' }}>
            {note ?? <>
              <SummaryRow label="Subtotal"    value={fmtJ(stats.sub)} />
              {stats.disc > 0 && <SummaryRow label="Discounts" value={'-'+fmtJ(stats.disc)} color="var(--ora)" />}
              {stats.tax  > 0 && <SummaryRow label="GCT (15%)" value={fmtJ(stats.tax)} />}
              {stats.grat > 0 && <SummaryRow label="Gratuity"  value={fmtJ(stats.grat)} color="var(--grn)" />}
            </>}
          </div>
        )}
        {(!stats || stats.total === 0) && (
          <div style={{ padding:'12px 16px', fontSize:12, color:'var(--txt3)' }}>No sales this shift</div>
        )}
      </div>
    )

    return (
      <Card>
        <CardHead title="Sales Summary" sub="Revenue breakdown by module with combined grand total" />
        <CardBody>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Restaurant */}
            <ModPanel id="restaurant" label="Restaurant" icon="🍽" color="var(--ora)" stats={modStats.restaurant} />

            {/* Bar */}
            <ModPanel id="bar" label="Bar" icon="🍹" color="var(--pur)" stats={modStats.bar} />

            {/* Car Wash */}
            <ModPanel id="carwash" label="Car Wash" icon="🚗" color="var(--blue)"
              stats={cwCount > 0 ? { count:cwCount, sub:cwTotal, disc:0, tax:0, grat:0, total:cwTotal } : null}
            />

            {/* Grand Total banner */}
            <div style={{ background:'var(--blue)', borderRadius:'var(--r3)', padding:'16px 20px', marginTop:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,.7)', textTransform:'uppercase', letterSpacing:'.6px' }}>Combined Grand Total</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', marginTop:2 }}>{grandOrders} orders · {fmtJ(grandOrders ? grandTotal/grandOrders : 0)} avg ticket</div>
                </div>
                <div style={{ fontSize:26, fontWeight:900, color:'#fff', fontFamily:'var(--mono)' }}>{fmtJ(grandTotal)}</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, borderTop:'1px solid rgba(255,255,255,.2)', paddingTop:10 }}>
                {[
                  { l:'Restaurant', v:modStats.restaurant.total },
                  { l:'Bar',        v:modStats.bar.total },
                  { l:'Car Wash',   v:cwTotal },
                ].map(x => (
                  <div key={x.l} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,.6)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:3 }}>{x.l}</div>
                    <div style={{ fontSize:14, fontWeight:800, color:'#fff', fontFamily:'var(--mono)' }}>{fmtJ(x.v)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Other combined stats */}
            <div style={{ background:'var(--surf)', borderRadius:'var(--r2)', padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>Combined Deductions & Additions</div>
              {grandDisc > 0 && <SummaryRow label="Total Discounts Given" value={'-'+fmtJ(grandDisc)} color="var(--ora)" />}
              {grandTax  > 0 && <SummaryRow label="GCT Collected"        value={fmtJ(grandTax)} />}
              {grandGrat > 0 && <SummaryRow label="Gratuity Collected"   value={fmtJ(grandGrat)} color="var(--grn)" />}
              {totalRefunds > 0 && <SummaryRow label="Refunds Issued"    value={'-'+fmtJ(totalRefunds)} color="var(--red)" />}
              <SummaryRow label="Net Revenue (after refunds)" value={fmtJ(grandTotal - totalRefunds)} bold color="var(--grn)" />
            </div>

            {/* Open Item Sales */}
            {openItemTotal > 0 && (
              <div style={{ background:'var(--surf)', borderRadius:'var(--r2)', padding:'14px 16px', border:'1px solid rgba(249,115,22,.3)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--ora)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>Open Item Sales</div>
                <SummaryRow label="Open Items Sold" value={String(openItemCount)} />
                <SummaryRow label="Open Item Total" value={fmtJ(openItemTotal)} bold color="var(--ora)" />
              </div>
            )}
          </div>
        </CardBody>
        <CardFoot>
          <Back to="gratuity" />
          <Next to="exceptions" />
        </CardFoot>
      </Card>
    )
  }

  const renderExceptions = () => {
    const allInWindow = transactions.filter(tx => {
      try { return new Date(tx.ts) >= new Date(shiftStart) } catch { return false }
    })
    const voidedTxs   = allInWindow.filter(tx => tx.voided)
    const refundedTxs = shiftTxs.filter(tx => tx.refunded)
    const discTxs     = shiftTxs.filter(tx => (tx.disc ?? 0) > 0)
    const voidTotal   = voidedTxs.reduce((s, tx) => s + tx.total, 0)
    const refundTotal = refundedTxs.reduce((s, tx) => s + (tx.refundAmount ?? tx.total), 0)
    const discTotal   = discTxs.reduce((s, tx) => s + (tx.disc ?? 0), 0)
    const hasExceptions = voidedTxs.length > 0 || refundedTxs.length > 0 || discTxs.length > 0 || data.override

    const tile = (label: string, count: number, amt: number | null, color: string) => (
      <div style={{ background:'var(--surf)', border:`1px solid var(--bdr)`, borderRadius:'var(--r2)', padding:'12px 14px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>{label}</div>
        <div style={{ fontSize:18, fontWeight:900, color, fontFamily:'var(--mono)' }}>{count}</div>
        {amt !== null && amt > 0 && <div style={{ fontSize:11, color:'var(--txt3)', marginTop:2 }}>{fmtJ(amt)}</div>}
      </div>
    )

    return (
      <Card>
        <CardHead
          title="Exception Summary"
          sub={hasExceptions ? 'Review all voids, refunds, discounts and overrides before closing' : 'No exceptions recorded this shift'}
          warn={voidedTxs.length > 0 || refundedTxs.length > 0}
        />
        <CardBody>
          {!hasExceptions ? (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--grn)' }}>Clean Shift</div>
              <div style={{ fontSize:12, color:'var(--txt3)', marginTop:5 }}>No voids, refunds, discounts, or overrides recorded</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* Summary tiles */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
                {tile('Voids',     voidedTxs.length,   voidTotal,   voidedTxs.length   > 0 ? 'var(--red)'  : 'var(--txt3)')}
                {tile('Refunds',   refundedTxs.length, refundTotal, refundedTxs.length > 0 ? 'var(--ora)'  : 'var(--txt3)')}
                {tile('Discounts', discTxs.length,     discTotal,   discTxs.length     > 0 ? 'var(--blue)' : 'var(--txt3)')}
                {tile('Overrides', data.override ? 1 : 0, null,     data.override       ? 'var(--ora)'  : 'var(--txt3)')}
              </div>

              {/* Voided transactions detail */}
              {voidedTxs.length > 0 && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>Voided Transactions ({voidedTxs.length})</div>
                  <div style={{ background:'var(--surf)', border:'1px solid var(--bdr)', borderRadius:'var(--r2)', overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid var(--bdr)' }}>
                          {['Time','Cashier','Amount','Reason','Voided By'].map(h => (
                            <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, color:'var(--txt3)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {voidedTxs.map(tx => (
                          <tr key={tx.id} style={{ borderBottom:'1px solid var(--bdr2)' }}>
                            <td style={{ padding:'8px 10px', color:'var(--txt3)', fontFamily:'var(--mono)', whiteSpace:'nowrap' }}>{new Date(tx.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                            <td style={{ padding:'8px 10px', color:'var(--txt)' }}>{tx.cashier}</td>
                            <td style={{ padding:'8px 10px', fontFamily:'var(--mono)', fontWeight:700, color:'var(--red)' }}>{fmtJ(tx.total)}</td>
                            <td style={{ padding:'8px 10px', color:'var(--txt3)', fontSize:11 }}>{tx.voidReason || '—'}</td>
                            <td style={{ padding:'8px 10px', color:'var(--txt3)' }}>{tx.voidedBy || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Refunded transactions detail */}
              {refundedTxs.length > 0 && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--ora)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>Refunds ({refundedTxs.length})</div>
                  <div style={{ background:'var(--surf)', border:'1px solid var(--bdr)', borderRadius:'var(--r2)', overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid var(--bdr)' }}>
                          {['Time','Cashier','Refund Amt','Reason','Refunded By'].map(h => (
                            <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, color:'var(--txt3)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {refundedTxs.map(tx => (
                          <tr key={tx.id} style={{ borderBottom:'1px solid var(--bdr2)' }}>
                            <td style={{ padding:'8px 10px', color:'var(--txt3)', fontFamily:'var(--mono)', whiteSpace:'nowrap' }}>{new Date(tx.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                            <td style={{ padding:'8px 10px', color:'var(--txt)' }}>{tx.cashier}</td>
                            <td style={{ padding:'8px 10px', fontFamily:'var(--mono)', fontWeight:700, color:'var(--ora)' }}>{fmtJ(tx.refundAmount ?? tx.total)}</td>
                            <td style={{ padding:'8px 10px', color:'var(--txt3)', fontSize:11 }}>{tx.refundReason || '—'}</td>
                            <td style={{ padding:'8px 10px', color:'var(--txt3)' }}>{tx.refundedBy || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Discounts summary */}
              {discTxs.length > 0 && (
                <div style={{ padding:'12px 14px', background:'var(--surf)', border:'1px solid var(--bdr)', borderRadius:'var(--r2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--blue)', textTransform:'uppercase', letterSpacing:'.5px' }}>Discounts Applied</div>
                    <div style={{ fontSize:12, color:'var(--txt3)', marginTop:2 }}>{discTxs.length} transaction{discTxs.length !== 1 ? 's' : ''} received a discount</div>
                  </div>
                  <div style={{ fontFamily:'var(--mono)', fontWeight:800, color:'var(--blue)', fontSize:15 }}>−{fmtJ(discTotal)}</div>
                </div>
              )}

              {/* Manager override */}
              {data.override && (
                <div style={{ padding:'12px 14px', background:'rgba(251,146,60,.08)', border:'1px solid rgba(251,146,60,.3)', borderRadius:'var(--r2)' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--ora)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2 }}>Manager Override Active</div>
                  <div style={{ fontSize:12, color:'var(--txt3)' }}>Shift was authorized to close with unresolved items. Authorized by {data.authorizedUser?.name ?? 'Manager'}.</div>
                </div>
              )}

            </div>
          )}
        </CardBody>
        <CardFoot>
          <Back to="sales" />
          <Next to="employees" />
        </CardFoot>
      </Card>
    )
  }

  const renderEmployees = () => {
    const empList = Object.entries(empMap).sort((a,b) => b[1].total - a[1].total)
    const canOverride = ['admin','manager'].includes(data.authorizedUser?.role ?? '')
    const todayDate = new Date().toISOString().slice(0, 10)

    // Read today's completed payroll time entries from localStorage
    type TEntry = { id: string; staffId: string; staffName: string; date: string; clockIn: string; clockOut: string | null; breakMinutes: number; notes: string }
    let todayEntries: TEntry[] = []
    try { todayEntries = (JSON.parse(localStorage.getItem('payroll_time_entries') ?? '[]') as TEntry[]).filter(e => e.date === todayDate && e.clockOut !== null) } catch {}

    const fmtMins = (mins: number) => {
      const h = Math.floor(mins / 60), m = mins % 60
      return m === 0 ? `${h}h` : `${h}h ${m}m`
    }
    const netMins = (e: TEntry) => {
      const [ih, im] = e.clockIn.split(':').map(Number)
      const [oh, om] = (e.clockOut ?? '00:00').split(':').map(Number)
      let d = (oh * 60 + om) - (ih * 60 + im); if (d < 0) d += 1440
      const brk = (e.id in breakOverrides ? breakOverrides[e.id] : e.breakMinutes)
      return Math.max(0, d - brk)
    }

    // Apply overrides to localStorage on step advance
    const applyOverridesAndAdvance = () => {
      if (Object.keys(breakOverrides).length > 0) {
        try {
          const all: TEntry[] = JSON.parse(localStorage.getItem('payroll_time_entries') ?? '[]')
          const updated = all.map(e => e.id in breakOverrides
            ? { ...e, breakMinutes: breakOverrides[e.id], notes: e.notes.replace('auto ·', 'approved ·') }
            : e
          )
          localStorage.setItem('payroll_time_entries', JSON.stringify(updated))
        } catch {}
      }
      setStep('print')
    }

    return (
      <Card>
        <CardHead title="Employee Performance" sub={`${empList.length} staff with activity this shift`} />
        <CardBody>
          {/* Sales performance table */}
          {empList.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--txt3)', padding:'20px 0', fontSize:13 }}>No transactions recorded this shift</div>
          ) : (
            <div style={{ overflowX:'auto', marginBottom:20 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--bdr)' }}>
                    {['Employee','Orders','Sales','Tips','Avg Ticket'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'var(--txt3)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empList.map(([name,v]) => (
                    <tr key={name} style={{ borderBottom:'1px solid var(--bdr2)' }}>
                      <td style={{ padding:'10px', fontWeight:700, color:'var(--txt)' }}>{name}</td>
                      <td style={{ padding:'10px', color:'var(--txt2)' }}>{v.count}</td>
                      <td style={{ padding:'10px', fontFamily:'var(--mono)', fontWeight:700, color:'var(--grn)' }}>{fmtJ(v.total)}</td>
                      <td style={{ padding:'10px', fontFamily:'var(--mono)', color: v.tips>0?'var(--grn)':'var(--txt3)' }}>{fmtJ(v.tips)}</td>
                      <td style={{ padding:'10px', fontFamily:'var(--mono)', color:'var(--txt2)' }}>{fmtJ(v.count ? v.total/v.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Break deduction approval */}
          {todayEntries.length > 0 && (
            <div style={{ borderTop:'1px solid var(--bdr)', paddingTop:16 }}>
              <div style={{ fontSize:12, fontWeight:800, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:12 }}>
                Break Deductions — Today&apos;s Shifts
              </div>
              {!canOverride && (
                <div style={{ fontSize:11, color:'var(--txt3)', marginBottom:10, fontStyle:'italic' }}>
                  View only. Managers and Admins can override.
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {todayEntries.map(e => {
                  const approved = (e.id in breakOverrides ? breakOverrides[e.id] : e.breakMinutes) as 0|15|30|45|60
                  const isSalary = e.notes.includes('salary')
                  const net = netMins(e)
                  return (
                    <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--surf)', borderRadius:'var(--r2)', border:'1px solid var(--bdr)', flexWrap:'wrap' }}>
                      <div style={{ flex:1, minWidth:120 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{e.staffName}</div>
                        <div style={{ fontSize:11, color:'var(--txt3)', marginTop:1 }}>
                          {e.clockIn} – {e.clockOut}
                          {isSalary && <span style={{ marginLeft:6, color:'var(--blue)', fontWeight:700 }}>salary</span>}
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:'var(--txt2)', minWidth:60, textAlign:'right' }}>
                        Net: <strong style={{ color:'var(--grn)' }}>{fmtMins(net)}</strong>
                      </div>
                      {canOverride && !isSalary ? (
                        <div>
                          <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', marginBottom:3 }}>Break</div>
                          <select
                            value={approved}
                            onChange={e2 => setBreakOverrides(prev => ({ ...prev, [e.id]: Number(e2.target.value) as 0|15|30|45|60 }))}
                            style={{ padding:'5px 8px', borderRadius:'var(--r)', border:'1px solid var(--bdr2)', background:'var(--bg2)', color:'var(--txt)', fontSize:12, fontWeight:700, cursor:'pointer' }}
                          >
                            {[0,15,30,45,60].map(m => <option key={m} value={m}>{m}m</option>)}
                          </select>
                        </div>
                      ) : (
                        <div style={{ fontSize:12, color: isSalary ? 'var(--txt3)' : 'var(--txt2)', minWidth:40, textAlign:'center' }}>
                          {isSalary ? '—' : `${approved}m`}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize:11, color:'var(--txt3)', marginTop:10, lineHeight:1.6 }}>
                Hourly staff: 30m auto-deducted. Override before closing to adjust payroll.
                Salary staff: hours tracked for attendance only.
              </div>
            </div>
          )}
        </CardBody>
        <CardFoot>
          <Back to="exceptions" />
          <Btn primary onClick={applyOverridesAndAdvance}>Save &amp; Continue →</Btn>
        </CardFoot>
      </Card>
    )
  }

  const renderPrint = () => (
    <Card>
      <CardHead title="Print Reports" sub="Print or export shift reports before closing" />
      <CardBody>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ padding:'16px', background:'var(--surf)', borderRadius:'var(--r2)', border:'1px solid var(--bdr)', fontSize:13, color:'var(--txt3)', textAlign:'center', lineHeight:1.6 }}>
            Shift reports are automatically saved to Shifts history.<br/>Use your receipt printer via the Topbar printer icon to print summaries.
          </div>
        </div>
      </CardBody>
      <CardFoot>
        <Back to="employees" />
        <Next to="confirm" label="Skip & Continue →" />
        <Next to="confirm" label="Done Printing →" />
      </CardFoot>
    </Card>
  )

  const renderConfirm = () => {
    const by = data.authorizedUser?.name ?? currentUser?.name ?? 'Manager'
    const varColor = variance === null ? 'var(--txt3)' : variance === 0 ? 'var(--grn)' : variance > 0 ? 'var(--blue)' : 'var(--red)'
    const grandConfirm = netSales
    return (
      <Card>
        <CardHead title="⚠️  Confirm End of Day Close" sub="Review the summary below before finalizing. This cannot be undone." warn />
        <CardBody>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { l:'Grand Total',    v:fmtJ(grandConfirm),                               c:'var(--grn)' },
                { l:'Total Orders',   v:String(shiftTxs.length),                            c:'var(--txt)' },
                { l:'Cash Variance',  v: variance!=null ? ((variance>=0?'+':'')+fmtJ(variance)) : '—', c:varColor },
                { l:'Closed By',      v:by.split(' ')[0],                                  c:'var(--txt)' },
              ].map(x => (
                <div key={x.l} style={{ background:'var(--surf)', border:'1px solid var(--bdr)', borderRadius:'var(--r2)', padding:'12px 14px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>{x.l}</div>
                  <div style={{ fontSize:16, fontWeight:900, color:x.c, fontFamily:'var(--mono)' }}>{x.v}</div>
                </div>
              ))}
            </div>
            {openItemTotal > 0 && (
              <div style={{ padding:'10px 14px', borderRadius:'var(--r2)', fontSize:12, color:'var(--ora)', background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)' }}>
                Open Item Sales: {fmtJ(openItemTotal)} ({openItemCount} item{openItemCount !== 1 ? 's' : ''})
              </div>
            )}
            {data.override && (
              <div style={{ padding:'10px 14px', borderRadius:'var(--r2)', fontSize:12, color:'var(--ora)', background:'#78350f18', border:'1px solid rgba(251,146,60,.3)' }}>
                ⚠️ Manager override is active — shift will be closed with open transactions on record.
              </div>
            )}
            {variance !== null && Math.abs(variance) > VAR_LIMIT && (
              <div style={{ padding:'10px 14px', borderRadius:'var(--r2)', fontSize:12, color:'var(--red)', background:'#7f1d1d18', border:'1px solid rgba(245,101,101,.3)' }}>
                ⚠️ Cash variance of {fmtJ(Math.abs(variance))} recorded. Note: {data.varianceNote}
              </div>
            )}
            <div style={{ padding:'12px 14px', borderRadius:'var(--r2)', fontSize:12, color:'var(--txt3)', background:'var(--surf)', border:'1px solid var(--bdr)' }}>
              All transactions will be locked, the shift will be marked closed, and a record will be saved to shift history.
            </div>
          </div>
        </CardBody>
        <CardFoot>
          <Back to="print" />
          <Btn danger onClick={doClose} disabled={closing} style={{ padding:'10px 28px', fontSize:14 }}>
            {closing ? 'Closing…' : '🔒 End of Day Close'}
          </Btn>
        </CardFoot>
      </Card>
    )
  }

  const renderDone = () => {
    const by = data.authorizedUser?.name ?? currentUser?.name ?? 'Manager'
    const cwTotal   = modMap['carwash']?.total ?? 0
    const grandDone = netSales
    return (
      <Card>
        <div style={{ padding:'36px 24px 20px', textAlign:'center', borderBottom:'1px solid var(--bdr)' }}>
          <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--txt)' }}>End of Day Close Complete</div>
          <div style={{ fontSize:13, color:'var(--txt3)', marginTop:6 }}>All data has been locked and saved</div>
        </div>
        <CardBody>
          <SummaryRow label="Shift ID"         value={savedShiftId ?? currentShift?.id ?? '—'} />
          <SummaryRow label="Close Time"        value={new Date().toLocaleString()} />
          <SummaryRow label="Closed By"         value={by} />
          <SummaryRow label="Restaurant Sales"  value={fmtJ(modMap['restaurant']?.total ?? 0)} color="var(--ora)" />
          <SummaryRow label="Bar Sales"         value={fmtJ(modMap['bar']?.total ?? 0)} color="var(--pur)" />
          <SummaryRow label="Car Wash Sales"    value={fmtJ(cwTotal)} color="var(--blue)" />
          {openItemTotal > 0 && <SummaryRow label="Open Item Sales" value={fmtJ(openItemTotal)} color="var(--ora)" />}
          <SummaryRow label="Grand Total"       value={fmtJ(grandDone)} bold color="var(--grn)" />
          <SummaryRow label="Total Orders"      value={String(shiftTxs.length)} />
          {variance !== null && (
            <SummaryRow label="Cash Variance" value={(variance>=0?'+':'')+fmtJ(variance)}
              color={variance===0?'var(--grn)':variance>0?'var(--blue)':'var(--red)'} />
          )}
          <div style={{ padding:'12px 14px', borderRadius:'var(--r2)', marginTop:12,
            background: isOnline ? '#14532d18' : '#78350f18',
            border: `1px solid ${isOnline ? '#16a34a44' : 'rgba(251,146,60,.3)'}`,
            display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--txt3)' }}>
            <span>{isOnline ? '🟢' : '🟡'}</span>
            {isOnline ? 'All data synced to the cloud successfully.' : 'Offline — data stored locally and will sync when connected.'}
          </div>
        </CardBody>
        <div style={{ padding:'14px 24px', borderTop:'1px solid var(--bdr)', display:'flex', justifyContent:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:12, color:'var(--txt3)', marginBottom:10 }}>Logging out automatically in 3 seconds…</div>
            <Btn primary onClick={() => { dispatch({ type: 'LOGOUT' }); cancel() }} style={{ padding:'12px 40px', fontSize:14 }}>Logout Now</Btn>
          </div>
        </div>
      </Card>
    )
  }

  const stepContent: Record<WStep, () => React.ReactNode> = {
    auth:      renderAuth,
    validate:  renderValidate,
    cash:      renderCash,
    payments:  renderPayments,
    gratuity:  renderGratuity,
    sales:      renderSales,
    exceptions: renderExceptions,
    employees:  renderEmployees,
    print:     renderPrint,
    confirm:   renderConfirm,
    done:      renderDone,
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.88)', zIndex:9999,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start',
      overflowY:'auto', padding:24, gap:16, backdropFilter:'blur(6px)' }}>

      {/* Progress bar */}
      {step !== 'done' && (
        <div style={{ width:'100%', maxWidth:600 }}>
          <div style={{ display:'flex', gap:3, marginBottom:8 }}>
            {progressSteps.map((s,i) => (
              <div key={s} style={{ flex:1, height:3, borderRadius:2,
                background: i < si ? 'var(--blue)' : s === step ? 'var(--blue)' : 'var(--bdr)',
                opacity: i < si ? 0.6 : s === step ? 1 : 0.25, transition:'all .2s' }} />
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'.6px' }}>
              Step {si + 1} of {progressSteps.length} · {STEP_LABELS[step]}
            </div>
            <div style={{ fontSize:10, color:'var(--txt3)' }}>End of Day Close</div>
          </div>
        </div>
      )}

      {/* Step content */}
      <div style={{ width:'100%', maxWidth:600, maxHeight:'calc(100vh - 120px)', overflowY:'auto' }}>
        {stepContent[step]()}
      </div>
    </div>
  )
}






