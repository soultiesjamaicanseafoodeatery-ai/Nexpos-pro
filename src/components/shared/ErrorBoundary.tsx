'use client'
import React from 'react'

interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0a', zIndex: 9999, padding: 24,
        }}>
          <div style={{
            background: '#1a0a0a', border: '1px solid #ef444455', borderRadius: 12,
            padding: 24, maxWidth: 720, width: '100%', fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', marginBottom: 12 }}>
              App Error — please copy and report this message:
            </div>
            <div style={{
              background: '#0a0a0a', borderRadius: 8, padding: '12px 16px',
              fontSize: 12, color: '#fca5a5', marginBottom: 16, wordBreak: 'break-all',
              lineHeight: 1.6, maxHeight: 360, overflowY: 'auto',
              userSelect: 'text', cursor: 'text',
            }}>
              <strong>{this.state.error.name}: {this.state.error.message}</strong>
              {this.state.error.stack && (
                <pre style={{ marginTop: 10, fontSize: 10, color: '#aaa', whiteSpace: 'pre-wrap' }}>
                  {this.state.error.stack}
                </pre>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  try { localStorage.clear() } catch { /* ignore */ }
                  window.location.reload()
                }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, background: '#7f1d1d',
                  color: '#fca5a5', border: '1px solid #ef444455', fontWeight: 700,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Clear data &amp; Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, background: '#1e3a5f',
                  color: '#93c5fd', border: '1px solid #3b82f655', fontWeight: 700,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Reload (keep data)
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
