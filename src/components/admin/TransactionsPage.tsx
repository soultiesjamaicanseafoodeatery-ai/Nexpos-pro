'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { supabase } from '@/lib/supabase'
import type { Transaction, VoidReason, VoidLog, RefundLog } from '@/types'
import { buildCustomerReceipt, smartPrint } from '@/lib/utils/ticketPrinter'
import VoidReasonModal from '@/components/pos/VoidReasonModal'
import RefundModal from '@/components/pos/RefundModal'

const MOD_COLOR: Record<string, string> = { restaurant: 'var(--ora)', bar: 'var(--pur)', carwash: 'var(--blue)' }
const MOD_ICON: Record<string, string>  = { restaurant: '🍽️', bar: '🍺', carwash: '🚗' }
const PAGE_SIZE = 50

export default function TransactionsPage() {
  const { state, dispatch, toast, audit } = useApp()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [voidingTxId,   setVoidingTxId]   = useState<number | null>(null)
  const [refundingTxId, setRefundingTxId] = useState<number | null>(null)
  const [txList,  setTxList]  = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTxs = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('data')
        .order('id', { ascending: false })
        .limit(50000)
      if (error) throw error
      const txs = ((data ?? []) as { data: Transaction }[]).map(r => r.data).sort((a, b) => b.id - a.id)
      console.log(
        '[NexPOS:TransactionsPage] source=Supabase',
        '| count=' + txs.length,
        '| latest=' + (txs[0]?.ts ?? 'none'),
        '| query=SELECT data FROM transactions ORDER BY created_at DESC LIMIT 50000',
      )
      setTxList(txs)
    } catch (err) {
      console.error('[NexPOS:TransactionsPage] Supabase fetch failed:', err)
      // Keep existing list on transient error so the page doesn't go blank
      setTxList(prev => prev)
    } finally {
      setLoading(false)
    }
  }, [])

  // Always fetch from Supabase on mount — never read from localStorage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTxs() }, [])

  const filtered = txList.filter(t => {
    if (filter !== 'all' && t.mod !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return t.item.toLowerCase().includes(q) || t.cashier.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q)
    }
    return true
  })

  useEffect(() => { setPage(1) }, [search, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const txs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalRev = filtered.filter(t => !t.voided).reduce((s, t) => s + t.total, 0)
  const sym = state.biz.currencySymbol ?? 'J$'
  const currentUser = state.currentUser

  const voidingTx   = voidingTxId   !== null ? txList.find(t => t.id === voidingTxId)   ?? null : null
  const refundingTx = refundingTxId !== null ? txList.find(t => t.id === refundingTxId) ?? null : null

  const handleRefund = (refundType: 'full' | 'partial', amount: number, reason: string) => {
    if (!refundingTx || !currentUser) return
    const nowStr = new Date().toLocaleString()
    dispatch({ type: 'REFUND_TRANSACTION', id: refundingTx.id, reason, refundType, amount, by: currentUser.name, at: nowStr })
    const logEntry: RefundLog = {
      id: crypto.randomUUID(), ts: nowStr,
      txId: refundingTx.id, user: currentUser.name, userId: currentUser.id, role: currentUser.role,
      reason, refundType, amount, mod: refundingTx.mod as RefundLog['mod'],
    }
    dispatch({ type: 'ADD_REFUND_LOG', entry: logEntry })
    audit('REFUND', `Tx #${refundingTx.id} refunded ${refundType} ${sym}${amount.toFixed(2)} — ${reason}`, 'warn')
    setRefundingTxId(null)
    // Re-fetch from Supabase so the updated record is reflected immediately
    setTimeout(fetchTxs, 800)
  }

  const handleVoidTx = (reason: VoidReason, reasonText: string) => {
    if (!voidingTx || !currentUser) return
    const nowStr = new Date().toLocaleString()
    dispatch({ type: 'VOID_TRANSACTION', id: voidingTx.id, reason: reasonText })
    const logEntry: VoidLog = {
      id: crypto.randomUUID(), ts: nowStr,
      user: currentUser.name, userId: currentUser.id, role: currentUser.role,
      voidType: 'transaction', txId: voidingTx.id,
      itemName: voidingTx.item,
      reason, reasonText,
      amount: voidingTx.total,
      mod: voidingTx.mod as VoidLog['mod'],
    }
    dispatch({ type: 'ADD_VOID_LOG', entry: logEntry })
    audit('VOID_TRANSACTION', `Transaction #${voidingTx.id} voided — ${reasonText}`, 'warn')
    toast('Transaction voided', 'warn')
    setVoidingTxId(null)
    // Re-fetch from Supabase so the updated record is reflected immediately
    setTimeout(fetchTxs, 800)
  }

  const handleReprint = async (tx: Parameters<typeof buildCustomerReceipt>[0]) => {
    const html = buildCustomerReceipt(tx, state.biz, { width: 80 })
    await smartPrint(html, 'Receipt Reprint', (state.biz as any).printerName, 80 as any, false)
  }

  const exportCSV = () => {
    const headers = ['Order #', 'Date/Time', 'Module', 'Cashier', 'Customer', 'Items', 'Subtotal', 'Discount', 'GCT', 'Total', 'Payment', 'Voided']
    const rows = filtered.map(tx => [
      tx.orderNum ?? String(tx.id ?? ''),
      tx.ts ?? '',
      tx.mod ?? '',
      tx.cashier ?? '',
      tx.customer ?? '',
      tx.item ?? '',
      (tx.sub ?? 0).toFixed(2),
      (tx.disc ?? 0).toFixed(2),
      (tx.gct ?? 0).toFixed(2),
      (tx.total ?? 0).toFixed(2),
      tx.pay ?? '',
      tx.voided ? 'Yes' : 'No',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="adm" style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 15 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Transactions</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {loading
              ? 'Loading from database…'
              : `${filtered.length} records · ${sym}${totalRev.toFixed(2)} total · source: Supabase`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchTxs} disabled={loading}
            style={{ background: 'var(--bg3)', color: 'var(--txt2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer', minHeight: 44, opacity: loading ? .5 : 1 }}>
            🔄 Refresh
          </button>
          <button onClick={exportCSV}
            style={{ background: 'var(--bg3)', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 'var(--r2)', padding: '8px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer', minHeight: 44 }}>
            ⬇️ Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden', marginBottom: 13 }}>
        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions..."
            style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '6px 10px', fontSize: 12, color: 'var(--txt)', width: 190 }} />
          {['all','restaurant','bar','carwash'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? 'btn-pr' : 'btn-gh'}`}>
              {f === 'all' ? 'All' : `${MOD_ICON[f]} ${f.charAt(0).toUpperCase()+f.slice(1)}`}
            </button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
              Loading transactions from database…
            </div>
          ) : (
            <table className="dt">
              <thead>
                <tr>
                  <th>Order #</th><th>Time</th><th>Module</th><th>Cashier</th>
                  <th>Customer</th><th>Item</th><th>Total</th><th>Payment</th><th>Status</th>
                  <th>Print</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {txs.map(tx => (
                  <tr key={tx.id} style={{ opacity: tx.voided ? .5 : 1 }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt3)' }}>{tx.orderNum ? `#${tx.orderNum}` : `#${String(tx.id).slice(-6)}`}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{tx.ts}</td>
                    <td>
                      <span style={{ color: MOD_COLOR[tx.mod], fontWeight: 700 }}>
                        {MOD_ICON[tx.mod]} {tx.mod.charAt(0).toUpperCase()+tx.mod.slice(1)}
                      </span>
                    </td>
                    <td>{tx.cashier}</td>
                    <td>{tx.customer}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.item}
                      {tx.addons?.length > 0 && <span style={{ color: 'var(--txt3)', fontSize: 11 }}> + {tx.addons.join(', ')}</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--grn)' }}>{sym}{tx.total.toFixed(2)}</td>
                    <td>
                      <span className="b b-bl">{tx.pay}</span>
                    </td>
                    <td>
                      {tx.voided    ? <span className="b b-rd">VOIDED</span>
                      : tx.refunded ? <span className="b b-bl">REFUNDED</span>
                      :               <span className="b b-gn">Complete</span>}
                    </td>
                    <td style={{ padding: '6px 8px', verticalAlign: 'middle' }}>
                      <button onClick={() => handleReprint(tx)} title="Reprint receipt"
                        style={{ background: 'none', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '4px 8px', cursor: 'pointer', fontSize: 14, color: 'var(--txt3)', minHeight: 32, lineHeight: 1 }}>🖨️</button>
                    </td>
                    <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {!tx.voided && !tx.refunded && (state.currentUser?.role === 'admin' || state.currentUser?.role === 'manager') && (
                        <>
                          <button className="btn btn-xs btn-gh" onClick={() => setVoidingTxId(tx.id)} style={{ color: '#ef4444', borderColor: '#ef444444' }}>Void</button>
                          <button className="btn btn-xs btn-gh" onClick={() => setRefundingTxId(tx.id)} style={{ color: 'var(--blue)', borderColor: 'var(--blue)44' }}>Refund</button>
                        </>
                      )}
                      {tx.voided    && tx.voidReason   && <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{tx.voidReason}</span>}
                      {tx.refunded  && tx.refundReason  && <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{tx.refundReason} ({sym}{(tx.refundAmount ?? tx.total).toFixed(2)})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No transactions found</div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--bdr)', fontSize: 12, color: 'var(--txt2)' }}>
            <button className="btn btn-sm btn-gh" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span>Page <strong>{page}</strong> of <strong>{totalPages}</strong> &nbsp;·&nbsp; {filtered.length} transactions</span>
            <button className="btn btn-sm btn-gh" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      <VoidReasonModal
        isOpen={!!voidingTx}
        itemName={voidingTx ? `Transaction #${voidingTx.id} — ${voidingTx.item}` : ''}
        onConfirm={handleVoidTx}
        onClose={() => setVoidingTxId(null)}
      />
      <RefundModal
        isOpen={!!refundingTx}
        tx={refundingTx}
        sym={sym}
        onConfirm={handleRefund}
        onClose={() => setRefundingTxId(null)}
      />
    </div>
  )
}
