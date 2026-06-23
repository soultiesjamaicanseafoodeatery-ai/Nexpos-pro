'use client'
import { useState } from 'react'
import { storage } from '@/lib/utils/storage'

interface InventoryItem {
  id: string
  name: string
  category: string
  unit: string
  quantity: number
  lowStockThreshold: number
  cost: number
  module: 'restaurant' | 'bar' | 'carwash' | 'all'
}

const EMPTY: InventoryItem = { id: '', name: '', category: '', unit: 'pcs', quantity: 0, lowStockThreshold: 5, cost: 0, module: 'restaurant' }

export default function InventoryPage() {
  const [items, setItems]   = useState<InventoryItem[]>(() => storage.get<InventoryItem[]>('inventory') ?? [])
  const [modal, setModal]   = useState<InventoryItem | null>(null)
  const [isNew, setIsNew]   = useState(false)
  const [modFilter, setModFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [adjModal, setAdjModal] = useState<{ item: InventoryItem; qty: number } | null>(null)
  const [pendingDel, setPendingDel] = useState<string | null>(null)

  const persist = (list: InventoryItem[]) => { setItems(list); storage.set('inventory', list) }

  const openAdd = () => { setModal({ ...EMPTY, id: `INV-${Date.now()}` }); setIsNew(true) }

  const save = () => {
    if (!modal?.name) return
    const updated = isNew ? [modal, ...items] : items.map(i => i.id === modal.id ? modal : i)
    persist(updated)
    setModal(null)
  }

  const del = (id: string) => {
    if (pendingDel !== id) { setPendingDel(id); return }
    persist(items.filter(i => i.id !== id))
    setPendingDel(null)
  }

  const adjust = () => {
    if (!adjModal) return
    const updated = items.map(i => i.id === adjModal.item.id ? { ...i, quantity: Math.max(0, i.quantity + adjModal.qty) } : i)
    persist(updated)
    setAdjModal(null)
  }

  const filtered = items.filter(i => {
    if (modFilter !== 'all' && i.module !== modFilter && i.module !== 'all') return false
    return !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
  })

  const lowStock = items.filter(i => i.quantity <= i.lowStockThreshold && i.quantity > 0)
  const outOfStock = items.filter(i => i.quantity === 0)

  const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }
  const set = (patch: Partial<InventoryItem>) => setModal(m => m ? { ...m, ...patch } : m)

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Inventory</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {items.length} items ·
            {outOfStock.length > 0 && <span style={{ color: 'var(--red,#ef4444)', fontWeight: 700 }}> {outOfStock.length} out of stock</span>}
            {lowStock.length > 0 && <span style={{ color: 'var(--ora)', fontWeight: 700 }}> · {lowStock.length} low stock</span>}
          </div>
        </div>
        <button onClick={openAdd} style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Add Item</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
          style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '7px 10px', fontSize: 13, color: 'var(--txt)', flex: 1, minWidth: 160 }} />
        {['all','restaurant','bar','carwash'].map(m => (
          <button key={m} onClick={() => setModFilter(m)} style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${modFilter === m ? 'transparent' : 'var(--bdr)'}`,
            background: modFilter === m ? 'var(--blue)' : 'transparent',
            color: modFilter === m ? '#fff' : 'var(--txt3)',
          }}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>
        ))}
      </div>

      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
            {items.length === 0 ? 'No inventory items — click "+ Add Item" to get started.' : 'No items match the filter.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                {['Item','Category','Module','Stock','Low Threshold',''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const isLow = i.quantity <= i.lowStockThreshold && i.quantity > 0
                const isOut = i.quantity === 0
                return (
                  <tr key={i.id} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--txt)' }}>{i.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)' }}>{i.category}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)', textTransform: 'capitalize' }}>{i.module}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontWeight: 800, color: isOut ? 'var(--red,#ef4444)' : isLow ? 'var(--ora)' : 'var(--txt)', fontFamily: 'var(--mono)' }}>
                        {i.quantity} {i.unit}
                      </span>
                      {isOut && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#7f1d1d22', color: 'var(--red,#ef4444)' }}>OUT</span>}
                      {isLow && !isOut && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#78350f22', color: 'var(--ora)' }}>LOW</span>}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{i.lowStockThreshold} {i.unit}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setAdjModal({ item: i, qty: 0 })} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Adjust</button>
                        <button onClick={() => { setModal({ ...i }); setIsNew(false) }} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => del(i.id)} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: pendingDel === i.id ? '1px solid #fbbf24' : '1px solid var(--bdr)', color: pendingDel === i.id ? '#fbbf24' : 'var(--red,#ef4444)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{pendingDel === i.id ? 'Sure?' : 'Del'}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 18 }}>{isNew ? 'Add Item' : 'Edit Item'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Item Name</label><input style={inp} value={modal.name} onChange={e => set({ name: e.target.value })} /></div>
              <div><label style={lbl}>Category</label><input style={inp} value={modal.category} onChange={e => set({ category: e.target.value })} placeholder="e.g. Beverages" /></div>
              <div><label style={lbl}>Unit</label><input style={inp} value={modal.unit} onChange={e => set({ unit: e.target.value })} placeholder="pcs, kg, L…" /></div>
              <div><label style={lbl}>Quantity</label><input type="number" min={0} style={inp} value={modal.quantity} onChange={e => set({ quantity: Number(e.target.value) })} /></div>
              <div><label style={lbl}>Low Stock Alert</label><input type="number" min={0} style={inp} value={modal.lowStockThreshold} onChange={e => set({ lowStockThreshold: Number(e.target.value) })} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Module</label>
                <select style={inp} value={modal.module} onChange={e => set({ module: e.target.value as InventoryItem['module'] })}>
                  <option value="restaurant">Restaurant</option>
                  <option value="bar">Bar</option>
                  <option value="carwash">Car Wash</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust qty modal */}
      {adjModal && (
        <div onClick={() => setAdjModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 320, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Adjust Stock</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>{adjModal.item.name} · current: {adjModal.item.quantity} {adjModal.item.unit}</div>
            <label style={lbl}>Adjustment (+add / −remove)</label>
            <input type="number" style={{ ...inp, marginBottom: 16 }} value={adjModal.qty} onChange={e => setAdjModal(a => a ? { ...a, qty: Number(e.target.value) } : a)} placeholder="e.g. 10 or -5" autoFocus />
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>
              New quantity: <strong>{Math.max(0, adjModal.item.quantity + adjModal.qty)} {adjModal.item.unit}</strong>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAdjModal(null)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={adjust} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
