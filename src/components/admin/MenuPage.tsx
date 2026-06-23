'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { MenuItem, Addon, ModuleKey } from '@/types'

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
const fmtJMD = (n: number) => 'J$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 })

const MODULES: { key: ModuleKey; label: string; icon: string }[] = [
  { key: 'restaurant', label: 'Restaurant', icon: '🍽️' },
  { key: 'bar',        label: 'Bar',        icon: '🍺' },
  { key: 'carwash',   label: 'Car Wash',   icon: '🚗' },
]

// ── Shared delete confirm ──────────────────────────────────────
function DelConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Confirm Delete</div>
        <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 20 }}>Delete <strong>{name}</strong>? This cannot be undone.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Item Modal ─────────────────────────────────────────────────
function ItemModal({ item, mod, categories, onSave, onClose }: {
  item: MenuItem | null; mod: ModuleKey; categories: string[]
  onSave: (data: MenuItem) => void; onClose: () => void
}) {
  const cats = categories.filter(c => c !== 'All')
  const [form, setForm] = useState({
    name:     item?.name ?? '',
    desc:     item?.desc ?? '',
    price:    item?.price ?? 0,
    cat:      item?.cat ?? (cats[0] ?? ''),
    emoji:    item?.emoji ?? (mod === 'restaurant' ? '🍽️' : mod === 'bar' ? '🍺' : '🚗'),
    active:   item?.active ?? true,
    duration: (item as Record<string, unknown>)?.duration as string ?? '',
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.name.trim().length > 0 && form.price > 0

  const handleSave = () => {
    if (!valid) return
    const saved: MenuItem = {
      id:     item?.id ?? `${mod[0]}${Date.now()}`,
      name:   form.name.trim(),
      desc:   form.desc.trim(),
      price:  Number(form.price),
      cat:    form.cat || (cats[0] ?? 'Other'),
      emoji:  form.emoji.trim() || '🍽️',
      active: form.active,
      module: mod,
      ...(mod === 'carwash' && form.duration ? { duration: form.duration } : {}),
    }
    onSave(saved)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{item ? 'Edit Item' : 'Add Item'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 20 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
            <div>
              <label style={lbl}>Item Name *</label>
              <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Grilled Lobster" autoFocus />
            </div>
            <div>
              <label style={lbl}>Emoji</label>
              <input style={inp} value={form.emoji} onChange={e => set('emoji', e.target.value)} placeholder="🍽️" maxLength={4} />
            </div>
          </div>
          <div>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="Brief description..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Price (J$) *</label>
              <input style={inp} type="number" min={0} step={50} value={form.price} onChange={e => set('price', Number(e.target.value))} />
            </div>
            <div>
              <label style={lbl}>Category</label>
              {cats.length > 0
                ? <select style={inp} value={form.cat} onChange={e => set('cat', e.target.value)}>
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                : <input style={inp} value={form.cat} onChange={e => set('cat', e.target.value)} placeholder="Enter category" />
              }
            </div>
          </div>
          {mod === 'carwash' && (
            <div>
              <label style={lbl}>Duration</label>
              <input style={inp} value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 15 min" />
            </div>
          )}
          <div>
            <label style={lbl}>Status</label>
            <button onClick={() => set('active', !form.active)} style={{ padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: form.active ? 'var(--grn-bg)' : 'var(--red-bg)', color: form.active ? 'var(--grn)' : 'var(--red)' }}>
              {form.active ? 'Active' : 'Inactive'}
            </button>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={!valid} style={{ flex: 2, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: valid ? 'var(--blue)' : 'var(--surf3)', color: valid ? '#fff' : 'var(--txt3)', border: 'none', cursor: valid ? 'pointer' : 'not-allowed' }}>
            {item ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Addon Modal ────────────────────────────────────────────────
function AddonModal({ addon, onSave, onClose }: {
  addon: Addon | null; onSave: (a: Addon) => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    name: addon?.name ?? '', desc: addon?.desc ?? '',
    price: addon?.price ?? 0, icon: addon?.icon ?? '✨', active: addon?.active ?? true,
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{addon ? 'Edit Add-on' : 'Add Add-on'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Extra Sauce" autoFocus />
            </div>
            <div>
              <label style={lbl}>Icon</label>
              <input style={inp} value={form.icon} onChange={e => set('icon', e.target.value)} maxLength={4} />
            </div>
          </div>
          <div>
            <label style={lbl}>Description</label>
            <input style={inp} value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="Optional..." />
          </div>
          <div>
            <label style={lbl}>Price (J$) — 0 = free</label>
            <input style={inp} type="number" min={0} step={50} value={form.price} onChange={e => set('price', Number(e.target.value))} />
          </div>
          <div>
            <label style={lbl}>Status</label>
            <button onClick={() => set('active', !form.active)} style={{ padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: form.active ? 'var(--grn-bg)' : 'var(--red-bg)', color: form.active ? 'var(--grn)' : 'var(--red)' }}>
              {form.active ? 'Active' : 'Inactive'}
            </button>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (!form.name.trim()) return; onSave({ id: addon?.id ?? `a${Date.now()}`, name: form.name.trim(), desc: form.desc.trim(), price: Number(form.price), icon: form.icon || '✨', active: form.active }) }} disabled={!form.name.trim()} style={{ flex: 2, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: form.name.trim() ? 'var(--blue)' : 'var(--surf3)', color: form.name.trim() ? '#fff' : 'var(--txt3)', border: 'none', cursor: form.name.trim() ? 'pointer' : 'not-allowed' }}>
            {addon ? 'Save Changes' : 'Add Add-on'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function MenuPage() {
  const { state, dispatch, toast } = useApp()
  const [tab,  setTab]  = useState<'items' | 'categories' | 'addons'>('items')
  const [mod,  setMod]  = useState<ModuleKey>('restaurant')
  const [search, setSearch] = useState('')

  // Item modal state
  const [editItem, setEditItem]         = useState<MenuItem | null>(null)
  const [showItemModal, setShowItemModal] = useState(false)
  const [delItemId, setDelItemId]       = useState<string | null>(null)

  // Addon modal state
  const [editAddon, setEditAddon]           = useState<Addon | null>(null)
  const [showAddonModal, setShowAddonModal] = useState(false)
  const [delAddonId, setDelAddonId]         = useState<string | null>(null)

  // Category editing state
  const [newCatName,  setNewCatName]  = useState('')
  const [editCatIdx,  setEditCatIdx]  = useState<number | null>(null)
  const [editCatVal,  setEditCatVal]  = useState('')

  const md         = state.menuData[mod]
  const items      = md.items
  const categories = md.categories
  const addons     = md.addons

  const filtered = items.filter(i => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return i.name.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q) || (i.desc ?? '').toLowerCase().includes(q)
  })

  // ── Item CRUD ──────────────────────────────────────────────────
  const saveItem = (data: MenuItem) => {
    if (items.some(i => i.id === data.id)) {
      dispatch({ type: 'UPDATE_MENU_ITEM', mod, item: data })
      toast('Item updated', 'success')
    } else {
      dispatch({ type: 'ADD_MENU_ITEM', mod, item: data })
      toast('Item added', 'success')
    }
    setShowItemModal(false); setEditItem(null)
  }

  const toggleItem = (item: MenuItem) => {
    dispatch({ type: 'UPDATE_MENU_ITEM', mod, item: { ...item, active: !item.active } })
    toast(item.active ? 'Item deactivated' : 'Item activated', 'success')
  }

  // ── Category CRUD ──────────────────────────────────────────────
  const addCategory = () => {
    const name = newCatName.trim()
    if (!name || categories.includes(name)) return
    dispatch({ type: 'SET_MENU_CATEGORIES', mod, categories: [...categories, name] })
    setNewCatName('')
    toast('Category added', 'success')
  }

  const renameCategory = (idx: number) => {
    const val = editCatVal.trim()
    if (!val || val === categories[idx]) { setEditCatIdx(null); return }
    dispatch({ type: 'RENAME_CATEGORY', mod, oldName: categories[idx], newName: val })
    setEditCatIdx(null); setEditCatVal('')
    toast('Category renamed', 'success')
  }

  const deleteCategory = (idx: number) => {
    const name = categories[idx]
    if (name === 'All') return
    if (items.some(i => i.cat === name)) { toast(`"${name}" is in use — reassign items first`, 'error'); return }
    dispatch({ type: 'SET_MENU_CATEGORIES', mod, categories: categories.filter((_, i) => i !== idx) })
    toast('Category deleted', 'success')
  }

  const moveCategory = (idx: number, dir: -1 | 1) => {
    const cats = [...categories]
    const next = idx + dir
    if (next < 0 || next >= cats.length) return
    ;[cats[idx], cats[next]] = [cats[next], cats[idx]]
    dispatch({ type: 'SET_MENU_CATEGORIES', mod, categories: cats })
  }

  // ── Addon CRUD ─────────────────────────────────────────────────
  const saveAddon = (data: Addon) => {
    if (addons.some(a => a.id === data.id)) {
      dispatch({ type: 'UPDATE_MENU_ADDON', mod, addon: data })
      toast('Add-on updated', 'success')
    } else {
      dispatch({ type: 'ADD_MENU_ADDON', mod, addon: data })
      toast('Add-on added', 'success')
    }
    setShowAddonModal(false); setEditAddon(null)
  }

  const toggleAddon = (addon: Addon) => {
    dispatch({ type: 'UPDATE_MENU_ADDON', mod, addon: { ...addon, active: !addon.active } })
  }

  const TABS = [
    { id: 'items' as const,      label: 'Menu Items',  count: items.length },
    { id: 'categories' as const, label: 'Categories',  count: categories.filter(c => c !== 'All').length },
    { id: 'addons' as const,     label: 'Add-ons',     count: addons.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Module selector */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: 'var(--bg3)', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
        {MODULES.map(m => (
          <button key={m.key} onClick={() => { setMod(m.key); setSearch('') }} style={{
            padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 'var(--r)',
            background: mod === m.key ? 'var(--blue)' : 'transparent',
            color:      mod === m.key ? '#fff' : 'var(--txt3)',
            border:    `1.5px solid ${mod === m.key ? 'var(--blue)' : 'var(--bdr)'}`,
          }}>{m.icon} {m.label}</button>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)', padding: '0 20px', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t.id ? 'var(--blue)' : 'transparent'}`,
            color: tab === t.id ? 'var(--blue)' : 'var(--txt3)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: tab === t.id ? 'var(--blue)' : 'var(--surf2)', color: tab === t.id ? '#fff' : 'var(--txt3)', fontWeight: 800 }}>{t.count}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Items ── */}
        {tab === 'items' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>
                  {MODULES.find(m => m.key === mod)?.icon} {MODULES.find(m => m.key === mod)?.label} Menu
                </span>
                <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 10 }}>
                  {items.filter(i => i.active).length} active · {items.length} total
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ ...inp, width: 160, padding: '7px 10px' }} />
                <button onClick={() => { setEditItem(null); setShowItemModal(true) }} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Item</button>
              </div>
            </div>

            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                    {['', 'Name & Description', 'Category', 'Price', 'Status', 'Actions'].map((h, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: i >= 4 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                      {search ? 'No items match your search.' : 'No items yet — click "+ Add Item" to get started.'}
                    </td></tr>
                  ) : filtered.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--bdr)', opacity: item.active ? 1 : 0.55 }}>
                      <td style={{ padding: '10px 12px', fontSize: 20, width: 44, textAlign: 'center' }}>{item.emoji}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--txt)' }}>{item.name}</div>
                        {item.desc && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{item.desc}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--txt2)', fontSize: 12 }}>{item.cat}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{fmtJMD(item.price)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={() => toggleItem(item)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: item.active ? 'var(--grn-bg)' : 'var(--red-bg)', color: item.active ? 'var(--grn)' : 'var(--red)' }}>
                          {item.active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => { setEditItem(item); setShowItemModal(true) }} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                        <button onClick={() => setDelItemId(item.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
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
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>
              {MODULES.find(m => m.key === mod)?.icon} {MODULES.find(m => m.key === mod)?.label} Categories
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 18 }}>
              Categories appear in the POS filter bar and the item editor. &quot;All&quot; is built-in.
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} placeholder="New category name..." style={{ ...inp, flex: 1 }} />
              <button onClick={addCategory} disabled={!newCatName.trim()} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: newCatName.trim() ? 'var(--blue)' : 'var(--surf2)', color: newCatName.trim() ? '#fff' : 'var(--txt3)', border: 'none', cursor: newCatName.trim() ? 'pointer' : 'not-allowed' }}>+ Add</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map((cat, idx) => {
                const isAll = cat === 'All'
                const inUse = items.filter(i => i.cat === cat).length
                return (
                  <div key={`${cat}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)' }}>
                    {!isAll ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--bdr)' : 'var(--txt3)', fontSize: 9, lineHeight: 1, padding: '2px 4px' }}>▲</button>
                        <button onClick={() => moveCategory(idx, 1)} disabled={idx === categories.length - 1} style={{ background: 'none', border: 'none', cursor: idx === categories.length - 1 ? 'default' : 'pointer', color: idx === categories.length - 1 ? 'var(--bdr)' : 'var(--txt3)', fontSize: 9, lineHeight: 1, padding: '2px 4px' }}>▼</button>
                      </div>
                    ) : <div style={{ width: 20 }} />}

                    {editCatIdx === idx ? (
                      <input autoFocus value={editCatVal} onChange={e => setEditCatVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameCategory(idx); if (e.key === 'Escape') setEditCatIdx(null) }} style={{ ...inp, flex: 1, padding: '5px 8px' }} />
                    ) : (
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: isAll ? 'var(--txt3)' : 'var(--txt)' }}>
                        {cat}{isAll && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(built-in filter)</span>}
                      </span>
                    )}

                    <span style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 6 }}>{inUse} item{inUse !== 1 ? 's' : ''}</span>

                    {!isAll && (
                      <div style={{ display: 'flex', gap: 5 }}>
                        {editCatIdx === idx ? (
                          <>
                            <button onClick={() => renameCategory(idx)} style={{ padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditCatIdx(null)} style={{ padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)', cursor: 'pointer' }}>✕</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditCatIdx(idx); setEditCatVal(cat) }} style={{ padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer' }}>Rename</button>
                            <button onClick={() => deleteCategory(idx)} disabled={inUse > 0} title={inUse > 0 ? 'Reassign items first' : 'Delete'} style={{ padding: '5px 10px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: inUse > 0 ? 'transparent' : 'var(--red-bg)', border: `1px solid ${inUse > 0 ? 'var(--bdr)' : 'transparent'}`, color: inUse > 0 ? 'var(--txt3)' : 'var(--red)', cursor: inUse > 0 ? 'not-allowed' : 'pointer' }}>Delete</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {categories.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No categories yet.</div>}
            </div>
          </div>
        )}

        {/* ── Add-ons ── */}
        {tab === 'addons' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>
                {MODULES.find(m => m.key === mod)?.icon} {MODULES.find(m => m.key === mod)?.label} Add-ons
              </div>
              <button onClick={() => { setEditAddon(null); setShowAddonModal(true) }} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Add Add-on</button>
            </div>

            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                    {['', 'Name', 'Description', 'Price', 'Status', 'Actions'].map((h, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: i >= 4 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {addons.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>No add-ons yet.</td></tr>
                  ) : addons.map(addon => (
                    <tr key={addon.id} style={{ borderBottom: '1px solid var(--bdr)', opacity: addon.active ? 1 : 0.55 }}>
                      <td style={{ padding: '10px 12px', fontSize: 20, width: 44, textAlign: 'center' }}>{addon.icon}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--txt)' }}>{addon.name}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--txt2)', fontSize: 12 }}>{addon.desc || '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{addon.price > 0 ? fmtJMD(addon.price) : 'Free'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={() => toggleAddon(addon)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: addon.active ? 'var(--grn-bg)' : 'var(--red-bg)', color: addon.active ? 'var(--grn)' : 'var(--red)' }}>
                          {addon.active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => { setEditAddon(addon); setShowAddonModal(true) }} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                        <button onClick={() => setDelAddonId(addon.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showItemModal && (
        <ItemModal item={editItem} mod={mod} categories={categories} onSave={saveItem} onClose={() => { setShowItemModal(false); setEditItem(null) }} />
      )}
      {delItemId && (
        <DelConfirm name={items.find(i => i.id === delItemId)?.name ?? ''} onConfirm={() => { dispatch({ type: 'DELETE_MENU_ITEM', mod, id: delItemId }); toast('Item deleted', 'success'); setDelItemId(null) }} onCancel={() => setDelItemId(null)} />
      )}
      {showAddonModal && (
        <AddonModal addon={editAddon} onSave={saveAddon} onClose={() => { setShowAddonModal(false); setEditAddon(null) }} />
      )}
      {delAddonId && (
        <DelConfirm name={addons.find(a => a.id === delAddonId)?.name ?? ''} onConfirm={() => { dispatch({ type: 'DELETE_MENU_ADDON', mod, id: delAddonId }); toast('Add-on deleted', 'success'); setDelAddonId(null) }} onCancel={() => setDelAddonId(null)} />
      )}
    </div>
  )
}
