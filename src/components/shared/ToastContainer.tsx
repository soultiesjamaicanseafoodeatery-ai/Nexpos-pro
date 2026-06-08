'use client'

import { useApp } from '@/lib/hooks/useAppStore'

export default function ToastContainer() {
  const { state } = useApp()

  return (
    <div id="toasts" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{{ success:'✓', error:'✕', info:'ℹ', warn:'⚠' }[t.type] ?? 'ℹ'}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
