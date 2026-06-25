'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import ServiceSelect from './workflow/ServiceSelect'
import DineInDashboard from './workflow/DineInDashboard'
import TakeoutDashboard from './workflow/TakeoutDashboard'
import DeliveryDashboard from './workflow/DeliveryDashboard'
import POSPage, { type OrderContext } from './POSPage'

type FlowStep = 'service' | 'dine-in' | 'takeout' | 'delivery' | 'takeout-form' | 'delivery-form' | 'order'

export default function POSFlow() {
  const { dispatch } = useApp()
  const [step, setStep]             = useState<FlowStep>('service')
  const [prevStep, setPrevStep]     = useState<FlowStep>('service')
  const [orderContext, setOrderContext] = useState<OrderContext | null>(null)

  // Takeout form state
  const [tkName,  setTkName]  = useState('')
  const [tkPhone, setTkPhone] = useState('')

  // Delivery form state
  const [dlName,    setDlName]    = useState('')
  const [dlPhone,   setDlPhone]   = useState('')
  const [dlAddress, setDlAddress] = useState('')

  const goToOrder = (ctx: OrderContext, backTo?: FlowStep) => {
    dispatch({ type: 'SET_CART_ORDER_TYPE', orderType: ctx.orderType })
    if (ctx.table) {
      dispatch({ type: 'SET_POS_STATE', mod: 'restaurant', patch: { selTable: ctx.table } })
    }
    setOrderContext(ctx)
    setPrevStep(backTo ?? step)
    setStep('order')
  }

  const leaveOrder = () => {
    setStep(prevStep)
    setOrderContext(null)
  }

  if (step === 'service') return (
    <ServiceSelect onSelect={type => {
      if (type === 'dine-in')  setStep('dine-in')
      if (type === 'takeout')  setStep('takeout')
      if (type === 'delivery') setStep('delivery')
    }} />
  )

  if (step === 'dine-in') return (
    <DineInDashboard
      onBack={() => setStep('service')}
      onTableSelect={table => goToOrder({ orderType: 'dine-in', table })}
      onNewTable={() => goToOrder({ orderType: 'dine-in' })}
    />
  )

  if (step === 'takeout') return (
    <TakeoutDashboard
      onBack={() => setStep('service')}
      onNewOrder={() => {
        setTkName(''); setTkPhone('')
        setPrevStep('takeout'); setStep('takeout-form')
      }}
      onOpenOrder={() => { setPrevStep('takeout'); goToOrder({ orderType: 'takeout' }) }}
    />
  )

  if (step === 'delivery') return (
    <DeliveryDashboard
      onBack={() => setStep('service')}
      onNewOrder={() => {
        setDlName(''); setDlPhone(''); setDlAddress('')
        setPrevStep('delivery'); setStep('delivery-form')
      }}
      onOpenOrder={() => { setPrevStep('delivery'); goToOrder({ orderType: 'delivery' }) }}
    />
  )

  if (step === 'takeout-form') return (
    <OrderForm
      title="New Takeout Order"
      icon="🥡"
      accentColor="var(--grn)"
      fields={[
        { label: 'Customer Name', value: tkName, onChange: setTkName, placeholder: 'e.g. Maria Johnson', type: 'text' },
        { label: 'Phone Number',  value: tkPhone, onChange: setTkPhone, placeholder: '876-000-0000', type: 'tel' },
      ]}
      onBack={() => setStep('takeout')}
      onStart={() => goToOrder({
        orderType: 'takeout',
        customerName: tkName  || undefined,
        phone:        tkPhone || undefined,
      }, 'takeout')}
    />
  )

  if (step === 'delivery-form') return (
    <OrderForm
      title="New Delivery Order"
      icon="🚗"
      accentColor="var(--blue)"
      fields={[
        { label: 'Customer Name',     value: dlName,    onChange: setDlName,    placeholder: 'e.g. Maria Johnson',  type: 'text' },
        { label: 'Phone Number',      value: dlPhone,   onChange: setDlPhone,   placeholder: '876-000-0000',        type: 'tel'  },
        { label: 'Delivery Address',  value: dlAddress, onChange: setDlAddress, placeholder: '123 Main Street',     type: 'text' },
      ]}
      onBack={() => setStep('delivery')}
      onStart={() => goToOrder({
        orderType: 'delivery',
        customerName: dlName    || undefined,
        phone:        dlPhone   || undefined,
        address:      dlAddress || undefined,
      }, 'delivery')}
    />
  )

  // step === 'order'
  return (
    <POSPage
      orderContext={orderContext ?? undefined}
      onBack={leaveOrder}
      onPaymentComplete={leaveOrder}
    />
  )
}

// ── Shared order form ─────────────────────────────────────────────────────────

interface FieldDef {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type: string
}

function OrderForm({ title, icon, accentColor, fields, onBack, onStart }: {
  title: string
  icon: string
  accentColor: string
  fields: FieldDef[]
  onBack: () => void
  onStart: () => void
}) {
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onStart() }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '16px 24px', background: 'var(--bg2)',
        borderBottom: '1px solid var(--bdr)',
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          padding: '8px 16px', borderRadius: 'var(--r)',
          border: '1.5px solid var(--bdr)', background: 'var(--surf)',
          color: 'var(--txt2)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>← Back</button>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span>
          <span>{title}</span>
        </div>
      </div>

      {/* Centered form card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{
          width: '100%', maxWidth: 460,
          background: 'var(--bg2)', border: '1px solid var(--bdr)',
          borderRadius: 'var(--r4)', padding: '36px 40px',
          boxShadow: '0 8px 40px rgba(0,0,0,.18)',
        }}>
          {fields.map((f, i) => (
            <div key={f.label} style={{ marginBottom: i < fields.length - 1 ? 22 : 32 }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: 'var(--txt3)',
                textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7,
              }}>{f.label}</div>
              <input
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
                onKeyDown={handleKey}
                placeholder={f.placeholder}
                type={f.type}
                autoFocus={i === 0}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 'var(--r)',
                  border: '1.5px solid var(--bdr)', background: 'var(--surf)',
                  color: 'var(--txt)', fontSize: 16, fontWeight: 600,
                  boxSizing: 'border-box', outline: 'none',
                  transition: 'border-color .12s',
                }}
                onFocus={e => { e.target.style.borderColor = accentColor }}
                onBlur={e =>  { e.target.style.borderColor = 'var(--bdr)' }}
              />
            </div>
          ))}

          <button
            onClick={onStart}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 'var(--r)',
              background: accentColor, color: '#fff', border: 'none',
              fontSize: 16, fontWeight: 900, cursor: 'pointer', letterSpacing: '.3px',
              transition: 'opacity .12s',
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.opacity = '.88' }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.opacity = '1' }}
          >
            Start Order →
          </button>

          <button onClick={onBack} style={{
            width: '100%', padding: '12px 0', marginTop: 10, borderRadius: 'var(--r)',
            background: 'transparent', color: 'var(--txt3)',
            border: '1.5px solid var(--bdr)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>

    </div>
  )
}
