import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const akey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = (url && akey) ? createClient(url, akey) : null

export interface OutsideOrder {
  id: string
  created_at: string
  customer_name: string
  customer_phone: string
  vehicle_plate: string
  vehicle_make: string
  vehicle_model: string
  vehicle_color: string
  service_name: string
  service_price: number
  addons: { name: string; price: number; icon: string }[]
  addons_total: number
  total: number
  notes: string
  status: 'pending' | 'accepted' | 'rejected'
  bay?: string
}
