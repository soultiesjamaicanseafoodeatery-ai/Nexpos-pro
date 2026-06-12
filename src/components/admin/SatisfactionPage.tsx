'use client'
import { useState } from 'react'
import { storage } from '@/lib/utils/storage'

interface FeedbackEntry {
  id: string
  ts: string
  rating: 1 | 2 | 3 | 4 | 5
  module: 'restaurant' | 'bar' | 'carwash'
  comment: string
  staffName?: string
  tableId?: string
}

const STAR_COLOR = { 5: 'var(--grn)', 4: '#22c55e', 3: 'var(--ora)', 2: '#f97316', 1: 'var(--red,#ef4444)' }

export default function SatisfactionPage() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>(() => storage.get<FeedbackEntry[]>('feedback') ?? [])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Partial<FeedbackEntry>>({ rating: 5, module: 'restaurant', comment: '' })
  const [modFilter, setModFilter] = useState('all')

  const persist = (list: FeedbackEntry[]) => { setFeedback(list); storage.set('feedback', list) }

  const submitFeedback = () => {
    if (!form.rating || !form.module) return
    const entry: FeedbackEntry = {
      id: `FB-${Date.now()}`, ts: new Date().toLocaleString(),
      rating: form.rating as FeedbackEntry['rating'], module: form.module as FeedbackEntry['module'],
      comment: form.comment ?? '', staffName: form.staffName, tableId: form.tableId,
    }
    persist([entry, ...feedback])
    setModal(false)
    setForm({ rating: 5, module: 'restaurant', comment: '' })
  }

  const del = (id: string) => persist(feedback.filter(f => f.id !== id))

  const filtered = feedback.filter(f => modFilter === 'all' || f.module === modFilter)

  const avg = (list: FeedbackEntry[]) => list.length === 0 ? 0 : list.reduce((s, f) => s + f.rating, 0) / list.length
  const dist = (list: FeedbackEntry[], r: number) => list.filter(f => f.rating === r).length

  const overall = avg(feedback)

  const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Customer Satisfaction</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{feedback.length} reviews · {overall.toFixed(1)} avg rating</div>
        </div>
        <button onClick={() => setModal(true)} style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Add Feedback</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {(['restaurant','bar','carwash'] as const).map(m => {
          const mFb = feedback.filter(f => f.module === m)
          const mAvg = avg(mFb)
          const color = m === 'restaurant' ? 'var(--ora)' : m === 'bar' ? 'var(--pur)' : 'var(--blue)'
          return (
            <div key={m} style={{ background: 'var(--surf)', border: `1px solid var(--bdr)`, borderRadius: 'var(--r3)', padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'capitalize', marginBottom: 6 }}>{m}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: mAvg > 0 ? (STAR_COLOR[Math.round(mAvg) as keyof typeof STAR_COLOR] ?? 'var(--txt)') : 'var(--txt3)' }}>
                {mAvg > 0 ? mAvg.toFixed(1) : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{mFb.length} reviews</div>
            </div>
          )
        })}
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', marginBottom: 6 }}>Rating Breakdown</div>
          {[5,4,3,2,1].map(r => {
            const count = dist(feedback, r)
            const pct = feedback.length > 0 ? (count / feedback.length) * 100 : 0
            return (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--txt3)', minWidth: 8 }}>{r}</span>
                <div style={{ flex: 1, height: 6, background: 'var(--surf2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: STAR_COLOR[r as keyof typeof STAR_COLOR], borderRadius: 3, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--txt3)', minWidth: 18, textAlign: 'right' }}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['all','restaurant','bar','carwash'].map(m => (
          <button key={m} onClick={() => setModFilter(m)} style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1.5px solid ${modFilter === m ? 'transparent' : 'var(--bdr)'}`,
            background: modFilter === m ? 'var(--blue)' : 'transparent',
            color: modFilter === m ? '#fff' : 'var(--txt3)',
          }}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>
        ))}
      </div>

      {/* Feedback list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13, background: 'var(--surf)', borderRadius: 'var(--r3)', border: '1px solid var(--bdr)' }}>
            No feedback yet.
          </div>
        ) : filtered.map(f => (
          <div key={f.id} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: STAR_COLOR[f.rating], minWidth: 40, textAlign: 'center', lineHeight: 1 }}>{f.rating}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'var(--surf2)', color: 'var(--txt3)', textTransform: 'capitalize' }}>{f.module}</span>
                {f.staffName && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Staff: {f.staffName}</span>}
                {f.tableId   && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Table: {f.tableId}</span>}
                <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 'auto' }}>{f.ts}</span>
              </div>
              {f.comment && <div style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.4 }}>{f.comment}</div>}
            </div>
            <button onClick={() => del(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 16, padding: 0 }}>×</button>
          </div>
        ))}
      </div>

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 380, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 18 }}>Add Feedback</div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Rating</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1,2,3,4,5].map(r => (
                  <button key={r} onClick={() => setForm(f => ({ ...f, rating: r as FeedbackEntry['rating'] }))} style={{
                    flex: 1, padding: '10px 0', borderRadius: 'var(--r)', fontSize: 16, fontWeight: 800, cursor: 'pointer',
                    border: `2px solid ${form.rating === r ? STAR_COLOR[r as keyof typeof STAR_COLOR] : 'var(--bdr)'}`,
                    background: form.rating === r ? STAR_COLOR[r as keyof typeof STAR_COLOR] + '22' : 'transparent',
                    color: form.rating === r ? STAR_COLOR[r as keyof typeof STAR_COLOR] : 'var(--txt3)',
                  }}>{r}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Module</label>
              <select style={inp} value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value as FeedbackEntry['module'] }))}>
                <option value="restaurant">Restaurant</option>
                <option value="bar">Bar</option>
                <option value="carwash">Car Wash</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Comment</label>
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' as const }} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="Customer comment…" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <div><label style={lbl}>Staff Name</label><input style={inp} value={form.staffName ?? ''} onChange={e => setForm(f => ({ ...f, staffName: e.target.value }))} /></div>
              <div><label style={lbl}>Table</label><input style={inp} value={form.tableId ?? ''} onChange={e => setForm(f => ({ ...f, tableId: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(false)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitFeedback} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
