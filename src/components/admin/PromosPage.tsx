'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { PromoCode } from '@/types'
import { storage } from '@/lib/utils/storage'

const EMPTY: PromoCode = {
  code: '', type: 'pct', value: 0, minOrder: 0,
  uses: 0, maxUses: 100, expiry: '', active: true,
}

export default function PromosPage() {
  const { state, dispatch, toast } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const [modal, setModal] = useState<PromoCode | null>(null)
  const [isNew, setIsNew] = useState(false)

  const promos = state.promos

  const openAdd = () => { setModal({ ...EMPTY }); setIsNew(true) }
  const openEdit = (p: PromoCode) => { setModal({ ...p }); setIsNew(false) }

  const save = () => {
    if (!modal?.code.trim()) { toast('Code is required', 'warn'); return }
    let updated: PromoCode[]
    if (isNew) {
      if (promos.find(p => p.code === modal.code.toUpperCase())) { toast('Code already exists', 'warn'); return }
      updated = [{ ...modal, code: modal.code.toUpperCase() }, ...promos]
    } else {
      updated = promos.map(p => p.code === modal!.code ? modal! : p)
    }
    dispatch({ type: 'SET_PROMOS', promos: updated })
    storage.set('promos', updated)
    setModal(null)
    toast(isNew ? 'Promo added' : 'Promo updated', 'success')
  }

  const del = (code: string) => {
    if (!confirm(`Delete promo code "${code}"?`)) return
    const updated = promos.filter(p => p.code !== code)
    dispatch({ type: 'SET_PROMOS', promos: updated })
    storage.set('promos', updated)
    toast('Promo deleted', 'warn')
  }

  const toggle = (code: string) => {
    const updated = promos.map(p => p.code === code ? { ...p, active: !p.active } : p)
    dispatch({ type: 'SET_PROMOS', promos: updated })
    storage.set('promos', updated)
  }

  const set = (patch: Partial<PromoCode>) => setModal(m => m ? { ...m, ...patch } : m)

  const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }

  const expired = (expiry: string) => expiry && new Date(expiry) < new Date()

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Promo Codes</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{promos.filter(p => p.active).length} active codes</div>
        </div>
        <button onClick={openAdd} style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ New Code</button>
      </div>

      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        {promos.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No promo codes yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                {['Code','Type','Value','Min Order','Uses','Expiry','Status',''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {promos.map(p => {
                const exp = expired(p.expiry)
                return (
                  <tr key={p.code} style={{ borderBottom: '1px solid var(--bdr2)', opacity: (!p.active || exp) ? 0.55 : 1 }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--txt)', fontSize: 13 }}>{p.code}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)', textTransform: 'capitalize' }}>{p.type === 'pct' ? 'Percent' : 'Flat'}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--grn)' }}>{p.type === 'pct' ? `${p.value}%` : `${sym}${p.value}`}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)' }}>{sym}{p.minOrder}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)' }}>{p.uses}/{p.maxUses}</td>
                    <td style={{ padding: '10px 12px', color: exp ? 'var(--red,#ef4444)' : 'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{p.expiry || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                        background: p.active && !exp ? '#14532d22' : '#7f1d1d22',
                        color: p.active && !exp ? 'var(--grn)' : 'var(--red,#ef4444)',
                      }}>{!p.active ? 'Inactive' : exp ? 'Expired' : 'Active'}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(p)} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => toggle(p.code)} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{p.active ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => del(p.code)} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--red,#ef4444)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 18 }}>{isNew ? 'New Promo Code' : 'Edit Promo Code'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Code</label>
                <input style={inp} value={modal.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="PROMO10" disabled={!isNew} />
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select style={inp} value={modal.type} onChange={e => set({ type: e.target.value as 'pct' | 'flat' })}>
                  <option value="pct">Percent (%)</option>
                  <option value="flat">Flat Amount</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Value ({modal.type === 'pct' ? '%' : sym})</label>
                <input type="number" min={0} style={inp} value={modal.value} onChange={e => set({ value: Number(e.target.value) })} />
              </div>
              <div>
                <label style={lbl}>Min Order ({sym})</label>
                <input type="number" min={0} style={inp} value={modal.minOrder} onChange={e => set({ minOrder: Number(e.target.value) })} />
              </div>
              <div>
                <label style={lbl}>Max Uses</label>
                <input type="number" min={1} style={inp} value={modal.maxUses} onChange={e => set({ maxUses: Number(e.target.value) })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Expiry Date</label>
                <input type="date" style={inp} value={modal.expiry} onChange={e => set({ expiry: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--txt2)' }}>
                  <input type="checkbox" checked={modal.active} onChange={e => set({ active: e.target.checked })} />
                  Active
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
