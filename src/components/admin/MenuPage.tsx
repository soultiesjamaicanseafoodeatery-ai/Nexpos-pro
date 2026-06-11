'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { storage } from '@/lib/utils/storage'

const API = 'https://www.soultiesseafoodjm.com'

// ── Types ──────────────────────────────────────────────────────
interface MenuItemRow {
  id: string
  name: string
  description: string
  price: number
  category: string
  module: string
  route: string
  emoji: string
  active: boolean
}
interface Category {
  id: string
  name: string
  module: string
  active: boolean
  sort_order: number
}
interface Flavour {
  id: string
  name: string
  description: string
  active: boolean
}
interface Side {
  id: string
  name: string
  description: string
  price: number
  active: boolean
}
interface PosAddon {
  id: string
  name: string
  description: string
  price: number
  active: boolean
}
interface Size {
  id: string
  name: string
  sort_order: number
  active: boolean
}
interface ItemAssignment {
  flavour_ids: string[]
  side_ids: string[]
  addon_ids: string[]
  sizes: { size_id: string; price: number }[]
}

// ── Shared style helpers ───────────────────────────────────────
const fmtJMD = (n: number) =>
  'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const lbl: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--txt3)',
  textTransform: 'uppercase' as const,
  letterSpacing: '.5px',
  marginBottom: 4,
  display: 'block',
}
const inp: React.CSSProperties = {
  width: '100%',
  background: 'var(--surf2)',
  border: '1px solid var(--bdr2)',
  borderRadius: 'var(--r2)',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--txt)',
}
const toggleStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  border: 'none',
  background: active ? 'var(--grn-bg)' : 'var(--red-bg)',
  color: active ? 'var(--grn)' : 'var(--red)',
})
const card: React.CSSProperties = {
  background: 'var(--surf)',
  border: '1px solid var(--bdr)',
  borderRadius: 'var(--r3)',
  overflow: 'hidden',
}

// ── SQL Schema ─────────────────────────────────────────────────
const SQL_SCHEMA = `-- New tables for relational menu management
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'restaurant',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.flavours (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sides (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.addons (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sizes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.item_flavours (
  item_id TEXT NOT NULL, flavour_id TEXT NOT NULL,
  PRIMARY KEY (item_id, flavour_id)
);
CREATE TABLE IF NOT EXISTS public.item_sides (
  item_id TEXT NOT NULL, side_id TEXT NOT NULL,
  PRIMARY KEY (item_id, side_id)
);
CREATE TABLE IF NOT EXISTS public.item_addons (
  item_id TEXT NOT NULL, addon_id TEXT NOT NULL,
  PRIMARY KEY (item_id, addon_id)
);
CREATE TABLE IF NOT EXISTS public.item_sizes (
  item_id TEXT NOT NULL, size_id TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, size_id)
);
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS module TEXT DEFAULT 'restaurant';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS route TEXT DEFAULT '';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '🍽️';
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flavours DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sides DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.addons DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sizes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_flavours DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_sides DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_addons DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_sizes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.categories TO anon, authenticated;
GRANT ALL ON public.flavours TO anon, authenticated;
GRANT ALL ON public.sides TO anon, authenticated;
GRANT ALL ON public.addons TO anon, authenticated;
GRANT ALL ON public.sizes TO anon, authenticated;
GRANT ALL ON public.item_flavours TO anon, authenticated;
GRANT ALL ON public.item_sides TO anon, authenticated;
GRANT ALL ON public.item_addons TO anon, authenticated;
GRANT ALL ON public.item_sizes TO anon, authenticated;
NOTIFY pgrst, 'reload schema';`

// ── SimpleManager ──────────────────────────────────────────────
interface SimpleManagerProps {
  title: string
  subtitle: string
  items: Record<string, unknown>[]
  loading: boolean
  error: string | null
  columns: { key: string; label: string; render?: (item: Record<string, unknown>) => React.ReactNode }[]
  formFields: {
    key: string
    label: string
    type: 'text' | 'number' | 'textarea'
    placeholder?: string
    defaultValue?: string | number
  }[]
  onSave: (form: Record<string, unknown>, editId: string | null) => Promise<void>
  onDelete: (id: string, name: string) => Promise<void>
  onToggle: (item: Record<string, unknown>) => Promise<void>
  addLabel?: string
}

