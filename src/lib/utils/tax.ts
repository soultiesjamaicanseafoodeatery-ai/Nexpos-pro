import type { POSState, OrderCalc, ModuleData, TaxConfig } from '@/types'
import { MODULE_DATA } from '@/lib/data/seed'

export function getTaxConfig(): TaxConfig {
  return MODULE_DATA.restaurant?.taxConfig ?? {
    name: 'GCT', rate: 0.15, enabled: true,
    taxableOrderTypes: ['dine-in'],
    serviceChargeRate: 0.10, serviceChargeEnabled: true,
  }
}

export function isGCTApplicable(
  orderType: string,
  override: boolean | null = null
): boolean {
  const cfg = getTaxConfig()
  if (!cfg.enabled) return false
  if (override === true) return true
  if (override === false) return false
  return cfg.taxableOrderTypes.includes(orderType)
}

export function calcOrder(
  p: Partial<POSState>,
  modKey: string,
  modData?: ModuleData
): OrderCalc {
  const m = modData ?? MODULE_DATA[modKey]
  const cfg = getTaxConfig()
  const itemPrice = (p.selItem?.price ?? 0) * (p.qty ?? 1)
  const addonPrice = (p.selAddons ?? []).reduce((s, a) => s + a.price, 0)
  const sub = itemPrice + addonPrice
  const memberDiscAmt = sub * ((p.member?.discount ?? 0) / 100)
  const manualDiscAmt = p.manualDiscPct
    ? sub * (p.manualDiscPct / 100)
    : (p.manualDiscFlat ?? 0)
  const disc = memberDiscAmt + manualDiscAmt
  const taxableBase = sub - disc

  const gctApplies =
    modKey === 'restaurant'
      ? isGCTApplicable(p.orderType ?? 'dine-in', p.taxOverride ?? null)
      : false
  const gctRate = gctApplies ? (cfg.rate ?? 0.15) : 0
  const gct = taxableBase * gctRate

  const scApplies =
    modKey === 'restaurant' &&
    (p.orderType ?? 'dine-in') === 'dine-in' &&
    cfg.serviceChargeEnabled
  const scRate = scApplies ? (cfg.serviceChargeRate ?? 0.10) : 0
  const serviceCharge = taxableBase * scRate

  const gratuity = taxableBase * ((p.gratuityPct ?? 0) / 100)
  const deliveryFee =
    (p.orderType ?? '') === 'delivery' ? (p.deliveryFee ?? 0) : 0
  const legacyTax =
    modKey !== 'restaurant' ? taxableBase * (m?.taxRate ?? 0) : 0

  const total = Math.max(
    0,
    taxableBase + gct + serviceCharge + gratuity + deliveryFee + legacyTax
  )

  return {
    sub, disc, memberDiscAmt, manualDiscAmt,
    taxableBase, gct, gctRate, gctApplies,
    serviceCharge, scRate,
    gratuity, deliveryFee, legacyTax,
    total,
    orderType: p.orderType ?? 'dine-in',
  }
}

export function fmt(n: number, symbol = 'J$'): string {
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
