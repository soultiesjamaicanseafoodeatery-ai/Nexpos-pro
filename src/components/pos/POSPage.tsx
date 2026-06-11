'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { MenuItem, Addon, Transaction, CartItem, OrderType, ModuleData } from '@/types'
import { calcCart, fmt } from '@/lib/utils/tax'
import OutsideOrders from './OutsideOrders'
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

export default function POSPage() {
  const { state, dispatch, toast, audit } = useApp()
  const { activeModule, posState, currentUser, biz, cart, cartPayMethod, cartOrderType } = state
  const ps  = posState[activeModule]
  const sym  = biz.currencySymbol ?? 'J$'

  const [cwTab,        setCwTab]        = useState<'pos' | 'orders'>('pos')
  const [pendingCount, setPendingCount] = useState(0)
  const [discPct,      setDiscPct]      = useState(0)

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
      cat: r.cat ?? r.category ?? 'All',
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

    // ── Step 2: Background sync ──
    async function syncFromSupabase() {
      const WAPI = 'https://www.soultiesseafoodjm.com'
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
            cat: r.category ?? 'All', emoji: r.emoji ?? '',
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
          .eq('active', true)
        if (cwData && cwData.length > 0) {
          const mapped: MenuItem[] = cwData.map((r: { id: string; name: string; description: string; price: number; duration: string; active: boolean; vehicle_type: string }) => ({
            id: r.id, name: r.name, desc: r.description ?? '', price: Number(r.price),
            cat: r.vehicle_type ? (r.vehicle_type.charAt(0).toUpperCase() + r.vehicle_type.slice(1)) : 'All',
            emoji: '', active: r.active, duration: r.duration ?? '',
          }))
          setLiveCarwashItems(mapped)
          storage.set('carwash_services', mapped)
        }

        // Fetch carwash addons
        const { data: addData } = await supabase
          .from('carwash_addons')
          .select('*')
          .eq('active', true)
        if (addData && addData.length > 0) {
          const mapped: Addon[] = addData.map((r: { id: string; name: string; description: string; price: number; active: boolean }) => ({
            id: r.id, name: r.name, desc: r.description ?? '', price: Number(r.price),
            icon: '', active: r.active,
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
    toast(`Added: ${modalItem.name}`, 'success')
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
    toast(`Added: ${item.name}`, 'success')
  }

  // Handle item click — open modal if addons/flavours/sizes/sides exist, else add directly
  const handleItemClick = (item: MenuItem) => {
    const assignment = liveAssignments[item.id]
    const hasFlavours  = (assignment?.flavour_ids?.length ?? 0) > 0
    const hasSides     = (assignment?.side_ids?.length ?? 0) > 0
    const hasSizes     = (assignment?.sizes?.length ?? 0) > 0
    const hasNewAddons = (assignment?.addon_ids?.length ?? 0) > 0
    const hasOldAddons = mod.addons.filter((a: Addon) => a.active).length > 0 && !assignment

    if (hasFlavours || hasSides || hasSizes || hasNewAddons || hasOldAddons) {
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

  const checkout = () => {
    if (cart.length === 0) { toast('Add items first', 'warn'); return }
    if (!currentUser) return

    const calc = calcCart(cart, { orderType: cartOrderType, taxOverride: null, manualDiscPct: discPct || undefined })

    const modules = Array.from(new Set(cart.map(ci => ci.module)))
    const mod2 = modules.length === 1 ? modules[0] : 'mixed' as const

    const plates = Array.from(new Set(cart.filter(ci => ci.plate).map(ci => ci.plate!)))
    const tableInfo = posState['restaurant'].selTable ? `Table ${posState['restaurant'].selTable}` : ''
    const customer = plates.length > 0
      ? plates.join(', ') + (tableInfo ? ` · ${tableInfo}` : '')
      : (tableInfo || 'Walk-in')

    const itemSummary = cart.length === 1
      ? `${cart[0].name}${cart[0].qty > 1 ? ` ×${cart[0].qty}` : ''}`
      : `${cart.length} items (${modules.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' + ')})`

    const tx: Transaction = {
      id: Date.now(),
      ts: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
          new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      mod: mod2,
      cashier: currentUser.name,
      userId:  currentUser.id,
      customer,
      item:    itemSummary,
      addons:  cart.flatMap(ci => ci.addons.map(a => a.name)),
      sub:     calc.sub,
      disc:    calc.disc,
      tax:     calc.gct + calc.serviceCharge,
      total:   calc.total,
      pay:     cartPayMethod,
      orderType: cartOrderType,
      gct:          calc.gct,
      serviceCharge: calc.serviceCharge,
      items: cart,
    }

    dispatch({ type: 'ADD_TRANSACTION', tx })
    dispatch({ type: 'CLEAR_CART' })
    setDiscPct(0)
    audit('CHECKOUT', `${itemSummary} — ${fmt(tx.total, sym)}`)
    toast(`✓ ${fmt(tx.total, sym)} charged`, 'success')
    dispatch({ type: 'SET_POS_STATE', mod: 'restaurant', patch: { selTable: null } })
    dispatch({ type: 'SET_POS_STATE', mod: 'carwash',    patch: { plate: '' } })
  }

  // Cart totals
  const hasRestaurantItems = cart.some(ci => ci.module === 'restaurant')
  const calc = calcCart(cart, { orderType: cartOrderType, taxOverride: null, manualDiscPct: discPct || undefined })

  // Active add-ons for modal display
  const activeAddons = mod.addons.filter((a: Addon) => a.active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

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

        /* ── Main POS grid (2-column) ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', flex: 1, overflow: 'hidden' }}>

          {/* Col 1 — Item browser */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--bdr)' }}>
            {/* Category tabs */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bdr)', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
              {cats.map((cat: string) => (
                <button key={cat} onClick={() => setPOS({ cat })} style={{
                  padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', border: `1.5px solid ${ps.cat === cat ? 'transparent' : 'var(--bdr)'}`,
                  color: ps.cat === cat ? '#fff' : 'var(--txt2)', whiteSpace: 'nowrap', minHeight: 40,
                  background: ps.cat === cat ? mod.color : 'transparent', transition: 'all .12s',
                }}>{cat}</button>
              ))}
            </div>

            {/* Item grid — 3 columns */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {filteredItems.map((item: MenuItem) => (
                  <div key={item.id} onClick={() => handleItemClick(item)} style={{
                    background: item.gradient ?? 'var(--surf)',
                    border: '2px solid var(--bdr)',
                    borderRadius: 'var(--r3)', cursor: 'pointer', position: 'relative',
                    overflow: 'hidden', transition: 'all .18s', minHeight: 150,
                    display: 'flex', flexDirection: 'column',
                  }}>
                    {item.duration && (
                      <div style={{ padding: '4px 10px', background: 'var(--surf2)', borderBottom: '1px solid var(--bdr)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)' }}>{item.duration}</div>
                    )}
                    <div style={{ padding: '8px 10px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', lineHeight: 1.2 }}>{item.name}</div>
                      <div style={{ marginTop: 4 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: '-.5px', color: item.accent ?? mod.color }}>{fmt(item.price, sym)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Col 2 — Global Cart (340px, unchanged) */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Cart header */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bdr)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>Bill</span>
              {cart.length > 0 && (
                <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 12, fontSize: 11, fontWeight: 800, padding: '1px 8px', minWidth: 22, textAlign: 'center' }}>
                  {cart.length}
                </span>
              )}
            </div>

            {/* Cart item list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 10px', color: 'var(--txt3)' }}>
                  <div style={{ fontSize: 12 }}>No items yet — add from any module</div>
                </div>
              ) : (
                cart.map((ci: CartItem) => {
                  const badge = MOD_BADGE[ci.module] ?? MOD_BADGE.restaurant
                  const lineTotal = (ci.price + ci.addons.reduce((s, a) => s + a.price, 0)) * ci.qty
                  return (
                    <div key={ci.id} style={{ background: 'var(--surf)', borderRadius: 'var(--r)', marginBottom: 8, display: 'flex', gap: 0, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
                      {/* Module color bar */}
                      <div style={{ width: 4, background: badge.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: '9px 10px' }}>
                        {/* Module badge + name row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: badge.bg, color: badge.color, flexShrink: 0 }}>{badge.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', flex: 1, lineHeight: 1.2 }}>{ci.name} <span style={{ color: 'var(--txt3)', fontWeight: 600 }}>×{ci.qty}</span></span>
                          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)', flexShrink: 0 }}>{fmt(lineTotal, sym)}</span>
                        </div>
                        {/* Addons */}
                        {ci.addons.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: 'var(--txt3)', flex: 1 }}>{a.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>+{fmt(a.price, sym)}</span>
                          </div>
                        ))}
                        {/* Flavour / Size / Sides */}
                        {ci.flavour && <div style={{ fontSize: 11, color: 'var(--ora)', marginBottom: 2 }}>Flavour: {ci.flavour}</div>}
                        {ci.size    && <div style={{ fontSize: 11, color: 'var(--pur)', marginBottom: 2 }}>Size: {ci.size}</div>}
                        {ci.sides && ci.sides.length > 0 && <div style={{ fontSize: 11, color: 'var(--grn)', marginBottom: 2 }}>Sides: {ci.sides.join(', ')}</div>}
                        {/* Plate */}
                        {ci.plate && (
                          <div style={{ fontSize: 11, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 700, marginTop: 2 }}>Plate: {ci.plate}</div>
                        )}
                        {/* Qty controls + remove */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                          <button onClick={() => dispatch({ type: 'UPDATE_CART_QTY', id: ci.id, qty: ci.qty - 1 })}
                            style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>−</button>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{ci.qty}</span>
                          <button onClick={() => dispatch({ type: 'UPDATE_CART_QTY', id: ci.id, qty: ci.qty + 1 })}
                            style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>+</button>
                          <button onClick={() => dispatch({ type: 'REMOVE_FROM_CART', id: ci.id })}
                            style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: 6, background: 'var(--red-bg, #7f1d1d22)', border: '1px solid var(--red-bdr, #ef444433)', color: 'var(--red, #ef4444)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>×</button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Totals + payment + checkout */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--bdr)', background: 'var(--bg3)', flexShrink: 0 }}>

              {/* Order type selector — only if restaurant items in cart */}
              {hasRestaurantItems && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 5 }}>Order Type</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                    {(['dine-in', 'takeout', 'delivery'] as OrderType[]).map(ot => (
                      <button key={ot} onClick={() => dispatch({ type: 'SET_CART_ORDER_TYPE', orderType: ot })} style={{
                        padding: '7px 4px', borderRadius: 'var(--r)',
                        border: `2px solid ${cartOrderType === ot ? 'var(--ora, #f97316)' : 'var(--bdr2)'}`,
                        background: cartOrderType === ot ? 'var(--ora-bg, #78350f22)' : 'var(--surf)',
                        color: cartOrderType === ot ? 'var(--ora, #f97316)' : 'var(--txt2)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .12s',
                      }}>
                        {ot === 'dine-in' ? 'Dine-in' : ot === 'takeout' ? 'Takeout' : 'Delivery'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Discount */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--txt3)', flex: 1 }}>Discount</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discPct || ''}
                  onChange={e => setDiscPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  placeholder="0"
                  style={{ width: 56, background: 'var(--surf2)', border: `1px solid ${discPct > 0 ? 'var(--grn)' : 'var(--bdr2)'}`, borderRadius: 'var(--r)', padding: '5px 8px', fontSize: 13, color: discPct > 0 ? 'var(--grn)' : 'var(--txt)', textAlign: 'right' }}
                />
                <span style={{ fontSize: 11, color: 'var(--txt3)' }}>%</span>
                {discPct > 0 && (
                  <button onClick={() => setDiscPct(0)} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>✕</button>
                )}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--bdr)', margin: '6px 0 10px' }} />

              {/* Totals */}
              {([
                { label: 'Subtotal',                                                                                   value: fmt(calc.sub, sym) },
                calc.disc > 0          && { label: `Discount (${discPct}%)`,                                           value: `−${fmt(calc.disc, sym)}`, color: 'var(--grn)' },
                calc.gct > 0           && { label: `GCT (${(calc.gctRate * 100).toFixed(0)}%)`,                        value: fmt(calc.gct, sym) },
                calc.serviceCharge > 0 && { label: `Service (${(calc.scRate * 100).toFixed(0)}%)`,                     value: fmt(calc.serviceCharge, sym) },
              ].filter(Boolean) as { label: string; value: string; color?: string }[]).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: row.color ?? 'var(--txt3)' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: row.color ?? 'var(--txt2)', fontFamily: 'var(--mono)' }}>{row.value}</span>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', fontSize: 18, fontWeight: 800 }}>
                <span style={{ color: 'var(--txt)' }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--mono)', color: cart.length > 0 ? 'var(--blue)' : 'var(--txt3)' }}>{fmt(calc.total, sym)}</span>
              </div>

              {/* Payment method */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, margin: '10px 0' }}>
                {[['cash','Cash'],['card','Card'],['tab','Tab'],['qr','QR Pay']].map(([key, lbl]) => (
                  <button key={key} onClick={() => dispatch({ type: 'SET_CART_PAY', method: key })} style={{
                    padding: '13px 4px', borderRadius: 'var(--r)',
                    border: `2px solid ${cartPayMethod === key ? 'var(--blue)' : 'var(--bdr2)'}`,
                    background: cartPayMethod === key ? 'var(--blue-bg)' : 'var(--surf)',
                    color: cartPayMethod === key ? 'var(--blue)' : 'var(--txt2)',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all .12s', minHeight: 44,
                  }}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* Charge button */}
              <button onClick={checkout} disabled={cart.length === 0} style={{
                width: '100%', padding: 16, borderRadius: 'var(--r)', fontSize: 15, fontWeight: 800,
                color: cart.length > 0 ? '#fff' : 'var(--txt3)',
                background: cart.length > 0 ? 'var(--blue)' : 'var(--surf3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                cursor: cart.length > 0 ? 'pointer' : 'not-allowed', border: 'none', transition: 'all .15s', minHeight: 54,
              }}>
                ✓ Charge {cart.length > 0 ? fmt(calc.total, sym) : '—'}
              </button>

              <button onClick={() => dispatch({ type: 'CLEAR_CART' })} style={{
                width: '100%', padding: 10, borderRadius: 'var(--r2)', fontSize: 12.5, fontWeight: 700,
                background: 'transparent', color: 'var(--txt3)', border: '1.5px solid var(--bdr)', marginTop: 7,
                cursor: 'pointer', transition: 'all .12s', minHeight: 42,
              }}>
                Clear Order
              </button>
            </div>
          </div>

        </div>
      )}

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
                const assignment = liveAssignments[modalItem!.id]
                let displayAddons: Addon[]
                if (assignment?.addon_ids?.length > 0) {
                  displayAddons = assignment.addon_ids.map(id => {
                    const a = livePosAddons.find(x => x.id === id)
                    if (!a) return null
                    return { id: a.id, name: a.name, desc: a.description, price: a.price, icon: a.icon ?? '', active: a.active } as Addon
                  }).filter(Boolean) as Addon[]
                } else {
                  displayAddons = activeAddons
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
