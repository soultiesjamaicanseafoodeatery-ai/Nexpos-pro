import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Strip a leading UTF-8 BOM — some environments' env vars have picked one up
// (same corruption pattern `src/app/api/staff/route.ts` already guards against
// for its own Supabase key). An un-stripped BOM makes the Headers API throw
// ("String contains non ISO-8859-1 code point") the moment supabase-js tries
// to send it as the apikey header, breaking every client-side Supabase call.
const url  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').replace(/^﻿/, '')
const akey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/^﻿/, '')

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