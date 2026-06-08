'use client'

import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'

const MOD_COLOR: Record<string, string> = { restaurant: 'var(--ora)', bar: 'var(--pur)', carwash: 'var(--blue)' }
const MOD_ICON: Record<string, string>  = { restaurant: '🍽️', bar: '🍺', carwash: '🚗' }

export default function TransactionsPage() {
  const { state, dispatch, toast } = useApp()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const txs = state.transactions
    .filter(t => {
      if (filter !== 'all' && t.mod !== filter) return false
      if (search) {
        const q = search.toLowerCase()
        return t.item.toLowerCase().includes(q) || t.cashier.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q)
      }
      return true
    })

  const totalRev = txs.filter(t => !t.voided).reduce((s, t) => s + t.total, 0)
  const sym = state.biz.currencySymbol ?? 'J$'

  const voidTx = (id: number) => {
    const reason = prompt('Void reason:')
    if (!reason) return
    dispatch({ type: 'VOID_TRANSACTION', id, reason })
    toast('Transaction voided', 'warn')
  }

  return (
    <div className="adm" style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 15 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Transactions</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>{txs.length} records · {sym}{totalRev.toFixed(2)} total</div>
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
          <table className="dt">
            <thead>
              <tr>
                <th>ID</th><th>Time</th><th>Module</th><th>Cashier</th>
                <th>Customer</th><th>Item</th><th>Total</th><th>Payment</th><th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {txs.map(tx => (
                <tr key={tx.id} style={{ opacity: tx.voided ? .5 : 1 }}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt3)' }}>#{tx.id}</td>
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
                    {tx.voided
                      ? <span className="b b-rd">VOIDED</span>
                      : <span className="b b-gn">Complete</span>
                    }
                  </td>
                  <td>
                    {!tx.voided && (state.currentUser?.role === 'admin' || state.currentUser?.role === 'manager') && (
                      <button className="btn btn-xs btn-gh" onClick={() => voidTx(tx.id)}>Void</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {txs.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No transactions found</div>
          )}
        </div>
      </div>
    </div>
  )
}
