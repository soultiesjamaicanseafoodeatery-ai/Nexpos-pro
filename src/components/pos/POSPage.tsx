'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { MenuItem, Addon, Transaction, CartItem, OrderType, ModuleData, HeldOrder, PaymentEntry, OrderTicket, VoidReason, VoidLog, Surcharge } from '@/types'
import { VOID_REASON_LABELS } from '@/types'
import { calcCart, fmt } from '@/lib/utils/tax'
import { buildCustomerReceipt, buildKitchenTicket, buildBarTicket, buildCarwashWorkOrder, buildVoidTicket, printTicket, smartPrint } from '@/lib/utils/ticketPrinter'
import { qzOpenDrawer } from '@/lib/utils/qzTray'
import OutsideOrders from './OutsideOrders'
import PaymentModal from './PaymentModal'
import TicketModal from './TicketModal'
import SplitBillModal from './SplitBillModal'
import VoidReasonModal from './VoidReasonModal'
import NoSaleModal from './NoSaleModal'
import OpenItemModal from './OpenItemModal'
import { MODULE_DATA } from '@/lib/data/seed'
import { supabase } from '@/lib/supabase'
import { storage } from '@/lib/utils/storage'

// ── Relational menu types (used by live state in POSPage) ─────
interface FlavourRow { id: string; name: string; active: boolean }
interface SideRow { id: string; name: string; price: number; active: boolean }
interface AddonRow { id: string; name: string; description: string; price: number; icon?: string; active: boolean }
interface SizeRow { id: string; name: string; sort_order: number; active: boolean }
interface ItemAssignment { flavour_ids: string[]; side_ids: string[]; addon_ids: string[]; sizes: { size_id: string; price: number }[] }

const MOD_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  restaurant: { bg: 'var(--ora-bg, #78350f22)', color: 'var(--ora, #f97316)', label: 'Food' },
  bar:        { bg: 'var(--pur-bg, #4c1d9522)', color: 'var(--pur, #a855f7)', label: 'Bar' },
  carwash:    { bg: 'var(--blue-bg)',            color: 'var(--blue)',          label: 'Wash' },
}

// Daily-resetting takeout order counter — TO-001, TO-002, … resets at midnight
function nextTakeoutNum(): string {
  const today = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'
  const stored = storage.get('takeout_daily_counter') as { date: string; count: number } | null
  const count = (stored?.date === today ? stored.count : 0) + 1
  storage.set('takeout_daily_counter', { date: today, count })
  return 'TO-' + String(count).padStart(3, '0')
}

export interface OrderContext {
  orderType: 'dine-in' | 'takeout' | 'delivery'
  table?: string
  guests?: number
  customerName?: string
  phone?: string
  address?: string
}

interface POSPageProps {
  onBack?: () => void
  onPaymentComplete?: () => void
  orderContext?: OrderContext
}

