'use client'
import React, { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────
interface CwService {
  id: string
  name: string
  description: string
  price: number
  vehicle_type: string
  is_available: boolean
}

interface CwAddon {
  id: string
  name: string
  description: string
  price: number
  is_available: boolean
}

// ── Style helpers ──────────────────────────────────────────────
const fmtJMD = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--txt3)',
  textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 4, display: 'block',
}
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--surf2)', border: '1px solid var(--bdr2)',
  borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)',
  boxSizing: 'border-box' as const,
}
const cardStyle: React.CSSProperties = {
  background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden',
}
const toggleBadge = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
  cursor: 'pointer', border: 'none',
  background: active ? 'var(--grn-bg)' : 'var(--red-bg)',
  color: active ? 'var(--grn)' : 'var(--red)',
})

// ── Blank forms ────────────────────────────────────────────────
const BLANK_SVC: Omit<CwService, 'id' | 'is_available'> = {
  name: '', description: '', price: 0, vehicle_type: '',
}
const BLANK_ADDON: Omit<CwAddon, 'id' | 'is_available'> = {
  name: '', description: '', price: 0,
}

const VEHICLE_TYPES = ['All Vehicles', 'Car', 'SUV', 'Pickup', 'Van', 'Truck']

// ── Component ──────────────────────────────────────────────────
export default function CarwashServicesPage() {
  const [tab,       setTab]       = useState<'services' | 'addons'>('services')
  const [viewMode,  setViewMode]  = useState<'table' | 'cards'>('table')
  const [services,  setServices]  = useState<CwService[]>([])
  const [addons,    setAddons]    = useState<CwAddon[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  // Service modal
  const [showSvcModal, setShowSvcModal] = useState(false)
  const [editSvcId,    setEditSvcId]    = useState<string | null>(null)
  const [svcForm,      setSvcForm]      = useState({ ...BLANK_SVC })
  const [savingSvc,    setSavingSvc]    = useState(false)
  const [delSvcId,     setDelSvcId]     = useState<string | null>(null)

  // Addon modal
  const [showAddonModal, setShowAddonModal] = useState(false)
  const [editAddonId,    setEditAddonId]    = useState<string | null>(null)
  const [addonForm,      setAddonForm]      = useState({ ...BLANK_ADDON })
  const [savingAddon,    setSavingAddon]    = useState(false)
  const [delAddonId,     setDelAddonId]     = useState<string | null>(null)

  const showMsg = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [svRes, adRes] = await Promise.all([
        fetch('/api/carwash-services'),
        fetch('/api/carwash-addons'),
      ])
      if (svRes.ok) setServices(await svRes.json())
      else setError('Could not load services from Supabase.')
      if (adRes.ok) setAddons(await adRes.json())
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Service CRUD ──────────────────────────────────────────────
  const openAddSvc = () => { setSvcForm({ ...BLANK_SVC }); setEditSvcId(null); setShowSvcModal(true) }
  const openEditSvc = (s: CwService) => {
    setSvcForm({ name: s.name, description: s.description, price: s.price, vehicle_type: s.vehicle_type })
    setEditSvcId(s.id); setShowSvcModal(true)
  }
  const saveSvc = async () => {
    if (!svcForm.name.trim()) return
    setSavingSvc(true)
    try {
      const method = editSvcId ? 'PUT' : 'POST'
      const body = editSvcId
        ? { id: editSvcId, ...svcForm, price: Number(svcForm.price) }
        : { ...svcForm, price: Number(svcForm.price) }
      const r = await fetch('/api/carwash-services', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message ?? e.error ?? 'Save failed') }
      await load(); setShowSvcModal(false)
      showMsg(editSvcId ? 'Service updated' : 'Service added')
    } catch (e) { showMsg((e as Error).message, false) } finally { setSavingSvc(false) }
  }
  const toggleSvc = async (s: CwService) => {
    await fetch('/api/carwash-services', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, is_available: !s.is_available }),
    })
    await load()
  }
  const deleteSvc = async () => {
    if (!delSvcId) return
    const r = await fetch(`/api/carwash-services?id=${encodeURIComponent(delSvcId)}`, { method: 'DELETE' })
    if (!r.ok) showMsg('Delete failed', false); else showMsg('Service deleted')
    setDelSvcId(null); await load()
  }

  // ── Addon CRUD ────────────────────────────────────────────────
  const openAddAddon = () => { setAddonForm({ ...BLANK_ADDON }); setEditAddonId(null); setShowAddonModal(true) }
  const openEditAddon = (a: CwAddon) => {
    setAddonForm({ name: a.name, description: a.description, price: a.price })
    setEditAddonId(a.id); setShowAddonModal(true)
  }
  const saveAddon = async () => {
    if (!addonForm.name.trim()) return
    setSavingAddon(true)
    try {
      const method = editAddonId ? 'PUT' : 'POST'
      const body = editAddonId
        ? { id: editAddonId, ...addonForm, price: Number(addonForm.price) }
        : { ...addonForm, price: Number(addonForm.price) }
      const r = await fetch('/api/carwash-addons', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message ?? e.error ?? 'Save failed') }
      await load(); setShowAddonModal(false)
      showMsg(editAddonId ? 'Add-on updated' : 'Add-on added')
    } catch (e) { showMsg((e as Error).message, false) } finally { setSavingAddon(false) }
  }
  const toggleAddon = async (a: CwAddon) => {
    await fetch('/api/carwash-addons', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, is_available: !a.is_available }),
    })
    await load()
  }
  const deleteAddon = async () => {
    if (!delAddonId) return
    const r = await fetch(`/api/carwash-addons?id=${encodeURIComponent(delAddonId)}`, { method: 'DELETE' })
    if (!r.ok) showMsg('Delete failed', false); else showMsg('Add-on deleted')
    setDelAddonId(null); await load()
  }

  const TABS = [
    { id: 'services' as const, icon: '🚗', label: 'Wash Services' },
    { id: 'addons'   as const, icon: '✨', label: 'Add-ons' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, padding: '12px 20px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: toast.ok ? 'var(--grn)' : 'var(--red)', color: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,.3)' }}>
          {toast.msg}
        </div>
      )}

      {/* Tab bar — matches MenuPage style */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)', padding: '0 16px', flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t.id ? 'var(--blue)' : 'transparent'}`,
            color: tab === t.id ? 'var(--blue)' : 'var(--txt3)',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {error && (
          <div style={{ margin: '16px 24px 0', background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* ── Wash Services ── */}
        {tab === 'services' && (
          <div style={{ padding: '20px 24px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Wash Services</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                  {services.length} service{services.length !== 1 ? 's' : ''} — shown in Car Wash POS when selecting a package
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* View toggle */}
                <div style={{ display: 'flex', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', overflow: 'hidden' }}>
                  {(['table', 'cards'] as const).map(m => (
                    <button key={m} onClick={() => setViewMode(m)} style={{
                      padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: viewMode === m ? 'var(--blue)' : 'transparent',
                      color: viewMode === m ? '#fff' : 'var(--txt3)',
                      border: 'none',
                    }}>
                      {m === 'table' ? '☰ Table' : '⊞ Cards'}
                    </button>
                  ))}
                </div>
                <button onClick={openAddSvc} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  + Add Service
                </button>
              </div>
            </div>

            {/* Table view */}
            {viewMode === 'table' && (
              <div style={cardStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                      {['Name', 'Category', 'Price', 'Status', 'Actions'].map((h, i) => (
                        <th key={i} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>Loading...</td></tr>
                    ) : services.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>No services yet — click &quot;+ Add Service&quot; to get started</td></tr>
                    ) : services.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--bdr)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--txt)' }}>{s.name}</div>
                          {s.description && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{s.description}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--txt2)', fontSize: 12 }}>
                          {s.vehicle_type || <span style={{ color: 'var(--txt3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--txt)' }}>
                          {fmtJMD(s.price)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button style={toggleBadge(s.is_available)} onClick={() => toggleSvc(s)}>
                            {s.is_available ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button onClick={() => openEditSvc(s)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                          <button onClick={() => setDelSvcId(s.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: '1px solid transparent', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cards view — mirrors POS appearance */}
            {viewMode === 'cards' && (
              <>
                {loading ? (
                  <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 40 }}>Loading...</div>
                ) : services.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--txt3)', padding: 60 }}>No services yet — click &quot;+ Add Service&quot; to get started</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    {services.map(s => (
                      <div key={s.id} style={{ background: 'var(--surf)', border: `2px solid ${s.is_available ? 'var(--bdr)' : 'var(--red-bg)'}`, borderRadius: 'var(--r3)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                        {/* Card body — matches POS card */}
                        <div style={{ padding: '18px 16px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', lineHeight: 1.3 }}>{s.name}</div>
                            <button style={{ ...toggleBadge(s.is_available), flexShrink: 0, fontSize: 10 }} onClick={() => toggleSvc(s)}>
                              {s.is_available ? 'Active' : 'Off'}
                            </button>
                          </div>
                          {s.description && <div style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.5, marginBottom: 8 }}>{s.description}</div>}
                          {s.vehicle_type && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{s.vehicle_type}</div>
                          )}
                          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--blue)', marginTop: 10, fontFamily: 'monospace' }}>{fmtJMD(s.price)}</div>
                        </div>

                        {/* Card actions */}
                        <div style={{ display: 'flex', borderTop: '1px solid var(--bdr)' }}>
                          <button onClick={() => openEditSvc(s)} style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700, background: 'transparent', border: 'none', color: 'var(--blue)', cursor: 'pointer', borderRight: '1px solid var(--bdr)' }}>
                            Edit
                          </button>
                          <button onClick={() => setDelSvcId(s.id)} style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700, background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Add-ons ── */}
        {tab === 'addons' && (
          <div style={{ padding: '20px 24px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Wash Add-ons</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                  {addons.length} add-on{addons.length !== 1 ? 's' : ''} — optional extras staff can add during package selection
                </div>
              </div>
              <button onClick={openAddAddon} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                + Add Add-on
              </button>
            </div>

            <div style={cardStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                    {['Name', 'Description', 'Price', 'Status', 'Actions'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>Loading...</td></tr>
                  ) : addons.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: 'var(--txt3)' }}>No add-ons yet — click &quot;+ Add Add-on&quot; to get started</td></tr>
                  ) : addons.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--bdr)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--txt)' }}>{a.name}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--txt3)', fontSize: 12 }}>{a.description || <span style={{ color: 'var(--txt3)' }}>—</span>}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--txt)' }}>{fmtJMD(a.price)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button style={toggleBadge(a.is_available)} onClick={() => toggleAddon(a)}>
                          {a.is_available ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button onClick={() => openEditAddon(a)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                        <button onClick={() => setDelAddonId(a.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: '1px solid transparent', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Service Modal ── */}
      {showSvcModal && (
        <div onClick={() => setShowSvcModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{editSvcId ? 'Edit Service' : 'Add Service'}</div>
              <button onClick={() => setShowSvcModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 20 }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Service Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" value={svcForm.name} onChange={e => setSvcForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Deluxe Wash, Basic Exterior" style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={svcForm.description} onChange={e => setSvcForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description shown to staff in the POS..." rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Price (J$) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="number" value={svcForm.price} onChange={e => setSvcForm(p => ({ ...p, price: Number(e.target.value) }))} min={0} step={50} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Category / Vehicle Type</label>
                  <select value={svcForm.vehicle_type} onChange={e => setSvcForm(p => ({ ...p, vehicle_type: e.target.value }))} style={inp}>
                    <option value="">— None —</option>
                    {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSvcModal(false)} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveSvc} disabled={savingSvc || !svcForm.name.trim()} style={{ flex: 2, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: !svcForm.name.trim() ? 'var(--surf3)' : 'var(--blue)', color: !svcForm.name.trim() ? 'var(--txt3)' : '#fff', border: 'none', cursor: savingSvc || !svcForm.name.trim() ? 'not-allowed' : 'pointer' }}>
                {savingSvc ? 'Saving...' : 'Save Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Addon Modal ── */}
      {showAddonModal && (
        <div onClick={() => setShowAddonModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{editAddonId ? 'Edit Add-on' : 'Add Add-on'}</div>
              <button onClick={() => setShowAddonModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 20 }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Add-on Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" value={addonForm.name} onChange={e => setAddonForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Tire Shine, Hand Wax, Engine Bay Clean" style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={addonForm.description} onChange={e => setAddonForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description..." rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              <div>
                <label style={lbl}>Price (J$)</label>
                <input type="number" value={addonForm.price} onChange={e => setAddonForm(p => ({ ...p, price: Number(e.target.value) }))} min={0} step={50} style={inp} />
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddonModal(false)} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveAddon} disabled={savingAddon || !addonForm.name.trim()} style={{ flex: 2, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: !addonForm.name.trim() ? 'var(--surf3)' : 'var(--blue)', color: !addonForm.name.trim() ? 'var(--txt3)' : '#fff', border: 'none', cursor: savingAddon || !addonForm.name.trim() ? 'not-allowed' : 'pointer' }}>
                {savingAddon ? 'Saving...' : 'Save Add-on'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete: Service ── */}
      {delSvcId && (
        <div onClick={() => setDelSvcId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', width: '100%', maxWidth: 360, boxShadow: '0 24px 60px rgba(0,0,0,.5)', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Delete Service?</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 20 }}>
              <strong>{services.find(s => s.id === delSvcId)?.name}</strong> will be removed from the Car Wash POS. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDelSvcId(null)} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteSvc} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete: Addon ── */}
      {delAddonId && (
        <div onClick={() => setDelAddonId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', width: '100%', maxWidth: 360, boxShadow: '0 24px 60px rgba(0,0,0,.5)', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Delete Add-on?</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 20 }}>
              <strong>{addons.find(a => a.id === delAddonId)?.name}</strong> will be removed. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDelAddonId(null)} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteAddon} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
