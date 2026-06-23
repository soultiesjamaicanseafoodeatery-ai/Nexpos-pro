'use client'
// Requires Supabase table: bookings (id text PRIMARY KEY, name text, phone text, date text, time text, "partySize" int4, module text, note text, status text, created_at timestamptz DEFAULT now())
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { storage } from '@/lib/utils/storage'

interface Booking {
  id: string; name: string; phone: string; date: string; time: string
  partySize: number; module: 'restaurant' | 'bar' | 'carwash'; note: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'seated'
}

const STATUS_COLOR: Record<string, string> = {
  confirmed: 'var(--blue)', pending: 'var(--ora)', cancelled: 'var(--red,#ef4444)', seated: 'var(--grn)'
}
const EMPTY: Booking = { id: '', name: '', phone: '', date: '', time: '', partySize: 2, module: 'restaurant', note: '', status: 'confirmed' }

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [modal, setModal]       = useState<Booking | null>(null)
  const [isNew, setIsNew]       = useState(false)
  const [filterDate, setFilterDate] = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase.from('bookings').select('*').order('date', { ascending: true })
      if (data) {
        setBookings(data)
      } else {
        const local = storage.get<Booking[]>('bookings') ?? []
        setBookings(local)
        if (error) console.error('Bookings load error:', error)
      }
      setLoading(false)
    }
    load()
  }, [])

  const upsert = async (booking: Booking) => {
    const { error } = await supabase.from('bookings').upsert(booking)
    if (error) {
      console.error('Save booking error:', error)
      storage.set('bookings', [...bookings.filter(b => b.id !== booking.id), booking])
    }
    setBookings(prev => {
      const without = prev.filter(b => b.id !== booking.id)
      return [...without, booking].sort((a, b) => `${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1)
    })
  }

  const deleteBooking = async (id: string) => {
    if (pendingDel !== id) { setPendingDel(id); return }
    setPendingDel(null)
    await supabase.from('bookings').delete().eq('id', id)
    setBookings(prev => prev.filter(b => b.id !== id))
  }

  const setStatus = async (id: string, status: Booking['status']) => {
    await supabase.from('bookings').update({ status }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
  }

  const openAdd = () => {
    const today = new Date().toISOString().split('T')[0]
    setModal({ ...EMPTY, id: `BK-${Date.now()}`, date: today })
    setIsNew(true)
  }

  const save = () => {
    if (!modal?.name || !modal.date || !modal.time) return
    upsert(modal)
    setModal(null)
  }

  const patch = (p: Partial<Booking>) => setModal(m => m ? { ...m, ...p } : m)

  const filtered = bookings
    .filter(b => !filterDate || b.date === filterDate)
    .sort((a, b) => `${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1)

  const today = new Date().toISOString().split('T')[0]
  const todayCount    = bookings.filter(b => b.date === today && b.status !== 'cancelled').length
  const upcomingCount = bookings.filter(b => b.date > today  && b.status !== 'cancelled').length

  const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Bookings</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {loading ? 'Loading…' : `${todayCount} today · ${upcomingCount} upcoming`}
          </div>
        </div>
        <button onClick={openAdd} style={{ padding: '9px 18px', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
          + New Booking
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '7px 10px', fontSize: 13, color: 'var(--txt)' }} />
        {filterDate && <button onClick={() => setFilterDate('')} style={{ fontSize: 12, color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>}
      </div>

      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>Loading bookings…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
            {bookings.length === 0 ? 'No bookings yet — click "+ New Booking" to add one.' : 'No bookings for this date.'}
          </div>
        ) : filtered.map(b => (
          <div key={b.id} style={{ padding: '13px 16px', borderBottom: '1px solid var(--bdr2)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'center', minWidth: 52 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', lineHeight: 1 }}>{b.time}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>{b.date}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>{b.name}</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{b.phone} · {b.partySize} guests · {b.module}</div>
              {b.note && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2, fontStyle: 'italic' }}>{b.note}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: STATUS_COLOR[b.status] + '22', color: STATUS_COLOR[b.status], textTransform: 'capitalize' }}>{b.status}</span>
              <select value={b.status} onChange={e => setStatus(b.id, e.target.value as Booking['status'])}
                style={{ fontSize: 11, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 6, padding: '4px 6px', color: 'var(--txt)' }}>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="seated">Seated</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={() => { setModal({ ...b }); setIsNew(false) }} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--bdr)', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
              <button onClick={() => deleteBooking(b.id)} style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', border: pendingDel === b.id ? '1px solid #fbbf24' : '1px solid var(--bdr)', color: pendingDel === b.id ? '#fbbf24' : 'var(--red,#ef4444)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{pendingDel === b.id ? 'Sure?' : 'Del'}</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', marginBottom: 18 }}>{isNew ? 'New Booking' : 'Edit Booking'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Guest Name</label><input style={inp} value={modal.name} onChange={e => patch({ name: e.target.value })} /></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={modal.phone} onChange={e => patch({ phone: e.target.value })} /></div>
              <div><label style={lbl}>Party Size</label><input type="number" min={1} max={100} style={inp} value={modal.partySize} onChange={e => patch({ partySize: Number(e.target.value) })} /></div>
              <div><label style={lbl}>Date</label><input type="date" style={inp} value={modal.date} onChange={e => patch({ date: e.target.value })} /></div>
              <div><label style={lbl}>Time</label><input type="time" style={inp} value={modal.time} onChange={e => patch({ time: e.target.value })} /></div>
              <div>
                <label style={lbl}>Module</label>
                <select style={inp} value={modal.module} onChange={e => patch({ module: e.target.value as Booking['module'] })}>
                  <option value="restaurant">Restaurant</option>
                  <option value="bar">Bar</option>
                  <option value="carwash">Car Wash</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={modal.status} onChange={e => patch({ status: e.target.value as Booking['status'] })}>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="seated">Seated</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Note</label><input style={inp} value={modal.note} onChange={e => patch({ note: e.target.value })} placeholder="Special requests, allergies…" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: 11, borderRadius: 'var(--r)', background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} disabled={!modal.name || !modal.date || !modal.time} style={{ flex: 2, padding: 11, borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}