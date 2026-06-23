'use client'
import { useState, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { storage } from '@/lib/utils/storage'
import { supabase } from '@/lib/supabase'

// ── Local types ──────────────────────────────────────────────────
interface TableEntry   { id: string; name: string; seats: number }
interface TablesConfig { restaurant: TableEntry[]; bar: TableEntry[]; status: Record<string, 'free' | 'occupied' | 'reserved'> }
interface TableOwner   { userId: string; userName: string; userColor: string; assignedAt: string }
interface TransferLog  { id: string; ts: string; tableId: string; tableName: string; fromUserId: string; fromUserName: string; toUserId: string; toUserName: string; byUserId: string; byUserName: string }

// ── Constants ────────────────────────────────────────────────────
const DEFAULT: TablesConfig = {
  restaurant: ['T1','T2','T3','T4','T5','T6','T7','T8'].map(id => ({ id, name: id, seats: 4 })),
  bar:        ['B1','B2','B3','B4','B5'].map(id => ({ id, name: id, seats: 2 })),
  status: { T1:'free',T2:'occupied',T3:'free',T4:'occupied',T5:'free',T6:'free',T7:'occupied',T8:'free', B1:'free',B2:'occupied',B3:'free',B4:'free',B5:'occupied' },
}
const STATUS_COLOR = { free: 'var(--grn)', occupied: 'var(--red,#ef4444)', reserved: 'var(--ora)' } as const
const STATUS_BG    = { free: '#14532d22', occupied: '#7f1d1d22', reserved: '#78350f22' } as const
const NEXT_STATUS  = { free: 'occupied', occupied: 'reserved', reserved: 'free' } as const

// ── Storage helpers ──────────────────────────────────────────────
function loadConfig():    TablesConfig                 { return storage.get<TablesConfig>('tables_config') ?? DEFAULT }
function loadOwners():    Record<string, TableOwner>  { return storage.get<Record<string,TableOwner>>('table_owners') ?? {} }
function loadTransfers(): TransferLog[]               { return storage.get<TransferLog[]>('table_transfer_log') ?? [] }
function saveOwners(o: Record<string, TableOwner>)    { storage.set('table_owners', o) }
function saveTransfers(t: TransferLog[])              { storage.set('table_transfer_log', t.slice(0, 500)) }

// ── Styles ───────────────────────────────────────────────────────
const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }
const h2:  React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }

// ── Transfer Modal ───────────────────────────────────────────────
function TransferModal({ tableIds, tableCfgMap, currentOwners, users, onConfirm, onClose }: {
  tableIds: string[]
  tableCfgMap: Record<string, string>
  currentOwners: Record<string, TableOwner>
  users: { id: string; name: string; color: string; role: string; active: boolean }[]
  onConfirm: (toUserId: string, toUserName: string, toUserColor: string) => void
  onClose: () => void
}) {
  const [toUserId, setToUserId] = useState('')
  const isSingle    = tableIds.length === 1
  const singleOwner = isSingle ? currentOwners[tableIds[0]] : null
  const eligible    = users.filter(u => u.active && u.id !== singleOwner?.userId)

  return (
    <div className="mo-bg" onClick={onClose}>
      <div className="mo" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="mh">
          <span className="mt">{isSingle ? `Transfer Table ${tableCfgMap[tableIds[0]] ?? tableIds[0]}` : `Transfer ${tableIds.length} Tables`}</span>
          <button className="mx" onClick={onClose}>×</button>
        </div>
        <div className="mb-c" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isSingle && singleOwner && (
            <div style={{ padding: '8px 12px', background: 'var(--surf)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--txt2)' }}>
              Currently assigned to: <strong style={{ color: 'var(--txt)' }}>{singleOwner.userName}</strong>
            </div>
          )}
          {!isSingle && (
            <div style={{ padding: '8px 12px', background: 'var(--surf)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--txt2)' }}>
              Tables: <strong style={{ color: 'var(--txt)' }}>{tableIds.map(id => tableCfgMap[id] ?? id).join(', ')}</strong>
            </div>
          )}
          <div>
            <label style={{ ...h2, display: 'block', marginBottom: 8 }}>Transfer To</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {eligible.length === 0 && (
                <div style={{ color: 'var(--txt3)', fontSize: 13, textAlign: 'center', padding: 20 }}>No eligible staff to transfer to.</div>
              )}
              {eligible.map(u => (
                <button key={u.id} onClick={() => setToUserId(u.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 'var(--r)', cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${toUserId === u.id ? 'var(--blue)' : 'var(--bdr)'}`,
                  background: toUserId === u.id ? 'var(--blue-bg)' : 'var(--surf)',
                }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, flexShrink: 0, background: u.color + '33', color: u.color }}>
                    {u.name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', textTransform: 'capitalize' }}>{u.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-gh" onClick={onClose}>Cancel</button>
          <button className="btn btn-pr" disabled={!toUserId} onClick={() => {
            const u = eligible.find(x => x.id === toUserId)
            if (u) onConfirm(u.id, u.name, u.color)
          }}>Confirm Transfer</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────
export default function TablesPage() {
  const { state, toast, audit } = useApp()
  const { currentUser, users, heldOrders } = state
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  const posOccupied = new Set(
    heldOrders.map(o => o.selTable ?? '').filter(Boolean)
  )
  const getStatus = (tableId: string): 'free' | 'occupied' | 'reserved' =>
    posOccupied.has(tableId) ? 'occupied' : (cfg.status[tableId] ?? 'free')

  const [cfg,       setCfg]       = useState<TablesConfig>(loadConfig)
  const [owners,    setOwners]    = useState<Record<string, TableOwner>>(loadOwners)
  const [transfers, setTransfers] = useState<TransferLog[]>(loadTransfers)
  const [tab,       setTab]       = useState<'tables' | 'overview' | 'history'>('tables')
  const [mod,       setMod]       = useState<'restaurant' | 'bar'>('restaurant')

  const [showAdd,   setShowAdd]   = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newSeats,  setNewSeats]  = useState(4)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editName,  setEditName]  = useState('')
  const [editSeats, setEditSeats] = useState(4)
  const [saving,    setSaving]    = useState(false)

  const [transferTableIds, setTransferTableIds] = useState<string[] | null>(null)

  const saveCfg = (next: TablesConfig) => { setCfg(next); storage.set('tables_config', next) }

  // Clear stale 'occupied' statuses that have no table owner (e.g. from old default config or unreliable posState)
  useEffect(() => {
    const currentCfg = loadConfig()
    const currentOwners = loadOwners()
    const stale = Object.keys(currentCfg.status).filter(
      id => currentCfg.status[id] === 'occupied' && !currentOwners[id]
    )
    if (stale.length > 0) {
      const newStatus = { ...currentCfg.status }
      stale.forEach(id => { newStatus[id] = 'free' })
      saveCfg({ ...currentCfg, status: newStatus })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const syncToSupabase = async (next: TablesConfig, module: 'restaurant' | 'bar') => {
    if (!supabase) return
    try {
      const { data } = await supabase.from('module_data').select('data').eq('id', module).single()
      if (!data) return
      const tables = next[module].map(t => t.name)
      const tableStatus = { ...data.data.tableStatus }
      tables.forEach(t => { if (!tableStatus[t]) tableStatus[t] = 'free' })
      Object.keys(tableStatus).forEach(t => { if (!tables.includes(t)) delete tableStatus[t] })
      await supabase.from('module_data').update({ data: { ...data.data, tables, tableStatus } }).eq('id', module)
    } catch { /* non-critical */ }
  }

  // ── Ownership helpers ──────────────────────────────────────────
  const assignOwner = useCallback((tableId: string, userId: string, userName: string, userColor: string) => {
    const next = { ...owners, [tableId]: { userId, userName, userColor, assignedAt: new Date().toISOString() } }
    setOwners(next); saveOwners(next)
  }, [owners])

  const releaseOwner = useCallback((tableId: string) => {
    const next = { ...owners }
    delete next[tableId]
    setOwners(next); saveOwners(next)
  }, [owners])

  const doTransfer = useCallback((tableIds: string[], toUserId: string, toUserName: string, toUserColor: string) => {
    if (!currentUser) return
    const newOwners = { ...owners }
    const newTransfers: TransferLog[] = [...transfers]
    const allTables = [...cfg.restaurant, ...cfg.bar]

    tableIds.forEach(tableId => {
      const prev     = owners[tableId]
      const tblName  = allTables.find(t => t.id === tableId)?.name ?? tableId
      const log: TransferLog = {
        id:           `TT-${Date.now()}-${tableId}`,
        ts:           new Date().toISOString(),
        tableId,      tableName: tblName,
        fromUserId:   prev?.userId   ?? '',
        fromUserName: prev?.userName ?? 'Unassigned',
        toUserId,     toUserName,
        byUserId:     currentUser.id,
        byUserName:   currentUser.name,
      }
      newTransfers.unshift(log)
      newOwners[tableId] = { userId: toUserId, userName: toUserName, userColor: toUserColor, assignedAt: new Date().toISOString() }
      audit('TABLE TRANSFER', `Table ${tblName} transferred from ${log.fromUserName} to ${toUserName} by ${currentUser.name}`, 'info')
    })

    setOwners(newOwners);         saveOwners(newOwners)
    setTransfers(newTransfers);   saveTransfers(newTransfers)
    toast(`${tableIds.length === 1 ? 'Table' : `${tableIds.length} tables`} transferred to ${toUserName}`, 'success')
  }, [owners, transfers, currentUser, cfg, audit, toast])

  // ── Status cycling ─────────────────────────────────────────────
  const cycleStatus = (tableId: string) => {
    if (posOccupied.has(tableId)) { toast('Table has an active order — close the order in POS to change status', 'warn'); return }
    const curr    = cfg.status[tableId] ?? 'free'
    const next    = NEXT_STATUS[curr]
    const updated = { ...cfg, status: { ...cfg.status, [tableId]: next } }
    saveCfg(updated)
    if (next === 'occupied' && currentUser && !owners[tableId]) {
      assignOwner(tableId, currentUser.id, currentUser.name, currentUser.color)
      audit('TABLE ASSIGNED', `Table ${tableId} assigned to ${currentUser.name}`, 'info')
    }
    if (next === 'free') releaseOwner(tableId)
  }

  // ── Table CRUD ─────────────────────────────────────────────────
  const addTable = async () => {
    const name = newName.trim().toUpperCase()
    if (!name) return
    if (cfg[mod].find(t => t.id === name)) { toast('Table name already exists', 'warn'); return }
    setSaving(true)
    const updated: TablesConfig = {
      ...cfg,
      [mod]: [...cfg[mod], { id: name, name, seats: newSeats }],
      status: { ...cfg.status, [name]: 'free' as const },
    }
    saveCfg(updated)
    await syncToSupabase(updated, mod)
    setSaving(false); setShowAdd(false); setNewName(''); setNewSeats(4)
    toast(`Table ${name} added`, 'success')
  }

  const deleteTable = async (id: string) => {
    if (!confirm(`Delete table "${id}"? This cannot be undone.`)) return
    const updated: TablesConfig = { ...cfg, [mod]: cfg[mod].filter(t => t.id !== id) }
    const { [id]: _, ...rest } = updated.status
    updated.status = rest
    saveCfg(updated); releaseOwner(id)
    await syncToSupabase(updated, mod)
    toast(`Table ${id} deleted`, 'warn')
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
    if (name !== editId) {
      const { [editId]: oldStatus, ...rest } = updated.status
      updated.status = { ...rest, [name]: oldStatus ?? 'free' }
      updated[mod] = updated[mod].map(t => t.name === name ? { ...t, id: name } : t)
      if (owners[editId]) {
        const next = { ...owners, [name]: owners[editId] }
        delete next[editId]
        setOwners(next); saveOwners(next)
      }
    }
    saveCfg(updated)
    await syncToSupabase(updated, mod)
    setSaving(false); setEditId(null)
    toast('Table updated', 'success')
  }

  // ── Derived data ───────────────────────────────────────────────
  const tables        = cfg[mod]
  const free          = tables.filter(t => getStatus(t.id) === 'free').length
  const occupied      = tables.filter(t => getStatus(t.id) === 'occupied').length
  const reserved      = tables.filter(t => getStatus(t.id) === 'reserved').length
  const occupiedAll   = [...cfg.restaurant, ...cfg.bar].filter(t => getStatus(t.id) === 'occupied')
  const myOpenTables  = currentUser ? tables.filter(t => getStatus(t.id) === 'occupied' && owners[t.id]?.userId === currentUser.id) : []
  const tableCfgMap   = Object.fromEntries([...cfg.restaurant, ...cfg.bar].map(t => [t.id, t.name]))

  const staffGroups = (() => {
    const groups: Record<string, { user: TableOwner; tables: TableEntry[] }> = {}
    occupiedAll.forEach(t => {
      const owner = owners[t.id]
      const key   = owner?.userId ?? '__unassigned__'
      if (!groups[key]) groups[key] = { user: owner ?? { userId: key, userName: 'Unassigned', userColor: '#999', assignedAt: '' }, tables: [] }
      groups[key].tables.push(t)
    })
    return Object.values(groups)
  })()

  const TABS = [
    { id: 'tables'   as const, label: '🪑 Tables' },
    ...(canManage ? [{ id: 'overview' as const, label: '👥 Staff Overview' }] : []),
    { id: 'history'  as const, label: '📋 Transfer History' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Shift-end protection banner */}
      {myOpenTables.length > 0 && (
        <div style={{ padding: '10px 20px', background: 'rgba(246,153,63,.12)', borderBottom: '1px solid rgba(246,153,63,.3)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--ora)', fontWeight: 600 }}>
            You have open tables assigned ({myOpenTables.map(t => t.name).join(', ')}). Transfer or close all tables before ending your shift.
          </div>
          <button className="btn btn-gh btn-xs" onClick={() => setTab('tables')}>View Tables</button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)', padding: '0 20px', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '11px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t.id ? 'var(--blue)' : 'transparent'}`,
            color: tab === t.id ? 'var(--blue)' : 'var(--txt3)',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ══ TABLES TAB ══════════════════════════════════════════ */}
        {tab === 'tables' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Table Management</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
                  {tables.length} tables · {free} free · {occupied} occupied · {reserved} reserved
                </div>
              </div>
              {canManage && (
                <button onClick={() => setShowAdd(true)} style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  + Add Table
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['restaurant','bar'] as const).map(m => (
                <button key={m} onClick={() => setMod(m)} style={{
                  padding: '8px 20px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${mod === m ? 'transparent' : 'var(--bdr)'}`,
                  background: mod === m ? (m === 'restaurant' ? 'var(--ora)' : 'var(--pur)') : 'transparent',
                  color: mod === m ? '#fff' : 'var(--txt2)',
                }}>{m === 'restaurant' ? 'Restaurant' : 'Bar'}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {(['free','occupied','reserved'] as const).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[s] }} />
                  <span style={{ color: 'var(--txt3)', textTransform: 'capitalize' }}>{s}</span>
                </div>
              ))}
              <span style={{ color: 'var(--txt3)', fontSize: 12 }}>· Click table header to cycle status</span>
            </div>

            {tables.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--txt3)', fontSize: 13 }}>
                No tables yet — click &ldquo;+ Add Table&rdquo; to get started.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {tables.map(t => {
                  const status = getStatus(t.id)
                  const owner  = owners[t.id]
                  const isMe   = owner?.userId === currentUser?.id
                  const isEdit = editId === t.id
                  return (
                    <div key={t.id} style={{
                      background: 'var(--surf)', border: `2px solid ${STATUS_COLOR[status]}`,
                      borderRadius: 'var(--r3)', overflow: 'hidden',
                      boxShadow: `0 0 0 3px ${STATUS_BG[status]}`,
                    }}>
                      {isEdit ? (
                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input value={editName} onChange={e => setEditName(e.target.value.toUpperCase())} style={inp} placeholder="Name" />
                          <input type="number" value={editSeats} min={1} max={20} onChange={e => setEditSeats(Number(e.target.value))} style={inp} placeholder="Seats" />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '7px 0', borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1px solid var(--bdr)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div onClick={() => cycleStatus(t.id)} style={{ padding: '14px 14px 10px', cursor: 'pointer', background: STATUS_BG[status] }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>{t.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{t.seats} seats</div>
                            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: STATUS_COLOR[status], textTransform: 'capitalize' }}>{status}</div>
                          </div>

                          {status === 'occupied' && (
                            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 7 }}>
                              {owner ? (
                                <>
                                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: owner.userColor + '33', color: owner.userColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                                    {owner.userName.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()}
                                  </div>
                                  <span style={{ fontSize: 12, color: 'var(--txt2)', fontWeight: isMe ? 700 : 500 }}>
                                    {isMe ? 'You' : owner.userName}
                                  </span>
                                </>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--ora)', fontWeight: 700 }}>⚠ Unassigned</span>
                              )}
                            </div>
                          )}

                          <div style={{ display: 'flex' }}>
                            {status === 'occupied' && (
                              <button
                                onClick={() => {
                                  if (!owner && currentUser) {
                                    assignOwner(t.id, currentUser.id, currentUser.name, currentUser.color)
                                    audit('TABLE ASSIGNED', `Table ${t.name} assigned to ${currentUser.name}`, 'info')
                                    toast(`Table ${t.name} assigned to you`, 'success')
                                  } else {
                                    setTransferTableIds([t.id])
                                  }
                                }}
                                style={{ flex: 1, padding: '7px 0', background: 'transparent', border: 'none', borderTop: '1px solid var(--bdr)', borderRight: '1px solid var(--bdr)', color: 'var(--blue)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {!owner ? 'Assign' : 'Transfer'}
                              </button>
                            )}
                            {canManage && (
                              <button onClick={() => { setEditId(t.id); setEditName(t.name); setEditSeats(t.seats) }}
                                style={{ flex: 1, padding: '7px 0', background: 'transparent', border: 'none', borderTop: '1px solid var(--bdr)', borderRight: status === 'occupied' || true ? '1px solid var(--bdr)' : 'none', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                            )}
                            {canManage && (
                              <button onClick={() => deleteTable(t.id)}
                                style={{ flex: 1, padding: '7px 0', background: 'transparent', border: 'none', borderTop: '1px solid var(--bdr)', color: 'var(--red,#ef4444)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Del</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {showAdd && (
              <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 360, padding: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 16 }}>Add Table</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...h2, display: 'block', marginBottom: 4 }}>Table Name</label>
                    <input value={newName} onChange={e => setNewName(e.target.value.toUpperCase())} placeholder="e.g. T9, VIP1, TERRACE" onKeyDown={e => e.key === 'Enter' && addTable()} style={inp} autoFocus />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ ...h2, display: 'block', marginBottom: 4 }}>Seats</label>
                    <input type="number" value={newSeats} min={1} max={30} onChange={e => setNewSeats(Number(e.target.value))} style={inp} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={addTable} disabled={saving || !newName.trim()} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add Table</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STAFF OVERVIEW TAB ══════════════════════════════════ */}
        {tab === 'overview' && canManage && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Open Tables by Employee</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>{occupiedAll.length} occupied tables</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['restaurant','bar'] as const).map(m => (
                <button key={m} onClick={() => setMod(m)} style={{
                  padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${mod === m ? 'transparent' : 'var(--bdr)'}`,
                  background: mod === m ? (m === 'restaurant' ? 'var(--ora)' : 'var(--pur)') : 'transparent',
                  color: mod === m ? '#fff' : 'var(--txt2)',
                }}>{m === 'restaurant' ? 'Restaurant' : 'Bar'}</button>
              ))}
            </div>
            {staffGroups.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No occupied tables right now.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {staffGroups.map(g => (
                  <div key={g.user.userId} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--bdr)' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: g.user.userColor + '33', color: g.user.userColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                        {g.user.userName.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--txt)' }}>{g.user.userName}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{g.tables.length} open {g.tables.length === 1 ? 'table' : 'tables'}</div>
                      </div>
                      <button className="btn btn-pr btn-xs" onClick={() => setTransferTableIds(g.tables.map(t => t.id))}>
                        Transfer All ({g.tables.length})
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
                      {g.tables.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg2)', borderRadius: 20, fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: 'var(--txt)' }}>{t.name}</span>
                          <span style={{ color: 'var(--txt3)', fontSize: 11 }}>{t.seats}s</span>
                          <button onClick={() => setTransferTableIds([t.id])} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '0 2px' }}>Transfer</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TRANSFER HISTORY TAB ════════════════════════════════ */}
        {tab === 'history' && (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginBottom: 16 }}>Transfer History</div>
            {transfers.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No transfers recorded yet.</div>
            ) : (
              <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Table</th>
                      <th>From</th>
                      <th>To</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map(tr => (
                      <tr key={tr.id}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt3)' }}>{new Date(tr.ts).toLocaleString()}</td>
                        <td style={{ fontWeight: 700, color: 'var(--txt)' }}>{tr.tableName}</td>
                        <td style={{ color: 'var(--txt2)' }}>{tr.fromUserName || 'Unassigned'}</td>
                        <td style={{ color: 'var(--grn)', fontWeight: 700 }}>{tr.toUserName}</td>
                        <td style={{ fontSize: 11, color: 'var(--txt3)' }}>{tr.byUserName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {transferTableIds && (
        <TransferModal
          tableIds={transferTableIds}
          tableCfgMap={tableCfgMap}
          currentOwners={owners}
          users={users}
          onConfirm={(toId, toName, toColor) => {
            doTransfer(transferTableIds, toId, toName, toColor)
            setTransferTableIds(null)
          }}
          onClose={() => setTransferTableIds(null)}
        />
      )}
    </div>
  )
}
