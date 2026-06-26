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
  const [services, setServices] = useState<CwService[]>([])
  const [addons, setAddons] = useState<CwAddon[]>([])

  const reset = () => { setServices([]); setAddons([]); setStep('services') }

  if (step === 'payment' && services.length > 0) {
    return (
      <CarWashPayment
        services={services}
        addons={addons}
        onBack={() => setStep('services')}
        onComplete={reset}
      />
    )
  }

  return (
    <CarWashPackageSelect
      onSelect={(svcs, adds) => { setServices(svcs); setAddons(adds); setStep('payment') }}
    />
  )
}
