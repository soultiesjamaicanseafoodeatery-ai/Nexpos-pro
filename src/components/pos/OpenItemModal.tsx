'use client'
import React, { useRef, useEffect, useState } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onAdd: (description: string, price: number) => void
  currencySymbol?: string
}

export default function OpenItemModal({ isOpen, onClose, onAdd, currencySymbol = 'J$' }: Props) {
  const [desc,  setDesc]  = useState('')
  const [price, setPrice] = useState('')
  const descRef  = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setDesc('')
      setPrice('')
      setTimeout(() => descRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  const priceNum = parseFloat(price)
  const valid = desc.trim().length > 0 && !isNaN(priceNum) && priceNum > 0

  const handleAdd = () => {
    if (!valid) return
    onAdd(desc.trim(), priceNum)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', zIndex:900,
        display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:'var(--bg2)', border:'1px solid var(--bdr)', borderRadius:'var(--r4)',
          width:'100%', maxWidth:360, overflow:'hidden', boxShadow:'0 32px 80px rgba(0,0,0,.7)' }}
      >
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--bdr)',
          display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:'var(--r2)', background:'var(--ora)22',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>✚</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--txt)' }}>Open Item</div>
            <div style={{ fontSize:11, color:'var(--txt3)' }}>Non-menu sale</div>
          </div>
          <button onClick={onClose}
            style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--txt3)',
              cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding:'20px' }}>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt3)',
              textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>
              Description *
            </label>
            <input
              ref={descRef}
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') priceRef.current?.focus() }}
              placeholder="e.g. Extra sauce, Special order…"
              style={{ width:'100%', padding:'10px 12px', borderRadius:'var(--r2)',
                background:'var(--surf)', border:'1.5px solid var(--bdr)',
                color:'var(--txt)', fontSize:14, outline:'none', boxSizing:'border-box' }}
            />
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt3)',
              textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6 }}>
              Price ({currencySymbol}) *
            </label>
            <input
              ref={priceRef}
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && valid) handleAdd() }}
              placeholder="0.00"
              style={{ width:'100%', padding:'10px 12px', borderRadius:'var(--r2)',
                background:'var(--surf)', border:'1.5px solid var(--bdr)',
                color:'var(--txt)', fontSize:16, fontFamily:'var(--mono)',
                outline:'none', boxSizing:'border-box' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--bdr)',
          display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'9px 18px', borderRadius:'var(--r2)', fontSize:13, fontWeight:700,
              background:'transparent', color:'var(--txt3)', border:'1.5px solid var(--bdr)',
              cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAdd} disabled={!valid}
            style={{ padding:'9px 22px', borderRadius:'var(--r2)', fontSize:13, fontWeight:800,
              background: valid ? 'var(--ora)' : 'var(--surf3)',
              color: valid ? '#fff' : 'var(--txt3)',
              border:'none', cursor: valid ? 'pointer' : 'not-allowed', letterSpacing:'.2px' }}>
            ✚ Add to Order
          </button>
        </div>
      </div>
    </div>
  )
}