export default function POSPage({ onBack, onPaymentComplete, orderContext }: POSPageProps = {}) {
  const { state, dispatch, toast, audit } = useApp()
  const { activeModule, posState, currentUser, biz, cart, cartPayMethod, cartOrderType } = state
  const ps  = posState[activeModule]
  const sym  = biz.currencySymbol ?? 'J$'

  const [cwTab,        setCwTab]        = useState<'pos' | 'orders'>('pos')
  const [pendingCount, setPendingCount] = useState(0)
  const [showDetails,  setShowDetails]  = useState(false)
  const [discPct,      setDiscPct]      = useState(0)
  const [discFlat,     setDiscFlat]     = useState(0)
  const [discMode,     setDiscMode]     = useState<'pct' | 'flat'>('pct')

  // Gratuity
  const [gratuityPct,      setGratuityPct]      = useState(0)
  const [gratuityOverride, setGratuityOverride] = useState(false)
  const [showGratEdit,     setShowGratEdit]     = useState(false)
  const [gratInput,        setGratInput]        = useState('15')

  // Surcharges
  const [surcharges, setSurcharges] = useState<Surcharge[]>([])

  // Guest & customer
  const [guestCount,    setGuestCount]    = useState(1)
  const [customerName,  setCustomerName]  = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  // Payment / receipt modals
  const [showPayment,   setShowPayment]   = useState(false)
  const [showTicket,    setShowTicket]    = useState(false)
  const [showSplitBill, setShowSplitBill] = useState(false)
  const [showHeld,      setShowHeld]      = useState(false)
  const [showOpen,      setShowOpen]      = useState(false)
  const [showNoSale,    setShowNoSale]    = useState(false)
  const [showOpenItem,  setShowOpenItem]  = useState(false)
  const [confirmClear,      setConfirmClear]      = useState(false)
  const [confirmDeleteHeld, setConfirmDeleteHeld] = useState<string | null>(null)

  const [lastTx,        setLastTx]        = useState<Transaction | null>(null)
  const [lastTicket,    setLastTicket]    = useState<OrderTicket | null>(null)
  const [orderNote,     setOrderNote]     = useState('')
  const [payingTicket,  setPayingTicket]  = useState<OrderTicket | null>(null)

  // Split bill target (when paying one split at a time)
  const [splitTarget,   setSplitTarget]   = useState<{ calc: ReturnType<typeof calcCart>; label: string } | null>(null)

  // Void system
  const [voidTarget,      setVoidTarget]      = useState<{ item: CartItem; ticketId?: string } | null>(null)
  const [editingNoteId,  setEditingNoteId]  = useState<string | null>(null)
  const [noteInput,      setNoteInput]      = useState('')
  const [voidOrderTarget, setVoidOrderTarget] = useState<OrderTicket | null>(null)
  // Add-to-existing-order mode
  const [addToOrderMode,  setAddToOrderMode]  = useState(false)
  // Transfer table: { ticketId }
  const [transferTarget,  setTransferTarget]  = useState<string | null>(null)

  // POS UI enhancements
  const [searchQuery,   setSearchQuery]   = useState('')
  const [showFloorPlan, setShowFloorPlan] = useState(false)

  // Modal state
  const [modalItem,   setModalItem]   = useState<MenuItem | null>(null)
  const [modalAddons, setModalAddons] = useState<Addon[]>([])
  const [modalQty,    setModalQty]    = useState(1)
  const [modalNote,   setModalNote]   = useState('')
  const [modalFlavourId, setModalFlavourId] = useState<string | null>(null)
  const [modalSideIds,   setModalSideIds]   = useState<string[]>([])
  const [modalSizeId,    setModalSizeId]    = useState<string | null>(null)
  const [modalSizePrice, setModalSizePrice] = useState<number>(0)
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus modal when it opens so Escape key works
  useEffect(() => {
    if (modalItem && modalRef.current) {
      modalRef.current.focus()
    }
  }, [modalItem])

  // Sync customer/guest details from orderContext on workspace entry
  const orderContextRef = useRef<OrderContext | null>(null)
  useEffect(() => {
    if (orderContext && orderContext !== orderContextRef.current) {
      orderContextRef.current = orderContext
      if (orderContext.customerName) setCustomerName(orderContext.customerName)
      if (orderContext.phone)        setCustomerPhone(orderContext.phone)
      if (orderContext.guests)       setGuestCount(orderContext.guests)
    }
  }, [orderContext])

  // Auto-apply 15% gratuity for dine-in orders unless manager has overridden it
  useEffect(() => {
    if (gratuityOverride) return
    setGratuityPct(cartOrderType === 'dine-in' ? 15 : 0)
  }, [cartOrderType, gratuityOverride])

  // Live data — loaded from localStorage immediately, refreshed from Supabase in background
  const [liveMenuItems,    setLiveMenuItems]    = useState<MenuItem[] | null>(null)
  const [liveCarwashItems, setLiveCarwashItems] = useState<MenuItem[] | null>(null)
  const [liveAddons,       setLiveAddons]       = useState<Addon[] | null>(null)
  const [liveRestAddons,   setLiveRestAddons]   = useState<Addon[] | null>(null)
  const [liveFlavours,    setLiveFlavours]    = useState<FlavourRow[]>([])
  const [liveSides,       setLiveSides]       = useState<SideRow[]>([])
  const [livePosAddons,   setLivePosAddons]   = useState<AddonRow[]>([])
  const [liveSizesDefs,   setLiveSizesDefs]   = useState<SizeRow[]>([])
  const [liveAssignments, setLiveAssignments] = useState<Record<string, ItemAssignment>>({})
  const [customTables, setCustomTables] = useState<{ restaurant?: string[]; bar?: string[]; status?: Record<string, string> } | null>(null)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    // ── Step 1: Load from localStorage immediately (works offline) ──
    // Handles both raw Supabase format (description/category) and mapped format (desc/cat)
    type RawItem = MenuItem & { description?: string; category?: string; is_available?: boolean }
    type RawAddon = Addon & { description?: string }

    const normMenuItem = (r: RawItem): MenuItem => ({
      id: r.id, name: r.name,
      desc: r.desc ?? r.description ?? '',
      price: Number(r.price),
      cat: (r.cat ?? r.category ?? 'All').trim().toUpperCase(),
      emoji: r.emoji ?? '',
      active: r.active ?? r.is_available ?? true,
      module: r.module,
      duration: r.duration ?? undefined,
    })
    const normAddon = (r: RawAddon): Addon => ({
      id: r.id, name: r.name,
      desc: r.desc ?? r.description ?? '',
      price: Number(r.price),
      icon: r.icon ?? '',
      active: r.active ?? true,
    })

    const cachedMenuRaw    = storage.get<RawItem[]>('menu_items')
    const cachedCarwashRaw = storage.get<RawItem[]>('carwash_services')
    const cachedAddonsRaw  = storage.get<RawAddon[]>('carwash_addons')
    const cachedRestAddonsRaw = storage.get<RawAddon[]>('menu_addons')

    if (cachedMenuRaw    && cachedMenuRaw.length > 0)
      setLiveMenuItems(cachedMenuRaw.map(normMenuItem).filter(i => i.active && i.cat !== 'addon'))
    if (cachedCarwashRaw && cachedCarwashRaw.length > 0)
      setLiveCarwashItems(cachedCarwashRaw.map(normMenuItem).filter(i => i.active))
    if (cachedAddonsRaw  && cachedAddonsRaw.length > 0)
      setLiveAddons(cachedAddonsRaw.map(normAddon).filter(i => i.active))
    if (cachedRestAddonsRaw && cachedRestAddonsRaw.length > 0)
      setLiveRestAddons(cachedRestAddonsRaw.map(normAddon).filter(i => i.active))

    // ── Load relational menu data from localStorage cache ──
    const cachedFlavours  = storage.get<FlavourRow[]>('pos_flavours')
    const cachedSides     = storage.get<SideRow[]>('pos_sides')
    const cachedPosAddons = storage.get<AddonRow[]>('pos_addons')
    const cachedSizes     = storage.get<SizeRow[]>('pos_sizes')
    const cachedAssign    = storage.get<Record<string, ItemAssignment>>('pos_assignments')
    if (cachedFlavours?.length)  setLiveFlavours(cachedFlavours)
    if (cachedSides?.length)     setLiveSides(cachedSides)
    if (cachedPosAddons?.length) setLivePosAddons(cachedPosAddons)
    if (cachedSizes?.length)     setLiveSizesDefs(cachedSizes)
    if (cachedAssign && Object.keys(cachedAssign).length) setLiveAssignments(cachedAssign)
    const tablesConf = storage.get<Record<string, unknown>>('tables_config')
    if (tablesConf) {
      // TablesPage stores entries as {id,name,seats} objects; normalize to strings
      const toStrArr = (arr: unknown): string[] => {
        if (!Array.isArray(arr)) return []
        return arr.map(t => {
          if (typeof t === 'string') return t
          if (t && typeof t === 'object') {
            const e = t as { name?: unknown; id?: unknown }
            return String(e.name ?? e.id ?? '')
          }
          return String(t)
        }).filter(Boolean)
      }
      setCustomTables({
        restaurant: toStrArr(tablesConf.restaurant),
        bar:        toStrArr(tablesConf.bar),
        status:     (tablesConf.status && typeof tablesConf.status === 'object')
                      ? tablesConf.status as Record<string, string>
                      : undefined,
      })
    }

    // ── Step 2: Background sync ──
    async function syncFromSupabase() {
      const WAPI = ''
      try {
        // ── Menu items via website API (same source as Menu Manager) ──
        const menuRes = await fetch(`${WAPI}/api/menu`)
        if (menuRes.ok) {
          type ApiItem = { id: string; name: string; description?: string; price: number; category: string; emoji?: string; active?: boolean; is_available?: boolean; module?: string }
          const allItems: ApiItem[] = await menuRes.json()
          const addonRows = allItems.filter(r => r.category === 'addon')
          const itemRows  = allItems.filter(r => r.category !== 'addon')

          const mappedItems: MenuItem[] = itemRows.map(r => ({
            id: r.id, name: r.name, desc: r.description ?? '', price: Number(r.price),
            cat: (r.category ?? 'All').trim().toUpperCase(), emoji: r.emoji ?? '',
            active: r.active ?? r.is_available ?? true,
            module: r.module,
          }))
          const mappedAddons: Addon[] = addonRows.map(r => ({
            id: r.id, name: r.name, desc: r.description ?? '', price: Number(r.price),
            icon: r.emoji ?? '', active: r.active ?? r.is_available ?? true,
          }))

          if (mappedItems.length > 0) {
            setLiveMenuItems(mappedItems)
            setLiveRestAddons(mappedAddons)
            storage.set('menu_items', mappedItems)
            storage.set('menu_addons', mappedAddons)
          }
        }

        // ── Carwash services via Supabase (no website API for these yet) ──
        if (!supabase) {
          // Skip carwash Supabase sync if client not configured
        } else {
        const { data: cwData } = await supabase
          .from('carwash_services')
          .select('*')
          .eq('is_available', true)
        if (cwData && cwData.length > 0) {
          const mapped: MenuItem[] = cwData.map((r: { id: string; name: string; description: string; price: number; duration?: string; is_available: boolean; vehicle_type: string }) => ({
            id: r.id, name: r.name, desc: r.description ?? '', price: Number(r.price),
            cat: r.vehicle_type ? (r.vehicle_type.charAt(0).toUpperCase() + r.vehicle_type.slice(1)) : 'All',
            emoji: '', active: r.is_available, duration: r.duration ?? '',
          }))
          setLiveCarwashItems(mapped)
          storage.set('carwash_services', mapped)
        }

        // Fetch carwash addons
        const { data: addData } = await supabase
          .from('carwash_addons')
          .select('*')
          .eq('is_available', true)
        if (addData && addData.length > 0) {
          const mapped: Addon[] = addData.map((r: { id: string; name: string; description: string; price: number; is_available: boolean }) => ({
            id: r.id, name: r.name, desc: r.description ?? '', price: Number(r.price),
            icon: '', active: r.is_available,
          }))
          setLiveAddons(mapped)
          storage.set('carwash_addons', mapped)
        }

        } // end supabase carwash block

        // ── Relational data (flavours, sides, addons, sizes, assignments) ──
        const [flvRes, sideRes, addRes, szRes, asgRes] = await Promise.allSettled([
          fetch(`${WAPI}/api/flavours`).then(r => r.ok ? r.json() : []),
          fetch(`${WAPI}/api/sides`).then(r => r.ok ? r.json() : []),
          fetch(`${WAPI}/api/addons`).then(r => r.ok ? r.json() : []),
          fetch(`${WAPI}/api/sizes`).then(r => r.ok ? r.json() : []),
          fetch(`${WAPI}/api/assignments`).then(r => r.ok ? r.json() : {}),
        ])
        if (flvRes.status === 'fulfilled' && Array.isArray(flvRes.value) && flvRes.value.length > 0) {
          setLiveFlavours(flvRes.value as FlavourRow[]); storage.set('pos_flavours', flvRes.value)
        }
        if (sideRes.status === 'fulfilled' && Array.isArray(sideRes.value) && sideRes.value.length > 0) {
          setLiveSides(sideRes.value as SideRow[]); storage.set('pos_sides', sideRes.value)
        }
        if (addRes.status === 'fulfilled' && Array.isArray(addRes.value) && addRes.value.length > 0) {
          setLivePosAddons(addRes.value as AddonRow[]); storage.set('pos_addons', addRes.value)
        }
        if (szRes.status === 'fulfilled' && Array.isArray(szRes.value) && szRes.value.length > 0) {
          setLiveSizesDefs(szRes.value as SizeRow[]); storage.set('pos_sizes', szRes.value)
        }
        if (asgRes.status === 'fulfilled' && asgRes.value && typeof asgRes.value === 'object') {
          setLiveAssignments(asgRes.value as Record<string, ItemAssignment>); storage.set('pos_assignments', asgRes.value)
        }
      } catch {
        // Silently keep using cached / seed data
      }
    }
    syncFromSupabase()
  }, [])

  // Build the effective module data.
  // Seed items are only used when Supabase is not configured at all (no URL/key).
  // If Supabase IS configured, show live data (or empty) — never show demo items in production.
  const seedMod = MODULE_DATA[activeModule]
  const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  // Menu items always come from website API now — supabaseConfigured only governs carwash/addon fallbacks
  const mod: ModuleData = {
    ...seedMod,
    items: (() => {
      if (activeModule === 'restaurant' || activeModule === 'bar') {
        if (liveMenuItems && liveMenuItems.length > 0) {
          const modItems = liveMenuItems.filter(i =>
            activeModule === 'bar'
              ? i.module === 'bar'
              : (i.module === 'restaurant' || !i.module)
          )
          // If module filter returns nothing, show all live items so POS is never blank
          return modItems.length > 0 ? modItems : liveMenuItems
        }
        return []  // loading — show empty grid, not fake seed data
      }
      if (activeModule === 'carwash') {
        if (liveCarwashItems && liveCarwashItems.length > 0) return liveCarwashItems
        return []
      }
      return []
    })(),
    addons: (() => {
      if (activeModule === 'carwash') {
        if (liveAddons && liveAddons.length > 0) return liveAddons
        return supabaseConfigured ? [] : seedMod.addons
      }
      // restaurant and bar — use Supabase addons if available, else seed fallback
      if (liveRestAddons && liveRestAddons.length > 0) return liveRestAddons
      return seedMod.addons
    })(),
    categories: (() => {
      if (activeModule === 'restaurant' || activeModule === 'bar') {
        if (liveMenuItems && liveMenuItems.length > 0) {
          const modItems = liveMenuItems.filter(i =>
            activeModule === 'bar'
              ? i.module === 'bar'
              : (i.module === 'restaurant' || !i.module)
          )
          const cats = Array.from(new Set(modItems.map(i => i.cat).filter(Boolean)))
          return ['All', ...cats]
        }
        return supabaseConfigured ? ['All'] : seedMod.categories
      }
      if (activeModule === 'carwash') {
        if (liveCarwashItems && liveCarwashItems.length > 0) {
          const cats = Array.from(new Set(liveCarwashItems.map(i => i.cat).filter(Boolean)))
          return ['All', ...cats]
        }
        return supabaseConfigured ? ['All'] : seedMod.categories
      }
      return supabaseConfigured ? ['All'] : seedMod.categories
    })(),
    tables: (() => {
      const key = activeModule as 'restaurant' | 'bar'
      const custom = customTables?.[key]
      if (custom && custom.length > 0) return custom
      return seedMod.tables ?? []
    })(),
    tableStatus: customTables?.status ?? seedMod.tableStatus ?? {},
  }

  const cats          = ['All', ...mod.categories.filter((c: string) => c !== 'All')]
  const filteredItems = ps.cat === 'All'
    ? mod.items.filter((i: MenuItem) => i.active)
    : mod.items.filter((i: MenuItem) => i.active && i.cat === ps.cat)

  const setPOS = (patch: Partial<typeof ps>) =>
    dispatch({ type: 'SET_POS_STATE', mod: activeModule, patch })

  // Toggle addon in modal
  const toggleModalAddon = (addon: Addon) => {
    setModalAddons(prev => {
      const exists = prev.find(a => a.id === addon.id)
      return exists ? prev.filter(a => a.id !== addon.id) : [...prev, addon]
    })
  }

  // Close modal and reset state
  const closeModal = () => {
    setModalItem(null)
    setModalAddons([])
    setModalFlavourId(null)
    setModalSideIds([])
    setModalSizeId(null)
    setModalSizePrice(0)
    setModalQty(1)
    setModalNote('')
  }

  // Add to cart from modal (item with add-ons)
  const addToCart = () => {
    if (!modalItem) return
    const effectivePrice = modalSizeId ? modalSizePrice : modalItem.price
    const flavourName = liveFlavours.find(f => f.id === modalFlavourId)?.name
    const sideName = modalSideIds.map(id => liveSides.find(s => s.id === id)?.name).filter(Boolean) as string[]
    const sizeName  = liveSizesDefs.find(s => s.id === modalSizeId)?.name

    const cartItem: CartItem = {
      id: crypto.randomUUID(),
      itemId: modalItem.id,
      name: modalItem.name,
      price: effectivePrice,
      qty: modalQty,
      addons: [...modalAddons],
      module: activeModule,
      note: modalNote || undefined,
      plate: activeModule === 'carwash' ? (ps.plate || undefined) : undefined,
      flavour: flavourName,
      size: sizeName,
      sides: sideName.length > 0 ? sideName : undefined,
    }
    dispatch({ type: 'ADD_TO_CART', item: cartItem })
    closeModal()
  }

  // Add to cart directly (item with no active add-ons)
  const addToCartDirect = (item: MenuItem) => {
    const cartItem: CartItem = {
      id: crypto.randomUUID(),
      itemId: item.id,
      name: item.name,
      price: item.price,
      qty: 1,
      addons: [],
      module: activeModule,
      plate: activeModule === 'carwash' ? (ps.plate || undefined) : undefined,
    }
    dispatch({ type: 'ADD_TO_CART', item: cartItem })
  }

  // Handle item click — open modal only if the item has assigned add-ons/flavours/sizes/sides
  const handleItemClick = (item: MenuItem) => {
    const assignment = liveAssignments[item.id]
    const hasFlavours     = (assignment?.flavour_ids?.length ?? 0) > 0
    const hasSides        = (assignment?.side_ids?.length ?? 0) > 0
    const hasSizes        = (assignment?.sizes?.length ?? 0) > 0
    const hasNewAddons    = (assignment?.addon_ids?.length ?? 0) > 0
    const hasCarwashAddons = activeModule === 'carwash' && activeAddons.length > 0

    if (hasFlavours || hasSides || hasSizes || hasNewAddons || hasCarwashAddons) {
      setModalItem(item)
      setModalAddons([])
      setModalFlavourId(null)
      setModalSideIds([])
      setModalSizeId(null)
      setModalSizePrice(item.price)
      setModalQty(1)
      setModalNote('')
    } else {
      addToCartDirect(item)
    }
  }

  const handleAddOpenItem = (description: string, price: number) => {
    if (!currentUser) return
    const cartItem: CartItem = {
      id: crypto.randomUUID(),
      itemId: 'OPEN_ITEM',
      name: description,
      price,
      qty: 1,
      addons: [],
      module: activeModule,
      openItem: true,
    }
    dispatch({ type: 'ADD_TO_CART', item: cartItem })
    audit('OPEN_ITEM', `Open Item: "${description}" — ${fmt(price, sym)}`, 'info')
  }

  const completeCheckout = (payData: { method: string; tender?: number; changeDue?: number; payments?: PaymentEntry[] }, overrideCalc?: ReturnType<typeof calcCart>) => {
    if (!currentUser) return

    const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const today   = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    const payMethodLabel = payData.method === 'gift_card' ? 'Gift Card'
      : payData.method === 'tab' ? 'Tab'
      : payData.method

    // ── Path A: Paying an existing open (sent) order ─────────────
    if (payingTicket) {
      const finalCalc = overrideCalc ?? payCalc
      const modules = Array.from(new Set(payingTicket.items.map(ci => ci.module)))
      const mod2 = modules.length === 1 ? modules[0] : 'mixed' as const

      const tx: Transaction = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        ts: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' + nowTime,
        mod: mod2,
        cashier:  currentUser.name,
        userId:   currentUser.id,
        customer: payingTicket.customerName || (payingTicket.table ? `Table ${payingTicket.table}` : 'Walk-in'),
        item:     `Order #${payingTicket.orderNum} · ${payingTicket.items.length} items`,
        addons:   payingTicket.items.flatMap(ci => ci.addons.map(a => a.name)),
        sub:      finalCalc.sub,
        disc:     finalCalc.disc,
        tax:      finalCalc.gct + finalCalc.serviceCharge,
        total:    finalCalc.total,
        pay:      payMethodLabel,
        orderType: payingTicket.orderType,
        gct:           finalCalc.gct,
        serviceCharge: finalCalc.serviceCharge,
        gratuity:      finalCalc.gratuity,
        gratuityPct,
        surchargeTotal: finalCalc.surchargeTotal,
        guestCount:    payingTicket.guestCount,
        customerName:  payingTicket.customerName,
        tableNum:      payingTicket.table,
        tender:    payData.tender,
        changeDue: payData.changeDue,
        payments:  payData.payments,
        items: [...payingTicket.items],
      }

      const updatedTimeline = { ...payingTicket.timeline, paid: nowTime }
      dispatch({ type: 'ADD_TRANSACTION', tx })
      dispatch({ type: 'UPDATE_ORDER_TICKET', id: payingTicket.id, patch: {
        status: 'paid' as const, txId: tx.id, timeline: updatedTimeline,
      }})
      dispatch({ type: 'SET_POS_STATE', mod: 'restaurant', patch: { selTable: null } })
      dispatch({ type: 'SET_POS_STATE', mod: 'bar',        patch: { selTable: null } })

      const paidTicket = { ...payingTicket, status: 'paid' as const, txId: tx.id, timeline: updatedTimeline }
      setPayingTicket(null)
      setSurcharges([])
      setGratuityOverride(false)
      setShowPayment(false)
      setShowOpen(false)
      setLastTx(tx)
      setLastTicket(paidTicket)
      setSplitTarget(null)
      if (payData.method === 'cash' && biz.printers?.drawerEnabled && biz.printers?.receipt)
        qzOpenDrawer(biz.printers.receipt)
      audit('PAYMENT', `Order #${payingTicket.orderNum} — ${fmt(finalCalc.total, sym)} · ${payMethodLabel}`, 'success')
      const pw2 = (biz.printers?.width ?? 80) as 58 | 80
      if (biz.printers?.receipt) {
        const receiptHTML = buildCustomerReceipt(tx, biz, { width: pw2 })
        smartPrint(receiptHTML, 'Receipt', biz.printers.receipt, pw2, true)
      }
      if (biz.printers?.receiptPreview) {
        setTimeout(() => setShowTicket(true), 200)
      } else {
        onPaymentComplete?.()
      }
      return
    }

    // ── Path B: Direct pay from current cart (quick / counter sale) ──
    if (cart.length === 0 && !overrideCalc) return

    const finalCalc  = overrideCalc ?? calc
    const modules    = Array.from(new Set(cart.map(ci => ci.module)))
    const mod2       = modules.length === 1 ? modules[0] : 'mixed' as const
    const plates     = Array.from(new Set(cart.filter(ci => ci.plate).map(ci => ci.plate!)))
    const selTable   = posState['restaurant'].selTable ?? posState['bar'].selTable
    const tableInfo  = selTable ? `Table ${selTable}` : ''
    const nameDisplay = customerPhone ? `${customerName || 'Customer'} · ${customerPhone}` : customerName
    const customer   = nameDisplay || (plates.length > 0
      ? plates.join(', ') + (tableInfo ? ` · ${tableInfo}` : '')
      : (tableInfo || 'Walk-in'))
    const itemSummary = cart.length === 1
      ? `${cart[0].name}${cart[0].qty > 1 ? ` ×${cart[0].qty}` : ''}`
      : `${cart.length} items (${modules.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' + ')})`

    const tx: Transaction = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      ts: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' + nowTime,
      mod: mod2,
      cashier:  currentUser.name,
      userId:   currentUser.id,
      customer,
      item:     itemSummary,
      addons:   cart.flatMap(ci => ci.addons.map(a => a.name)),
      sub:      finalCalc.sub,
      disc:     finalCalc.disc,
      tax:      finalCalc.gct + finalCalc.serviceCharge,
      total:    finalCalc.total,
      pay:      payMethodLabel,
      orderType: cartOrderType,
      gct:           finalCalc.gct,
      serviceCharge: finalCalc.serviceCharge,
      gratuity:      finalCalc.gratuity,
      gratuityPct:   gratuityPct,
      surchargeTotal: finalCalc.surchargeTotal,
      guestCount:  guestCount > 1 ? guestCount : undefined,
      customerName: customerName || undefined,
      tableNum:  selTable ?? undefined,
      tender:    payData.tender,
      changeDue: payData.changeDue,
      payments:  payData.payments,
      items: cart,
    }

    const orderNum   = cartOrderType === 'takeout' ? nextTakeoutNum() : String(tx.id).slice(-4).padStart(4, '0')
    const hasKitchen = cart.some(ci => ci.module === 'restaurant')
    const hasBar     = cart.some(ci => ci.module === 'bar')
    const hasCarwash = cart.some(ci => ci.module === 'carwash')

    const newTicket: OrderTicket = {
      id: crypto.randomUUID(),
      orderNum,
      txId:   tx.id,
      table:  selTable ?? undefined,
      server: currentUser.name,
      guestCount:    guestCount > 1 ? guestCount : undefined,
      customerName:  customerName || undefined,
      orderType:     cartOrderType,
      status:        'paid',
      hasKitchen,
      hasBar,
      hasCarwash,
      kitchenStatus: 'pending',
      barStatus:     'pending',
      carwashStatus: 'queued',
      items:    [...cart],
      orderNote: orderNote || undefined,
      discPct, discFlat, gratuityPct,
      timeline: {
        created: nowTime,
        sentToKitchen: hasKitchen ? nowTime : undefined,
        paid: nowTime,
      },
      reprints: [],
    }
    dispatch({ type: 'ADD_ORDER_TICKET', ticket: newTicket })

    // Print production tickets so kitchen receives the order
    const ticketData = {
      orderNum,
      table:        selTable ?? undefined,
      server:       currentUser.name,
      guestCount:   guestCount > 1 ? guestCount : undefined,
      orderType:    cartOrderType,
      date:         today,
      time:         nowTime,
      items:        [...cart],
      orderNote:    orderNote || undefined,
      customerName: customerName || undefined,
    }
    const pw = (biz.printers?.width ?? 80) as 58 | 80
    // silentOnly=true: auto-prints never open a browser dialog; they succeed via QZ Tray or skip
    if (hasKitchen) {
      const html = buildKitchenTicket(ticketData, { width: pw })
      smartPrint(html, 'Kitchen Ticket', biz.printers?.kitchen, pw, true, true)
    }
    if (hasBar) {
      const html = buildBarTicket(ticketData, { width: pw })
      smartPrint(html, 'Bar Ticket', biz.printers?.bar || biz.printers?.kitchen, pw, true, true)
    }
    if (hasCarwash) {
      const html = buildCarwashWorkOrder(ticketData, { width: pw })
      smartPrint(html, 'Car Wash Work Order', biz.printers?.receipt, pw, true)
    }
    // Auto-print receipt (always, unless receipt preview modal is enabled in Settings)
    if (biz.printers?.receipt && !biz.printers?.receiptPreview) {
      const receiptHTML = buildCustomerReceipt(tx, biz, { width: pw })
      smartPrint(receiptHTML, 'Receipt', biz.printers.receipt, pw, true)
    }
    // Open cash drawer after cash payment
    if (payData.method === 'cash' && biz.printers?.drawerEnabled && biz.printers?.receipt)
      qzOpenDrawer(biz.printers.receipt)

    dispatch({ type: 'ADD_TRANSACTION', tx })
    dispatch({ type: 'CLEAR_CART' })
    setLastTx(tx)
    setLastTicket(newTicket)
    setShowPayment(false)
    setDiscPct(0); setDiscFlat(0)
    setGuestCount(1); setCustomerName(''); setCustomerPhone(''); setOrderNote('')
    setGratuityOverride(false)
    setSurcharges([])
    setSplitTarget(null)
    audit('PAYMENT', `${itemSummary} — ${fmt(tx.total, sym)} · ${payMethodLabel}`, 'success')
    dispatch({ type: 'SET_POS_STATE', mod: 'restaurant', patch: { selTable: null } })
    dispatch({ type: 'SET_POS_STATE', mod: 'bar',        patch: { selTable: null } })
    dispatch({ type: 'SET_POS_STATE', mod: 'carwash',    patch: { plate: '' } })
    if (biz.printers?.receiptPreview) {
      setTimeout(() => setShowTicket(true), 200)
    } else {
      onPaymentComplete?.()
    }
  }

  // ── Send Order: print kitchen/bar tickets, keep order open ────
  const sendOrder = () => {
    if (activeCart.length === 0) return
    if (!currentUser) return

    const selTable   = posState['restaurant'].selTable ?? posState['bar'].selTable
    const nowTime    = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const today      = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    const orderNum   = cartOrderType === 'takeout' ? nextTakeoutNum() : String(Date.now()).slice(-4).padStart(4, '0')
    const hasKitchen = activeCart.some(ci => ci.module === 'restaurant')
    const hasBar     = activeCart.some(ci => ci.module === 'bar')
    const hasCarwash = activeCart.some(ci => ci.module === 'carwash')

    const newTicket: OrderTicket = {
      id: crypto.randomUUID(),
      orderNum,
      table:  selTable ?? undefined,
      server: currentUser.name,
      guestCount:    guestCount > 1 ? guestCount : undefined,
      customerName:  customerName || undefined,
      orderType:     cartOrderType,
      status:        'sent',
      hasKitchen,
      hasBar,
      hasCarwash,
      kitchenStatus: 'pending',
      barStatus:     'pending',
      carwashStatus: 'queued',
      items:    [...cart],  // keep voided items for audit; active items only go to kitchen
      orderNote: orderNote || undefined,
      discPct, discFlat, gratuityPct,
      timeline: {
        created: nowTime,
        sentToKitchen: hasKitchen ? nowTime : undefined,
      },
      reprints: [],
    }

    const ticketData = {
      orderNum,
      table:        selTable ?? undefined,
      server:       currentUser.name,
      guestCount:   guestCount > 1 ? guestCount : undefined,
      orderType:    cartOrderType,
      date:         today,
      time:         nowTime,
      items:        [...activeCart],  // only non-voided items to kitchen/bar
      orderNote:    orderNote || undefined,
      customerName: customerName || undefined,
    }
    const pw2 = (biz.printers?.width ?? 80) as 58 | 80
    // silentOnly=false on Send to Kitchen: opens browser dialog if QZ Tray is unavailable
    if (hasKitchen) {
      const html = buildKitchenTicket(ticketData, { width: pw2 })
      smartPrint(html, 'Kitchen Ticket', biz.printers?.kitchen, pw2, false, true)
    }
    if (hasBar) {
      const html = buildBarTicket(ticketData, { width: pw2 })
      smartPrint(html, 'Bar Ticket', biz.printers?.bar || biz.printers?.kitchen, pw2, false, true)
    }
    if (hasCarwash) {
      const html = buildCarwashWorkOrder(ticketData, { width: pw2 })
      smartPrint(html, 'Car Wash Work Order', biz.printers?.receipt, pw2, false)
    }

    dispatch({ type: 'ADD_ORDER_TICKET', ticket: newTicket })
    dispatch({ type: 'CLEAR_CART' })
    dispatch({ type: 'SET_POS_STATE', mod: 'restaurant', patch: { selTable: null } })
    dispatch({ type: 'SET_POS_STATE', mod: 'bar',        patch: { selTable: null } })
    dispatch({ type: 'SET_POS_STATE', mod: 'carwash',    patch: { plate: '' } })
    setDiscPct(0); setDiscFlat(0); setGuestCount(1); setCustomerName(''); setOrderNote(''); setGratuityOverride(false)

    const sentTo = [hasKitchen && 'Kitchen', hasBar && 'Bar', hasCarwash && 'Car Wash'].filter(Boolean).join(' + ')
    audit('SEND_ORDER', `Order #${orderNum} sent to ${sentTo}`, 'info')
    setShowOpen(true)
  }

  // ── Permission helpers ─────────────────────────────────────
  const role = currentUser?.role ?? ''
  const canVoidCartItem  = ['admin','manager','supervisor','cashier'].includes(role)
  const canVoidSentItem  = ['admin','manager','supervisor'].includes(role)

  // ── Void a cart item (pre-send) ────────────────────────────
  const handleVoidCartItem = (item: CartItem, reason: VoidReason, reasonText: string) => {
    if (!currentUser) return
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    dispatch({ type: 'VOID_CART_ITEM', id: item.id, reason, reasonText, by: currentUser.name, at: nowTime })
    const logEntry: VoidLog = {
      id: crypto.randomUUID(), ts: new Date().toLocaleString(),
      user: currentUser.name, userId: currentUser.id, role,
      voidType: 'item', itemName: item.name,
      reason, reasonText,
      amount: (item.price + item.addons.reduce((s, a) => s + a.price, 0)) * item.qty,
      mod: item.module,
    }
    dispatch({ type: 'ADD_VOID_LOG', entry: logEntry })
    audit('VOID_ITEM', `Voided ${item.name} from cart — ${reasonText}`, 'warn')
    setVoidTarget(null)
  }

  // ── Void an item on a sent open order ─────────────────────
  const handleVoidTicketItem = (ticket: OrderTicket, item: CartItem, reason: VoidReason, reasonText: string) => {
    if (!currentUser) return
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    dispatch({ type: 'VOID_TICKET_ITEM', ticketId: ticket.id, itemId: item.id, reason, reasonText, by: currentUser.name, at: nowTime })
    const logEntry: VoidLog = {
      id: crypto.randomUUID(), ts: new Date().toLocaleString(),
      user: currentUser.name, userId: currentUser.id, role,
      voidType: 'item', orderNum: ticket.orderNum, itemName: item.name,
      reason, reasonText,
      amount: (item.price + item.addons.reduce((s, a) => s + a.price, 0)) * item.qty,
      mod: item.module,
    }
    dispatch({ type: 'ADD_VOID_LOG', entry: logEntry })
    // Print void ticket to kitchen/bar via QZ Tray (no browser popup)
    const html = buildVoidTicket(
      ticket.orderNum, item.name, currentUser.name, nowTime,
      { reason: reasonText, qty: item.qty }
    )
    const _pw = (biz.printers?.width ?? 80) as 58 | 80
    smartPrint(html, 'VOID Ticket', biz.printers?.kitchen, _pw, true, true)
    audit('VOID_ITEM', `Voided ${item.name} from Order #${ticket.orderNum} — ${reasonText}`, 'warn')
    setVoidTarget(null)
  }

  // ── Void entire open order (manager/admin only) ────────────
  const isManager = ['admin','manager'].includes(role)
  const canUseOpenItem = isManager || !!(biz as any).staffOpenItemAllowed
  const handleVoidEntireOrder = (ticket: OrderTicket, reason: VoidReason, reasonText: string) => {
    if (!currentUser) return
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const voidedItems = ticket.items.map(ci =>
      ci.voided ? ci : { ...ci, voided: true, voidReason: reason, voidReasonText: reasonText, voidedBy: currentUser.name, voidedAt: nowTime }
    )
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: { status: 'voided', items: voidedItems } })
    const totalAmt = ticket.items.filter(ci => !ci.voided).reduce((s, ci) => s + (ci.price + ci.addons.reduce((as, a) => as + a.price, 0)) * ci.qty, 0)
    dispatch({ type: 'ADD_VOID_LOG', entry: {
      id: crypto.randomUUID(), ts: new Date().toLocaleString(),
      user: currentUser.name, userId: currentUser.id, role,
      voidType: 'order', orderNum: ticket.orderNum, reason, reasonText,
      amount: totalAmt, mod: activeModule,
    }})
    if (ticket.hasKitchen || ticket.hasBar) {
      const html = buildVoidTicket(ticket.orderNum, `ENTIRE ORDER (${ticket.items.filter(ci => !ci.voided).length} items)`, currentUser.name, nowTime, { reason: reasonText })
      const _pw2 = (biz.printers?.width ?? 80) as 58 | 80
      smartPrint(html, 'VOID — Entire Order', biz.printers?.kitchen, _pw2, true, true)
    }
    audit('VOID_ORDER', `Order #${ticket.orderNum} voided — ${reasonText}`, 'warn')
    setVoidOrderTarget(null)
  }

  // ── Add current cart items to an existing open order ───────
  const addToExistingOrder = (ticket: OrderTicket) => {
    if (activeCart.length === 0) return
    if (!currentUser) return
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const today   = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    const newHasKitchen = activeCart.some(ci => ci.module === 'restaurant')
    const newHasBar     = activeCart.some(ci => ci.module === 'bar')
    const newHasCarwash = activeCart.some(ci => ci.module === 'carwash')
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticket.id, patch: {
      items: [...ticket.items, ...activeCart],
      hasKitchen: ticket.hasKitchen || newHasKitchen,
      hasBar: ticket.hasBar || newHasBar,
      hasCarwash: ticket.hasCarwash || newHasCarwash,
    }})
    const addData = { orderNum: ticket.orderNum, table: ticket.table, server: currentUser.name, orderType: ticket.orderType, date: today, time: nowTime, items: [...activeCart], orderNote: `++ ADDITIONAL ITEMS ++` }
    const pw3 = (biz.printers?.width ?? 80) as 58 | 80
    if (newHasKitchen) { const h = buildKitchenTicket(addData, { width: pw3 }); smartPrint(h, 'Kitchen Ticket — Addition', biz.printers?.kitchen, pw3, true, true) }
    if (newHasBar)     { const h = buildBarTicket(addData, { width: pw3 });     smartPrint(h, 'Bar Ticket — Addition', biz.printers?.bar || biz.printers?.kitchen, pw3, true, true) }
    dispatch({ type: 'CLEAR_CART' })
    setAddToOrderMode(false); setShowOpen(false)
    audit('ADD_TO_ORDER', `Added ${activeCart.length} item(s) to Order #${ticket.orderNum}`, 'info')
  }

  // ── Transfer table ──────────────────────────────────────────
  const transferTable = (ticketId: string, newTable: string) => {
    dispatch({ type: 'UPDATE_ORDER_TICKET', id: ticketId, patch: { table: newTable } })
    audit('TRANSFER_TABLE', `Order moved to Table ${newTable}`, 'info')
    setTransferTarget(null)
  }

  const holdOrder = () => {
    if (cart.length === 0) return
    if (!currentUser) return
    const selTable = posState['restaurant'].selTable ?? posState['bar'].selTable
    const label = customerName || (selTable ? `Table ${selTable}` : `Order ${Date.now().toString().slice(-4)}`)
    const held: HeldOrder = {
      id: crypto.randomUUID(),
      label,
      cart: [...cart],
      orderType: cartOrderType,
      module: activeModule,
      selTable,
      guestCount,
      customerName,
      discPct,
      discFlat,
      gratuityPct,
      gratuityOverride,
      savedAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      savedBy: currentUser.name,
    }
    dispatch({ type: 'HOLD_ORDER', order: held })
    dispatch({ type: 'CLEAR_CART' })
    setDiscPct(0)
    setDiscFlat(0)
    setCustomerName('')
    setGuestCount(1)
    setGratuityOverride(false)
    audit('HOLD_ORDER', `Held: ${label}`, 'info')
  }

  const resumeOrder = (held: HeldOrder) => {
    dispatch({ type: 'CLEAR_CART' })
    held.cart.forEach(ci => dispatch({ type: 'ADD_TO_CART', item: ci }))
    dispatch({ type: 'SET_CART_ORDER_TYPE', orderType: held.orderType })
    setCustomerName(held.customerName)
    setGuestCount(held.guestCount)
    setDiscPct(held.discPct)
    setDiscFlat(held.discFlat)
    setGratuityPct(held.gratuityPct)
    setGratuityOverride(held.gratuityOverride)
    if (held.selTable) {
      dispatch({ type: 'SET_POS_STATE', mod: held.module as 'restaurant' | 'bar', patch: { selTable: held.selTable } })
    }
    dispatch({ type: 'REMOVE_HELD_ORDER', id: held.id })
    setShowHeld(false)
    audit('RESUME_ORDER', `Resumed: ${held.label}`, 'info')
  }

  // Auto-set gratuity: 15% for dine-in restaurant, 0 otherwise
  const hasRestaurantItems = cart.some(ci => ci.module === 'restaurant')
  useEffect(() => {
    if (gratuityOverride) return
    if (cartOrderType === 'dine-in' && hasRestaurantItems) {
      setGratuityPct(15)
    } else {
      setGratuityPct(0)
    }
  }, [cartOrderType, hasRestaurantItems, gratuityOverride])


  // Cart totals
  const discOpts = discMode === 'pct'
    ? { manualDiscPct: discPct || undefined }
    : { manualDiscFlat: discFlat || undefined }
  const activeCart = cart.filter(ci => !ci.voided)
  const calc = calcCart(activeCart, { orderType: cartOrderType, taxOverride: null, ...discOpts, gratuityPct, surcharges })

  // Open (sent, unpaid) orders — excludes legacy, paid, and voided tickets
  const openOrders = state.orderTickets.filter(t => {
    const s = t.status ?? 'paid'
    return s !== 'paid' && s !== 'voided'
  })

  // Calc to use when paying an open order vs. current cart
  const payCalc = payingTicket
    ? calcCart(payingTicket.items.filter(ci => !ci.voided), {
        orderType: payingTicket.orderType as OrderType,
        manualDiscPct: payingTicket.discPct || undefined,
        manualDiscFlat: payingTicket.discFlat || undefined,
        gratuityPct,
        surcharges,
      })
    : calc

  // Active add-ons for modal display
  const activeAddons = mod.addons.filter((a: Addon) => a.active)

  // Floor plan: map table → open ticket
  const tableOrderMap: Record<string, OrderTicket> = {}
  openOrders.forEach(t => { if (t.table) tableOrderMap[t.table] = t })

  // Quick picks: top 8 most ordered items in this module (from transaction history)
  const quickPicks: MenuItem[] = (() => {
    const counts: Record<string, number> = {}
    state.transactions.slice(-300).forEach(tx => {
      if (tx.items) tx.items.forEach(ci => {
        if (ci.module === activeModule && !ci.voided)
          counts[ci.itemId] = (counts[ci.itemId] ?? 0) + ci.qty
      })
    })
    return mod.items
      .filter((i: MenuItem) => i.active && (counts[i.id] ?? 0) > 0)
      .sort((a: MenuItem, b: MenuItem) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
      .slice(0, 8)
  })()

  // Filtered items — applies search on top of category filter
  const liveInvQty = (() => {
    const inv = storage.get<Array<{ name: string; quantity: number }>>('inventory') ?? []
    const m: Record<string, number> = {}
    inv.forEach(i => { m[i.name.toLowerCase()] = i.quantity })
    return m
  })()
  const isEightySixed = (itemName: string) => {
    const qty = liveInvQty[itemName.toLowerCase()]
    return qty !== undefined && qty === 0
  }
  const elapsedMins = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  const elapsedTime = (iso: string): string | null => {
    const m = elapsedMins(iso)
    if (m < 1) return null
    if (m >= 60) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'
    return m + 'm'
  }
  const elapsedColor = (iso: string) => {
    const m = elapsedMins(iso)
    return m >= 60 ? '#ef4444' : m >= 30 ? 'var(--ora)' : 'var(--txt3)'
  }

  const searchFiltered = filteredItems.filter((i: MenuItem) =>
    !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Selected table for current module
  const selTable = posState['restaurant'].selTable ?? posState['bar'].selTable

  // Active table's open order (for kitchen status display)
  const activeTableOrder = selTable ? openOrders.find(t => t.table === selTable) ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Order Workspace Header ── */}
      {onBack && orderContext && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          background: 'var(--bg3)', borderBottom: '2px solid var(--bdr)', flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          {/* Service type label */}
          <span style={{ fontSize: 12, fontWeight: 900, color: mod.color, textTransform: 'uppercase', letterSpacing: '.6px', flexShrink: 0 }}>
            {orderContext.orderType === 'dine-in' ? '🍽 Dine-In' : orderContext.orderType === 'takeout' ? '🥡 Takeout' : '🚗 Delivery'}
          </span>

          {/* Table pill */}
          {selTable && (
            <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--txt)', background: 'var(--surf)', padding: '4px 14px', borderRadius: 'var(--r)', border: `2px solid ${mod.color}44`, flexShrink: 0 }}>
              Table {selTable}
            </span>
          )}

          {/* Guest count — editable for dine-in */}
          {orderContext.orderType === 'dine-in' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <button onClick={() => setGuestCount(g => Math.max(1, g - 1))} style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', minWidth: 60, textAlign: 'center' }}>{guestCount} {guestCount === 1 ? 'Guest' : 'Guests'}</span>
              <button onClick={() => setGuestCount(g => g + 1)} style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          )}

          {/* Customer name */}
          {customerName && (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', background: 'var(--surf)', padding: '4px 10px', borderRadius: 'var(--r)', border: '1px solid var(--bdr)', flexShrink: 0 }}>
              {customerName}
            </span>
          )}

          {/* Phone */}
          {customerPhone && (
            <span style={{ fontSize: 12, color: 'var(--txt3)', fontFamily: 'var(--mono)', fontWeight: 600, flexShrink: 0 }}>
              {customerPhone}
            </span>
          )}

          {/* Delivery address */}
          {orderContext.address && (
            <span style={{ fontSize: 12, color: 'var(--txt3)', fontWeight: 600, flexShrink: 0 }}>
              📍 {orderContext.address}
            </span>
          )}

          {/* Server */}
          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>· {currentUser?.name}</span>

          {/* Kitchen status chips */}
          {activeTableOrder && (
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              {[
                { label: 'Sent ✓', done: true },
                { label: 'Ready', done: activeTableOrder.kitchenStatus === 'ready' || activeTableOrder.status === 'ready' || activeTableOrder.status === 'served' },
                { label: 'Served', done: activeTableOrder.status === 'served' },
              ].map(s => (
                <span key={s.label} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, color: s.done ? 'var(--grn)' : 'var(--txt3)', background: s.done ? '#14532d22' : 'var(--surf)', border: `1px solid ${s.done ? '#16a34a44' : 'var(--bdr)'}` }}>{s.label}</span>
              ))}
            </div>
          )}

          {/* Open / Held */}
          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
            <button onClick={() => setShowOpen(true)} style={{ padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${openOrders.length > 0 ? 'var(--grn)' : 'var(--bdr)'}`, background: openOrders.length > 0 ? '#14532d22' : 'transparent', color: openOrders.length > 0 ? 'var(--grn)' : 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Open{openOrders.length > 0 && <span style={{ background: 'var(--grn)', color: '#fff', borderRadius: 6, fontSize: 9, padding: '0 4px', fontWeight: 800 }}>{openOrders.length}</span>}
            </button>
            <button onClick={() => setShowHeld(true)} style={{ padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${state.heldOrders.length > 0 ? 'var(--ora)' : 'var(--bdr)'}`, background: state.heldOrders.length > 0 ? '#78350f22' : 'transparent', color: state.heldOrders.length > 0 ? 'var(--ora)' : 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Held{state.heldOrders.length > 0 && <span style={{ background: 'var(--ora)', color: '#fff', borderRadius: 6, fontSize: 9, padding: '0 4px', fontWeight: 800 }}>{state.heldOrders.length}</span>}
            </button>
          </div>

          {/* Back link */}
          <button onClick={onBack} style={{ padding: '5px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            ← Back
          </button>
        </div>
      )}

      {/* ── Legacy nav bar — when onBack is set but no orderContext ── */}
      {onBack && !orderContext && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
          background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', flexShrink: 0,
        }}>
          <button onClick={onBack} style={{
            padding: '6px 14px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)',
            background: 'var(--surf)', color: 'var(--txt2)', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>← Dashboard</button>
          <div style={{ fontSize: 12, color: 'var(--txt3)', fontWeight: 600 }}>
            {cartOrderType === 'dine-in'  ? '🍽 Dine-In'  :
             cartOrderType === 'takeout'  ? '🥡 Takeout'  :
             cartOrderType === 'delivery' ? '🚗 Delivery'  : 'Order Entry'}
            {posState['restaurant'].selTable ? ` · Table ${posState['restaurant'].selTable}` : ''}
          </div>
        </div>
      )}

      {/* ── Carwash toolbar (bay, plate, tabs) ── */}
      {activeModule === 'carwash' && (

        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg2)' }}>
          {/* Tab switcher */}
          {(['pos','orders'] as const).map(t => (
            <button key={t} onClick={() => setCwTab(t)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${cwTab === t ? 'transparent' : 'var(--bdr)'}`,
              background: cwTab === t ? 'var(--blue)' : 'transparent',
              color: cwTab === t ? '#fff' : 'var(--txt2)',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .12s', minHeight: 36,
            }}>
              {t === 'pos' ? 'New Sale' : 'Outside Orders'}
              {t === 'orders' && pendingCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 800, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}

          {/* Bay selector + plate input (POS tab only) */}
          {cwTab === 'pos' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={ps.selTable ?? ''}
                onChange={e => setPOS({ selTable: e.target.value || null })}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minWidth: 110 }}
              >
                <option value="">— Bay —</option>
                {(mod.bays as string[])?.map((b: string) => (
                  <option key={b} value={b}>{b} {mod.bayStatus?.[b] === 'occupied' ? '(Busy)' : '(Open)'}</option>
                ))}
              </select>
              <input
                value={ps.plate}
                onChange={e => setPOS({ plate: e.target.value.toUpperCase() })}
                placeholder="PLATE-000"
                maxLength={10}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt)', fontSize: 12, fontWeight: 700, width: 105, fontFamily: 'var(--mono)', letterSpacing: 1 }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Outside orders panel ── */}
      {activeModule === 'carwash' && cwTab === 'orders' ? (
        <OutsideOrders onCountChange={setPendingCount} />
      ) : (

        /* ── Redesigned 2-panel POS ── */
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── LEFT: Menu panel (40%) ── */}
          <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--bdr)' }}>

            {/* Category tabs + search bar */}
            <div style={{ borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
              <div style={{ padding: '8px 12px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
                {cats.map((cat: string) => (
                  <button key={cat} onClick={() => { setPOS({ cat }); setSearchQuery('') }} style={{
                    padding: '8px 18px', borderRadius: '20px 20px 0 0', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', border: `1.5px solid ${ps.cat === cat ? mod.color : 'var(--bdr)'}`,
                    borderBottom: ps.cat === cat ? `2px solid ${mod.color}` : '1.5px solid var(--bdr)',
                    color: ps.cat === cat ? mod.color : 'var(--txt2)', whiteSpace: 'nowrap', minHeight: 40,
                    background: ps.cat === cat ? mod.color + '15' : 'transparent', transition: 'all .12s', flexShrink: 0,
                  }}>{cat}</button>
                ))}
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--txt3)', pointerEvents: 'none' }}>🔍</span>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search menu..."
                    style={{ width: '100%', padding: '8px 10px 8px 34px', borderRadius: 10, border: `1.5px solid ${searchQuery ? mod.color : 'var(--bdr)'}`, background: 'var(--surf2)', color: 'var(--txt)', fontSize: 13, fontWeight: 500, boxSizing: 'border-box' }} />
                </div>
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}>×</button>
                )}
              </div>
            </div>

            {/* Menu content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

              {/* Quick Picks */}
              {quickPicks.length > 0 && !searchQuery && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: mod.color, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>⚡ Quick Picks</div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {quickPicks.map((item: MenuItem) => (
                      <button key={item.id} onClick={() => handleItemClick(item)} style={{
                        padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${mod.color}44`,
                        background: 'var(--surf)', color: 'var(--txt)', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center',
                        whiteSpace: 'nowrap', transition: 'all .12s',
                      }}>
                        {item.name}
                        <span style={{ color: mod.color, fontFamily: 'var(--mono)', fontSize: 11 }}>{fmt(item.price, sym)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search result count */}
              {searchQuery && (
                <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 10 }}>
                  {searchFiltered.length} result{searchFiltered.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                </div>
              )}

              {/* Item grid — 3 columns */}
              {liveMenuItems === null && (activeModule === 'restaurant' || activeModule === 'bar') ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt3)', fontSize: 13 }}>
                  Loading menu…
                </div>
              ) : searchFiltered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt3)', fontSize: 13 }}>
                  {searchQuery ? <>No items match &ldquo;{searchQuery}&rdquo;</> : 'No menu items in this category'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {searchFiltered.map((item: MenuItem) => {
                    const eightySixed = isEightySixed(item.name)
                    return (
                    <div key={item.id} onClick={() => !eightySixed && handleItemClick(item)} style={{
                      background: eightySixed ? 'var(--surf2)' : (item.gradient ?? 'var(--surf)'),
                      border: '2px solid var(--bdr)',
                      borderRadius: 'var(--r3)', cursor: eightySixed ? 'not-allowed' : 'pointer', overflow: 'hidden',
                      transition: 'all .15s', display: 'flex', flexDirection: 'column', minHeight: 130,
                      opacity: eightySixed ? 0.55 : 1,
                    }}>
                      {eightySixed ? (
                        <div style={{ padding: '3px 8px', background: '#7f1d1d33', borderBottom: '1px solid #ef444433', fontSize: 10, fontWeight: 800, color: '#ef4444', textAlign: 'center', letterSpacing: '.5px' }}>{'86\'d — OUT'}</div>
                      ) : item.duration ? (
                        <div style={{ padding: '3px 8px', background: 'var(--surf2)', borderBottom: '1px solid var(--bdr)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)' }}>{item.duration}</div>
                      ) : null}
                      <div style={{ padding: '11px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: eightySixed ? 'var(--txt3)' : 'var(--txt)', lineHeight: 1.25, textDecoration: eightySixed ? 'line-through' : 'none' }}>{item.name}</div>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: eightySixed ? 'var(--txt3)' : (item.accent ?? mod.color), marginTop: 8, letterSpacing: '-.3px' }}>
                          {eightySixed ? '86 OUT' : fmt(item.price, sym)}
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Order ticket (60%) ── */}
          <div style={{ flex: '0 0 60%', minWidth: 340, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Table / Server / Status header — hidden when workspace header is active */}
            {!orderContext && <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg3)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  {selTable ? (
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--txt)', lineHeight: 1, letterSpacing: '-.5px' }}>Table {selTable}</div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt3)' }}>No Table Selected</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                    {currentUser?.name}{guestCount > 1 ? ` · ${guestCount} guests` : ' · 1 guest'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  {cart.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 8, background: '#14532d22', color: 'var(--grn)', border: '1px solid #16a34a44', whiteSpace: 'nowrap' }}>OPEN ORDER</span>}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setShowOpen(true)} style={{ padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${openOrders.length > 0 ? 'var(--grn)' : 'var(--bdr)'}`, background: openOrders.length > 0 ? '#14532d22' : 'transparent', color: openOrders.length > 0 ? 'var(--grn)' : 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      Open{openOrders.length > 0 && <span style={{ background: 'var(--grn)', color: '#fff', borderRadius: 6, fontSize: 9, padding: '0 4px', fontWeight: 800 }}>{openOrders.length}</span>}
                    </button>
                    <button onClick={() => setShowHeld(true)} style={{ padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${state.heldOrders.length > 0 ? 'var(--ora)' : 'var(--bdr)'}`, background: state.heldOrders.length > 0 ? '#78350f22' : 'transparent', color: state.heldOrders.length > 0 ? 'var(--ora)' : 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      Held{state.heldOrders.length > 0 && <span style={{ background: 'var(--ora)', color: '#fff', borderRadius: 6, fontSize: 9, padding: '0 4px', fontWeight: 800 }}>{state.heldOrders.length}</span>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Kitchen status tracker */}
              {activeTableOrder && (
                <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Kitchen Sent ✓', done: true },
                    { label: 'Food Ready', done: activeTableOrder.kitchenStatus === 'ready' || activeTableOrder.status === 'ready' || activeTableOrder.status === 'served' },
                    { label: 'Served', done: activeTableOrder.status === 'served' },
                  ].map(step => (
                    <div key={step.label} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, color: step.done ? 'var(--grn)' : 'var(--txt3)', background: step.done ? '#14532d22' : 'var(--surf)', border: `1px solid ${step.done ? '#16a34a44' : 'var(--bdr)'}` }}>{step.label}</div>
                  ))}
                </div>
              )}

              {/* Table selector — floor plan or dropdown */}
              {(activeModule === 'restaurant' || activeModule === 'bar') && (mod.tables as string[])?.length > 0 && (
                showFloorPlan ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: mod.color, textTransform: 'uppercase', letterSpacing: '.5px' }}>Floor Plan</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 9, color: 'var(--txt3)' }}>
                        <span style={{ color: 'var(--grn)' }}>● Free</span>
                        <span style={{ color: 'var(--ora)' }}>● Occupied</span>
                        <span style={{ color: '#ef4444' }}>● Pay Now</span>
                        <button onClick={() => setShowFloorPlan(false)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer', fontWeight: 700 }}>List ▾</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
                      {(mod.tables as string[]).map((tbl: string) => {
                        const tOrder = tableOrderMap[tbl]
                        const tStatus = tOrder ? ((tOrder.status === 'ready' || tOrder.status === 'served') ? 'paying' : 'occupied') : 'free'
                        const tColors = tStatus === 'free' ? { bg: '#14532d22', border: '#16a34a55', color: 'var(--grn)' }
                          : tStatus === 'occupied' ? { bg: '#78350f22', border: '#d9770055', color: 'var(--ora)' }
                          : { bg: '#7f1d1d22', border: '#ef444455', color: '#ef4444' }
                        const isSel = selTable === tbl
                        return (
                          <button key={tbl} onClick={() => setPOS({ selTable: isSel ? null : tbl })} style={{ padding: '7px 4px', borderRadius: 'var(--r2)', textAlign: 'center', cursor: 'pointer', border: `2px solid ${isSel ? mod.color : tColors.border}`, background: isSel ? mod.color + '33' : tColors.bg, color: isSel ? mod.color : tColors.color }}>
                            <div style={{ fontSize: 11, fontWeight: 800 }}>{tbl}</div>
                            <div style={{ fontSize: 8, opacity: .75, marginTop: 1 }}>{tStatus === 'free' ? 'Free' : tStatus === 'occupied' ? `#${tOrder!.orderNum}` : 'Pay'}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={ps.selTable ?? ''} onChange={e => setPOS({ selTable: e.target.value || null })}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: ps.selTable ? 'var(--txt)' : 'var(--txt3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <option value="">— Select Table —</option>
                      {(mod.tables as string[]).map((tbl: string) => {
                        const tOrder = tableOrderMap[tbl]
                        const tStatus = (mod.tableStatus as Record<string, string>)?.[tbl] ?? 'free'
                        return <option key={tbl} value={tbl}>{tbl}{tOrder ? ` (Order #${tOrder.orderNum})` : tStatus === 'reserved' ? ' (Reserved)' : ''}</option>
                      })}
                    </select>
                    <button onClick={() => setShowFloorPlan(true)} title="Floor plan view" style={{ flexShrink: 0, padding: '7px 11px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt3)', cursor: 'pointer', fontSize: 15 }}>⊞</button>
                  </div>
                )
              )}
            </div>}

            {/* Customer / order type / guests — only when no orderContext (workspace mode hides this) */}
            {(activeModule === 'restaurant' || activeModule === 'bar') && !orderContext && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bdr)', flexShrink: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 6 }}>
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name (optional)"
                    style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--txt)', fontSize: 11, fontWeight: 600 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => setGuestCount(g => Math.max(1, g-1))} style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 800, minWidth: 20, textAlign: 'center', color: 'var(--txt)' }}>{guestCount}</span>
                    <button onClick={() => setGuestCount(g => g+1)} style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </div>
              </div>
            )}

            {/* Cart items — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', minHeight: 0 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 10px', color: 'var(--txt3)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🍽</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Tap menu items to add</div>
                </div>
              ) : (
                cart.map((ci: CartItem) => {
                  const badge = MOD_BADGE[ci.module] ?? MOD_BADGE.restaurant
                  const lineTotal = (ci.price + ci.addons.reduce((s, a) => s + a.price, 0)) * ci.qty
                  const isVoided = !!ci.voided
                  return (
                    <div key={ci.id} style={{ background: isVoided ? 'var(--surf3)' : 'var(--surf)', borderRadius: 'var(--r)', marginBottom: 7, overflow: 'hidden', border: `1px solid ${isVoided ? '#ef444433' : 'var(--bdr)'}`, opacity: isVoided ? .55 : 1, display: 'flex' }}>
                      <div style={{ width: 4, background: isVoided ? '#ef4444' : badge.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: '9px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: isVoided ? 'var(--txt3)' : 'var(--txt)', textDecoration: isVoided ? 'line-through' : 'none', lineHeight: 1.2 }}>{ci.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 5 }}>×{ci.qty}</span>
                            {isVoided && <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginLeft: 6 }}>VOID</span>}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: isVoided ? 'var(--txt3)' : 'var(--txt)', flexShrink: 0, textDecoration: isVoided ? 'line-through' : 'none' }}>{fmt(lineTotal, sym)}</span>
                        </div>
                        {isVoided && ci.voidReason && (
                          <div style={{ fontSize: 10, color: '#ef4444', marginBottom: 3 }}>{ci.voidReasonText || VOID_REASON_LABELS[ci.voidReason]} · {ci.voidedBy}</div>
                        )}
                        {!isVoided && (
                          <>
                            {ci.flavour && <div style={{ fontSize: 11, color: 'var(--ora)', marginBottom: 1 }}>Flavour: {ci.flavour}</div>}
                            {ci.size    && <div style={{ fontSize: 11, color: 'var(--pur)', marginBottom: 1 }}>Size: {ci.size}</div>}
                            {ci.sides && ci.sides.length > 0 && <div style={{ fontSize: 11, color: 'var(--grn)', marginBottom: 1 }}>Sides: {ci.sides.join(', ')}</div>}
                            {ci.addons.map(a => (
                              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--txt3)', marginBottom: 1 }}>
                                <span>{a.name}</span><span>+{fmt(a.price, sym)}</span>
                              </div>
                            ))}
                            {ci.plate && <div style={{ fontSize: 11, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 700 }}>Plate: {ci.plate}</div>}
                            {ci.note && editingNoteId !== ci.id && <div style={{ fontSize: 11, color: 'var(--txt3)', fontStyle: 'italic', marginTop: 2 }}>Note: {ci.note}</div>}
                            {editingNoteId === ci.id && (
                              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                                <textarea autoFocus value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Special instructions..." rows={2} style={{ flex: 1, padding: '6px 8px', borderRadius: 'var(--r)', border: '1.5px solid var(--blue)', background: 'var(--bg3)', color: 'var(--txt)', fontSize: 12, resize: 'none' }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <button onClick={() => { dispatch({ type: 'UPDATE_CART_NOTE', id: ci.id, note: noteInput }); setEditingNoteId(null) }} style={{ padding: '4px 8px', borderRadius: 'var(--r)', background: 'var(--grn)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Save</button>
                                  <button onClick={() => setEditingNoteId(null)} style={{ padding: '4px 8px', borderRadius: 'var(--r)', background: 'var(--bg3)', color: 'var(--txt3)', border: '1px solid var(--bdr)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {!isVoided && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                            {!isVoided && (<button onClick={() => { setNoteInput(ci.note ?? ''); setEditingNoteId(editingNoteId === ci.id ? null : ci.id) }} title="Edit note" style={{ background: editingNoteId === ci.id ? 'var(--blue)' : 'var(--bg3)', border: '1px solid var(--bdr)', color: editingNoteId === ci.id ? '#fff' : ci.note ? 'var(--blue)' : 'var(--txt3)', borderRadius: 'var(--r)', width: 28, height: 28, cursor: 'pointer', fontSize: 13 }}>✏️</button>)}
                            <button onClick={() => dispatch({ type: 'UPDATE_CART_QTY', id: ci.id, qty: ci.qty - 1 })}
                              style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>−</button>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, minWidth: 22, textAlign: 'center', color: 'var(--txt)' }}>{ci.qty}</span>
                            <button onClick={() => dispatch({ type: 'UPDATE_CART_QTY', id: ci.id, qty: ci.qty + 1 })}
                              style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>+</button>
                            {canVoidCartItem && (
                              <button onClick={() => setVoidTarget({ item: ci })}
                                style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: '#7f1d1d22', border: '1px solid #ef444433', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>VOID</button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* ── STICKY TOTALS + ACTIONS ── */}
            <div style={{ borderTop: '2px solid var(--bdr)', background: 'var(--bg3)', flexShrink: 0 }}>

              {/* Discount — visible only when Pay is open */}
              {showDetails && <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--bdr2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--txt3)', flex: 1 }}>Discount</span>
                <button onClick={() => { setDiscMode(m => m === 'pct' ? 'flat' : 'pct'); setDiscPct(0); setDiscFlat(0) }}
                  style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--txt3)', cursor: 'pointer', fontWeight: 700 }}>
                  {discMode === 'pct' ? '%' : sym}
                </button>
                {discMode === 'pct' ? (
                  <>
                    <input type="number" min={0} max={100} value={discPct || ''} onChange={e => { const v = Math.min(100, Math.max(0, Number(e.target.value)||0)); if (v > 20 && !isManager) return; setDiscPct(v) }} placeholder="0"
                      style={{ width: 46, background: 'var(--surf2)', border: `1px solid ${discPct>0?'var(--grn)':'var(--bdr2)'}`, borderRadius: 6, padding: '4px 6px', fontSize: 13, color: discPct>0?'var(--grn)':'var(--txt)', textAlign: 'right' }} />
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>%</span>
                  </>
                ) : (
                  <>
                    <input type="number" min={0} value={discFlat || ''} onChange={e => { const v = Math.max(0, Number(e.target.value)||0); if (v > calc.sub*0.2 && !isManager) return; setDiscFlat(v) }} placeholder="0"
                      style={{ width: 60, background: 'var(--surf2)', border: `1px solid ${discFlat>0?'var(--grn)':'var(--bdr2)'}`, borderRadius: 6, padding: '4px 6px', fontSize: 13, color: discFlat>0?'var(--grn)':'var(--txt)', textAlign: 'right' }} />
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{sym}</span>
                  </>
                )}
                {(discPct > 0 || discFlat > 0) && (
                  <button onClick={() => { setDiscPct(0); setDiscFlat(0) }} style={{ fontSize: 14, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
                )}
              </div>}

              {/* Totals */}
              <div style={{ padding: '8px 14px' }}>
                {/* Subtotal / disc / GCT / service — only when Pay is open */}
                {showDetails && ([
                  { label: 'Subtotal', value: fmt(calc.sub, sym), color: 'var(--txt3)' },
                  calc.disc > 0 && { label: discMode==='pct' ? `Discount (${discPct}%)` : 'Discount', value: `−${fmt(calc.disc,sym)}`, color: 'var(--grn)' },
                  calc.gct > 0  && { label: `GCT (${(calc.gctRate*100).toFixed(0)}%)`, value: fmt(calc.gct,sym), color: 'var(--txt3)' },
                  calc.serviceCharge > 0 && { label: `Service (${(calc.scRate*100).toFixed(0)}%)`, value: fmt(calc.serviceCharge,sym), color: 'var(--txt3)' },
                ].filter(Boolean) as {label:string;value:string;color:string}[]).map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: row.color }}>{row.label}</span>
                    <span style={{ fontWeight: 700, color: row.color, fontFamily: 'var(--mono)' }}>{row.value}</span>
                  </div>
                ))}

                {/* Gratuity — only when Pay is open */}
                {showDetails && hasRestaurantItems && cartOrderType === 'dine-in' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--txt3)' }}>Gratuity ({gratuityPct}%)</span>
                      {isManager && !showGratEdit && (
                        <button onClick={() => { setGratInput(String(gratuityPct)); setShowGratEdit(true) }}
                          style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer' }}>edit</button>
                      )}
                      {isManager && showGratEdit && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <input type="number" min={0} max={50} value={gratInput} onChange={e => setGratInput(e.target.value)}
                            style={{ width: 38, padding: '1px 5px', borderRadius: 5, border: '1px solid var(--bdr)', background: 'var(--surf2)', color: 'var(--txt)', fontSize: 11, textAlign: 'center' }} />
                          <span style={{ fontSize: 9, color: 'var(--txt3)' }}>%</span>
                          <button onClick={() => { const v = Math.max(0, Math.min(50, parseFloat(gratInput)||0)); setGratuityPct(v); setGratuityOverride(true); setShowGratEdit(false); audit('GRATUITY_OVERRIDE',`Set gratuity to ${v}%`,'warn') }}
                            style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, border: '1px solid var(--grn)', background: '#14532d22', color: 'var(--grn)', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                          <button onClick={() => setShowGratEdit(false)} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, border: '1px solid var(--bdr)', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer' }}>✕</button>
                        </div>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, color: gratuityPct>0?'var(--txt2)':'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 12 }}>{gratuityPct>0?fmt(calc.gratuity,sym):'—'}</span>
                  </div>
                )}

                {/* TOTAL */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 8, borderTop: '2px solid var(--bdr)' }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--txt)', letterSpacing: '-.3px' }}>TOTAL</span>
                  <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--mono)', color: cart.length > 0 ? 'var(--blue)' : 'var(--txt3)', letterSpacing: '-.5px' }}>{fmt(calc.total, sym)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>

                {/* Send Order + Add to Order */}
                <div style={{ display: 'grid', gridTemplateColumns: openOrders.length > 0 ? '1fr 1fr' : '1fr', gap: 6 }}>
                  <button onClick={sendOrder} disabled={activeCart.length === 0} style={{ minHeight: 32, borderRadius: 'var(--r)', fontSize: 11, fontWeight: 900, border: 'none', cursor: activeCart.length > 0 ? 'pointer' : 'not-allowed', color: activeCart.length > 0 ? '#fff' : 'var(--txt3)', background: activeCart.length > 0 ? 'var(--grn)' : 'var(--surf3)', letterSpacing: '.2px', transition: 'all .15s' }}>
                    Send Order
                  </button>
                  {openOrders.length > 0 && (
                    <button onClick={() => { setAddToOrderMode(true); setShowOpen(true) }} disabled={activeCart.length === 0} style={{ minHeight: 32, borderRadius: 'var(--r)', fontSize: 11, fontWeight: 800, color: activeCart.length > 0 ? 'var(--grn)' : 'var(--txt3)', background: activeCart.length > 0 ? '#14532d22' : 'var(--surf3)', border: `1.5px solid ${activeCart.length > 0 ? 'var(--grn)' : 'var(--bdr)'}`, cursor: activeCart.length > 0 ? 'pointer' : 'not-allowed', transition: 'all .15s' }}>
                      Add to Order
                    </button>
                  )}
                </div>

                {/* Pay */}
                <button onClick={() => { if (cart.length===0) return; setShowDetails(true); setShowPayment(true) }} disabled={cart.length === 0} style={{ width: '100%', minHeight: 36, borderRadius: 'var(--r)', fontSize: 12, fontWeight: 900, border: 'none', cursor: cart.length > 0 ? 'pointer' : 'not-allowed', color: cart.length > 0 ? '#fff' : 'var(--txt3)', background: cart.length > 0 ? 'var(--blue)' : 'var(--surf3)', letterSpacing: '.3px', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  ✓ Pay {cart.length > 0 ? fmt(calc.total, sym) : '—'}
                </button>

                {/* Split / Hold / Clear */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <button onClick={() => { if (cart.length===0) return; setShowSplitBill(true) }}
                    style={{ minHeight: 44, borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Split</button>
                  <button onClick={holdOrder}
                    style={{ minHeight: 44, borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', cursor: 'pointer' }}>Hold</button>
                  <button onClick={() => {
                      if (cart.length === 0) return
                      if (!confirmClear) { setConfirmClear(true); return }
                      setConfirmClear(false)
                      dispatch({ type: 'CLEAR_CART' })
                    }}
                    style={{ minHeight: 44, borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: confirmClear ? '#7f1d1d22' : 'transparent', color: confirmClear ? '#ef4444' : 'var(--txt3)', border: `1.5px solid ${confirmClear ? '#ef4444' : 'var(--bdr)'}`, cursor: cart.length > 0 ? 'pointer' : 'not-allowed' }}>
                    {confirmClear ? 'Confirm?' : 'Clear'}
                  </button>
                </div>

                <button onClick={() => setShowOpenItem(true)}
                  style={{ width: '100%', minHeight: 36, borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--ora)', border: '1px solid rgba(249,115,22,.3)', cursor: 'pointer', letterSpacing: '.2px' }}>
                  &#43; Open Item
                </button>
                <button onClick={() => setShowNoSale(true)}
                style={{ width: '100%', minHeight: 36, borderRadius: 'var(--r2)', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1px dashed var(--bdr)', cursor: 'pointer', letterSpacing: '.3px' }}>
                No Sale &#8212; Open Drawer
              </button>
              {/* Reprint */}
                {lastTx && lastTicket && (
                  <button onClick={() => setShowTicket(true)} style={{ width: '100%', padding: '8px 0', borderRadius: 'var(--r2)', fontSize: 11, fontWeight: 700, background: 'transparent', color: 'var(--txt3)', border: '1.5px dashed var(--bdr)', cursor: 'pointer' }}>
                    Reprint Last Receipt
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── Held Orders Panel ── */}
      {showHeld && (
        <div onClick={() => setShowHeld(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', flex: 1 }}>Held Orders</span>
              <button onClick={() => setShowHeld(false)} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {state.heldOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--txt3)', fontSize: 13 }}>No held orders.</div>
              ) : state.heldOrders.map(h => (
                <div key={h.id} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>{h.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                        {h.cart.length} items · Saved {h.savedAt} by {h.savedBy}
                        {h.openedAt && (() => { const t = elapsedTime(h.openedAt!); return t ? <span style={{ color: elapsedColor(h.openedAt!), fontWeight: 700, marginLeft: 4 }}>· {t}</span> : null })()}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>
                      {fmt(calcCart(h.cart, { orderType: h.orderType, gratuityPct: h.gratuityPct }).total, sym)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => resumeOrder(h)} style={{ flex: 2, padding: '9px 0', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      Resume
                    </button>
                    <button onClick={() => {
                        if (confirmDeleteHeld !== h.id) { setConfirmDeleteHeld(h.id); return }
                        setConfirmDeleteHeld(null)
                        dispatch({ type: 'REMOVE_HELD_ORDER', id: h.id })
                      }}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 'var(--r)', background: 'transparent', color: confirmDeleteHeld === h.id ? '#fbbf24' : '#ef4444', border: `1px solid ${confirmDeleteHeld === h.id ? '#fbbf24' : '#ef444444'}`, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      {confirmDeleteHeld === h.id ? 'Sure?' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Open Orders Panel ── */}
      {showOpen && (
        <div onClick={() => { setShowOpen(false); setAddToOrderMode(false); setTransferTarget(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)', width: '100%', maxWidth: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: addToOrderMode ? 'var(--grn)' : 'var(--txt)', flex: 1 }}>
                {addToOrderMode ? `Add ${activeCart.length} item(s) to Order` : 'Open Orders'}
              </span>
              {addToOrderMode && <button onClick={() => setAddToOrderMode(false)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>Cancel</button>}
              <button onClick={() => { setShowOpen(false); setAddToOrderMode(false); setTransferTarget(null) }} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {openOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--txt3)', fontSize: 13 }}>No open orders.</div>
              ) : openOrders.map(t => {
                const activeItems = t.items.filter(ci => !ci.voided)
                const tCalc = calcCart(activeItems, { orderType: t.orderType as OrderType, manualDiscPct: t.discPct, manualDiscFlat: t.discFlat, gratuityPct: t.gratuityPct ?? 0 })
                const statusColors: Record<string, string> = { sent: 'var(--blue)', preparing: 'var(--ora)', ready: 'var(--grn)', served: 'var(--txt2)' }
                const statusColor = statusColors[t.status ?? 'sent'] ?? 'var(--txt3)'
                const isTransferring = transferTarget === t.id
                const allTables = [
                  ...(customTables?.restaurant ?? MODULE_DATA.restaurant.tables ?? []),
                  ...(customTables?.bar        ?? MODULE_DATA.bar.tables        ?? []),
                ].filter(tbl => tbl !== t.table && !tableOrderMap[tbl])
                return (
                  <div key={t.id} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '12px 14px', marginBottom: 8 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>#{t.orderNum}</span>
                          {t.table && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Table {t.table}</span>}
                          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: statusColor + '22', borderRadius: 8, padding: '1px 7px', textTransform: 'uppercase' }}>{t.status ?? 'sent'}</span>
                          {/* Transfer table button */}
                          {canVoidSentItem && allTables.length > 0 && !isTransferring && (
                            <button onClick={() => setTransferTarget(t.id)}
                              style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'var(--surf3)', border: '1px solid var(--bdr)', color: 'var(--txt3)', cursor: 'pointer' }}>
                              Transfer
                            </button>
                          )}
                        </div>
                        {/* Transfer table selector */}
                        {isTransferring && (
                          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select onChange={e => { if (e.target.value) transferTable(t.id, e.target.value) }} defaultValue=""
                              style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--grn)', background: 'var(--surf2)', color: 'var(--txt)', fontSize: 12 }}>
                              <option value="">— Move to table —</option>
                              {allTables.map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
                            </select>
                            <button onClick={() => setTransferTarget(null)} style={{ fontSize: 11, color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>
                          {activeItems.length} items · {t.server}{t.customerName ? ` · ${t.customerName}` : ''}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--grn)' }}>
                        {fmt(tCalc.total, sym)}
                      </div>
                    </div>
                    {/* Items */}
                    <div style={{ marginBottom: 8, maxHeight: 110, overflowY: 'auto' }}>
                      {t.items.map((ci, i) => (
                        <div key={i} style={{ fontSize: 11, color: ci.voided ? '#ef444488' : 'var(--txt2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', gap: 6, textDecoration: ci.voided ? 'line-through' : 'none' }}>
                          <span style={{ flex: 1 }}>{ci.qty}× {ci.name}{ci.voided ? ' [VOID]' : ''}</span>
                          <span style={{ fontFamily: 'var(--mono)', flexShrink: 0 }}>{fmt(ci.price * ci.qty, sym)}</span>
                          {!ci.voided && canVoidSentItem && (
                            <button onClick={() => setVoidTarget({ item: ci, ticketId: t.id })}
                              style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 5, background: '#7f1d1d22', border: '1px solid #ef444433', color: '#ef4444', cursor: 'pointer', fontSize: 9, fontWeight: 800 }}>
                              VOID
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Actions */}
                    {addToOrderMode ? (
                      <button onClick={() => addToExistingOrder(t)}
                        style={{ width: '100%', padding: '9px 0', borderRadius: 'var(--r)', background: 'var(--grn)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        Add {activeCart.length} Item(s) to #{t.orderNum}
                      </button>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: isManager ? '1fr auto' : '1fr', gap: 6 }}>
                        <button onClick={() => { setPayingTicket(t); setGratuityPct(t.gratuityPct ?? 15); setGratuityOverride(true); setShowOpen(false); setShowPayment(true) }}
                          style={{ padding: '9px 0', borderRadius: 'var(--r)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          Pay {fmt(tCalc.total, sym)}
                        </button>
                        {isManager && (
                          <button onClick={() => setVoidOrderTarget(t)}
                            style={{ padding: '9px 12px', borderRadius: 'var(--r)', background: '#7f1d1d22', color: '#ef4444', border: '1px solid #ef444433', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            Void Order
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ── */}
      <PaymentModal
        isOpen={showPayment}
        onClose={() => { setShowPayment(false); setPayingTicket(null); setShowDetails(false); setGratuityOverride(false); setSurcharges([]) }}
        calc={splitTarget ? splitTarget.calc : payCalc}
        gratuityPct={gratuityPct}
        onGratuityChange={pct => { setGratuityPct(pct); setGratuityOverride(true) }}
        isManager={isManager}
        sym={sym}
        selTable={payingTicket?.table ?? posState['restaurant'].selTable ?? posState['bar'].selTable}
        guestCount={payingTicket?.guestCount ?? guestCount}
        customerName={payingTicket?.customerName ?? customerName}
        surcharges={surcharges}
        onSurchargesChange={setSurcharges}
        onComplete={payData => completeCheckout(payData, splitTarget?.calc)}
      />

      {/* ── Ticket Modal ── */}
      {lastTx && lastTicket && (
        <TicketModal
          isOpen={showTicket}
          onClose={() => { setShowTicket(false); onPaymentComplete?.() }}
          ticket={lastTicket}
          tx={lastTx}
          biz={biz}
        />
      )}

      {/* ── Split Bill Modal ── */}
      <SplitBillModal
        isOpen={showSplitBill}
        onClose={() => setShowSplitBill(false)}
        cart={payingTicket ? payingTicket.items : cart}
        orderType={(payingTicket?.orderType ?? cartOrderType) as OrderType}
        gratuityPct={payingTicket?.gratuityPct ?? gratuityPct}
        sym={sym}
        onPaySplit={split => {
          setShowSplitBill(false)
          setSplitTarget({ calc: split.calc, label: split.label })
          setShowPayment(true)
        }}
        onPayAll={() => { setShowSplitBill(false); setShowPayment(true) }}
        onAllPaid={() => {
          if (payingTicket) {
            dispatch({ type: 'UPDATE_ORDER_TICKET', id: payingTicket.id, patch: { status: 'paid' } })
            setPayingTicket(null)
          }
          setShowSplitBill(false)
          setSplitTarget(null)
          dispatch({ type: 'CLEAR_CART' })
        }}
      />

      {/* ── Void Item Modal ── */}
      <VoidReasonModal
        isOpen={!!voidTarget}
        itemName={voidTarget?.item.name ?? ''}
        itemQty={voidTarget?.item.qty}
        onClose={() => setVoidTarget(null)}
        onConfirm={(reason, reasonText) => {
          if (!voidTarget) return
          if (voidTarget.ticketId) {
            const ticket = state.orderTickets.find(t => t.id === voidTarget.ticketId)
            if (ticket) handleVoidTicketItem(ticket, voidTarget.item, reason, reasonText)
          } else {
            handleVoidCartItem(voidTarget.item, reason, reasonText)
          }
        }}
      />

      {/* ── Void Entire Order Modal ── */}
      <OpenItemModal isOpen={showOpenItem} onClose={() => setShowOpenItem(false)} onAdd={handleAddOpenItem} currencySymbol={sym} />
      <NoSaleModal isOpen={showNoSale} onClose={() => setShowNoSale(false)} />
      <VoidReasonModal
        isOpen={!!voidOrderTarget}
        itemName={voidOrderTarget ? `Order #${voidOrderTarget.orderNum} (${voidOrderTarget.items.filter(ci => !ci.voided).length} items)` : ''}
        onClose={() => setVoidOrderTarget(null)}
        onConfirm={(reason, reasonText) => {
          if (voidOrderTarget) handleVoidEntireOrder(voidOrderTarget, reason, reasonText)
        }}
      />

      {/* ── Add-ons Modal ── */}
      {modalItem && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') closeModal() }}
            style={{
              background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r4)',
              width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,.5)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              outline: 'none',
            }}
          >
            {/* Modal header — item name + price */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{modalItem.name}</div>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: mod.color }}>
                {fmt(modalSizeId ? modalSizePrice : modalItem.price, sym)}
              </div>
            </div>

            {/* Scrollable modal body */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '60vh' }}>

              {/* ─── Size picker ─── */}
              {(() => {
                const assignment = liveAssignments[modalItem!.id]
                const itemSizes = (assignment?.sizes ?? []).map(s => ({ ...liveSizesDefs.find(sz => sz.id === s.size_id), price: s.price })).filter(s => s.id)
                if (itemSizes.length === 0) return null
                return (
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--bdr)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Size <span style={{ color: 'var(--red)', fontSize: 10 }}>*required</span></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {itemSizes.map(sz => {
                        const selected = modalSizeId === sz.id
                        return (
                          <button key={sz.id} onClick={() => { setModalSizeId(sz.id!); setModalSizePrice(sz.price) }}
                            style={{ padding: '8px 16px', borderRadius: 'var(--r)', border: `2px solid ${selected ? mod.color : 'var(--bdr)'}`, background: selected ? 'var(--surf2)' : 'transparent', color: selected ? 'var(--txt)' : 'var(--txt2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {sz.name} — {sym}{sz.price.toLocaleString()}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* ─── Flavour picker ─── */}
              {(() => {
                const assignment = liveAssignments[modalItem!.id]
                const itemFlavours = (assignment?.flavour_ids ?? []).map(id => liveFlavours.find(f => f.id === id)).filter(Boolean)
                if (itemFlavours.length === 0) return null
                return (
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--bdr)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Flavour <span style={{ color: 'var(--red)', fontSize: 10 }}>*required</span></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {itemFlavours.map(f => {
                        const selected = modalFlavourId === f!.id
                        return (
                          <button key={f!.id} onClick={() => setModalFlavourId(selected ? null : f!.id)}
                            style={{ padding: '8px 16px', borderRadius: 'var(--r)', border: `2px solid ${selected ? mod.color : 'var(--bdr)'}`, background: selected ? 'var(--surf2)' : 'transparent', color: selected ? 'var(--txt)' : 'var(--txt2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {f!.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* ─── Sides picker ─── */}
              {(() => {
                const assignment = liveAssignments[modalItem!.id]
                const itemSides = (assignment?.side_ids ?? []).map(id => liveSides.find(s => s.id === id)).filter(Boolean)
                if (itemSides.length === 0) return null
                return (
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--bdr)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Sides (optional)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {itemSides.map(s => {
                        const selected = modalSideIds.includes(s!.id)
                        return (
                          <button key={s!.id} onClick={() => setModalSideIds(prev => selected ? prev.filter(id => id !== s!.id) : [...prev, s!.id])}
                            style={{ padding: '8px 16px', borderRadius: 'var(--r)', border: `2px solid ${selected ? mod.color : 'var(--bdr)'}`, background: selected ? 'var(--surf2)' : 'transparent', color: selected ? 'var(--txt)' : 'var(--txt2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {s!.name}{s!.price > 0 ? ` +${sym}${s!.price}` : ''}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* ─── Add-ons ─── */}
              {(() => {
                let displayAddons: Addon[]
                if (activeModule === 'carwash') {
                  displayAddons = activeAddons
                } else {
                  const assignment = liveAssignments[modalItem!.id]
                  if (assignment?.addon_ids?.length > 0) {
                    displayAddons = assignment.addon_ids.map(id => {
                      const a = livePosAddons.find(x => x.id === id)
                      if (!a) return null
                      return { id: a.id, name: a.name, desc: a.description, price: a.price, icon: a.icon ?? '', active: a.active } as Addon
                    }).filter(Boolean) as Addon[]
                  } else {
                    displayAddons = []
                  }
                }
                if (displayAddons.length === 0) return null
                return (
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', maxHeight: 200, overflowY: 'auto' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Add-ons (optional)</div>
                    {displayAddons.map((addon: Addon) => {
                      const checked = modalAddons.some(a => a.id === addon.id)
                      return (
                        <div key={addon.id} onClick={() => toggleModalAddon(addon)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', marginBottom: 6, cursor: 'pointer', background: checked ? 'var(--surf2)' : 'var(--surf)', border: `2px solid ${checked ? mod.color : 'var(--bdr)'}`, transition: 'all .14s' }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? mod.color : 'var(--bdr2)'}`, background: checked ? mod.color : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{checked ? '✓' : ''}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{addon.name}</div>
                            {addon.desc && <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{addon.desc}</div>}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: addon.price === 0 ? 'var(--grn)' : 'var(--txt)', flexShrink: 0 }}>{addon.price === 0 ? 'Free' : `+${fmt(addon.price, sym)}`}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Qty + Note */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)' }}>
                {/* Qty row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', flex: 1 }}>Qty</span>
                  <button onClick={() => setModalQty(q => Math.max(1, q - 1))} style={{
                    width: 32, height: 32, borderRadius: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)',
                    color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800,
                  }}>−</button>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, minWidth: 28, textAlign: 'center' }}>{modalQty}</span>
                  <button onClick={() => setModalQty(q => q + 1)} style={{
                    width: 32, height: 32, borderRadius: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)',
                    color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800,
                  }}>+</button>
                </div>
                {/* Note */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', marginBottom: 5 }}>Note</div>
                <textarea
                  value={modalNote}
                  onChange={e => setModalNote(e.target.value)}
                  placeholder="Special instructions..."
                  rows={2}
                  style={{
                    width: '100%', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)',
                    padding: '8px 10px', fontSize: 12, color: 'var(--txt)', resize: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

            </div>{/* end scrollable body */}

            {/* Footer — Cancel + Add to Cart */}
            {(() => {
              const assignment = modalItem ? liveAssignments[modalItem.id] : null
              const needsSize    = (assignment?.sizes?.length ?? 0) > 0 && !modalSizeId
              const needsFlavour = (assignment?.flavour_ids?.length ?? 0) > 0 && !modalFlavourId
              const canAddToCart = !needsSize && !needsFlavour
              return (
                <div style={{ padding: '14px 18px', display: 'flex', gap: 10 }}>
                  <button onClick={closeModal} style={{
                    flex: 1, padding: '12px 8px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700,
                    background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)',
                    cursor: 'pointer', transition: 'all .12s',
                  }}>Cancel</button>
                  <button onClick={addToCart} disabled={!canAddToCart} style={{
                    flex: 2, padding: '12px 8px', borderRadius: 'var(--r)', fontSize: 14, fontWeight: 800,
                    background: canAddToCart ? mod.color : 'var(--surf3)', color: canAddToCart ? mod.cobText : 'var(--txt3)', border: 'none',
                    cursor: canAddToCart ? 'pointer' : 'not-allowed', transition: 'all .15s',
                  }}>
                    {needsSize ? 'Select a size' : needsFlavour ? 'Select a flavour' : `Add to Cart ×${modalQty}`}
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

    </div>
  )
}


