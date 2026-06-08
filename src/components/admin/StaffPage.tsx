'use client'

import { useApp } from '@/lib/hooks/useAppStore'
import { ROLES } from '@/lib/data/seed'

export default function StaffPage() {
  const { state, dispatch, toast } = useApp()
  const { users, currentUser } = state

  const toggleActive = (id: string) => {
    if (id === currentUser?.id) { toast('Cannot deactivate yourself', 'warn'); return }
    const updated = users.map(u => u.id === id ? { ...u, active: !u.active } : u)
    dispatch({ type: 'SET_USERS', users: updated })
    toast('Staff updated', 'success')
  }

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 15 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Staff</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{users.filter(u => u.active).length} active · {users.length} total</div>
        </div>
      </div>

      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
        <table className="dt">
          <thead>
            <tr>
              <th>Staff</th><th>Role</th><th>Modules</th><th>Staff ID</th><th>Status</th>
              {currentUser?.role === 'admin' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const role = ROLES[u.role]
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: `${u.color}22`, color: u.color, flexShrink: 0 }}>{u.ini}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{u.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--txt3)' }}>ID: {u.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 700, color: role?.color ?? 'var(--txt2)' }}>{role?.label ?? u.role}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.allowedModules.map(m => (
                        <span key={m} className="b b-bl" style={{ fontSize: 9 }}>{m}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{u.staffId ?? '—'}</td>
                  <td>
                    <span className={`b ${u.active ? 'b-gn' : 'b-rd'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  {currentUser?.role === 'admin' && (
                    <td>
                      <button className={`btn btn-xs ${u.active ? 'btn-red' : 'btn-gn'}`} onClick={() => toggleActive(u.id)} disabled={u.id === currentUser.id}>
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
