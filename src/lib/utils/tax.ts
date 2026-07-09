import type { POSState, OrderCalc, ModuleData, TaxConfig, CartItem, Surcharge } from '@/types'
import { MODULE_DATA } from '@/lib/data/seed'

export function getTaxConfig(): TaxConfig {
  return MODULE_DATA.restaurant?.taxConfig ?? {
    name: 'GCT', rate: 0.15, enabled: true,
    taxableOrderTypes: ['dine-in'],
    serviceChargeRate: 0.10, serviceChargeEnabled: false,
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
    surchargeTotal: 0,
    total,
    orderType: p.orderType ?? 'dine-in',
  }
}

export function calcCart(
  cart: CartItem[],
  opts: { orderType?: string; taxOverride?: boolean | null; manualDiscPct?: number; manualDiscFlat?: number; gratuityPct?: number; surcharges?: Surcharge[] }
): OrderCalc {
  const cfg = getTaxConfig()

  const sub = cart.reduce((sum, ci) => {
    const addonsTotal = ci.addons.reduce((s, a) => s + a.price, 0)
    const sidesTotal  = (ci.sideDetails ?? []).reduce((s, sd) => s + sd.price, 0)
    return sum + (ci.price + addonsTotal + sidesTotal) * ci.qty
  }, 0)

  const restaurantSub = cart
    .filter(ci => ci.module === 'restaurant')
    .reduce((sum, ci) => {
      const addonsTotal = ci.addons.reduce((s, a) => s + a.price, 0)
      const sidesTotal  = (ci.sideDetails ?? []).reduce((s, sd) => s + sd.price, 0)
      return sum + (ci.price + addonsTotal + sidesTotal) * ci.qty
    }, 0)

  const disc = opts.manualDiscPct
    ? sub * (opts.manualDiscPct / 100)
    : (opts.manualDiscFlat ?? 0)

  const taxableBase    = Math.max(0, sub - disc)
  const restaurantDiscPortion = sub > 0 ? disc * (restaurantSub / sub) : 0
  const taxableRestSub = Math.max(0, restaurantSub - restaurantDiscPortion)

  const gctApplies = cfg.enabled
    && isGCTApplicable(opts.orderType ?? 'dine-in', opts.taxOverride ?? null)
    && restaurantSub > 0
  const gctRate = gctApplies ? cfg.rate : 0
  const gct = taxableRestSub * gctRate

  const scApplies = (opts.orderType ?? 'dine-in') === 'dine-in'
    && cfg.serviceChargeEnabled
    && restaurantSub > 0
  const scRate = scApplies ? cfg.serviceChargeRate : 0
  const serviceCharge = taxableRestSub * scRate

  // Gratuity applies only to dine-in restaurant orders, on taxable restaurant subtotal
  const gratApplies = (opts.orderType ?? 'dine-in') === 'dine-in' && restaurantSub > 0 && (opts.gratuityPct ?? 0) > 0
  const gratuity = gratApplies ? taxableRestSub * ((opts.gratuityPct ?? 0) / 100) : 0

  const surchargeTotal = (opts.surcharges ?? []).reduce((sum, s) => {
    const amt = s.amountType === 'percentage' ? taxableBase * s.value / 100 : s.value
    return sum + amt
  }, 0)

  const total = Math.max(0, taxableBase + gct + serviceCharge + gratuity + surchargeTotal)

  return {
    sub, disc, memberDiscAmt: 0, manualDiscAmt: disc,
    taxableBase, gct, gctRate, gctApplies,
    serviceCharge, scRate,
    gratuity, deliveryFee: 0, legacyTax: 0,
    surchargeTotal,
    total,
    orderType: opts.orderType ?? 'dine-in',
  }
}

export function fmt(n: number, symbol = 'J$'): string {
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
