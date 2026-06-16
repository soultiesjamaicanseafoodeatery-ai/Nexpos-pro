'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { OrderType } from '@/types'
import ServiceSelect from './workflow/ServiceSelect'
import DineInDashboard from './workflow/DineInDashboard'
import TakeoutDashboard from './workflow/TakeoutDashboard'
import DeliveryDashboard from './workflow/DeliveryDashboard'
import POSPage from './POSPage'

type FlowStep = 'service' | 'dine-in' | 'takeout' | 'delivery' | 'order'

export default function POSFlow() {
  const { dispatch } = useApp()
  const [step, setStep] = useState<FlowStep>('service')
  const [prevStep, setPrevStep] = useState<FlowStep>('service')

  const goToOrder = (orderType: OrderType, table?: string) => {
    dispatch({ type: 'SET_CART_ORDER_TYPE', orderType })
    if (table) {
      dispatch({ type: 'SET_POS_STATE', mod: 'restaurant', patch: { selTable: table } })
    }
    setPrevStep(step)
    setStep('order')
  }

  const goBack = () => setStep(prevStep)

  const handlePaymentComplete = () => {
    // After payment + receipt modal closed, return to appropriate dashboard
    setStep(prevStep)
  }

  if (step === 'service') {
    return (
      <ServiceSelect
        onSelect={type => {
          if (type === 'dine-in')  setStep('dine-in')
          if (type === 'takeout')  setStep('takeout')
          if (type === 'delivery') setStep('delivery')
        }}
      />
    )
  }

  if (step === 'dine-in') {
    return (
      <DineInDashboard
        onBack={() => setStep('service')}
        onTableSelect={table => goToOrder('dine-in', table)}
        onNewTable={() => goToOrder('dine-in')}
      />
    )
  }

  if (step === 'takeout') {
    return (
      <TakeoutDashboard
        onBack={() => setStep('service')}
        onNewOrder={() => goToOrder('takeout')}
        onOpenOrder={() => goToOrder('takeout')}
      />
    )
  }

  if (step === 'delivery') {
    return (
      <DeliveryDashboard
        onBack={() => setStep('service')}
        onNewOrder={() => goToOrder('delivery')}
        onOpenOrder={() => goToOrder('delivery')}
      />
    )
  }

  // step === 'order'
  return (
    <POSPage
      onBack={goBack}
      onPaymentComplete={handlePaymentComplete}
    />
  )
}
