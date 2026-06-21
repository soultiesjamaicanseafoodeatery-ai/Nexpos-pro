'use client'
import { useState, useMemo } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { buildZReport, smartPrint } from '@/lib/utils/ticketPrinter'
import type { ZReportData, PrintWidth } from '@/lib/utils/ticketPrinter'

const JMD_DENOMS = [
  { label: '$5,000 Bill', value: 5000 },
  { label: '$1,000 Bill', value: 1000 },
  { label: '$500 Bill',   value: 500  },
  { label: '$100 Bill',   value: 100  },
  { label: '$50 Bill',    value: 50   },
  { label: '$20 Coin',    value: 20   },
  { label: '$10 Coin',    value: 10   },
  { label: '$5 Coin',     value: 5    },
  { label: '$1 Coin',     value: 1    },
]

function sameDay(ts: string, isoDate: string) {
  try {
    const txDate = new Date(ts)
    const ref    = new Date(isoDate)
    return txDate.getFullYear() === ref.getFullYear() &&
           txDate.getMonth()    === ref.getMonth()    &&
           txDate.getDate()     === ref.getDate()
  } catch { return false }
}

interface Props { onClose: () => void }

export default function EODWizard({ onClose }: Props) {
  const { state } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) =>
    sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const todayStr = new Date().toISOString().slice(0, 10)

  const [step,         setStep]         = useState(1)
  const [openingFloat, setOpeningFloat] = useState('')
  const [qtys,         setQtys]         = useState<number[]>(JMD_DENOMS.map(() => 0))
  const [printing,     setPrinting]     = useState(false)

  const openHeldOrders = ((state as any).heldOrders ?? []).filter((o: any) => Array.isArray(o.cart) && o.cart.length > 0)
  const pendingTickets  = ((state as any).orderTickets ?? []).filter((t: any) => t.status === 'pending' || t.status === 'preparing')

  const dayTxs   = useMemo(() => ((state as any).transactions ?? []).filter((tx: any) => sameDay(tx.ts, todayStr)), [state, todayStr])
  const validTxs = dayTxs.filter((tx: any) => !tx.voided)

  const resTxs   = validTxs.filter((tx: any) => tx.module === 'restaurant')
  const barTxs   = validTxs.filter((tx: any) => tx.module === 'bar')
  const cwTxs    = validTxs.filter((tx: any) => tx.module === 'carwash')
  const resSales  = resTxs.reduce( (s: number, t: any) => s + t.total, 0)
  const barSales  = barTxs.reduce( (s: number, t: any) => s + t.total, 0)
  const cwSales   = cwTxs.reduce(  (s: number, t: any) => s + t.total, 0)
  const totalSales = validTxs.reduce((s: number, t: any) => s + t.total, 0)

  function getMethod(tx: any, method: string): number {
    if (Array.isArray(tx.payments) && tx.payments.length > 0)
      return tx.payments
        .filter((p: any) => String(p.method).toLowerCase().includes(method))
        .reduce((s: number, p: any) => s + (p.amount ?? 0), 0)
    return String(tx.pay ?? '').toLowerCase().includes(method) ? (tx.total ?? 0) : 0
  }
  const cashSales     = validTxs.reduce((s: number, tx: any) => s + getMethod(tx, 'cash'), 0)
  const cardSales     = validTxs.reduce((s: number, tx: any) => s + getMethod(tx, 'card'), 0)
  const giftCardSales = validTxs.reduce((s: number, tx: any) => s + getMethod(tx, 'gift'), 0)
  const tabSales      = validTxs.reduce((s: number, tx: any) => s + getMethod(tx, 'tab'),  0)

  const totalDiscounts = validTxs.reduce((s: number, tx: any) => s + (tx.disc ?? 0), 0)
  const voidedTxs      = dayTxs.filter((tx: any) => tx.voided)
  const totalVoids     = voidedTxs.reduce((s: number, tx: any) => s + (tx.total ?? 0), 0)
  const refundTxs      = dayTxs.filter((tx: any) => tx.refunded)
  const totalRefunds   = refundTxs.reduce((s: number, tx: any) => s + (tx.refundAmount ?? 0), 0)

  const totalGCT           = validTxs.reduce((s: number, tx: any) => s + (tx.gct ?? 0), 0)
  const totalServiceCharge = validTxs.reduce((s: number, tx: any) => s + (tx.serviceCharge ?? 0), 0)
  const totalGratuity      = validTxs.reduce((s: number, tx: any) => s + (tx.gratuity ?? 0), 0)

  const floatNum     = parseFloat(openingFloat) || 0
  const totalCounted = qtys.reduce((s, q, i) => s + q * JMD_DENOMS[i].value, 0)
  const expectedCash = floatNum + cashSales
  const variance     = totalCounted - expectedCash

  const varColor = variance === 0 ? 'var(--grn)' : variance > 0 ? 'var(--blue)' : '#ef4444'
  const varLabel = variance === 0 ? 'BALANCED ✓'
    : variance > 0 ? ('OVER +' + fmt(variance))
    : ('SHORT -' + fmt(Math.abs(variance)))

  const buildReportData = (): ZReportData => ({
    date: new Date().toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }),
    closedBy: (state as any).currentUser?.name ?? (state as any).currentShift?.userName ?? 'Manager',
    openingFloat: floatNum,
    restaurantSales: resSales, barSales, carwashSales: cwSales, totalSales,
    cashSales, cardSales, giftCardSales, tabSales, otherSales: 0,
    totalDiscounts, totalVoids, totalRefunds,
    voidCount: voidedTxs.length, refundCount: refundTxs.length,
    totalGCT, totalServiceCharge, totalGratuity,
    restaurantCount: resTxs.length, barCount: barTxs.length, carwashCount: cwTxs.length,
    totalCount: validTxs.length,
    expectedCash, actualCash: totalCounted, variance,
    denominations: JMD_DENOMS.map((d, i) => ({ label: d.label, qty: qtys[i], value: qtys[i] * d.value })),
    gctRegNo: (state.biz as any).gctRegNo,
    trn:      (state.biz as any).trn,
    sym,
  })

  const handlePrint = async () => {
    setPrinting(true)
    try {
      const html = buildZReport(buildReportData(), { width: 80 })
      const printerName = (state.biz as any).printerName as string | undefined
      await smartPrint(html, 'Z-Report', printerName, 80 as PrintWidth, false)
    } finally {
      setPrinting(false)
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: '#00000088', zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }
  const modal: React.CSSProperties = {
    background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)',
    width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px #0008',
  }
  const hdr: React.CSSProperties = {
    padding: '16px 20px', borderBottom: '1px solid var(--bdr)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }
  const body: React.CSSProperties = { padding: '20px' }
  const ftr: React.CSSProperties = {
    padding: '14px 20px', borderTop: '1px solid var(--bdr)',
    display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap',
  }
  const btnPrimary: React.CSSProperties = {
    background: 'var(--grn)', color: '#fff', border: 'none', borderRadius: 'var(--r2)',
    padding: '12px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 44,
  }
  const btnSecondary: React.CSSProperties = {
    background: 'var(--bg3)', color: 'var(--txt)', border: '1px solid var(--bdr)',
    borderRadius: 'var(--r2)', padding: '12px 20px', fontWeight: 600, fontSize: 14,
    cursor: 'pointer', minHeight: 44,
  }
  const btnBlue: React.CSSProperties = { ...btnSecondary, color: 'var(--blue)', borderColor: 'var(--blue)' }
  const STEP_LABELS = ['Pre-Close Check', 'Count Cash', 'Review & Print', 'Day Complete']

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>

        <div style={hdr}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)' }}>📋 End of Day Wizard</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>Step {step} of 4 — {STEP_LABELS[step - 1]}</div>
          </div>
          <button onClick={onClose} style={{ ...btnSecondary, padding: '8px 14px', fontSize: 18, minHeight: 44 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '10px 20px', background: 'var(--bg3)', borderBottom: '1px solid var(--bdr)' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', margin: '0 auto 4px',
                background: i + 1 < step ? 'var(--grn)' : i + 1 === step ? 'var(--blue)' : 'var(--bdr)',
                color: i + 1 <= step ? '#fff' : 'var(--txt3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 12,
              }}>{i + 1 < step ? '✓' : i + 1}</div>
              <div style={{ fontSize: 9, color: i + 1 === step ? 'var(--blue)' : 'var(--txt3)', fontWeight: i + 1 === step ? 700 : 400 }}>{label}</div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <div style={body}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 14 }}>Pre-Close Audit</div>
              {openHeldOrders.length > 0 && (
                <div style={{ background: '#7f1d1d22', border: '2px solid #ef4444', borderRadius: 'var(--r2)', padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>⚠️ {openHeldOrders.length} Open Held Order{openHeldOrders.length !== 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 6 }}>These tables are still open. Closing the day with open orders may cause revenue gaps.</div>
                  {openHeldOrders.slice(0, 5).map((o: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>• {o.label ?? ('Order ' + (i + 1))} — {o.cart?.length ?? 0} item(s)</div>
                  ))}
                  {openHeldOrders.length > 5 && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>...and {openHeldOrders.length - 5} more</div>}
                </div>
              )}
              {pendingTickets.length > 0 && (
                <div style={{ background: '#78350f22', border: '2px solid var(--ora)', borderRadius: 'var(--r2)', padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: 'var(--ora)', marginBottom: 4 }}>🍳 {pendingTickets.length} Kitchen Ticket{pendingTickets.length !== 1 ? 's' : ''} Still Pending</div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Some orders have not been marked as served in the kitchen display.</div>
                </div>
              )}
              {openHeldOrders.length === 0 && pendingTickets.length === 0 && (
                <div style={{ background: '#14532d22', border: '1.5px solid var(--grn)', borderRadius: 'var(--r2)', padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: 'var(--grn)' }}>✓ All Clear — No Open Orders</div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 4 }}>All tables are closed and no kitchen tickets are pending.</div>
                </div>
              )}
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 10 }}>Today&apos;s Snapshot</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Total Sales',   val: fmt(totalSales),         color: 'var(--grn)' },
                    { label: 'Transactions',  val: String(validTxs.length), color: 'var(--blue)' },
                    { label: 'Voids',         val: String(voidedTxs.length),color: voidedTxs.length > 0 ? '#ef4444' : 'var(--txt3)' },
                    { label: 'GCT',           val: fmt(totalGCT),           color: 'var(--pur)' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>{val}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={ftr}>
              <button onClick={onClose} style={btnSecondary}>Go Back</button>
              <button onClick={() => setStep(2)} style={btnPrimary}>
                {openHeldOrders.length > 0 ? 'Acknowledge & Continue →' : 'Start Cash Count →'}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={body}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>Count Your Cash Drawer</div>
              <div style={{ fontSize: 12, color: 'var(--ora)', fontWeight: 600, marginBottom: 14, padding: '8px 12px', background: '#78350f22', borderRadius: 'var(--r2)', border: '1px solid var(--ora)' }}>
                🔒 Count independently — do not check system totals until Step 3
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px', gap: '4px 8px', marginBottom: 4 }}>
                {['Denomination', 'Qty', 'Value'].map(h => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', padding: '0 0 4px' }}>{h}</div>
                ))}
              </div>
              {JMD_DENOMS.map((denom, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px', gap: '4px 8px', marginBottom: 6, alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{denom.label}</div>
                  <input
                    type="number" min={0} step={1}
                    value={qtys[i] === 0 ? '' : qtys[i]}
                    onChange={e => { const v = [...qtys]; v[i] = parseInt(e.target.value) || 0; setQtys(v) }}
                    placeholder="0"
                    style={{
                      padding: '8px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 700, minHeight: 44,
                      border: ('1.5px solid ' + (qtys[i] > 0 ? 'var(--blue)' : 'var(--bdr)')),
                      background: 'var(--bg3)', color: 'var(--txt)', textAlign: 'center',
                    }}
                  />
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt2)', textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {qtys[i] > 0 ? fmt(qtys[i] * denom.value) : '—'}
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '2px solid var(--bdr)', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>TOTAL COUNTED</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--grn)', fontFamily: 'var(--mono)' }}>{fmt(totalCounted)}</div>
              </div>
            </div>
            <div style={ftr}>
              <button onClick={() => setStep(1)} style={btnSecondary}>← Back</button>
              <button onClick={() => setStep(3)} style={btnPrimary}>Submit Count →</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={body}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 12 }}>Day Summary &amp; Variance</div>
              <div style={{
                background: variance === 0 ? '#14532d22' : variance > 0 ? '#1e3a5f22' : '#7f1d1d22',
                border: ('2px solid ' + varColor), borderRadius: 'var(--r3)',
                padding: '16px 20px', marginBottom: 14, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 8 }}>Cash Variance</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: varColor, fontFamily: 'var(--mono)', marginBottom: 10 }}>{varLabel}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 2 }}>Expected in Drawer</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', fontFamily: 'var(--mono)' }}>{fmt(expectedCash)}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>Float + Cash Sales</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 2 }}>Actual Counted</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: varColor, fontFamily: 'var(--mono)' }}>{fmt(totalCounted)}</div>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 6 }}>Opening Float (cash in drawer at start of day)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--txt3)', fontSize: 13 }}>{sym}</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={openingFloat}
                    onChange={e => setOpeningFloat(e.target.value)}
                    placeholder="0.00"
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 'var(--r2)', fontSize: 14, fontWeight: 700, minHeight: 44,
                      border: ('1.5px solid ' + (openingFloat ? 'var(--blue)' : 'var(--bdr)')),
                      background: 'var(--bg3)', color: 'var(--txt)',
                    }}
                  />
                </div>
              </div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 8 }}>Sales by Module</div>
                {resTxs.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--txt2)' }}>🍽️ Restaurant ({resTxs.length} tx)</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{fmt(resSales)}</span>
                  </div>
                )}
                {barTxs.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--txt2)' }}>🍺 Bar ({barTxs.length} tx)</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--pur)' }}>{fmt(barSales)}</span>
                  </div>
                )}
                {cwTxs.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--txt2)' }}>🚗 Car Wash ({cwTxs.length} tx)</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{fmt(cwSales)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--bdr)', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Total ({validTxs.length} tx)</span>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--grn)' }}>{fmt(totalSales)}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 8 }}>By Payment</div>
                  {cashSales > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12 }}>💵 Cash</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(cashSales)}</span></div>}
                  {cardSales > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12 }}>💳 Card</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(cardSales)}</span></div>}
                  {giftCardSales > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12 }}>🎁 Gift Card</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(giftCardSales)}</span></div>}
                  {tabSales > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12 }}>📋 Tab</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(tabSales)}</span></div>}
                  {cashSales === 0 && cardSales === 0 && giftCardSales === 0 && tabSales === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No transactions today</div>
                  )}
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 8 }}>Tax &amp; Adjustments</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12 }}>GCT (15%)</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(totalGCT)}</span></div>
                  {totalServiceCharge > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12 }}>Svc Charge</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(totalServiceCharge)}</span></div>}
                  {totalGratuity > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12 }}>Gratuity</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(totalGratuity)}</span></div>}
                  {totalDiscounts > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 12, color: '#ef4444' }}>Discounts</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: '#ef4444' }}>-{fmt(totalDiscounts)}</span></div>}
                  {voidedTxs.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: '#ef4444' }}>Voids ({voidedTxs.length})</span><span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', color: '#ef4444' }}>-{fmt(totalVoids)}</span></div>}
                </div>
              </div>
            </div>
            <div style={ftr}>
              <button onClick={() => setStep(2)} style={btnSecondary}>← Back</button>
              <button onClick={handlePrint} disabled={printing} style={btnBlue}>{printing ? 'Printing...' : '🖨️ Print Z-Report'}</button>
              <button onClick={() => setStep(4)} style={btnPrimary}>Close Day →</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ ...body, textAlign: 'center', padding: '32px 20px' }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--grn)', marginBottom: 8 }}>End of Day Complete</div>
              <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 20 }}>
                {new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{
                display: 'inline-block', borderRadius: 'var(--r3)', padding: '12px 28px', marginBottom: 20,
                background: variance === 0 ? '#14532d22' : variance > 0 ? '#1e3a5f22' : '#7f1d1d22',
                border: ('2px solid ' + varColor),
              }}>
                <div style={{ fontSize: 11, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 4 }}>Final Variance</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: varColor, fontFamily: 'var(--mono)' }}>{varLabel}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, maxWidth: 400, margin: '0 auto 10px' }}>
                {[
                  { label: 'Restaurant', val: fmt(resSales), color: 'var(--grn)' },
                  { label: 'Bar',        val: fmt(barSales), color: 'var(--pur)' },
                  { label: 'Car Wash',   val: fmt(cwSales),  color: 'var(--blue)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px 8px' }}>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'var(--mono)' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px', maxWidth: 400, margin: '0 auto' }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', marginBottom: 4 }}>Total Day Sales</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--grn)', fontFamily: 'var(--mono)' }}>{fmt(totalSales)}</div>
              </div>
            </div>
            <div style={ftr}>
              <button onClick={handlePrint} disabled={printing} style={btnBlue}>{printing ? 'Printing...' : '🖨️ Print Another Copy'}</button>
              <button onClick={onClose} style={btnPrimary}>Done ✓</button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
