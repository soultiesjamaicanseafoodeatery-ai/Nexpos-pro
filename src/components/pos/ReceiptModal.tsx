'use client'
import type { Transaction, BusinessConfig } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  tx: Transaction
  biz: BusinessConfig
}

function buildReceiptHTML(tx: Transaction, biz: BusinessConfig): string {
  const sym = biz.currencySymbol ?? 'J$'
  const fmtN = (n: number) => sym + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const hr = '<div style="border-top:1px dashed #ccc;margin:10px 0"></div>'

  const itemRows = tx.items?.map(ci => {
    const lineTotal = (ci.price + ci.addons.reduce((s, a) => s + a.price, 0)) * ci.qty
    const addons = ci.addons.map(a => `<div style="display:flex;justify-content:space-between;padding-left:12px;color:#666"><span>+ ${a.name}</span><span>${fmtN(a.price)}</span></div>`).join('')
    const extras = [
      ci.flavour ? `<div style="padding-left:12px;color:#666">Flavour: ${ci.flavour}</div>` : '',
      ci.size    ? `<div style="padding-left:12px;color:#666">Size: ${ci.size}</div>` : '',
      ci.sides?.length ? `<div style="padding-left:12px;color:#666">Sides: ${ci.sides.join(', ')}</div>` : '',
    ].join('')
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between">
        <span>${ci.qty > 1 ? `${ci.qty}x ` : ''}${ci.name}</span><span>${fmtN(lineTotal)}</span>
      </div>${addons}${extras}
    </div>`
  }).join('') ?? `<div>${tx.item}</div>`

  const payMethod = tx.pay === 'gift_card' ? 'Gift Card' : tx.pay === 'tab' ? 'House Account' : tx.pay
  const splitRows = tx.payments?.map(p =>
    `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="text-transform:capitalize">${p.method}</span><span>${fmtN(p.amount)}</span></div>`
  ).join('') ?? ''

  return `
    <div style="font-family:monospace;font-size:12px;max-width:320px;margin:0 auto;padding:20px">
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:16px;font-weight:bold">${biz.name}</div>
        ${biz.address ? `<div style="color:#666">${biz.address}</div>` : ''}
        ${biz.phone   ? `<div style="color:#666">${biz.phone}</div>` : ''}
        ${biz.gctRegNo ? `<div style="color:#666">GCT Reg: ${biz.gctRegNo}</div>` : ''}
        ${biz.trn ? `<div style="color:#666">TRN: ${biz.trn}</div>` : ''}
      </div>
      ${hr}
      <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Date/Time</span><span>${tx.ts}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Server</span><span>${tx.cashier}</span></div>
      ${tx.tableNum || tx.customer ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Table/Ref</span><span>${tx.tableNum ?? tx.customer}</span></div>` : ''}
      ${tx.customerName ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Customer</span><span>${tx.customerName}</span></div>` : ''}
      ${tx.orderType ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Order</span><span style="text-transform:capitalize">${tx.orderType}</span></div>` : ''}
      ${tx.guestCount && tx.guestCount > 1 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Guests</span><span>${tx.guestCount}</span></div>` : ''}
      ${hr}
      ${itemRows}
      ${hr}
      <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Subtotal</span><span>${fmtN(tx.sub)}</span></div>
      ${tx.disc > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Discount</span><span>-${fmtN(tx.disc)}</span></div>` : ''}
      ${(tx.gct ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>GCT</span><span>${fmtN(tx.gct!)}</span></div>` : ''}
      ${(tx.serviceCharge ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Service Charge</span><span>${fmtN(tx.serviceCharge!)}</span></div>` : ''}
      ${(tx.gratuity ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Gratuity (${tx.gratuityPct}%)</span><span>${fmtN(tx.gratuity!)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px;margin-top:8px;padding-top:8px;border-top:1px dashed #ccc">
        <span>TOTAL</span><span>${fmtN(tx.total)}</span>
      </div>
      ${hr}
      <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Payment</span><span style="text-transform:capitalize">${payMethod}</span></div>
      ${splitRows}
      ${tx.tender != null ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>Tendered</span><span>${fmtN(tx.tender)}</span></div>` : ''}
      ${tx.changeDue != null ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;font-weight:bold"><span>Change</span><span>${fmtN(tx.changeDue)}</span></div>` : ''}
      ${hr}
      <div style="text-align:center;color:#666;font-size:11px;margin-top:12px">
        ${biz.footer?.message ?? 'Thank you for dining with us!'}
      </div>
      ${biz.footer?.social?.instagram ? `<div style="text-align:center;color:#666;font-size:10px;margin-top:4px">@${biz.footer.social.instagram}</div>` : ''}
    </div>
  `
}

export default function ReceiptModal({ isOpen, onClose, tx, biz }: Props) {
  if (!isOpen) return null

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=380,height=650')
    if (!win) return
    const html = buildReceiptHTML(tx, biz)
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt #${tx.id}</title><style>body{margin:0;padding:0}@media print{body{width:80mm}}</style></head><body>${html}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script></body></html>`)
    win.document.close()
  }

  const html = buildReceiptHTML(tx, biz)
  const sym  = biz.currencySymbol ?? 'J$'
  const fmtN = (n: number) => sym + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>Receipt</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>#{tx.id} · {fmtN(tx.total)}</div>
          </div>
          <button onClick={handlePrint} style={{ padding: '9px 16px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Print
          </button>
          <button onClick={onClose} style={{ padding: '9px 14px', background: 'transparent', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--txt3)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Close
          </button>
        </div>

        {/* Receipt preview */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--surf)' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--r3)', padding: 4, boxShadow: '0 2px 12px rgba(0,0,0,.15)' }}
            dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  )
}
