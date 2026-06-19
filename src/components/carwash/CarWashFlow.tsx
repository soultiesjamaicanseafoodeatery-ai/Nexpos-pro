'use client'

import { useState } from 'react'
import CarWashPackageSelect from './CarWashPackageSelect'
import CarWashPayment from './CarWashPayment'

export interface CwService {
  id: string; name: string; description: string; price: number; vehicle_type: string; is_available: boolean
}
export interface CwAddon {
  id: string; name: string; description: string; price: number; is_available: boolean
}

export default function CarWashFlow() {
  const [step, setStep] = useState<'services' | 'payment'>('services')
  const [service, setService] = useState<CwService | null>(null)
  const [addons, setAddons] = useState<CwAddon[]>([])

  const reset = () => { setService(null); setAddons([]); setStep('services') }

  if (step === 'payment' && service) {
    return (
      <CarWashPayment
        service={service}
        addons={addons}
        onBack={() => setStep('services')}
        onComplete={reset}
      />
    )
  }

  return (
    <CarWashPackageSelect
      onSelect={(svc, adds) => { setService(svc); setAddons(adds); setStep('payment') }}
    />
  )
}
