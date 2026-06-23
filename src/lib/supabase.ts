import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const akey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase: SupabaseClient = (url && akey)
  ? createClient(url, akey)
  : createClient('https://placeholder.supabase.co', 'placeholder')

export interface OrderItem {
  id: string
  order_id: string
  item_name: string
  quantity: number
  price: number
}

export interface OutsideOrder {
  id: string
  created_at: string
  customer_name: string
  customer_phone: string
  customer_email?: string
  total_amount: number
  discount_amount: number
  final_amount: number
  type: 'carwash' | 'mixed'
  status: 'pending' | 'ready' | 'completed' | 'cancelled'
  payment_status: string
  fulfillment_method?: string
  order_items: OrderItem[]
}