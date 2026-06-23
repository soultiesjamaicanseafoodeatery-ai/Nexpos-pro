'use client'

import { useApp } from '@/lib/hooks/useAppStore'

export default function ToastContainer() {
  const { state, dispatch } = useApp()

  return (
    <div id="toasts" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{{ success:'✓', error:'✕', info:'ℹ', warn:'⚠' }[t.type] ?? 'ℹ'}</span>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button onClick={() => dispatch({ type: 'REMOVE_TOAST', id: t.id })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.7, fontSize: 14, padding: '0 2px' }}>×</button>
        </div>
      ))}
    </div>
  )
}
