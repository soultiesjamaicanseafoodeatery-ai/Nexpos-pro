'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { storage } from '@/lib/utils/storage'
import type { LoyaltyMember } from '@/types'

const TIERS = [
  { name: 'Bronze', minPts: 0,    color: '#b45309' },
  { name: 'Silver', minPts: 500,  color: '#6b7280' },
  { name: 'Gold',   minPts: 1500, color: '#d97706' },
  { name: 'VIP',    minPts: 5000, color: '#7c3aed' },
]

function tier(pts: number) {
  return [...TIERS].reverse().find(t => pts >= t.minPts) ?? TIERS[0]
}

export default function LoyaltyPage() {
  const { state, toast } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'

  const [members, setMembers] = useState<LoyaltyMember[]>(() => state.loyalty)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState<{ member: LoyaltyMember; pts: number; note: string } | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [newForm, setNewForm] = useState({ email: '', name: '', points: 0 })

  const persist = (list: LoyaltyMember[]) => {
    setMembers(list)
    storage.set('loyalty', list)
  }

  const openAdjust = (m: LoyaltyMember) => setModal({ member: m, pts: 0, note: '' })

  const applyAdjust = () => {
    if (!modal) return
    const updated = members.map(m =>
      m.email === modal.member.email
        ? { ...m, points: Math.max(0, m.points + modal.pts), history: [{ date: new Date().toLocaleDateString(), pts: modal.pts, desc: modal.note || 'Manual adjustment' }, ...m.history] }
        : m
    )
    persist(updated)
    setModal(null)
    toast('Points updated', 'success')
  }

  const addMember = () => {
    if (!newForm.email || !newForm.name) { toast('Name and email required', 'warn'); return }
    if (members.find(m => m.email === newForm.email)) { toast('Member already exists', 'warn'); return }
    const m: LoyaltyMember = { email: newForm.email, name: newForm.name, points: newForm.points, tier: tier(newForm.points).name, history: [] }
    persist([m, ...members])
    setAddModal(false)
    setNewForm({ email: '', name: '', points: 0 })
    toast('Member added', 'success')
  }

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    return !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  const totalPts = members.reduce((s, m) => s + m.points, 0)

  const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Loyalty Program</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{members.length} members · {totalPts.toLocaleString()} total points</div>
        </div>
        <button onClick={() => setAddModal(true)} style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Add Member</button>
      </div>

      {/* Tier legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {TIERS.map(t => (
          <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${t.color}22`, background: `${t.color}11` }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.name}</span>
            <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{t.minPts.toLocaleString()}+ pts</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
          style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 12px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' }} />
      </div>

      {/* Members table */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No loyalty members yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)' }}>
                {['Name','Email','Tier','Points','History',''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--txt3)', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const t = tier(m.points)
                return (
                  <tr key={m.email} style={{ borderBottom: '1px solid var(--bdr2)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--txt)' }}>{m.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)' }}>{m.email}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: `${t.color}22`, color: t.color }}>{t.name}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)', fontSize: 13 }}>{m.points.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--txt3)', fontSize: 11 }}>{m.history.length} transactions</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={() => openAdjust(m)} style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Adjust Points</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Adjust modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 360, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>Adjust Points</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>{modal.member.name} · {modal.member.points.toLocaleString()} pts</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Points to Add (+) or Deduct (−)</label>
              <input type="number" style={inp} value={modal.pts} onChange={e => setModal(m => m ? { ...m, pts: Number(e.target.value) } : m)} placeholder="e.g. 100 or -50" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Note</label>
              <input style={inp} value={modal.note} onChange={e => setModal(m => m ? { ...m, note: e.target.value } : m)} placeholder="e.g. Birthday bonus" />
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>
              New balance: <strong>{Math.max(0, modal.member.points + modal.pts).toLocaleString()} pts</strong> → <strong style={{ color: tier(Math.max(0, modal.member.points + modal.pts)).color }}>{tier(Math.max(0, modal.member.points + modal.pts)).name}</strong>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={applyAdjust} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Add member modal */}
      {addModal && (
        <div onClick={() => setAddModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 360, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 16 }}>Add Loyalty Member</div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Full Name</label><input style={inp} value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Email</label><input type="email" style={inp} value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div style={{ marginBottom: 20 }}><label style={lbl}>Starting Points</label><input type="number" min={0} style={inp} value={newForm.points} onChange={e => setNewForm(f => ({ ...f, points: Number(e.target.value) }))} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAddModal(false)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addMember} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add Member</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