function SimpleManager({
  title,
  subtitle,
  items,
  loading,
  error,
  columns,
  formFields,
  onSave,
  onDelete,
  onToggle,
  addLabel = '+ Add',
}: SimpleManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState<Record<string, unknown>>({})
  const [saving,   setSaving]   = useState(false)
  const [delId,    setDelId]    = useState<string | null>(null)

  const openAdd = () => {
    const defaults: Record<string, unknown> = {}
    formFields.forEach(f => { defaults[f.key] = f.defaultValue ?? '' })
    setForm(defaults)
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (item: Record<string, unknown>) => {
    const vals: Record<string, unknown> = {}
    formFields.forEach(f => { vals[f.key] = item[f.key] ?? f.defaultValue ?? '' })
    setForm(vals)
    setEditId(item.id as string)
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(form, editId)
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!delId) return
    const item = items.find(i => i.id === delId)
    await onDelete(delId, (item?.name as string) ?? delId)
    setDelId(null)
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{subtitle}</div>
        </div>
        <button onClick={openAdd} style={{
          padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700,
          background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer',
        }}>{addLabel}</button>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r)', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
              {columns.map(col => (
                <th key={col.key} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{col.label}</th>
              ))}
              <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Status</th>
              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 2} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)' }}>Loading...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)' }}>No items yet</td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id as string} style={{ borderBottom: '1px solid var(--bdr)' }}>
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '10px 14px', color: 'var(--txt)' }}>
                    {col.render ? col.render(item) : String(item[col.key] ?? '')}
                  </td>
                ))}
                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                  <button style={toggleStyle(item.active as boolean)} onClick={() => onToggle(item)}>
                    {item.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button onClick={() => openEdit(item)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                  <button onClick={() => setDelId(item.id as string)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: '1px solid transparent', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>
              {editId ? 'Edit' : 'Add'} {title.replace(/s$/, '')}
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formFields.map(field => (
                <div key={field.key}>
                  <label style={lbl}>{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={String(form[field.key] ?? '')}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      rows={3}
                      style={{ ...inp, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={String(form[field.key] ?? '')}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
                      placeholder={field.placeholder}
                      style={{ ...inp, boxSizing: 'border-box' }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {delId && (
        <div onClick={() => setDelId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', width: '100%', maxWidth: 360, boxShadow: '0 24px 60px rgba(0,0,0,.5)', padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Confirm Delete</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 20 }}>
              Are you sure you want to delete <strong>{(items.find(i => i.id === delId)?.name as string) ?? delId}</strong>? This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDelId(null)} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ItemModal ──────────────────────────────────────────────────
interface ItemModalProps {
  item: MenuItemRow | null
  categories: Category[]
  flavours: Flavour[]
  sides: Side[]
  addons: PosAddon[]
  sizes: Size[]
  assignment: ItemAssignment
  onSave: (itemData: Partial<MenuItemRow>, assignment: ItemAssignment) => Promise<void>
  onClose: () => void
}

function ItemModal({ item, categories, flavours, sides, addons, sizes, assignment, onSave, onClose }: ItemModalProps) {
  const [subTab, setSubTab] = useState<'details' | 'flavours-sides' | 'addons-sizes'>('details')
  const [form, setForm] = useState<Partial<MenuItemRow>>({
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item?.price ?? 0,
    category: item?.category ?? '',
    module: item?.module ?? 'restaurant',
    route: item?.route ?? '',
    emoji: item?.emoji ?? '🍽️',
    active: item?.active ?? true,
  })
  const [asgn, setAsgn] = useState<ItemAssignment>({
    flavour_ids: assignment.flavour_ids ?? [],
    side_ids: assignment.side_ids ?? [],
    addon_ids: assignment.addon_ids ?? [],
    sizes: assignment.sizes ?? [],
  })
  const [saving, setSaving] = useState(false)

  const moduleFilter = form.module ?? 'restaurant'
  const filteredCats = categories.filter(c => c.active !== false && (c.module === moduleFilter || !c.module))
  const activeFlavours = flavours.filter(f => f.active !== false)
  const activeSides    = sides.filter(s => s.active !== false)
  const activeAddons   = addons.filter(a => a.active !== false)
  const activeSizes    = sizes.filter(s => s.active !== false).sort((a, b) => a.sort_order - b.sort_order)

  const toggleFlavour = (id: string) => {
    setAsgn(prev => ({
      ...prev,
      flavour_ids: prev.flavour_ids.includes(id) ? prev.flavour_ids.filter(x => x !== id) : [...prev.flavour_ids, id],
    }))
  }
  const toggleSide = (id: string) => {
    setAsgn(prev => ({
      ...prev,
      side_ids: prev.side_ids.includes(id) ? prev.side_ids.filter(x => x !== id) : [...prev.side_ids, id],
    }))
  }
  const toggleAddon = (id: string) => {
    setAsgn(prev => ({
      ...prev,
      addon_ids: prev.addon_ids.includes(id) ? prev.addon_ids.filter(x => x !== id) : [...prev.addon_ids, id],
    }))
  }
  const setSizePrice = (sizeId: string, price: number) => {
    setAsgn(prev => {
      const existing = prev.sizes.find(s => s.size_id === sizeId)
      if (price === 0 && existing) {
        return { ...prev, sizes: prev.sizes.filter(s => s.size_id !== sizeId) }
      }
      if (price > 0 && existing) {
        return { ...prev, sizes: prev.sizes.map(s => s.size_id === sizeId ? { ...s, price } : s) }
      }
      if (price > 0 && !existing) {
        return { ...prev, sizes: [...prev.sizes, { size_id: sizeId, price }] }
      }
      return prev
    })
  }

  const handleSave = async () => {
    if (!form.name || !form.price) return
    setSaving(true)
    try {
      await onSave(form, asgn)
    } finally {
      setSaving(false)
    }
  }

  const SUB_TABS = [
    { id: 'details' as const,         label: 'Details' },
    { id: 'flavours-sides' as const,  label: 'Flavours & Sides' },
    { id: 'addons-sizes' as const,    label: 'Add-ons & Sizes' },
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>
            {item ? 'Edit Item' : 'Add Item'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 20 }}>×</button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)', padding: '0 16px' }}>
          {SUB_TABS.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)} style={{
              padding: '10px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${subTab === t.id ? 'var(--blue)' : 'transparent'}`,
              color: subTab === t.id ? 'var(--blue)' : 'var(--txt3)',
              marginRight: 4,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* ── Details ── */}
          {subTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Name *</label>
                  <input type="text" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={{ ...inp, boxSizing: 'border-box' }} placeholder="Item name" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Description</label>
                  <textarea value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical', boxSizing: 'border-box' }} placeholder="Description..." />
                </div>
                <div>
                  <label style={lbl}>Price (J$) *</label>
                  <input type="number" value={form.price ?? 0} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} style={{ ...inp, boxSizing: 'border-box' }} min={0} step={0.01} />
                </div>
                <div>
                  <label style={lbl}>Emoji</label>
                  <input type="text" value={form.emoji ?? '🍽️'} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} style={{ ...inp, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={lbl}>Module</label>
                  <select value={form.module ?? 'restaurant'} onChange={e => setForm(p => ({ ...p, module: e.target.value, category: '' }))} style={{ ...inp, boxSizing: 'border-box' }}>
                    <option value="restaurant">Restaurant</option>
                    <option value="bar">Bar</option>
                    <option value="carwash">Car Wash</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Category</label>
                  {filteredCats.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 10px', background: 'var(--red-bg)', borderRadius: 'var(--r2)', border: '1px solid var(--bdr2)' }}>
                      No categories found for <strong>{form.module ?? 'restaurant'}</strong>. Create one in the Categories tab first.
                    </div>
                  ) : (
                    <select value={form.category ?? ''} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ ...inp, boxSizing: 'border-box' }}>
                      <option value="">— Select —</option>
                      {filteredCats.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Route</label>
                  <input type="text" value={form.route ?? ''} onChange={e => setForm(p => ({ ...p, route: e.target.value }))} style={{ ...inp, boxSizing: 'border-box' }} placeholder="e.g. kitchen, bar, carwash" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Active</label>
                  <button style={toggleStyle(form.active ?? true)} onClick={() => setForm(p => ({ ...p, active: !p.active }))}>
                    {form.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Flavours & Sides ── */}
          {subTab === 'flavours-sides' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ ...lbl, marginBottom: 10 }}>Flavours</div>
                {activeFlavours.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No flavours defined yet. Add them in the Flavours tab.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {activeFlavours.map(f => {
                      const sel = asgn.flavour_ids.includes(f.id)
                      return (
                        <button key={f.id} onClick={() => toggleFlavour(f.id)} style={{
                          padding: '7px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          border: `2px solid ${sel ? 'var(--blue)' : 'var(--bdr)'}`,
                          background: sel ? 'var(--blue-bg, #1e3a5f22)' : 'transparent',
                          color: sel ? 'var(--blue)' : 'var(--txt2)',
                        }}>{f.name}</button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div>
                <div style={{ ...lbl, marginBottom: 10 }}>Sides</div>
                {activeSides.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No sides defined yet. Add them in the Sides tab.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {activeSides.map(s => {
                      const sel = asgn.side_ids.includes(s.id)
                      return (
                        <button key={s.id} onClick={() => toggleSide(s.id)} style={{
                          padding: '7px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          border: `2px solid ${sel ? 'var(--blue)' : 'var(--bdr)'}`,
                          background: sel ? 'var(--blue-bg, #1e3a5f22)' : 'transparent',
                          color: sel ? 'var(--blue)' : 'var(--txt2)',
                        }}>
                          {s.name}{s.price > 0 ? ` +${fmtJMD(s.price)}` : ''}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Add-ons & Sizes ── */}
          {subTab === 'addons-sizes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ ...lbl, marginBottom: 10 }}>Add-ons</div>
                {activeAddons.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No add-ons defined yet. Add them in the Add-ons tab.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {activeAddons.map(a => {
                      const sel = asgn.addon_ids.includes(a.id)
                      return (
                        <button key={a.id} onClick={() => toggleAddon(a.id)} style={{
                          padding: '7px 14px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          border: `2px solid ${sel ? 'var(--blue)' : 'var(--bdr)'}`,
                          background: sel ? 'var(--blue-bg, #1e3a5f22)' : 'transparent',
                          color: sel ? 'var(--blue)' : 'var(--txt2)',
                        }}>
                          {a.name}{a.price > 0 ? ` +${fmtJMD(a.price)}` : ''}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div>
                <div style={{ ...lbl, marginBottom: 10 }}>Sizes (price 0 = not available)</div>
                {activeSizes.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No sizes defined yet. Add them in the Sizes tab.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeSizes.map(sz => {
                      const existing = asgn.sizes.find(s => s.size_id === sz.id)
                      const priceVal = existing?.price ?? 0
                      return (
                        <div key={sz.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 'var(--r)', background: priceVal > 0 ? 'var(--blue-bg, #1e3a5f22)' : 'var(--surf)', border: `1px solid ${priceVal > 0 ? 'var(--blue)' : 'var(--bdr)'}` }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', flex: 1 }}>{sz.name}</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={priceVal}
                            onChange={e => setSizePrice(sz.id, Number(e.target.value))}
                            placeholder="0 = not included"
                            style={{ width: 120, background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '6px 8px', fontSize: 13, color: 'var(--txt)', boxSizing: 'border-box' }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name} style={{
            flex: 2, padding: '11px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700,
            background: !form.name ? 'var(--surf3)' : 'var(--blue)', color: !form.name ? 'var(--txt3)' : '#fff',
            border: 'none', cursor: !form.name || saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RoutingTab ─────────────────────────────────────────────────
interface RoutingTabProps {
  items: MenuItemRow[]
  onBulkRoute: (ids: string[], route: string) => Promise<void>
}

function RoutingTab({ items, onBulkRoute }: RoutingTabProps) {
  const [selected,  setSelected]  = useState<string[]>([])
  const [bulkRoute, setBulkRoute] = useState('')
  const [saving,    setSaving]    = useState(false)

  const groups: Record<string, MenuItemRow[]> = {}
  for (const item of items) {
    const key = item.route?.trim() || '__unassigned__'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleBulkAssign = async () => {
    if (selected.length === 0 || !bulkRoute.trim()) return
    setSaving(true)
    try {
      await onBulkRoute(selected, bulkRoute.trim())
      setSelected([])
      setBulkRoute('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Routing</div>
        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>Assign menu items to kitchen routes for order printing/display.</div>
      </div>

      {selected.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--blue-bg, #1e3a5f22)', border: '1px solid var(--blue)', marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>{selected.length} selected</span>
          <input
            value={bulkRoute}
            onChange={e => setBulkRoute(e.target.value)}
            placeholder="Route name (e.g. kitchen, bar)"
            style={{ flex: 1, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '7px 10px', fontSize: 13, color: 'var(--txt)' }}
          />
          <button onClick={handleBulkAssign} disabled={saving || !bulkRoute.trim()} style={{ padding: '8px 16px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Assign'}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '8px 12px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)', cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Object.entries(groups)
          .sort(([a], [b]) => a === '__unassigned__' ? 1 : b === '__unassigned__' ? -1 : a.localeCompare(b))
          .map(([route, routeItems]) => (
            <div key={route} style={card}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: route === '__unassigned__' ? 'var(--txt3)' : 'var(--txt)' }}>
                  {route === '__unassigned__' ? '— Unassigned —' : `Route: ${route}`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 600 }}>{routeItems.length} item{routeItems.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ padding: '8px 16px' }}>
                {routeItems.map(item => (
                  <div key={item.id} onClick={() => toggleSelect(item.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r)',
                    marginBottom: 4, cursor: 'pointer',
                    background: selected.includes(item.id) ? 'var(--blue-bg, #1e3a5f22)' : 'transparent',
                    border: `1px solid ${selected.includes(item.id) ? 'var(--blue)' : 'transparent'}`,
                  }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selected.includes(item.id) ? 'var(--blue)' : 'var(--bdr2)'}`, background: selected.includes(item.id) ? 'var(--blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                      {selected.includes(item.id) ? '✓' : ''}
                    </div>
                    <span style={{ fontSize: 16 }}>{item.emoji}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', flex: 1 }}>{item.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{item.category}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--surf2)', color: 'var(--txt3)', fontWeight: 600 }}>{item.module}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── MenuPage ───────────────────────────────────────────────────
export default function MenuPage() {
  const [tab,           setTab]           = useState<'items' | 'categories' | 'flavours' | 'sides' | 'addons' | 'sizes' | 'routing'>('items')
  const [moduleFilter,  setModuleFilter]  = useState<'restaurant' | 'bar' | 'carwash'>('restaurant')
  const [items,         setItems]         = useState<MenuItemRow[]>([])
  const [categories,    setCategories]    = useState<Category[]>([])
  const [flavours,      setFlavours]      = useState<Flavour[]>([])
  const [sides,         setSides]         = useState<Side[]>([])
  const [addons,        setAddons]        = useState<PosAddon[]>([])
  const [sizes,         setSizes]         = useState<Size[]>([])
  const [assignments,   setAssignments]   = useState<Record<string, ItemAssignment>>({})
  const [loading,       setLoading]       = useState(true)
  const [editItem,      setEditItem]      = useState<MenuItemRow | null>(null)
  const [showItemModal, setShowItemModal] = useState(false)
  const [localToast,    setLocalToast]    = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [sqlOpen,       setSqlOpen]       = useState(false)

  const [catErr,   setCatErr]   = useState<string | null>(null)
  const [flvErr,   setFlvErr]   = useState<string | null>(null)
  const [sideErr,  setSideErr]  = useState<string | null>(null)
  const [addonErr, setAddonErr] = useState<string | null>(null)
  const [sizeErr,  setSizeErr]  = useState<string | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setLocalToast({ msg, type })
    setTimeout(() => setLocalToast(null), 3000)
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, catsRes, flvRes, sideRes, addRes, szRes, asgRes] = await Promise.allSettled([
        fetch(`${API}/api/menu`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/categories`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/flavours`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/sides`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/addons`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/sizes`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/assignments`).then(r => r.ok ? r.json() : {}),
      ])

      if (itemsRes.status === 'fulfilled' && Array.isArray(itemsRes.value)) {
        setItems(itemsRes.value.map((r: Record<string, unknown>) => ({
          id: String(r.id ?? ''),
          name: String(r.name ?? ''),
          description: String(r.description ?? ''),
          price: Number(r.price ?? 0),
          category: String(r.category ?? ''),
          module: String(r.module ?? 'restaurant'),
          route: String(r.route ?? ''),
          emoji: String(r.emoji ?? '🍽️'),
          active: Boolean(r.active ?? (r.is_available ?? true)),
        })))
      } else {
        showToast('Could not load menu items', 'error')
      }

      if (catsRes.status  === 'fulfilled' && Array.isArray(catsRes.value))  setCategories(catsRes.value)
      if (flvRes.status   === 'fulfilled' && Array.isArray(flvRes.value))   setFlavours(flvRes.value)
      if (sideRes.status  === 'fulfilled' && Array.isArray(sideRes.value))  setSides(sideRes.value)
      if (addRes.status   === 'fulfilled' && Array.isArray(addRes.value))   setAddons(addRes.value)
      if (szRes.status    === 'fulfilled' && Array.isArray(szRes.value))    setSizes(szRes.value)
      if (asgRes.status   === 'fulfilled' && asgRes.value && typeof asgRes.value === 'object') {
        setAssignments(asgRes.value as Record<string, ItemAssignment>)
      }
    } catch {
      showToast('Error loading data', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Item save ──
  const saveItem = async (itemData: Partial<MenuItemRow>, asgn: ItemAssignment) => {
    const isEdit = !!(editItem?.id)
    const method = isEdit ? 'PUT' : 'POST'
    const payload = isEdit ? { id: editItem!.id, ...itemData } : itemData

    const r = await fetch(`${API}/api/menu`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error((e as { error?: string }).error ?? 'Save failed')
    }
    const saved = await r.json() as { id: string }

    await fetch(`${API}/api/assignments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: saved.id, ...asgn }),
    })

    await loadAll()
    setShowItemModal(false)
    setEditItem(null)
    showToast(`Item ${isEdit ? 'updated' : 'created'} successfully`)
  }

  // ── Generic CRUD helpers ──
  const saveSimpleEntity = async (endpoint: string, form: Record<string, unknown>, editId: string | null) => {
    const method = editId ? 'PUT' : 'POST'
    const payload = editId ? { id: editId, ...form } : form
    const r = await fetch(`${API}/api/${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error((e as { error?: string }).error ?? 'Save failed')
    }
    await loadAll()
    showToast('Saved successfully')
  }

  const deleteSimpleEntity = async (endpoint: string, id: string) => {
    const r = await fetch(`${API}/api/${endpoint}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error((e as { error?: string }).error ?? 'Delete failed')
    }
    await loadAll()
    showToast('Deleted')
  }

  const toggleSimpleEntity = async (endpoint: string, item: Record<string, unknown>) => {
    await fetch(`${API}/api/${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    })
    await loadAll()
  }

  const toggleItem = async (item: MenuItemRow) => {
    await fetch(`${API}/api/menu`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    })
    await loadAll()
  }

  const deleteItem = async (id: string) => {
    await fetch(`${API}/api/menu?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await loadAll()
    showToast('Item deleted')
  }

  const handleBulkRoute = async (ids: string[], route: string) => {
    await Promise.all(ids.map(id =>
      fetch(`${API}/api/menu`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, route }),
      })
    ))
    await loadAll()
    showToast(`Route assigned to ${ids.length} item(s)`)
  }

  const TABS = [
    { id: 'items',      icon: '🍽️', label: 'Items' },
    { id: 'categories', icon: '📂', label: 'Categories' },
    { id: 'flavours',   icon: '🌶️', label: 'Flavours' },
    { id: 'sides',      icon: '🍚', label: 'Sides' },
    { id: 'addons',     icon: '✨', label: 'Add-ons' },
    { id: 'sizes',      icon: '📏', label: 'Sizes' },
    { id: 'routing',    icon: '🔀', label: 'Routing' },
  ] as const

  const filteredItems = items.filter(i => i.module === moduleFilter)

  // Suppress unused import warning — storage is available for future cache use
  void storage

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toast */}
      {localToast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          padding: '12px 20px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700,
          background: localToast.type === 'success' ? 'var(--grn)' : 'var(--red)',
          color: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,.3)',
        }}>
          {localToast.msg}
        </div>
      )}

      {/* Tab bar */}
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

        {/* ── Items tab ── */}
        {tab === 'items' && (
          <div style={{ padding: '20px 24px' }}>
            {/* SQL info box */}
            <div style={{ marginBottom: 18, border: '1px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              <button
                onClick={() => setSqlOpen(o => !o)}
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--txt2)', textAlign: 'left' }}
              >
                <span style={{ fontSize: 14 }}>{sqlOpen ? '▼' : '▶'}</span>
                Run this SQL in Supabase to enable full relational features
              </button>
              {sqlOpen && (
                <div style={{ background: 'var(--bg3)', borderTop: '1px solid var(--bdr)' }}>
                  <pre style={{ margin: 0, padding: '14px 16px', fontSize: 11, color: 'var(--txt2)', overflowX: 'auto', lineHeight: 1.6 }}>
                    {SQL_SCHEMA}
                  </pre>
                </div>
              )}
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>Menu Items</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} in {moduleFilter}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {(['restaurant', 'bar', 'carwash'] as const).map(m => (
                  <button key={m} onClick={() => setModuleFilter(m)} style={{
                    padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: `2px solid ${moduleFilter === m ? 'var(--blue)' : 'var(--bdr)'}`,
                    background: moduleFilter === m ? 'var(--blue-bg, #1e3a5f22)' : 'transparent',
                    color: moduleFilter === m ? 'var(--blue)' : 'var(--txt3)',
                  }}>
                    {m === 'restaurant' ? '🍽️ Restaurant' : m === 'bar' ? '🍺 Bar' : '🚗 Car Wash'}
                  </button>
                ))}
                <button onClick={() => { setEditItem(null); setShowItemModal(true) }} style={{
                  padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700,
                  background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer',
                }}>+ Add Item</button>
              </div>
            </div>

            {/* Items table */}
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                    {['', 'Name', 'Category', 'Module', 'Price', 'Route', 'Status', 'Actions'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: i >= 6 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)' }}>Loading...</td></tr>
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)' }}>No items yet — click &quot;+ Add Item&quot; to get started</td></tr>
                  ) : filteredItems.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--bdr)' }}>
                      <td style={{ padding: '10px 12px', fontSize: 22 }}>{item.emoji}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--txt)' }}>{item.name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--txt2)' }}>{item.category}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                          background: item.module === 'restaurant' ? 'var(--ora-bg,#78350f22)' : item.module === 'bar' ? '#4c1d9522' : 'var(--blue-bg)',
                          color: item.module === 'restaurant' ? 'var(--ora,#f97316)' : item.module === 'bar' ? '#a855f7' : 'var(--blue)',
                        }}>
                          {item.module}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{fmtJMD(item.price)}</td>
                      <td style={{ padding: '10px 12px', color: item.route ? 'var(--txt2)' : 'var(--txt3)', fontSize: 12 }}>{item.route || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button style={toggleStyle(item.active)} onClick={() => toggleItem(item)}>
                          {item.active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button onClick={() => { setEditItem(item); setShowItemModal(true) }} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                        <button onClick={() => deleteItem(item.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: '1px solid transparent', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Categories ── */}
        {tab === 'categories' && (
          <SimpleManager
            title="Categories"
            subtitle="Group menu items by category, per module."
            items={categories as unknown as Record<string, unknown>[]}
            loading={loading}
            error={catErr}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'module', label: 'Module' },
              { key: 'sort_order', label: 'Order' },
            ]}
            formFields={[
              { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Seafood' },
              { key: 'module', label: 'Module', type: 'text', placeholder: 'restaurant / bar / carwash', defaultValue: 'restaurant' },
              { key: 'sort_order', label: 'Sort Order', type: 'number', defaultValue: 0 },
            ]}
            onSave={async (form, editId) => {
              setCatErr(null)
              try { await saveSimpleEntity('categories', form, editId) } catch (e) { setCatErr((e as Error).message) }
            }}
            onDelete={async (id) => {
              setCatErr(null)
              try { await deleteSimpleEntity('categories', id) } catch (e) { setCatErr((e as Error).message) }
            }}
            onToggle={async (item) => {
              try { await toggleSimpleEntity('categories', item) } catch (e) { setCatErr((e as Error).message) }
            }}
          />
        )}

        {/* ── Flavours ── */}
        {tab === 'flavours' && (
          <SimpleManager
            title="Flavours"
            subtitle="Define flavour options that can be assigned to menu items."
            items={flavours as unknown as Record<string, unknown>[]}
            loading={loading}
            error={flvErr}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'description', label: 'Description' },
            ]}
            formFields={[
              { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Jerk, Curry, Pepper...' },
              { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description...' },
            ]}
            onSave={async (form, editId) => {
              setFlvErr(null)
              try { await saveSimpleEntity('flavours', form, editId) } catch (e) { setFlvErr((e as Error).message) }
            }}
            onDelete={async (id) => {
              setFlvErr(null)
              try { await deleteSimpleEntity('flavours', id) } catch (e) { setFlvErr((e as Error).message) }
            }}
            onToggle={async (item) => {
              try { await toggleSimpleEntity('flavours', item) } catch (e) { setFlvErr((e as Error).message) }
            }}
          />
        )}

        {/* ── Sides ── */}
        {tab === 'sides' && (
          <SimpleManager
            title="Sides"
            subtitle="Define side dishes that can be assigned to menu items."
            items={sides as unknown as Record<string, unknown>[]}
            loading={loading}
            error={sideErr}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'description', label: 'Description' },
              { key: 'price', label: 'Price', render: (i) => (i.price as number) > 0 ? fmtJMD(i.price as number) : 'Free' },
            ]}
            formFields={[
              { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Rice & Peas, Festival...' },
              { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description...' },
              { key: 'price', label: 'Price (J$)', type: 'number', defaultValue: 0 },
            ]}
            onSave={async (form, editId) => {
              setSideErr(null)
              try { await saveSimpleEntity('sides', form, editId) } catch (e) { setSideErr((e as Error).message) }
            }}
            onDelete={async (id) => {
              setSideErr(null)
              try { await deleteSimpleEntity('sides', id) } catch (e) { setSideErr((e as Error).message) }
            }}
            onToggle={async (item) => {
              try { await toggleSimpleEntity('sides', item) } catch (e) { setSideErr((e as Error).message) }
            }}
          />
        )}

        {/* ── Add-ons ── */}
        {tab === 'addons' && (
          <SimpleManager
            title="Add-ons"
            subtitle="Define add-ons that can be assigned to specific menu items."
            items={addons as unknown as Record<string, unknown>[]}
            loading={loading}
            error={addonErr}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'description', label: 'Description' },
              { key: 'price', label: 'Price', render: (i) => (i.price as number) > 0 ? fmtJMD(i.price as number) : 'Free' },
            ]}
            formFields={[
              { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Extra Sauce, Cheese...' },
              { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description...' },
              { key: 'price', label: 'Price (J$)', type: 'number', defaultValue: 0 },
            ]}
            onSave={async (form, editId) => {
              setAddonErr(null)
              try { await saveSimpleEntity('addons', form, editId) } catch (e) { setAddonErr((e as Error).message) }
            }}
            onDelete={async (id) => {
              setAddonErr(null)
              try { await deleteSimpleEntity('addons', id) } catch (e) { setAddonErr((e as Error).message) }
            }}
            onToggle={async (item) => {
              try { await toggleSimpleEntity('addons', item) } catch (e) { setAddonErr((e as Error).message) }
            }}
          />
        )}

        {/* ── Sizes ── */}
        {tab === 'sizes' && (
          <SimpleManager
            title="Sizes"
            subtitle="Define size options. Assign per-item prices in the Items editor."
            items={sizes as unknown as Record<string, unknown>[]}
            loading={loading}
            error={sizeErr}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'sort_order', label: 'Sort Order' },
            ]}
            formFields={[
              { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Small, Medium, Large' },
              { key: 'sort_order', label: 'Sort Order', type: 'number', defaultValue: 0 },
            ]}
            onSave={async (form, editId) => {
              setSizeErr(null)
              try { await saveSimpleEntity('sizes', form, editId) } catch (e) { setSizeErr((e as Error).message) }
            }}
            onDelete={async (id) => {
              setSizeErr(null)
              try { await deleteSimpleEntity('sizes', id) } catch (e) { setSizeErr((e as Error).message) }
            }}
            onToggle={async (item) => {
              try { await toggleSimpleEntity('sizes', item) } catch (e) { setSizeErr((e as Error).message) }
            }}
          />
        )}

        {/* ── Routing ── */}
        {tab === 'routing' && (
          <RoutingTab items={items} onBulkRoute={handleBulkRoute} />
        )}
      </div>

      {/* Item Modal */}
      {showItemModal && (
        <ItemModal
          item={editItem}
          categories={categories}
          flavours={flavours}
          sides={sides}
          addons={addons}
          sizes={sizes}
          assignment={
            editItem
              ? (assignments[editItem.id] ?? { flavour_ids: [], side_ids: [], addon_ids: [], sizes: [] })
              : { flavour_ids: [], side_ids: [], addon_ids: [], sizes: [] }
          }
          onSave={saveItem}
          onClose={() => { setShowItemModal(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}
