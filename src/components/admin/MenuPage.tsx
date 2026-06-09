'use client'

import { useState, useEffect, useCallback } from 'react'
import { storage } from '@/lib/utils/storage'

const API = 'https://www.soultiesseafoodjm.com'

// ── JMD formatter ─────────────────────────────────────────────
function fmtJMD(n: number): string {
  return 'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Types ──────────────────────────────────────────────────────
interface MenuItemRow {
  id: string
  name: string
  description: string
  price: number
  category: string
  emoji: string
  active: boolean
  created_at?: string
}

interface CarwashServiceRow {
  id: string
  name: string
  description: string
  price: number
  duration: string
  active: boolean
  vehicle_type: string
}

interface CarwashAddonRow {
  id: string
  name: string
  description: string
  price: number
  duration_minutes: number
  active: boolean
}

// ── Empty form defaults ───────────────────────────────────────
const emptyMenuItem = (): Omit<MenuItemRow, 'id' | 'created_at'> => ({
  name: '', description: '', price: 0, category: '', emoji: '🍽️', active: true,
})
const emptyService = (): Omit<CarwashServiceRow, 'id'> => ({
  name: '', description: '', price: 0, duration: '', active: true, vehicle_type: '',
})
const emptyAddon = (): Omit<CarwashAddonRow, 'id'> => ({
  name: '', description: '', price: 0, duration_minutes: 0, active: true,
})

// ── Shared inline style helpers ───────────────────────────────
const card: React.CSSProperties = {
  background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden',
}
const formRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12,
}
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, display: 'block',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)',
  padding: '8px 10px', fontSize: 12, color: 'var(--txt)',
}
const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
  background: active ? 'var(--grn-bg)' : 'var(--red-bg)',
  color: active ? 'var(--grn)' : 'var(--red)',
})

