'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { User, UserRole, ModuleKey } from '@/types'
import { ROLES } from '@/lib/data/seed'
import { hashPin } from '@/lib/utils/hash'

const API = '/api/staff'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin',   label: 'Administrator' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff',   label: 'Staff' },
]

const MODULE_OPTIONS: { value: ModuleKey; label: string; emoji: string }[] = [
  { value: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { value: 'bar',        label: 'Bar',         emoji: '🍺' },
  { value: 'carwash',    label: 'Car Wash',    emoji: '🚗' },
]

const COLOR_PRESETS = ['#f56565','#f5a623','#9b8afb','#4f8ef7','#3ecf8e','#38bdf8','#f6993f','#48bb78']

const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 4, display: 'block' }
const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)' }
const toggleBtn = (active: boolean): React.CSSProperties => ({ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: active ? 'var(--grn-bg)' : 'var(--red-bg)', color: active ? 'var(--grn)' : 'var(--red)' })

function autoIni(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 3)
}

// ── Staff form modal ──────────────────────────────────────────
interface StaffForm {
  name: string
  ini: string
  role: UserRole
  allowedModules: ModuleKey[]
  color: string
  staffId: string
  pin: string
  confirmPin: string
}

function emptyForm(): StaffForm {
  return { name: '', ini: '', role: 'staff', allowedModules: ['restaurant','bar','carwash'], color: '#3ecf8e', staffId: '', pin: '', confirmPin: '' }
}

