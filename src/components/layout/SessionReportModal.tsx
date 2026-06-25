'use client'
import React, { useMemo, useRef } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'

interface Props {
  clockinAt: string  // ISO string of when this employee clocked in
  onClockOut: () => void
  onCancel: () => void
}

const PAY_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', credit: 'Credit Card', debit: 'Debit Card',
  mobile: 'Mobile Pay', check: 'Check', fleet: 'Fleet Account', split: 'Split',
}

export default function SessionReportModal({ clockinAt, onClockOut, onCancel }: Props) {
  const { state } = useApp()
  const { currentUser, orderTickets, biz } = state
  const printRef = useRef<HTMLDivElement>(null)

  const shiftStart = useMemo(() => new Date(clockinAt), [clockinAt])
  const sym = biz.currencySymbol || '$'
  const fmt = (n: number) => `${sym}${n.toFixed(2)}`

  const shiftTxs = useMemo(() =>
    state.transactions.filter(tx =>
      tx.userId === currentUser?.id &&
      new Date(tx.ts) >= shiftStart
    ),
    [state.transactions, currentUser, shiftStart]
  )

  const completedTxs = shiftTxs.filter(tx => !tx.voided)
  const voidedTxs    = shiftTxs.filter(tx => tx.voided)
  const refundedTxs  = completedTxs.filter(tx => tx.refunded)

  const totalRevenue  = completedTxs.reduce((s, tx) => s + tx.total, 0)
  const totalGratuity = completedTxs.reduce((s, tx) => s + (tx.gratuity ?? 0), 0)
  const totalDiscount = completedTxs.reduce((s, tx) => s + (tx.disc ?? 0), 0)
  const totalRefunds  = refundedTxs.reduce((s, tx) => s + (tx.refundAmount ?? 0), 0)
  const totalTax      = completedTxs.reduce((s, tx) => s + (tx.gct ?? tx.tax ?? 0), 0)

  const payBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const tx of completedTxs) {
      if (tx.payments && tx.payments.length > 0) {
        for (const p of tx.payments) {
          map[p.method] = (map[p.method] ?? 0) + p.amount
        }
      } else {
        const key = tx.pay || 'cash'
        map[key] = (map[key] ?? 0) + tx.total
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [completedTxs])

  const openOrders = orderTickets.filter(t =>
    !['paid', 'voided'].includes(t.status ?? '') &&
    t.server === currentUser?.name
  )

  const durationMs  = Date.now() - shiftStart.getTime()
  const hours       = Math.floor(durationMs / 3600000)
  const minutes     = Math.floor((durationMs % 3600000) / 60000)
  const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(`
      <html><head><title>Session Report</title>
      <style>
        body { font-family: monospace; font-size: 12px; margin: 16px; color: #000; background: #fff; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .divider { border-top: 1px dashed #999; margin: 6px 0; }
        .bold { font-weight: bold; }
        .center { text-align: center; }
        h2 { font-size: 14px; margin: 0 0 6px; }
      </style>
      </head><body>${content.innerHTML}</body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  const s = {
    overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 970,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: { background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)',
      width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const,
      overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.75)' },
    head: { padding: '16px 20px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 },
    body: { flex: 1, overflowY: 'auto' as const, padding: '14px 18px', display: 'flex',
      flexDirection: 'column' as const, gap: 10 },
    foot: { padding: '14px 16px', borderTop: '1px solid var(--bdr)', flexShrink: 0,
      display: 'flex', gap: 8 },
  }

  const Row = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: 13, fontWeight: bold ? 800 : 500,
      color: color ?? (bold ? 'var(--txt)' : 'var(--txt2)') }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)',
      borderRadius: 'var(--r2)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase',
        letterSpacing: '.5px', marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  )

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={s.head}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>Session Report</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {currentUser?.name} · {shiftStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} — Now ({durationStr})
          </div>
        </div>

        <div style={s.body}>
          {/* Printable area */}
          <div ref={printRef} style={{ display: 'none' }}>
            <div className="center bold"><h2>{biz.name || 'NexPOS Pro'}</h2></div>
            <div className="center">Session Report</div>
            <div className="divider" />
            <div className="row"><span>Employee:</span><span>{currentUser?.name}</span></div>
            <div className="row"><span>Clock In:</span><span>{shiftStart.toLocaleString()}</span></div>
            <div className="row"><span>Clock Out:</span><span>{new Date().toLocaleString()}</span></div>
            <div className="row"><span>Duration:</span><span>{durationStr}</span></div>
            <div className="divider" />
            <div className="row bold"><span>Orders Completed:</span><span>{completedTxs.length}</span></div>
            <div className="row bold"><span>Total Revenue:</span><span>{fmt(totalRevenue)}</span></div>
            {totalGratuity > 0 && <div className="row"><span>Gratuity Collected:</span><span>{fmt(totalGratuity)}</span></div>}
            {totalDiscount > 0 && <div className="row"><span>Discounts Given:</span><span>({fmt(totalDiscount)})</span></div>}
            {totalTax > 0 && <div className="row"><span>Tax (GCT):</span><span>{fmt(totalTax)}</span></div>}
            <div className="divider" />
            {payBreakdown.map(([method, amt]) => (
              <div key={method} className="row"><span>{PAY_LABELS[method] ?? method}:</span><span>{fmt(amt)}</span></div>
            ))}
            <div className="divider" />
            {voidedTxs.length > 0 && <div className="row"><span>Voids:</span><span>{voidedTxs.length}</span></div>}
            {refundedTxs.length > 0 && <div className="row"><span>Refunds:</span><span>({fmt(totalRefunds)})</span></div>}
            {openOrders.length > 0 && <div className="row"><span>Open Orders Remaining:</span><span>{openOrders.length}</span></div>}
          </div>

          {/* Session summary */}
          <Section title="Session Summary">
            <Row label="Orders Completed" value={String(completedTxs.length)} bold />
            <Row label="Total Revenue" value={fmt(totalRevenue)} bold color="var(--grn)" />
            {totalTax > 0 && <Row label="Tax (GCT)" value={fmt(totalTax)} />}
          </Section>

          {/* Payment breakdown */}
          {payBreakdown.length > 0 && (
            <Section title="Payments">
              {payBreakdown.map(([method, amt]) => (
                <Row key={method} label={PAY_LABELS[method] ?? method} value={fmt(amt)} />
              ))}
            </Section>
          )}

          {/* Adjustments */}
          {(totalGratuity > 0 || totalDiscount > 0 || refundedTxs.length > 0) && (
            <Section title="Adjustments">
              {totalGratuity > 0 && <Row label="Gratuity Collected" value={fmt(totalGratuity)} color="var(--grn)" />}
              {totalDiscount > 0 && <Row label="Discounts Given" value={`(${fmt(totalDiscount)})`} color="var(--ora)" />}
              {refundedTxs.length > 0 && <Row label={`Refunds (${refundedTxs.length})`} value={`(${fmt(totalRefunds)})`} color="var(--red)" />}
            </Section>
          )}

          {/* Voids */}
          {voidedTxs.length > 0 && (
            <Section title="Voids">
              <Row label="Voided Transactions" value={String(voidedTxs.length)} color="var(--red)" />
            </Section>
          )}

          {/* Open orders warning */}
          {openOrders.length > 0 && (
            <div style={{ background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.3)',
              borderRadius: 'var(--r2)', padding: '10px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ora)', marginBottom: 4 }}>
                {openOrders.length} open order{openOrders.length !== 1 ? 's' : ''} still assigned to you
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                These were transferred or will remain on the floor.
              </div>
            </div>
          )}

          {completedTxs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--txt3)', fontSize: 13 }}>
              No transactions recorded this session.
            </div>
          )}
        </div>

        <div style={s.foot}>
          <button onClick={handlePrint}
            style={{ flex: 1, padding: '10px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700,
              background: 'transparent', color: 'var(--txt2)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>
            Print Report
          </button>
          <button onClick={onCancel}
            style={{ flex: 1, padding: '10px', borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700,
              background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>
            Stay Logged In
          </button>
          <button onClick={onClockOut}
            style={{ flex: 2, padding: '10px', borderRadius: 'var(--r2)', fontSize: 13, fontWeight: 800,
              border: 'none', cursor: 'pointer', background: 'var(--grn)', color: '#fff' }}>
            Clock Out
          </button>
        </div>
      </div>
    </div>
  )
}
