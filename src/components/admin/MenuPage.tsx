'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { MenuItem, Addon, ModuleKey } from '@/types'

interface RawApiItem {
  id: string; name: string; description?: string; price?: number
  category?: string; emoji?: string; is_available?: boolean; active?: boolean; module?: string
}
interface Flavour { id: string; name: string; description: string; active: boolean }
interface Side    { id: string; name: string; description: string; price: number; active: boolean }

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

function ItemModal({ item, mod, categories, flavours, sides, addons, onSave, onClose }: {
  item: MenuItem | null; mod: ModuleKey; categories: string[]
  flavours: Flavour[]; sides: Side[]; addons: Addon[]
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
    duration: item?.duration ?? '',
  })
  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }))

  const [assignedFlavourIds, setAssignedFlavourIds] = useState<string[]>([])
  const [assignedSideIds,    setAssignedSideIds]    = useState<string[]>([])
  const [assignedAddonIds,   setAssignedAddonIds]   = useState<string[]>([])

  useEffect(() => {
    if (!item?.id) return
    fetch('/api/assignments')
      .then(r => r.json())
      .then((data: Record<string, { flavour_ids: string[]; side_ids: string[]; addon_ids: string[] }>) => {
        const a = data[item.id]
        if (a) {
          setAssignedFlavourIds(a.flavour_ids ?? [])
          setAssignedSideIds(a.side_ids ?? [])
          setAssignedAddonIds(a.addon_ids ?? [])
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  const valid = form.name.trim().length > 0 && form.price > 0

  const handleSave = () => {
    if (!valid) return
    const saved: MenuItem = {
      ...(item ?? {}),
      id:     item?.id ?? `${mod[0]}${Date.now()}`,
      name:   form.name.trim(),
      desc:   form.desc.trim(),
      price:  Number(form.price),
      cat:    form.cat || (cats[0] ?? 'Other'),
      emoji:  form.emoji.trim() || '🍽️',
      active: form.active,
      module: mod,
      ...(form.duration ? { duration: form.duration } : {}),
    }
    fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: saved.id, flavour_ids: assignedFlavourIds, side_ids: assignedSideIds, addon_ids: assignedAddonIds }),
    }).catch(() => {})
    onSave(saved)
  }

  const chipOn  = (on: boolean, color: string, bg: string): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: `1.5px solid ${on ? color : 'var(--bdr)'}`,
    background: on ? bg : 'var(--surf2)',
    color: on ? color : 'var(--txt3)',
  })

  const activeFlavours = flavours.filter(f => f.active)
  const activeSides    = sides.filter(s => s.active)
  const activeAddons   = addons.filter(a => a.active)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
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

          {activeFlavours.length > 0 && (
            <div>
              <label style={lbl}>
                🌶️ Flavours
                <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, marginLeft: 6 }}>— tap to assign to this item</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {activeFlavours.map(f => {
                  const on = assignedFlavourIds.includes(f.id)
                  return (
                    <button key={f.id}
                      onClick={() => setAssignedFlavourIds(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                      style={chipOn(on, 'var(--ora)', 'rgba(249,115,22,.14)')}>
                      {f.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeSides.length > 0 && (
            <div>
              <label style={lbl}>
                🍚 Sides
                <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, marginLeft: 6 }}>— tap to assign to this item</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {activeSides.map(s => {
                  const on = assignedSideIds.includes(s.id)
                  return (
                    <button key={s.id}
                      onClick={() => setAssignedSideIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                      style={chipOn(on, 'var(--grn)', 'rgba(34,197,94,.14)')}>
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeAddons.length > 0 && (
            <div>
              <label style={lbl}>
                ✨ Add-Ons
                <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, marginLeft: 6 }}>— tap to assign to this item</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {activeAddons.map(a => {
                  const on = assignedAddonIds.includes(a.id)
                  return (
                    <button key={a.id}
                      onClick={() => setAssignedAddonIds(prev => prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id])}
                      style={chipOn(on, 'var(--blue)', 'rgba(59,130,246,.14)')}>
                      {a.icon} {a.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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

function FlavourModal({ flavour, onSave, onClose }: {
  flavour: Flavour | null; onSave: (f: Flavour) => void; onClose: () => void
}) {
  const [name, setName] = useState(flavour?.name ?? '')
  const [desc, setDesc] = useState(flavour?.description ?? '')
  const valid = name.trim().length > 0

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{flavour ? 'Edit Flavour' : 'Add Flavour'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Flavour Name *</label>
            <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jerk, Steamed, Curry" autoFocus />
          </div>
          <div>
            <label style={lbl}>Description</label>
            <input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description..." />
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (!valid) return; onSave({ id: flavour?.id ?? `FLV-${Date.now()}`, name: name.trim(), description: desc.trim(), active: flavour?.active ?? true }) }} disabled={!valid} style={{ flex: 2, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: valid ? 'var(--blue)' : 'var(--surf3)', color: valid ? '#fff' : 'var(--txt3)', border: 'none', cursor: valid ? 'pointer' : 'not-allowed' }}>
            {flavour ? 'Save Changes' : 'Add Flavour'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SideModal({ side, onSave, onClose }: {
  side: Side | null; onSave: (s: Side) => void; onClose: () => void
}) {
  const [name, setName]   = useState(side?.name ?? '')
  const [desc, setDesc]   = useState(side?.description ?? '')
  const [price, setPrice] = useState(side?.price ?? 0)
  const valid = name.trim().length > 0

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{side ? 'Edit Side' : 'Add Side'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Side Name *</label>
            <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rice & Peas, Festival, Bammy" autoFocus />
          </div>
          <div>
            <label style={lbl}>Description</label>
            <input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description..." />
          </div>
          <div>
            <label style={lbl}>Price (J$) — 0 = included</label>
            <input style={inp} type="number" min={0} step={50} value={price} onChange={e => setPrice(Number(e.target.value))} />
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (!valid) return; onSave({ id: side?.id ?? `SID-${Date.now()}`, name: name.trim(), description: desc.trim(), price: Number(price), active: side?.active ?? true }) }} disabled={!valid} style={{ flex: 2, padding: '10px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: valid ? 'var(--blue)' : 'var(--surf3)', color: valid ? '#fff' : 'var(--txt3)', border: 'none', cursor: valid ? 'pointer' : 'not-allowed' }}>
            {side ? 'Save Changes' : 'Add Side'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MenuPage() {
  const { state, dispatch, toast } = useApp()
  const [tab,  setTab]  = useState<'items' | 'categories' | 'addons' | 'flavours' | 'sides'>('items')
  const mod = state.activeModule
  const [search, setSearch] = useState('')

  // Live items from the same API source as the POS ordering screen
  const [liveItems,    setLiveItems]    = useState<MenuItem[] | null>(null)
  const [loadingItems, setLoadingItems] = useState(true)
  const [loadError,    setLoadError]    = useState(false)

  const loadItems = () => {
    setLoadingItems(true)
    setLoadError(false)
    fetch('/api/menu')
      .then(r => r.json())
      .then((data: RawApiItem[]) => {
        const mapped = data
          .filter(r => (r.module ?? 'restaurant') === mod)
          .map(r => ({
            id:     r.id,
            name:   r.name,
            desc:   r.description ?? '',
            price:  Number(r.price ?? 0),
            cat:    r.category ?? '',
            emoji:  r.emoji ?? (mod === 'restaurant' ? '🍽️' : mod === 'bar' ? '🍺' : '🚗'),
            active: r.is_available ?? r.active ?? true,
            module: mod,
          } as MenuItem))
        setLiveItems(mapped)
        setLoadingItems(false)
      })
      .catch(() => { setLoadError(true); setLoadingItems(false) })
  }

  useEffect(() => {
    setLiveItems(null)
    setSearch('')
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod])

  // Flavours
  const [flavours,        setFlavours]        = useState<Flavour[] | null>(null)
  const [loadingFlavours, setLoadingFlavours] = useState(true)
  const [editFlavour,     setEditFlavour]     = useState<Flavour | null>(null)
  const [showFlavourModal,setShowFlavourModal]= useState(false)
  const [delFlavourId,    setDelFlavourId]    = useState<string | null>(null)

  const loadFlavours = () => {
    setLoadingFlavours(true)
    fetch('/api/flavours')
      .then(r => r.json())
      .then((data: Flavour[]) => { setFlavours(data); setLoadingFlavours(false) })
      .catch(() => setLoadingFlavours(false))
  }

  // Sides
  const [sides,        setSides]        = useState<Side[] | null>(null)
  const [loadingSides, setLoadingSides] = useState(true)
  const [editSide,     setEditSide]     = useState<Side | null>(null)
  const [showSideModal,setShowSideModal]= useState(false)
  const [delSideId,    setDelSideId]    = useState<string | null>(null)

  const loadSides = () => {
    setLoadingSides(true)
    fetch('/api/sides')
      .then(r => r.json())
      .then((data: Side[]) => { setSides(data); setLoadingSides(false) })
      .catch(() => setLoadingSides(false))
  }

  // Addons — API-backed (Supabase addons table)
  const [liveAddons,    setLiveAddons]    = useState<Addon[] | null>(null)
  const [loadingAddons, setLoadingAddons] = useState(true)

  const loadAddons = () => {
    setLoadingAddons(true)
    fetch('/api/addons')
      .then(r => r.json())
      .then((data: Array<{ id: string; name: string; description?: string; price: number; icon?: string; active?: boolean }>) => {
        setLiveAddons(data.map(r => ({ id: r.id, name: r.name, desc: r.description ?? '', price: Number(r.price), icon: r.icon ?? '✨', active: r.active ?? true })))
        setLoadingAddons(false)
      })
      .catch(() => setLoadingAddons(false))
  }

  useEffect(() => { loadFlavours(); loadSides(); loadAddons() }, [])

  const [editItem, setEditItem]           = useState<MenuItem | null>(null)
  const [showItemModal, setShowItemModal] = useState(false)
  const [delItemId, setDelItemId]         = useState<string | null>(null)

  const [editAddon, setEditAddon]           = useState<Addon | null>(null)
  const [showAddonModal, setShowAddonModal] = useState(false)
  const [delAddonId, setDelAddonId]         = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState('')
  const [editCatIdx, setEditCatIdx] = useState<number | null>(null)
  const [editCatVal, setEditCatVal] = useState('')

  const md         = state.menuData[mod]
  const items      = liveItems ?? md.items
  const categories = Array.from(new Set([...md.categories, ...(liveItems ?? []).map(i => i.cat).filter(Boolean)]))
  const addons     = liveAddons ?? md.addons

  const filtered = items.filter(i => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return i.name.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q) || (i.desc ?? '').toLowerCase().includes(q)
  })

  // ── Item CRUD — API-driven ─────────────────────────────────
  const saveItem = async (data: MenuItem) => {
    const isNew = !items.some(i => i.id === data.id)
    const body = {
      id: data.id, name: data.name, description: data.desc,
      price: data.price, category: data.cat, emoji: data.emoji,
      active: data.active, module: mod,
    }
    const res = await fetch('/api/menu', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setLiveItems(prev =>
        prev ? (isNew ? [...prev, data] : prev.map(i => i.id === data.id ? data : i)) : prev
      )
    } else {
      toast('Save failed — check connection', 'error')
    }
    setShowItemModal(false); setEditItem(null)
  }

  const toggleItem = async (item: MenuItem) => {
    const next = !item.active
    const res = await fetch('/api/menu', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, active: next }),
    })
    if (res.ok) {
      setLiveItems(prev => prev?.map(i => i.id === item.id ? { ...i, active: next } : i) ?? prev)
    } else {
      toast('Update failed', 'error')
    }
  }

  const handleDeleteItem = async () => {
    if (!delItemId) return
    const res = await fetch(`/api/menu?id=${encodeURIComponent(delItemId)}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      setLiveItems(prev => prev?.filter(i => i.id !== delItemId) ?? prev)
    } else {
      toast('Delete failed', 'error')
    }
    setDelItemId(null)
  }

  // ── Category CRUD — local store ────────────────────────────
  const addCategory = () => {
    const name = newCatName.trim()
    if (!name || md.categories.includes(name)) return
    dispatch({ type: 'SET_MENU_CATEGORIES', mod, categories: [...md.categories, name] })
    setNewCatName('')
  }

  const renameCategory = (idx: number) => {
    const val = editCatVal.trim()
    if (!val || val === md.categories[idx]) { setEditCatIdx(null); return }
    dispatch({ type: 'RENAME_CATEGORY', mod, oldName: md.categories[idx], newName: val })
    setEditCatIdx(null); setEditCatVal('')
  }

  const deleteCategory = (idx: number) => {
    const name = md.categories[idx]
    if (name === 'All') return
    if (items.some(i => i.cat === name)) { toast(`"${name}" is in use — reassign items first`, 'error'); return }
    dispatch({ type: 'SET_MENU_CATEGORIES', mod, categories: md.categories.filter((_, i) => i !== idx) })
  }

  const moveCategory = (idx: number, dir: -1 | 1) => {
    const cats = [...md.categories]
    const next = idx + dir
    if (next < 0 || next >= cats.length) return
    ;[cats[idx], cats[next]] = [cats[next], cats[idx]]
    dispatch({ type: 'SET_MENU_CATEGORIES', mod, categories: cats })
  }

  // ── Addon CRUD — API-backed ────────────────────────────────
  const saveAddon = async (data: Addon) => {
    const isNew = !addons.some(a => a.id === data.id)
    const body = { id: data.id, name: data.name, description: data.desc, price: data.price, icon: data.icon, active: data.active }
    const res = await fetch('/api/addons', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setLiveAddons(prev => prev
        ? (isNew ? [...prev, data] : prev.map(a => a.id === data.id ? data : a))
        : [data]
      )
    } else {
      toast('Save failed — check connection', 'error')
    }
    setShowAddonModal(false); setEditAddon(null)
  }

  const toggleAddon = async (addon: Addon) => {
    const next = !addon.active
    const res = await fetch('/api/addons', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: addon.id, active: next }),
    })
    if (res.ok) {
      setLiveAddons(prev => prev?.map(a => a.id === addon.id ? { ...a, active: next } : a) ?? prev)
    } else {
      toast('Update failed', 'error')
    }
  }

  // ── Flavour CRUD ───────────────────────────────────────────
  const saveFlavour = async (data: Flavour) => {
    const isNew = !flavours?.some(f => f.id === data.id)
    const res = await fetch('/api/flavours', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setFlavours(prev => prev ? (isNew ? [...prev, data] : prev.map(f => f.id === data.id ? data : f)) : [data])
    } else {
      toast('Save failed', 'error')
    }
    setShowFlavourModal(false); setEditFlavour(null)
  }

  const toggleFlavour = async (f: Flavour) => {
    const next = !f.active
    const res = await fetch('/api/flavours', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id, active: next }),
    })
    if (res.ok) setFlavours(prev => prev?.map(x => x.id === f.id ? { ...x, active: next } : x) ?? prev)
    else toast('Update failed', 'error')
  }

  const handleDeleteFlavour = async () => {
    if (!delFlavourId) return
    const res = await fetch(`/api/flavours?id=${encodeURIComponent(delFlavourId)}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      setFlavours(prev => prev?.filter(f => f.id !== delFlavourId) ?? prev)
    } else {
      toast('Delete failed', 'error')
    }
    setDelFlavourId(null)
  }

  // ── Side CRUD ──────────────────────────────────────────────
  const saveSide = async (data: Side) => {
    const isNew = !sides?.some(s => s.id === data.id)
    const res = await fetch('/api/sides', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setSides(prev => prev ? (isNew ? [...prev, data] : prev.map(s => s.id === data.id ? data : s)) : [data])
    } else {
      toast('Save failed', 'error')
    }
    setShowSideModal(false); setEditSide(null)
  }

  const toggleSide = async (s: Side) => {
    const next = !s.active
    const res = await fetch('/api/sides', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, active: next }),
    })
    if (res.ok) setSides(prev => prev?.map(x => x.id === s.id ? { ...x, active: next } : x) ?? prev)
    else toast('Update failed', 'error')
  }

  const handleDeleteSide = async () => {
    if (!delSideId) return
    const res = await fetch(`/api/sides?id=${encodeURIComponent(delSideId)}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      setSides(prev => prev?.filter(s => s.id !== delSideId) ?? prev)
    } else {
      toast('Delete failed', 'error')
    }
    setDelSideId(null)
  }

  const TABS = [
    { id: 'items'      as const, label: 'Menu Items',  count: items.length },
    { id: 'categories' as const, label: 'Categories',  count: categories.filter(c => c !== 'All').length },
    { id: 'addons'     as const, label: 'Add-ons',     count: addons.length },
    { id: 'flavours'   as const, label: 'Flavours',    count: flavours?.length ?? 0 },
    { id: 'sides'      as const, label: 'Sides',       count: sides?.length ?? 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

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

        {tab === 'items' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>
                  {MODULES.find(m => m.key === mod)?.icon} {MODULES.find(m => m.key === mod)?.label} Menu
                </span>
                <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 10 }}>
                  {loadingItems ? 'Loading…' : loadError ? '⚠ Load failed' : `${items.filter(i => i.active).length} active · ${items.length} total · live`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={loadItems} title="Reload from database" style={{ padding: '8px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', color: 'var(--txt3)', border: '1px solid var(--bdr)', cursor: 'pointer' }}>
                  ↻ Refresh
                </button>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ ...inp, width: 160, padding: '7px 10px' }} />
                <button onClick={() => { setEditItem(null); setShowItemModal(true) }} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Item</button>
              </div>
            </div>

            {loadingItems ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>Loading menu from database…</div>
            ) : loadError ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>
                Failed to load menu. <button onClick={loadItems} style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 700 }}>Try again</button>
              </div>
            ) : (
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
            )}
          </div>
        )}

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
              {md.categories.map((cat, idx) => {
                const isAll = cat === 'All'
                const inUse = items.filter(i => i.cat === cat).length
                return (
                  <div key={`${cat}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)' }}>
                    {!isAll ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--bdr)' : 'var(--txt3)', fontSize: 9, lineHeight: 1, padding: '2px 4px' }}>▲</button>
                        <button onClick={() => moveCategory(idx, 1)} disabled={idx === md.categories.length - 1} style={{ background: 'none', border: 'none', cursor: idx === md.categories.length - 1 ? 'default' : 'pointer', color: idx === md.categories.length - 1 ? 'var(--bdr)' : 'var(--txt3)', fontSize: 9, lineHeight: 1, padding: '2px 4px' }}>▼</button>
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
              {md.categories.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No categories yet.</div>}
            </div>
          </div>
        )}

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

        {tab === 'flavours' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>🌶️ Flavours</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>Global flavour options offered at checkout (e.g. Jerk, Steamed, Curry)</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={loadFlavours} style={{ padding: '8px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', color: 'var(--txt3)', border: '1px solid var(--bdr)', cursor: 'pointer' }}>↻ Refresh</button>
                <button onClick={() => { setEditFlavour(null); setShowFlavourModal(true) }} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Add Flavour</button>
              </div>
            </div>
            {loadingFlavours ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>Loading flavours…</div>
            ) : (
              <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                      {['Name', 'Description', 'Status', 'Actions'].map((h, i) => (
                        <th key={i} style={{ padding: '9px 12px', textAlign: i >= 2 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!flavours || flavours.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>No flavours yet — click &quot;+ Add Flavour&quot; to get started.</td></tr>
                    ) : flavours.map(f => (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--bdr)', opacity: f.active ? 1 : 0.55 }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--txt)' }}>{f.name}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--txt2)', fontSize: 12 }}>{f.description || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => toggleFlavour(f)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: f.active ? 'var(--grn-bg)' : 'var(--red-bg)', color: f.active ? 'var(--grn)' : 'var(--red)' }}>
                            {f.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => { setEditFlavour(f); setShowFlavourModal(true) }} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                          <button onClick={() => setDelFlavourId(f.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'sides' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>🍚 Sides</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>Side dishes offered at checkout (e.g. Rice & Peas, Festival, Bammy)</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={loadSides} style={{ padding: '8px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', color: 'var(--txt3)', border: '1px solid var(--bdr)', cursor: 'pointer' }}>↻ Refresh</button>
                <button onClick={() => { setEditSide(null); setShowSideModal(true) }} style={{ padding: '8px 18px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Add Side</button>
              </div>
            </div>
            {loadingSides ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>Loading sides…</div>
            ) : (
              <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
                      {['Name', 'Description', 'Price', 'Status', 'Actions'].map((h, i) => (
                        <th key={i} style={{ padding: '9px 12px', textAlign: i >= 3 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!sides || sides.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>No sides yet — click &quot;+ Add Side&quot; to get started.</td></tr>
                    ) : sides.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--bdr)', opacity: s.active ? 1 : 0.55 }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--txt)' }}>{s.name}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--txt2)', fontSize: 12 }}>{s.description || '—'}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{s.price > 0 ? fmtJMD(s.price) : 'Included'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => toggleSide(s)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: s.active ? 'var(--grn-bg)' : 'var(--red-bg)', color: s.active ? 'var(--grn)' : 'var(--red)' }}>
                            {s.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => { setEditSide(s); setShowSideModal(true) }} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                          <button onClick={() => setDelSideId(s.id)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--red-bg)', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {showItemModal && (
        <ItemModal item={editItem} mod={mod} categories={categories} flavours={flavours ?? []} sides={sides ?? []} addons={addons} onSave={saveItem} onClose={() => { setShowItemModal(false); setEditItem(null) }} />
      )}
      {delItemId && (
        <DelConfirm name={items.find(i => i.id === delItemId)?.name ?? ''} onConfirm={handleDeleteItem} onCancel={() => setDelItemId(null)} />
      )}
      {showAddonModal && (
        <AddonModal addon={editAddon} onSave={saveAddon} onClose={() => { setShowAddonModal(false); setEditAddon(null) }} />
      )}
      {delAddonId && (
        <DelConfirm name={addons.find(a => a.id === delAddonId)?.name ?? ''} onConfirm={async () => {
          const res = await fetch(`/api/addons?id=${encodeURIComponent(delAddonId!)}`, { method: 'DELETE' })
          if (res.ok || res.status === 204) {
            setLiveAddons(prev => prev?.filter(a => a.id !== delAddonId) ?? prev)
          } else {
            toast('Delete failed', 'error')
          }
          setDelAddonId(null)
        }} onCancel={() => setDelAddonId(null)} />
      )}
      {showFlavourModal && (
        <FlavourModal flavour={editFlavour} onSave={saveFlavour} onClose={() => { setShowFlavourModal(false); setEditFlavour(null) }} />
      )}
      {delFlavourId && (
        <DelConfirm name={flavours?.find(f => f.id === delFlavourId)?.name ?? ''} onConfirm={handleDeleteFlavour} onCancel={() => setDelFlavourId(null)} />
      )}
      {showSideModal && (
        <SideModal side={editSide} onSave={saveSide} onClose={() => { setShowSideModal(false); setEditSide(null) }} />
      )}
      {delSideId && (
        <DelConfirm name={sides?.find(s => s.id === delSideId)?.name ?? ''} onConfirm={handleDeleteSide} onCancel={() => setDelSideId(null)} />
      )}
    </div>
  )
}
