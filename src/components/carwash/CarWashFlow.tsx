'use client'

import { useState } from 'react'
import CarWashDashboard from './CarWashDashboard'
import CarWashPackageSelect from './CarWashPackageSelect'
import CarWashVehicleInfo from './CarWashVehicleInfo'
import CarWashPayment from './CarWashPayment'

export interface CwService {
  id: string; name: string; description: string; price: number; vehicle_type: string; is_available: boolean
}
export interface CwAddon {
  id: string; name: string; description: string; price: number; is_available: boolean
}
export interface CwVehicle {
  plate: string; customerName: string; phone: string; vehicleType: string; notes: string
}

type CWStep = 'dashboard' | 'package' | 'vehicle' | 'payment'

export default function CarWashFlow() {
  const [step, setStep] = useState<CWStep>('dashboard')
  const [service, setService] = useState<CwService | null>(null)
  const [addons, setAddons] = useState<CwAddon[]>([])
  const [vehicle, setVehicle] = useState<CwVehicle>({
    plate: '', customerName: '', phone: '', vehicleType: 'Car', notes: ''
  })

  const reset = () => {
    setService(null)
    setAddons([])
    setVehicle({ plate: '', customerName: '', phone: '', vehicleType: 'Car', notes: '' })
    setStep('dashboard')
  }

  switch (step) {
    case 'dashboard':
      return <CarWashDashboard onNewWash={() => setStep('package')} />
    case 'package':
      return (
        <CarWashPackageSelect
          onBack={() => setStep('dashboard')}
          onSelect={(svc, adds) => { setService(svc); setAddons(adds); setStep('vehicle') }}
        />
      )
    case 'vehicle':
      return (
        <CarWashVehicleInfo
          service={service!}
          addons={addons}
          onBack={() => setStep('package')}
          onContinue={(v) => { setVehicle(v); setStep('payment') }}
        />
      )
    case 'payment':
      return (
        <CarWashPayment
          service={service!}
          addons={addons}
          vehicle={vehicle}
          onBack={() => setStep('vehicle')}
          onComplete={reset}
        />
      )
    default:
      return null
  }
}
