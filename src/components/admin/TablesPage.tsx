'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { storage } from '@/lib/utils/storage'
import { supabase } from '@/lib/supabase'

interface TableEntry { id: string; name: string; seats: number }
interface TablesConfig {
  restaurant: TableEntry[]
  bar: TableEntry[]
  status: Record<string, 'free' | 'occupied' | 'reserved'>
}

const DEFAULT: TablesConfig = {
  restaurant: ['T1','T2','T3','T4','T5','T6','T7','T8'].map(id => ({ id, name: id, seats: 4 })),
  bar: ['B1','B2','B3','B4','B5'].map(id => ({ id, name: id, seats: 2 })),
  status: { T1:'free',T2:'occupied',T3:'free',T4:'occupied',T5:'free',T6:'free',T7:'occupied',T8:'free', B1:'free',B2:'occupied',B3:'free',B4:'free',B5:'occupied' },
}

const STATUS_COLOR = { free: 'var(--grn)', occupied: 'var(--red,#ef4444)', reserved: 'var(--ora)' }
const STATUS_BG    = { free: '#14532d22', occupied: '#7f1d1d22', reserved: '#78350f22' }
const NEXT_STATUS = { free: 'occupied', occupied: 'reserved', reserved: 'free' } as const

function loadConfig(): TablesConfig {
  return storage.get<TablesConfig>('tables_config') ?? DEFAULT
}