function StaffModal({
  editUser,
  onSave,
  onClose,
}: {
  editUser: User | null
  onSave: (form: StaffForm) => Promise<string | null>
  onClose: () => void
}) {
  const [form, setForm] = useState<StaffForm>(() =>
    editUser
      ? { name: editUser.name, ini: editUser.ini, role: editUser.role, allowedModules: [...editUser.allowedModules], color: editUser.color, staffId: editUser.staffId ?? '', pin: '', confirmPin: '' }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = <K extends keyof StaffForm>(k: K, v: StaffForm[K]) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill initials when name changes (only if user hasn't manually edited)
  const [iniTouched, setIniTouched] = useState(!!editUser)
  useEffect(() => {
    if (!iniTouched && form.name) set('ini', autoIni(form.name))
  }, [form.name, iniTouched])

  const toggleModule = (mod: ModuleKey) => {
    set('allowedModules', form.allowedModules.includes(mod)
      ? form.allowedModules.filter(m => m !== mod)
      : [...form.allowedModules, mod]
    )
  }

  const submit = async () => {
    setErr('')
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!form.ini.trim()) { setErr('Initials are required'); return }
    if (form.allowedModules.length === 0) { setErr('Select at least one module'); return }
    const isDemo = editUser && !editUser.pin_hash
    if (!editUser || isDemo) {
      if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
        setErr(isDemo ? 'A new PIN is required to save this account' : 'PIN must be exactly 4 digits')
        return
      }
      if (form.pin !== form.confirmPin) { setErr('PINs do not match'); return }
    } else if (form.pin) {
      if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) { setErr('New PIN must be exactly 4 digits'); return }
      if (form.pin !== form.confirmPin) { setErr('PINs do not match'); return }
    }
    setSaving(true)
    const error = await onSave(form)
    setSaving(false)
    if (error) setErr(error)
  }

  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{editUser ? 'Edit Staff Member' : 'Add Staff Member'}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name + Initials */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
            <div>
              <label style={label}>Full Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Jane Smith" />
            </div>
            <div>
              <label style={label}>Initials *</label>
              <input style={inputStyle} value={form.ini} onChange={e => { setIniTouched(true); set('ini', e.target.value.toUpperCase().slice(0, 3)) }} placeholder="JS" />
            </div>
          </div>

          {/* Role + Staff ID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Role *</label>
              <select style={inputStyle} value={form.role} onChange={e => set('role', e.target.value as UserRole)}>
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Staff ID</label>
              <input style={inputStyle} value={form.staffId} onChange={e => set('staffId', e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {/* Modules */}
          <div>
            <label style={label}>Allowed Modules *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {MODULE_OPTIONS.map(m => {
                const on = form.allowedModules.includes(m.value)
                return (
                  <button key={m.value} onClick={() => toggleModule(m.value)} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--blue)' : 'var(--bdr)'}`, background: on ? 'var(--blue-bg)' : 'transparent', color: on ? 'var(--blue)' : 'var(--txt3)', transition: 'all .12s' }}>
                    {m.emoji} {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Color */}
          <div>
            <label style={label}>Avatar Color</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map(c => (
                <button key={c} onClick={() => set('color', c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${form.color === c ? 'white' : 'transparent'}`, cursor: 'pointer', outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: 1 }} />
              ))}
              <input type="color" value={form.color} onChange={e => set('color', e.target.value)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: 'transparent' }} title="Custom color" />
            </div>
          </div>

          {/* PIN */}
          <div>
            <label style={label}>{!editUser ? 'PIN *' : editUser.pin_hash ? 'New PIN (leave blank to keep current)' : 'PIN * (required to activate this account)'}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input
                style={inputStyle}
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={form.pin}
                onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit PIN"
              />
              <input
                style={inputStyle}
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={form.confirmPin}
                onChange={e => set('confirmPin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Confirm PIN"
              />
            </div>
          </div>

          {err && <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>⚠ {err}</div>}
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : (editUser ? 'Save Changes' : 'Add Staff')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm delete/deactivate modal ──────────────────────────
function ConfirmModal({ name, hasTx, onConfirm, onCancel }: { name: string; hasTx: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mo-bg" onClick={onCancel}>
      <div className="mo" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{hasTx ? 'Deactivate Staff Member' : 'Delete Staff Member'}</span>
          <button className="mx" onClick={onCancel}>×</button>
        </div>
        <div className="mb-c">
          {hasTx ? (
            <p style={{ fontSize: 13, color: 'var(--txt2)' }}>
              <strong>{name}</strong> has historical sales records. They will be <strong>deactivated</strong> (hidden from login) and their transaction history will be preserved for reporting.
            </p>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--txt2)' }}>
              <strong>{name}</strong> has no transactions and will be <strong>permanently deleted</strong>.
            </p>
          )}
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onCancel}>Cancel</button>
          <button className="btn btn-red" onClick={onConfirm}>{hasTx ? 'Deactivate' : 'Delete'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main StaffPage ────────────────────────────────────────────
export default function StaffPage() {
  const { state, dispatch, toast } = useApp()
  const { users, currentUser } = state

  const [showModal, setShowModal]   = useState(false)
  const [editUser, setEditUser]     = useState<User | null>(null)
  const [confirmDel, setConfirmDel] = useState<User | null>(null)
  const [saving, setSaving]         = useState(false)
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'empty' | 'ready' | 'error'>('checking')

  const isAdmin = currentUser?.role === 'admin'

  const refetchStaff = useCallback(async () => {
    try {
      const res = await fetch(API)
      if (!res.ok) { setSupabaseStatus('error'); return }
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length > 0) {
        const updated: User[] = rows.map((r: { id: string; name: string; ini: string; pin_hash: string; role: UserRole; color: string; allowed_modules: string[]; active: boolean; staff_id?: string }) => ({
          id: r.id, name: r.name, ini: r.ini, pin_hash: r.pin_hash,
          role: r.role as UserRole, color: r.color,
          allowedModules: (r.allowed_modules ?? ['restaurant']) as ModuleKey[],
          active: r.active, staffId: r.staff_id ?? undefined,
        }))
        dispatch({ type: 'SET_USERS', users: updated })
        setSupabaseStatus('ready')
      } else {
        setSupabaseStatus('empty')
      }
    } catch { setSupabaseStatus('error') }
  }, [dispatch])

  useEffect(() => { refetchStaff() }, [refetchStaff])

  const saveStaff = async (form: StaffForm): Promise<string | null> => {
    try {
      let pin_hash: string | undefined
      if (form.pin) {
        pin_hash = await hashPin(form.pin)
      }

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        ini: form.ini.trim(),
        role: form.role,
        allowed_modules: form.allowedModules,
        color: form.color,
        staff_id: form.staffId.trim() || null,
        active: editUser?.active ?? true,
      }
      if (pin_hash) payload.pin_hash = pin_hash

      if (editUser) {
        const res = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editUser.id, ...payload }) })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Save failed') }
        toast('Staff updated', 'success')
      } else {
        if (!pin_hash) return 'PIN is required'
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Save failed') }
        toast('Staff member added', 'success')
      }

      setShowModal(false)
      setEditUser(null)
      await refetchStaff()
      return null
    } catch (e: unknown) {
      return e instanceof Error ? e.message : 'An error occurred'
    }
  }

  const toggleActive = async (user: User) => {
    if (user.id === currentUser?.id) { toast('Cannot deactivate yourself', 'warn'); return }
    setSaving(true)
    try {
      const res = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id, active: !user.active }) })
      if (!res.ok) throw new Error('Failed')
      toast(user.active ? 'Staff deactivated' : 'Staff activated', 'success')
      await refetchStaff()
    } catch {
      toast('Toggle failed', 'error')
    }
    setSaving(false)
  }

  const deleteStaff = async (user: User) => {
    setSaving(true)
    const hasTx = state.transactions.some(t => t.userId === user.id)
    try {
      if (hasTx) {
        // Soft delete — deactivate and preserve history
        const res = await fetch(API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: user.id, active: false }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error ?? `Server error ${res.status}`)
        }
        await refetchStaff()
        toast(`${user.name} deactivated — sales history preserved`, 'success')
      } else {
        // Hard delete — no transaction history
        const res = await fetch(`${API}?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' })
        if (!res.ok && res.status !== 204) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error ?? `Server error ${res.status}`)
        }
        await refetchStaff()
        toast(`${user.name} deleted`, 'success')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast(`Delete failed: ${msg}`, 'error')
    }
    setConfirmDel(null)
    setSaving(false)
  }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 15 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Staff</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {users.filter(u => u.active).length} active · {users.length} total
            {supabaseStatus === 'empty'   && <span style={{ color: 'var(--ora)', marginLeft: 8 }}>⚠ No staff yet — click + Add Staff</span>}
            {supabaseStatus === 'error'   && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠ Connection error — showing cached staff</span>}
            {supabaseStatus === 'checking'&& <span style={{ color: 'var(--txt3)', marginLeft: 8 }}>Loading…</span>}
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-pr" onClick={() => { setEditUser(null); setShowModal(true) }}>+ Add Staff</button>
        )}
      </div>

      {/* Status banners */}
      {supabaseStatus === 'empty' && isAdmin && (
        <div style={{ background: 'var(--blue-bg)', border: '1px solid rgba(79,142,247,.3)', borderRadius: 'var(--r2)', padding: '12px 16px', marginBottom: 16, fontSize: 12, color: 'var(--txt2)' }}>
          <strong style={{ color: 'var(--blue)' }}>Database connected</strong> — your staff table is empty. Click <strong>+ Add Staff</strong> to add your first staff account.
        </div>
      )}
      {supabaseStatus === 'error' && isAdmin && (
        <div style={{ background: 'var(--ora-bg)', border: '1px solid rgba(255,124,76,.3)', borderRadius: 'var(--r2)', padding: '12px 16px', marginBottom: 16, fontSize: 12, color: 'var(--txt2)' }}>
          <strong style={{ color: 'var(--ora)' }}>Could not reach the database</strong> — if you haven&apos;t created the staff table yet, run this SQL in your{' '}
          <a href="https://supabase.com/dashboard/project/zkdemtdmscanbiygtwsh/sql/new" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>SQL editor</a>:
          <pre style={{ marginTop: 8, background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 11, overflowX: 'auto', color: 'var(--grn)', lineHeight: 1.6 }}>{`CREATE TABLE IF NOT EXISTS public.staff (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  ini             TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'cashier',
  pin_hash        TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#4f8ef7',
  allowed_modules TEXT[] NOT NULL DEFAULT '{restaurant}',
  active          BOOLEAN NOT NULL DEFAULT true,
  staff_id        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.staff TO anon, authenticated;
NOTIFY pgrst, 'reload schema';`}</pre>
        </div>
      )}

      {/* Staff table */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        <table className="dt">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>Role</th>
              <th>Modules</th>
              <th>Staff ID</th>
              <th>Status</th>
              {isAdmin && <th style={{ width: 160 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--txt3)', fontSize: 13 }}>No staff found. Click &quot;+ Add Staff&quot; to get started.</td></tr>
            ) : users.map(u => {
              const role = ROLES[u.role]
              const isSelf = u.id === currentUser?.id
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: `${u.color}22`, color: u.color, flexShrink: 0 }}>{u.ini}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{u.name}{isSelf && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--blue)' }}>(you)</span>}</div>
                        {!u.pin_hash && <div style={{ fontSize: 10, color: 'var(--ora)', marginTop: 1 }}>⚠ Local only</div>}
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, color: role?.color ?? 'var(--txt2)' }}>{role?.label ?? u.role}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.allowedModules.map(m => <span key={m} className="b b-bl" style={{ fontSize: 9 }}>{m}</span>)}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{u.staffId ?? '—'}</td>
                  <td><span className={`b ${u.active ? 'b-gn' : 'b-rd'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-gh btn-xs" onClick={() => { setEditUser(u); setShowModal(true) }}>Edit</button>
                        <button style={toggleBtn(u.active)} onClick={() => toggleActive(u)} disabled={isSelf || saving}>
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                        {!isSelf && (
                          <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }} onClick={() => setConfirmDel(u)} disabled={saving}>Del</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showModal && (
        <StaffModal
          editUser={editUser}
          onSave={saveStaff}
          onClose={() => { setShowModal(false); setEditUser(null) }}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          name={confirmDel.name}
          hasTx={state.transactions.some(t => t.userId === confirmDel.id)}
          onConfirm={() => deleteStaff(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}