// ── Confirmation dialog ───────────────────────────────────────
function ConfirmModal({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mo-bg" onClick={onCancel}>
      <div className="mo" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="mh"><span className="mt">Confirm Delete</span><button className="mx" onClick={onCancel}>×</button></div>
        <div className="mb-c"><p style={{ fontSize: 13, color: 'var(--txt2)' }}>{msg}</p></div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onCancel}>Cancel</button>
          <button className="btn btn-red" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── MenuItem form modal ───────────────────────────────────────
function MenuItemModal({
  item, onSave, onClose, isAddon,
}: {
  item: Partial<MenuItemRow> | null
  onSave: (data: Omit<MenuItemRow, 'id' | 'created_at'>) => Promise<void>
  onClose: () => void
  isAddon?: boolean
}) {
  const defaultCategory = isAddon ? 'addon' : ''
  const [form, setForm] = useState<Omit<MenuItemRow, 'id' | 'created_at'>>(
    item ? { name: item.name ?? '', description: item.description ?? '', price: item.price ?? 0, category: item.category ?? defaultCategory, emoji: item.emoji ?? '✨', active: item.active ?? true }
          : { ...emptyMenuItem(), category: defaultCategory, emoji: isAddon ? '✨' : '🍽️' }
  )
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(isAddon ? { ...form, category: 'addon' } : form)
    setSaving(false)
  }

  const title = isAddon
    ? (item?.id ? 'Edit Modifier' : 'New Modifier')
    : (item?.id ? 'Edit Menu Item' : 'New Menu Item')

  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{title}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c">
          <div style={formRow}>
            <div>
              <label style={label}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder={isAddon ? 'Modifier name' : 'Item name'} />
            </div>
            <div>
              <label style={label}>Emoji</label>
              <input style={inputStyle} value={form.emoji} onChange={e => set('emoji', e.target.value)} placeholder={isAddon ? '✨' : '🍽️'} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Description</label>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Short description" />
          </div>
          <div style={isAddon ? { marginBottom: 12 } : formRow}>
            <div style={isAddon ? { marginBottom: 12 } : undefined}>
              <label style={label}>Price (JMD)</label>
              <input style={inputStyle} type="number" min={0} step={0.01} value={form.price} onChange={e => set('price', parseFloat(e.target.value) || 0)} />
            </div>
            {!isAddon && (
              <div>
                <label style={label}>Category</label>
                <input style={inputStyle} value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Mains, Drinks" />
              </div>
            )}
          </div>
          {isAddon && (
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Category</label>
              <span style={{ ...inputStyle, display: 'inline-block', background: 'var(--surf3)', color: 'var(--txt3)', cursor: 'default' }}>addon</span>
            </div>
          )}
          <div>
            <label style={label}>Active</label>
            <button style={toggleBtn(form.active)} onClick={() => set('active', !form.active)}>
              {form.active ? '✓ Active' : '✗ Inactive'}
            </button>
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" onClick={submit} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : (isAddon ? 'Save Modifier' : 'Save Item')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CarwashService form modal ─────────────────────────────────
function ServiceModal({
  item, onSave, onClose,
}: {
  item: Partial<CarwashServiceRow> | null
  onSave: (data: Omit<CarwashServiceRow, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<Omit<CarwashServiceRow, 'id'>>(
    item ? { name: item.name ?? '', description: item.description ?? '', price: item.price ?? 0, duration: item.duration ?? '', active: item.active ?? true, vehicle_type: item.vehicle_type ?? '' }
          : emptyService()
  )
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{item?.id ? 'Edit Car Wash Service' : 'New Car Wash Service'}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c">
          <div style={formRow}>
            <div>
              <label style={label}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Service name" />
            </div>
            <div>
              <label style={label}>Duration</label>
              <input style={inputStyle} value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 30 min" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Description</label>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Short description" />
          </div>
          <div style={formRow}>
            <div>
              <label style={label}>Price (JMD)</label>
              <input style={inputStyle} type="number" min={0} step={0.01} value={form.price} onChange={e => set('price', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label style={label}>Vehicle Type</label>
              <input style={inputStyle} value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)} placeholder="e.g. Sedan, SUV, All" />
            </div>
          </div>
          <div>
            <label style={label}>Active</label>
            <button style={toggleBtn(form.active)} onClick={() => set('active', !form.active)}>
              {form.active ? '✓ Active' : '✗ Inactive'}
            </button>
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" onClick={submit} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save Service'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CarwashAddon form modal ───────────────────────────────────
function AddonModal({
  item, onSave, onClose,
}: {
  item: Partial<CarwashAddonRow> | null
  onSave: (data: Omit<CarwashAddonRow, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<Omit<CarwashAddonRow, 'id'>>(
    item ? { name: item.name ?? '', description: item.description ?? '', price: item.price ?? 0, duration_minutes: item.duration_minutes ?? 0, active: item.active ?? true }
          : emptyAddon()
  )
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{item?.id ? 'Edit Add-on' : 'New Add-on'}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c">
          <div style={formRow}>
            <div>
              <label style={label}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Add-on name" />
            </div>
            <div>
              <label style={label}>Duration (minutes)</label>
              <input style={inputStyle} type="number" min={0} value={form.duration_minutes} onChange={e => set('duration_minutes', parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Description</label>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Short description" />
          </div>
          <div style={formRow}>
            <div>
              <label style={label}>Price (JMD)</label>
              <input style={inputStyle} type="number" min={0} step={0.01} value={form.price} onChange={e => set('price', parseFloat(e.target.value) || 0)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={label}>Active</label>
              <button style={toggleBtn(form.active)} onClick={() => set('active', !form.active)}>
                {form.active ? '✓ Active' : '✗ Inactive'}
              </button>
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" onClick={submit} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save Add-on'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main MenuPage ─────────────────────────────────────────────
export default function MenuPage() {
  const [tab, setTab] = useState<'restaurant' | 'carwash' | 'addons'>('restaurant')

  // Restaurant/Bar menu items
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([])
  const [menuLoading, setMenuLoading] = useState(true)
  const [menuError, setMenuError] = useState<string | null>(null)

  // Carwash services
  const [services, setServices] = useState<CarwashServiceRow[]>([])
  const [svcLoading, setSvcLoading] = useState(true)
  const [svcError, setSvcError] = useState<string | null>(null)

  // Carwash addons
  const [addons, setAddons] = useState<CarwashAddonRow[]>([])
  const [addLoading, setAddLoading] = useState(true)
  const [addError, setAddError] = useState<string | null>(null)

  // Modal state — showXModal=true means modal open; editX=null means "new"
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [showSvcModal,  setShowSvcModal]  = useState(false)
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [editMenuItem, setEditMenuItem] = useState<MenuItemRow | null>(null)
  const [editService,  setEditService]  = useState<CarwashServiceRow | null>(null)
  const [editAddon,    setEditAddon]    = useState<CarwashAddonRow | null>(null)
  const [confirmDel, setConfirmDel] = useState<{ table: string; id: string; name: string } | null>(null)
  const [addingAddon, setAddingAddon] = useState(false)

  // Toast (local)
  const [localToast, setLocalToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setLocalToast({ msg, type })
    setTimeout(() => setLocalToast(null), 2800)
  }

  // ── Fetch helpers ─────────────────────────────────────────
  const fetchMenuItems = useCallback(async () => {
    setMenuLoading(true); setMenuError(null)
    try {
      const res = await fetch(`${API}/api/menu`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows: MenuItemRow[] = await res.json()
      setMenuItems(rows)
      storage.set('menu_items', rows)
    } catch (e: unknown) {
      setMenuError(e instanceof Error ? e.message : 'Failed to load menu items')
    }
    setMenuLoading(false)
  }, [])

  const fetchCarwash = useCallback(async () => {
    setSvcLoading(true); setSvcError(null)
    setAddLoading(true); setAddError(null)
    try {
      const res = await fetch(`${API}/api/carwash`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: { services: CarwashServiceRow[]; addons: CarwashAddonRow[] } = await res.json()
      const svcRows = data.services ?? []
      const addRows = data.addons ?? []
      setServices(svcRows)
      storage.set('carwash_services', svcRows)
      setAddons(addRows)
      storage.set('carwash_addons', addRows)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load carwash data'
      setSvcError(msg)
      setAddError(msg)
    }
    setSvcLoading(false)
    setAddLoading(false)
  }, [])

  useEffect(() => { fetchMenuItems() }, [fetchMenuItems])
  useEffect(() => { fetchCarwash() }, [fetchCarwash])

  // ── Menu item CRUD ────────────────────────────────────────
  const saveMenuItem = async (form: Omit<MenuItemRow, 'id' | 'created_at'>) => {
    try {
      if (editMenuItem) {
        const res = await fetch(`${API}/api/menu`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editMenuItem.id, ...form }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        showToast('Item updated')
      } else {
        const res = await fetch(`${API}/api/menu`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        showToast('Item added')
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error'); return
    }
    setShowMenuModal(false); setEditMenuItem(null)
    await fetchMenuItems()
  }

  const toggleMenuActive = async (item: MenuItemRow) => {
    try {
      const res = await fetch(`${API}/api/menu`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, name: item.name, description: item.description, price: item.price, category: item.category, emoji: item.emoji, active: !item.active }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      showToast(item.active ? 'Item deactivated' : 'Item activated')
      await fetchMenuItems()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Toggle failed', 'error')
    }
  }

  // ── Carwash service CRUD ──────────────────────────────────
  const saveService = async (form: Omit<CarwashServiceRow, 'id'>) => {
    try {
      if (editService) {
        const res = await fetch(`${API}/api/carwash`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'service', id: editService.id, ...form }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        showToast('Service updated')
      } else {
        const res = await fetch(`${API}/api/carwash`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'service', ...form }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        showToast('Service added')
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error'); return
    }
    setShowSvcModal(false); setEditService(null)
    await fetchCarwash()
  }

  const toggleServiceActive = async (item: CarwashServiceRow) => {
    try {
      const res = await fetch(`${API}/api/carwash`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'service', id: item.id, name: item.name, description: item.description, price: item.price, duration: item.duration, active: !item.active, vehicle_type: item.vehicle_type }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      showToast(item.active ? 'Service deactivated' : 'Service activated')
      await fetchCarwash()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Toggle failed', 'error')
    }
  }

  // ── Addon CRUD ────────────────────────────────────────────
  const saveAddon = async (form: Omit<CarwashAddonRow, 'id'>) => {
    try {
      if (editAddon) {
        const res = await fetch(`${API}/api/carwash`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'addon', id: editAddon.id, ...form }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        showToast('Add-on updated')
      } else {
        const res = await fetch(`${API}/api/carwash`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'addon', ...form }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        showToast('Add-on added')
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error'); return
    }
    setShowAddModal(false); setEditAddon(null)
    await fetchCarwash()
  }

  const toggleAddonActive = async (item: CarwashAddonRow) => {
    try {
      const res = await fetch(`${API}/api/carwash`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'addon', id: item.id, name: item.name, description: item.description, price: item.price, duration_minutes: item.duration_minutes, active: !item.active }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      showToast(item.active ? 'Add-on deactivated' : 'Add-on activated')
      await fetchCarwash()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Toggle failed', 'error')
    }
  }

  // ── Delete ────────────────────────────────────────────────
  const deleteItem = async () => {
    if (!confirmDel) return
    try {
      let url: string
      if (confirmDel.table === 'menu_items') {
        url = `${API}/api/menu?id=${encodeURIComponent(confirmDel.id)}`
      } else if (confirmDel.table === 'carwash_services') {
        url = `${API}/api/carwash?target=service&id=${encodeURIComponent(confirmDel.id)}`
      } else {
        url = `${API}/api/carwash?target=addon&id=${encodeURIComponent(confirmDel.id)}`
      }
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      showToast('Deleted')
      if (confirmDel.table === 'menu_items') await fetchMenuItems()
      else await fetchCarwash()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
    setConfirmDel(null)
  }

  // ── Loading skeleton ──────────────────────────────────────
  const LoadingRow = () => (
    <tr>
      <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--txt3)', fontSize: 12 }}>
        <span style={{ opacity: .6 }}>⏳ Loading…</span>
      </td>
    </tr>
  )

  const ErrorRow = ({ msg }: { msg: string }) => (
    <tr>
      <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--red)', fontSize: 12 }}>
        ⚠ {msg}
      </td>
    </tr>
  )

  const EmptyRow = ({ cols, text }: { cols: number; text: string }) => (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', padding: 28, color: 'var(--txt3)', fontSize: 12 }}>
        {text}
      </td>
    </tr>
  )

  const TABS: { id: 'restaurant' | 'carwash' | 'addons'; label: string; icon: string }[] = [
    { id: 'restaurant', label: 'Restaurant / Bar', icon: '🍽️' },
    { id: 'carwash',    label: 'Car Wash',          icon: '🚗' },
    { id: 'addons',     label: 'Add-ons',           icon: '✨' },
  ]

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Menu Manager</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {menuItems.length} menu items · {services.length} car wash services · {addons.length} add-ons
          </div>
        </div>
        {tab === 'restaurant' && (
          <button className="btn btn-pr" onClick={() => { setEditMenuItem(null); setAddingAddon(false); setShowMenuModal(true) }}>+ Add Item</button>
        )}
        {tab === 'carwash' && (
          <button className="btn btn-pr" onClick={() => { setEditService(null); setShowSvcModal(true) }}>+ Add Service</button>
        )}
        {tab === 'addons' && (
          <button className="btn btn-pr" onClick={() => { setEditAddon(null); setShowAddModal(true) }}>+ Add Add-on</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${tab === t.id ? 'transparent' : 'var(--bdr)'}`,
            background: tab === t.id ? 'var(--blue)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--txt2)', transition: 'all .12s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Restaurant / Bar Tab ── */}
      {tab === 'restaurant' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflow: 'hidden' }}>
          {/* Menu items table */}
          <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflowY: 'auto' }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Price (JMD)</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {menuLoading ? <LoadingRow /> :
                   menuError ? <ErrorRow msg={menuError} /> :
                   menuItems.filter(i => i.category !== 'addon').length === 0 ? <EmptyRow cols={5} text="No menu items yet. Click + Add Item to create one." /> :
                   menuItems.filter(i => i.category !== 'addon').map(item => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 }}>{item.emoji || '🍽️'}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="b b-bl" style={{ fontSize: 10 }}>{item.category || '—'}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--grn)' }}>
                        {fmtJMD(item.price)}
                      </td>
                      <td>
                        <button style={toggleBtn(item.active)} onClick={() => toggleMenuActive(item)}>
                          {item.active ? '✓ Active' : '✗ Inactive'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-gh btn-xs" onClick={() => { setEditMenuItem(item); setShowMenuModal(true) }}>Edit</button>
                          <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }}
                            onClick={() => setConfirmDel({ table: 'menu_items', id: item.id, name: item.name })}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modifiers / Add-ons section */}
          <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Modifiers / Add-ons</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>Shown in the add-ons modal when placing restaurant &amp; bar orders</div>
              </div>
              <button className="btn btn-pr" onClick={() => { setEditMenuItem(null); setAddingAddon(true); setShowMenuModal(true) }}>+ Add Modifier</button>
            </div>
            <div style={{ overflowY: 'auto' }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Emoji</th>
                    <th>Price (JMD)</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {menuLoading ? <LoadingRow /> :
                   menuError ? <ErrorRow msg={menuError} /> :
                   menuItems.filter(i => i.category === 'addon').length === 0 ? <EmptyRow cols={5} text="No modifiers yet. Click + Add Modifier to create one." /> :
                   menuItems.filter(i => i.category === 'addon').map(item => (
                    <tr key={item.id}>
                      <td>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--txt3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                        </div>
                      </td>
                      <td style={{ fontSize: 20, textAlign: 'center' }}>{item.emoji || '✨'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--grn)' }}>
                        {fmtJMD(item.price)}
                      </td>
                      <td>
                        <button style={toggleBtn(item.active)} onClick={() => toggleMenuActive(item)}>
                          {item.active ? '✓ Active' : '✗ Inactive'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-gh btn-xs" onClick={() => { setEditMenuItem(item); setAddingAddon(true); setShowMenuModal(true) }}>Edit</button>
                          <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }}
                            onClick={() => setConfirmDel({ table: 'menu_items', id: item.id, name: item.name })}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Car Wash Tab ── */}
      {tab === 'carwash' && (
        <div style={{ ...card, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Duration</th>
                  <th>Vehicle Type</th>
                  <th>Price (JMD)</th>
                  <th>Status</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {svcLoading ? <LoadingRow /> :
                 svcError ? <ErrorRow msg={svcError} /> :
                 services.length === 0 ? <EmptyRow cols={6} text="No car wash services yet. Click + Add Service to create one." /> :
                 services.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--txt2)' }}>{item.duration || '—'}</td>
                    <td>
                      {item.vehicle_type ? <span className="b b-pu" style={{ fontSize: 10 }}>{item.vehicle_type}</span> : <span style={{ color: 'var(--txt3)' }}>—</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--grn)' }}>
                      {fmtJMD(item.price)}
                    </td>
                    <td>
                      <button style={toggleBtn(item.active)} onClick={() => toggleServiceActive(item)}>
                        {item.active ? '✓ Active' : '✗ Inactive'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-gh btn-xs" onClick={() => { setEditService(item); setShowSvcModal(true) }}>Edit</button>
                        <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }}
                          onClick={() => setConfirmDel({ table: 'carwash_services', id: item.id, name: item.name })}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add-ons Tab ── */}
      {tab === 'addons' && (
        <div style={{ ...card, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>Add-on</th>
                  <th>Duration (min)</th>
                  <th>Price (JMD)</th>
                  <th>Status</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {addLoading ? <LoadingRow /> :
                 addError ? <ErrorRow msg={addError} /> :
                 addons.length === 0 ? <EmptyRow cols={5} text="No add-ons yet. Click + Add Add-on to create one." /> :
                 addons.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--txt2)', fontFamily: 'var(--mono)' }}>
                      {item.duration_minutes > 0 ? item.duration_minutes : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--grn)' }}>
                      {fmtJMD(item.price)}
                    </td>
                    <td>
                      <button style={toggleBtn(item.active)} onClick={() => toggleAddonActive(item)}>
                        {item.active ? '✓ Active' : '✗ Inactive'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-gh btn-xs" onClick={() => { setEditAddon(item); setShowAddModal(true) }}>Edit</button>
                        <button className="btn btn-xs" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: 'none' }}
                          onClick={() => setConfirmDel({ table: 'carwash_addons', id: item.id, name: item.name })}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showMenuModal && (
        <MenuItemModal
          item={editMenuItem}
          onSave={saveMenuItem}
          onClose={() => { setShowMenuModal(false); setEditMenuItem(null); setAddingAddon(false) }}
          isAddon={addingAddon}
        />
      )}
      {showSvcModal && (
        <ServiceModal
          item={editService}
          onSave={saveService}
          onClose={() => { setShowSvcModal(false); setEditService(null) }}
        />
      )}
      {showAddModal && (
        <AddonModal
          item={editAddon}
          onSave={saveAddon}
          onClose={() => { setShowAddModal(false); setEditAddon(null) }}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          msg={`Delete "${confirmDel.name}"? This cannot be undone.`}
          onConfirm={deleteItem}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {/* Local toast */}
      {localToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: localToast.type === 'success' ? '#1a3d2e' : '#3d1a1a',
          border: `1px solid ${localToast.type === 'success' ? 'rgba(62,207,142,.3)' : 'rgba(245,101,101,.3)'}`,
          color: localToast.type === 'success' ? 'var(--grn)' : 'var(--red)',
          padding: '10px 20px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,.5)', zIndex: 600,
        }}>
          {localToast.type === 'success' ? '✓' : '⚠'} {localToast.msg}
        </div>
      )}
    </div>
  )
}