export default function TablesPage() {
  const { toast } = useApp()
  const [cfg, setCfg]   = useState<TablesConfig>(loadConfig)
  const [mod, setMod]   = useState<'restaurant' | 'bar'>('restaurant')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSeats, setNewSeats] = useState(4)
  const [editId, setEditId]   = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSeats, setEditSeats] = useState(4)
  const [saving, setSaving] = useState(false)

  const save = (next: TablesConfig) => {
    setCfg(next)
    storage.set('tables_config', next)
  }

  // Sync to Supabase module_data when available
  const syncToSupabase = async (next: TablesConfig, module: 'restaurant' | 'bar') => {
    if (!supabase) return
    try {
      const { data } = await supabase.from('module_data').select('data').eq('id', module).single()
      if (!data) return
      const tables = next[module].map(t => t.name)
      const tableStatus = { ...data.data.tableStatus }
      // add any new tables as free
      tables.forEach(t => { if (!tableStatus[t]) tableStatus[t] = 'free' })
      // remove deleted tables
      Object.keys(tableStatus).forEach(t => { if (!tables.includes(t)) delete tableStatus[t] })
      await supabase.from('module_data').update({ data: { ...data.data, tables, tableStatus } }).eq('id', module)
    } catch { /* non-critical, localStorage is authoritative */ }
  }

  const cycleStatus = (tableId: string) => {
    const curr = cfg.status[tableId] ?? 'free'
    const next = NEXT_STATUS[curr]
    const updated = { ...cfg, status: { ...cfg.status, [tableId]: next } }
    save(updated)
  }

  const addTable = async () => {
    const name = newName.trim().toUpperCase()
    if (!name) return
    const id = name
    if (cfg[mod].find(t => t.id === id)) { toast('Table name already exists', 'warn'); return }
    setSaving(true)
    const updated: TablesConfig = {
      ...cfg,
      [mod]: [...cfg[mod], { id, name, seats: newSeats }],
      status: { ...cfg.status, [id]: 'free' as const },
    }
    save(updated)
    await syncToSupabase(updated, mod)
    setSaving(false)
    setShowAdd(false)
    setNewName('')
    setNewSeats(4)
    toast(`Table ${name} added`, 'success')
  }

  const deleteTable = async (id: string) => {
    if (!confirm(`Delete table "${id}"? This cannot be undone.`)) return
    const updated: TablesConfig = { ...cfg, [mod]: cfg[mod].filter(t => t.id !== id) }
    const { [id]: _, ...rest } = updated.status
    updated.status = rest
    save(updated)
    await syncToSupabase(updated, mod)
    toast(`Table ${id} deleted`, 'warn')
  }

  const startEdit = (t: TableEntry) => {
    setEditId(t.id)
    setEditName(t.name)
    setEditSeats(t.seats)
  }

  const saveEdit = async () => {
    if (!editId) return
    const name = editName.trim().toUpperCase()
    if (!name) return
    setSaving(true)
    const updated: TablesConfig = {
      ...cfg,
      [mod]: cfg[mod].map(t => t.id === editId ? { ...t, name, seats: editSeats } : t),
    }
    // if name changed, migrate status
    if (name !== editId) {
      const { [editId]: oldStatus, ...rest } = updated.status
      updated.status = { ...rest, [name]: oldStatus ?? 'free' }
      // update id too
      updated[mod] = updated[mod].map(t => t.name === name ? { ...t, id: name } : t)
    }
    save(updated)
    await syncToSupabase(updated, mod)
    setSaving(false)
    setEditId(null)
    toast('Table updated', 'success')
  }

  const tables = cfg[mod]
  const free     = tables.filter(t => (cfg.status[t.id] ?? 'free') === 'free').length
  const occupied = tables.filter(t => (cfg.status[t.id] ?? 'free') === 'occupied').length
  const reserved = tables.filter(t => (cfg.status[t.id] ?? 'free') === 'reserved').length

  const h2: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }
  const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Table Management</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {tables.length} tables · {free} free · {occupied} occupied · {reserved} reserved
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          + Add Table
        </button>
      </div>

      {/* Module tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['restaurant', 'bar'] as const).map(m => (
          <button key={m} onClick={() => setMod(m)} style={{
            padding: '8px 20px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${mod === m ? 'transparent' : 'var(--bdr)'}`,
            background: mod === m ? (m === 'restaurant' ? 'var(--ora)' : 'var(--pur)') : 'transparent',
            color: mod === m ? '#fff' : 'var(--txt2)',
          }}>{m === 'restaurant' ? 'Restaurant' : 'Bar'}</button>
        ))}
      </div>

      {/* Status legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {(['free','occupied','reserved'] as const).map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[s] }} />
            <span style={{ color: 'var(--txt3)', textTransform: 'capitalize' }}>{s}</span>
          </div>
        ))}
        <span style={{ color: 'var(--txt3)', fontSize: 12, marginLeft: 6 }}>· Click a table to cycle status</span>
      </div>

      {/* Table grid */}
      {tables.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--txt3)', fontSize: 13 }}>
          No tables yet &mdash; click &ldquo;+ Add Table&rdquo; to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {tables.map(t => {
            const status = cfg.status[t.id] ?? 'free'
            const isEditing = editId === t.id
            return (
              <div key={t.id} style={{
                background: 'var(--surf)', border: `2px solid ${STATUS_COLOR[status]}`,
                borderRadius: 'var(--r3)', overflow: 'hidden',
                boxShadow: `0 0 0 3px ${STATUS_BG[status]}`,
              }}>
                {isEditing ? (
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={editName} onChange={e => setEditName(e.target.value.toUpperCase())}
                      style={{ ...inp }} placeholder="Name" />
                    <input type="number" value={editSeats} min={1} max={20}
                      onChange={e => setEditSeats(Number(e.target.value))}
                      style={{ ...inp }} placeholder="Seats" />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div onClick={() => cycleStatus(t.id)} style={{ padding: '16px 14px', cursor: 'pointer', background: STATUS_BG[status] }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{t.seats} seats</div>
                      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: STATUS_COLOR[status], textTransform: 'capitalize' }}>{status}</div>
                    </div>
                    <div style={{ display: 'flex', borderTop: '1px solid var(--bdr)' }}>
                      <button onClick={() => startEdit(t)} style={{ flex: 1, padding: '8px 0', background: 'transparent', border: 'none', borderRight: '1px solid var(--bdr)', color: 'var(--txt3)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => deleteTable(t.id)} style={{ flex: 1, padding: '8px 0', background: 'transparent', border: 'none', color: 'var(--red,#ef4444)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 360, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 16 }}>Add Table</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ ...h2, display: 'block', marginBottom: 4 }}>Table Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value.toUpperCase())}
                placeholder="e.g. T9, VIP1, TERRACE"
                onKeyDown={e => e.key === 'Enter' && addTable()}
                style={{ ...inp }} autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ ...h2, display: 'block', marginBottom: 4 }}>Seats</label>
              <input type="number" value={newSeats} min={1} max={30} onChange={e => setNewSeats(Number(e.target.value))} style={{ ...inp }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addTable} disabled={saving || !newName.trim()} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add Table</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
