'use client'

import { useState, useEffect, u seRef } from 'react'
import { useApp } from ' @/lib/hooks/useAppStore'
import type { MenuIt em, Addon, Transaction, CartItem, OrderType,  ModuleData, HeldOrder, PaymentEntry, OrderTic ket, VoidReason, VoidLog, Surcharge } from '@ /types'
import { VOID_REASON_LABELS } from '@ /types'
import { calcCart, fmt } from '@/lib/ utils/tax'
import { buildCustomerReceipt, bui ldKitchenTicket, buildBarTicket, buildCarwash WorkOrder, buildVoidTicket, printTicket, smar tPrint } from '@/lib/utils/ticketPrinter'
imp ort { qzOpenDrawer } from '@/lib/utils/qzTray '
import OutsideOrders from './OutsideOrders' 
import PaymentModal from './PaymentModal'
im port TicketModal from './TicketModal'
import  SplitBillModal from './SplitBillModal'
import  VoidReasonModal from './VoidReasonModal'
imp ort { MODULE_DATA } from '@/lib/data/seed'
im port { supabase } from '@/lib/supabase'
impor t { storage } from '@/lib/utils/storage'

//  ── Relational menu types (used by live st ate in POSPage) ─────
interface Fla vourRow { id: string; name: string; active: b oolean }
interface SideRow { id: string; name : string; price: number; active: boolean }
in terface AddonRow { id: string; name: string;  description: string; price: number; icon?: st ring; active: boolean }
interface SizeRow { i d: string; name: string; sort_order: number;  active: boolean }
interface ItemAssignment {  flavour_ids: string[]; side_ids: string[]; ad don_ids: string[]; sizes: { size_id: string;  price: number }[] }

const MOD_BADGE: Record< string, { bg: string; color: string; label: s tring }> = {
  restaurant: { bg: 'var(--ora-b g, #78350f22)', color: 'var(--ora, #f97316)',  label: 'Food' },
  bar:        { bg: 'var(-- pur-bg, #4c1d9522)', color: 'var(--pur, #a855 f7)', label: 'Bar' },
  carwash:    { bg: 'va r(--blue-bg)',            color: 'var(--blue) ',          label: 'Wash' },
}

export interf ace OrderContext {
  orderType: 'dine-in' | ' takeout' | 'delivery'
  table?: string
  gues ts?: number
  customerName?: string
  phone?:  string
  address?: string
}

interface POSPa geProps {
  onBack?: () => void
  onPaymentCo mplete?: () => void
  orderContext?: OrderCon text
}

export default function POSPage({ onB ack, onPaymentComplete, orderContext }: POSPa geProps = {}) {
  const { state, dispatch, to ast, audit } = useApp()
  const { activeModul e, posState, currentUser, biz, cart, cartPayM ethod, cartOrderType } = state
  const ps  =  posState[activeModule]
  const sym  = biz.cur rencySymbol ?? 'J$'

  const [cwTab,        s etCwTab]        = useState<'pos' | 'orders'>( 'pos')
  const [pendingCount, setPendingCount ] = useState(0)
  const [showDetails,  setSho wDetails]  = useState(false)
  const [discPct ,      setDiscPct]      = useState(0)
  const  [discFlat,     setDiscFlat]     = useState(0 )
  const [discMode,     setDiscMode]     = u seState<'pct' | 'flat'>('pct')

  // Gratuity 
  const [gratuityPct,      setGratuityPct]       = useState(0)
  const [gratuityOverride,  setGratuityOverride] = useState(false)
  cons t [showGratEdit,     setShowGratEdit]     = u seState(false)
  const [gratInput,        set GratInput]        = useState('15')

  // Surc harges
  const [surcharges, setSurcharges] =  useState<Surcharge[]>([])

  // Guest & custo mer
  const [guestCount,    setGuestCount]     = useState(1)
  const [customerName,  setCus tomerName]  = useState('')
  const [customerP hone, setCustomerPhone] = useState('')

  //  Payment / receipt modals
  const [showPayment ,   setShowPayment]   = useState(false)
  con st [showTicket,    setShowTicket]    = useSta te(false)
  const [showSplitBill, setShowSpli tBill] = useState(false)
  const [showHeld,       setShowHeld]      = useState(false)
  con st [showOpen,      setShowOpen]      = useSta te(false)
  const [confirmClear,      setConf irmClear]      = useState(false)
  const [con firmDeleteHeld, setConfirmDeleteHeld] = useSt ate<string | null>(null)
  const [pendingBarA dd,    setPendingBarAdd]    = useState<'modal ' | 'direct' | null>(null)
  const [pendingDi rectItem, setPendingDirectItem] = useState<Me nuItem | null>(null)
  const [lastTx,         setLastTx]        = useState<Transaction | nu ll>(null)
  const [lastTicket,    setLastTick et]    = useState<OrderTicket | null>(null)
   const [orderNote,     setOrderNote]     = us eState('')
  const [payingTicket,  setPayingT icket]  = useState<OrderTicket | null>(null)
 
  // Split bill target (when paying one spli t at a time)
  const [splitTarget,   setSplit Target]   = useState<{ calc: ReturnType<typeo f calcCart>; label: string } | null>(null)

   // Void system
  const [voidTarget,      set VoidTarget]      = useState<{ item: CartItem;  ticketId?: string } | null>(null)
  const [e ditingNoteId,  setEditingNoteId]  = useState< string | null>(null)
  const [noteInput,       setNoteInput]      = useState('')
  const [v oidOrderTarget, setVoidOrderTarget] = useStat e<OrderTicket | null>(null)
  // Add-to-exist ing-order mode
  const [addToOrderMode,  setA ddToOrderMode]  = useState(false)
  // Transf er table: { ticketId }
  const [transferTarge t,  setTransferTarget]  = useState<string | n ull>(null)

  // POS UI enhancements
  const  [searchQuery,   setSearchQuery]   = useState( '')
  const [showFloorPlan, setShowFloorPlan]  = useState(false)

  // Modal state
  const  [modalItem,   setModalItem]   = useState<Menu Item | null>(null)
  const [modalAddons, setM odalAddons] = useState<Addon[]>([])
  const [ modalQty,    setModalQty]    = useState(1)
   const [modalNote,   setModalNote]   = useStat e('')
  const [modalFlavourId, setModalFlavou rId] = useState<string | null>(null)
  const  [modalSideIds,   setModalSideIds]   = useStat e<string[]>([])
  const [modalSizeId,    setM odalSizeId]    = useState<string | null>(null )
  const [modalSizePrice, setModalSizePrice]  = useState<number>(0)
  const modalRef = use Ref<HTMLDivElement>(null)

  // Focus modal w hen it opens so Escape key works
  useEffect( () => {
    if (modalItem && modalRef.current ) {
      modalRef.current.focus()
    }
  },  [modalItem])

  // Sync customer/guest detai ls from orderContext on workspace entry
  con st orderContextRef = useRef<OrderContext | nu ll>(null)
  useEffect(() => {
    if (orderCo ntext && orderContext !== orderContextRef.cur rent) {
      orderContextRef.current = order Context
      if (orderContext.customerName)  setCustomerName(orderContext.customerName)
       if (orderContext.phone)        setCustome rPhone(orderContext.phone)
      if (orderCon text.guests)       setGuestCount(orderContext .guests)
    }
  }, [orderContext])

  // Aut o-apply 15% gratuity for dine-in orders unles s manager has overridden it
  useEffect(() =>  {
    if (gratuityOverride) return
    setGr atuityPct(cartOrderType === 'dine-in' ? 15 :  0)
  }, [cartOrderType, gratuityOverride])

   // Live data — loaded from localStorage im mediately, refreshed from Supabase in backgro und
  const [liveMenuItems,    setLiveMenuIte ms]    = useState<MenuItem[] | null>(null)
   const [liveCarwashItems, setLiveCarwashItems]  = useState<MenuItem[] | null>(null)
  const  [liveAddons,       setLiveAddons]       = use State<Addon[] | null>(null)
  const [liveRest Addons,   setLiveRestAddons]   = useState<Add on[] | null>(null)
  const [liveFlavours,     setLiveFlavours]    = useState<FlavourRow[]>( [])
  const [liveSides,       setLiveSides]        = useState<SideRow[]>([])
  const [liveP osAddons,   setLivePosAddons]   = useState<Ad donRow[]>([])
  const [liveSizesDefs,   setLi veSizesDefs]   = useState<SizeRow[]>([])
  co nst [liveAssignments, setLiveAssignments] = u seState<Record<string, ItemAssignment>>({})
   const [customTables, setCustomTables] = useS tate<{ restaurant?: string[]; bar?: string[];  status?: Record<string, string> } | null>(nu ll)
  const hasFetched = useRef(false)

  use Effect(() => {
    if (hasFetched.current) re turn
    hasFetched.current = true

    // � �─ Step 1: Load from localStorage immediate ly (works offline) ──
    // Handles both  raw Supabase format (description/category) a nd mapped format (desc/cat)
    type RawItem  = MenuItem & { description?: string; category ?: string; is_available?: boolean }
    type  RawAddon = Addon & { description?: string }

     const normMenuItem = (r: RawItem): MenuIt em => ({
      id: r.id, name: r.name,
       desc: r.desc ?? r.description ?? '',
      pr ice: Number(r.price),
      cat: (r.cat ?? r. category ?? 'All').trim().toUpperCase(),
       emoji: r.emoji ?? '',
      active: r.activ e ?? r.is_available ?? true,
      module: r. module,
      duration: r.duration ?? undefin ed,
    })
    const normAddon = (r: RawAddon ): Addon => ({
      id: r.id, name: r.name,
       desc: r.desc ?? r.description ?? '',
       price: Number(r.price),
      icon: r.ico n ?? '',
      active: r.active ?? true,
     })

    const cachedMenuRaw    = storage.get< RawItem[]>('menu_items')
    const cachedCarw ashRaw = storage.get<RawItem[]>('carwash_serv ices')
    const cachedAddonsRaw  = storage.g et<RawAddon[]>('carwash_addons')
    const ca chedRestAddonsRaw = storage.get<RawAddon[]>(' menu_addons')

    if (cachedMenuRaw    && ca chedMenuRaw.length > 0)
      setLiveMenuItem s(cachedMenuRaw.map(normMenuItem).filter(i =>  i.active && i.cat !== 'addon'))
    if (cach edCarwashRaw && cachedCarwashRaw.length > 0)
       setLiveCarwashItems(cachedCarwashRaw.ma p(normMenuItem).filter(i => i.active))
    if  (cachedAddonsRaw  && cachedAddonsRaw.length  > 0)
      setLiveAddons(cachedAddonsRaw.map( normAddon).filter(i => i.active))
    if (cac hedRestAddonsRaw && cachedRestAddonsRaw.lengt h > 0)
      setLiveRestAddons(cachedRestAddo nsRaw.map(normAddon).filter(i => i.active))

     // ── Load relational menu data from  localStorage cache ──
    const cachedFla vours  = storage.get<FlavourRow[]>('pos_flavo urs')
    const cachedSides     = storage.get <SideRow[]>('pos_sides')
    const cachedPosA ddons = storage.get<AddonRow[]>('pos_addons') 
    const cachedSizes     = storage.get<Size Row[]>('pos_sizes')
    const cachedAssign     = storage.get<Record<string, ItemAssignment> >('pos_assignments')
    if (cachedFlavours?. length)  setLiveFlavours(cachedFlavours)
     if (cachedSides?.length)     setLiveSides(cac hedSides)
    if (cachedPosAddons?.length) se tLivePosAddons(cachedPosAddons)
    if (cache dSizes?.length)     setLiveSizesDefs(cachedSi zes)
    if (cachedAssign && Object.keys(cach edAssign).length) setLiveAssignments(cachedAs sign)
    const tablesConf = storage.get<Reco rd<string, unknown>>('tables_config')
    if  (tablesConf) {
      // TablesPage stores ent ries as {id,name,seats} objects; normalize to  strings
      const toStrArr = (arr: unknown ): string[] => {
        if (!Array.isArray(a rr)) return []
        return arr.map(t => {
           if (typeof t === 'string') return t 
          if (t && typeof t === 'object') {
             const e = t as { name?: unknown;  id?: unknown }
            return String(e.na me ?? e.id ?? '')
          }
          retur n String(t)
        }).filter(Boolean)
       }
      setCustomTables({
        restaurant:  toStrArr(tablesConf.restaurant),
        bar :        toStrArr(tablesConf.bar),
        st atus:     (tablesConf.status && typeof tables Conf.status === 'object')
                       ? tablesConf.status as Record<string, stri ng>
                      : undefined,
       })
    }

    // ── Step 2: Background sy nc ──
    async function syncFromSupabase () {
      const WAPI = ''
      try {
         // ── Menu items via website API (same  source as Menu Manager) ──
        const  menuRes = await fetch(`${WAPI}/api/menu`)
         if (menuRes.ok) {
          type ApiItem  = { id: string; name: string; description?:  string; price: number; category: string; emoj i?: string; active?: boolean; is_available?:  boolean; module?: string }
          const al lItems: ApiItem[] = await menuRes.json()
           const addonRows = allItems.filter(r =>  r.category === 'addon')
          const itemR ows  = allItems.filter(r => r.category !== 'a ddon')

          const mappedItems: MenuItem [] = itemRows.map(r => ({
            id: r.i d, name: r.name, desc: r.description ?? '', p rice: Number(r.price),
            cat: (r.ca tegory ?? 'All').trim().toUpperCase(), emoji:  r.emoji ?? '',
            active: r.active  ?? r.is_available ?? true,
            module : r.module,
          }))
          const map pedAddons: Addon[] = addonRows.map(r => ({
             id: r.id, name: r.name, desc: r.des cription ?? '', price: Number(r.price),
             icon: r.emoji ?? '', active: r.active  ?? r.is_available ?? true,
          }))

           if (mappedItems.length > 0) {
             setLiveMenuItems(mappedItems)
             setLiveRestAddons(mappedAddons)
             storage.set('menu_items', mappedItems)
             storage.set('menu_addons', mappedAddons )
          }
        }

        // ── Ca rwash services via Supabase (no website API f or these yet) ──
        if (!supabase) { 
          // Skip carwash Supabase sync if c lient not configured
        } else {
         const { data: cwData } = await supabase
           .from('carwash_services')
          .se lect('*')
          .eq('is_available', true) 
        if (cwData && cwData.length > 0) {
           const mapped: MenuItem[] = cwData.ma p((r: { id: string; name: string; description : string; price: number; duration?: string; i s_available: boolean; vehicle_type: string })  => ({
            id: r.id, name: r.name, de sc: r.description ?? '', price: Number(r.pric e),
            cat: r.vehicle_type ? (r.vehi cle_type.charAt(0).toUpperCase() + r.vehicle_ type.slice(1)) : 'All',
            emoji: '' , active: r.is_available, duration: r.duratio n ?? '',
          }))
          setLiveCarwa shItems(mapped)
          storage.set('carwas h_services', mapped)
        }

        // Fe tch carwash addons
        const { data: addD ata } = await supabase
          .from('carwa sh_addons')
          .select('*')
           .eq('is_available', true)
        if (addData  && addData.length > 0) {
          const map ped: Addon[] = addData.map((r: { id: string;  name: string; description: string; price: num ber; is_available: boolean }) => ({
             id: r.id, name: r.name, desc: r.descriptio n ?? '', price: Number(r.price),
             icon: '', active: r.is_available,
          } ))
          setLiveAddons(mapped)
           storage.set('carwash_addons', mapped)
         }

        } // end supabase carwash block

         // ── Relational data (flavours,  sides, addons, sizes, assignments) ──
         const [flvRes, sideRes, addRes, szRes, a sgRes] = await Promise.allSettled([
           fetch(`${WAPI}/api/flavours`).then(r => r.ok  ? r.json() : []),
          fetch(`${WAPI}/a pi/sides`).then(r => r.ok ? r.json() : []),
           fetch(`${WAPI}/api/addons`).then(r = > r.ok ? r.json() : []),
          fetch(`${W API}/api/sizes`).then(r => r.ok ? r.json() :  []),
          fetch(`${WAPI}/api/assignments `).then(r => r.ok ? r.json() : {}),
        ] )
        if (flvRes.status === 'fulfilled' & & Array.isArray(flvRes.value) && flvRes.value .length > 0) {
          setLiveFlavours(flvR es.value as FlavourRow[]); storage.set('pos_f lavours', flvRes.value)
        }
        if  (sideRes.status === 'fulfilled' && Array.isAr ray(sideRes.value) && sideRes.value.length >  0) {
          setLiveSides(sideRes.value as  SideRow[]); storage.set('pos_sides', sideRes. value)
        }
        if (addRes.status == = 'fulfilled' && Array.isArray(addRes.value)  && addRes.value.length > 0) {
          setLi vePosAddons(addRes.value as AddonRow[]); stor age.set('pos_addons', addRes.value)
        } 
        if (szRes.status === 'fulfilled' &&  Array.isArray(szRes.value) && szRes.value.len gth > 0) {
          setLiveSizesDefs(szRes.v alue as SizeRow[]); storage.set('pos_sizes',  szRes.value)
        }
        if (asgRes.sta tus === 'fulfilled' && asgRes.value && typeof  asgRes.value === 'object') {
          setLi veAssignments(asgRes.value as Record<string,  ItemAssignment>); storage.set('pos_assignment s', asgRes.value)
        }
      } catch {
         // Silently keep using cached / seed d ata
      }
    }
    syncFromSupabase()
  },  [])

  // Build the effective module data.
   // Seed items are only used when Supabase is  not configured at all (no URL/key).
  // If  Supabase IS configured, show live data (or em pty) — never show demo items in production. 
  const seedMod = MODULE_DATA[activeModule]
   const supabaseConfigured = !!(process.env.N EXT_PUBLIC_SUPABASE_URL && process.env.NEXT_P UBLIC_SUPABASE_ANON_KEY)
  // Menu items alwa ys come from website API now — supabaseConf igured only governs carwash/addon fallbacks
   const mod: ModuleData = {
    ...seedMod,
     items: (() => {
      if (activeModule ===  'restaurant' || activeModule === 'bar') {
         if (liveMenuItems && liveMenuItems.lengt h > 0) {
          const modItems = liveMenuI tems.filter(i =>
            activeModule ===  'bar'
              ? i.module === 'bar'
               : (i.module === 'restaurant' || !i .module)
          )
          // If module f ilter returns nothing, show all live items so  POS is never blank
          return modItems .length > 0 ? modItems : liveMenuItems
         }
        return []  // loading — show em pty grid, not fake seed data
      }
      if  (activeModule === 'carwash') {
        if (l iveCarwashItems && liveCarwashItems.length >  0) return liveCarwashItems
        return []
       }
      return []
    })(),
    addons:  (() => {
      if (activeModule === 'carwash ') {
        if (liveAddons && liveAddons.len gth > 0) return liveAddons
        return sup abaseConfigured ? [] : seedMod.addons
      } 
      // restaurant and bar — use Supabase  addons if available, else seed fallback
       if (liveRestAddons && liveRestAddons.length  > 0) return liveRestAddons
      return seed Mod.addons
    })(),
    categories: (() => { 
      if (activeModule === 'restaurant' || a ctiveModule === 'bar') {
        if (liveMenu Items && liveMenuItems.length > 0) {
           const modItems = liveMenuItems.filter(i =>
             activeModule === 'bar'
               ? i.module === 'bar'
              : (i.m odule === 'restaurant' || !i.module)
           )
          const cats = Array.from(new Set (modItems.map(i => i.cat).filter(Boolean)))
           return ['All', ...cats]
        }
         return supabaseConfigured ? ['All'] : s eedMod.categories
      }
      if (activeMod ule === 'carwash') {
        if (liveCarwashI tems && liveCarwashItems.length > 0) {
           const cats = Array.from(new Set(liveCarwa shItems.map(i => i.cat).filter(Boolean)))
           return ['All', ...cats]
        }
         return supabaseConfigured ? ['All'] : see dMod.categories
      }
      return supabase Configured ? ['All'] : seedMod.categories
     })(),
    tables: (() => {
      const key =  activeModule as 'restaurant' | 'bar'
      c onst custom = customTables?.[key]
      if (c ustom && custom.length > 0) return custom
       return seedMod.tables ?? []
    })(),
     tableStatus: customTables?.status ?? seedMod. tableStatus ?? {},
  }

  const cats           = ['All', ...mod.categories.filter((c: strin g) => c !== 'All')]
  const filteredItems = p s.cat === 'All'
    ? mod.items.filter((i: Me nuItem) => i.active)
    : mod.items.filter(( i: MenuItem) => i.active && i.cat === ps.cat) 

  const setPOS = (patch: Partial<typeof ps> ) =>
    dispatch({ type: 'SET_POS_STATE', mo d: activeModule, patch })

  // Toggle addon  in modal
  const toggleModalAddon = (addon: A ddon) => {
    setModalAddons(prev => {
       const exists = prev.find(a => a.id === addon .id)
      return exists ? prev.filter(a => a .id !== addon.id) : [...prev, addon]
    })
   }

  // Close modal and reset state
  const  closeModal = () => {
    setModalItem(null)
     setModalAddons([])
    setModalFlavourId(n ull)
    setModalSideIds([])
    setModalSize Id(null)
    setModalSizePrice(0)
    setModa lQty(1)
    setModalNote('')
  }

  // Add to  cart from modal (item with add-ons)
  const  addToCart = () => {
    if (!modalItem) retur n
    const effectivePrice = modalSizeId ? mo dalSizePrice : modalItem.price
    const flav ourName = liveFlavours.find(f => f.id === mod alFlavourId)?.name
    const sideName = modal SideIds.map(id => liveSides.find(s => s.id == = id)?.name).filter(Boolean) as string[]
     const sizeName  = liveSizesDefs.find(s => s.i d === modalSizeId)?.name

    if (activeModul e === 'bar' || modalItem?.module === 'bar') { 
      const hasBarItems = cart.some(ci => ci .module === 'bar')
      if (!hasBarItems) {  setPendingBarAdd('modal'); return }
    }
     const cartItem: CartItem = {
      id: crypt o.randomUUID(),
      itemId: modalItem.id,
       name: modalItem.name,
      price: effec tivePrice,
      qty: modalQty,
      addons:  [...modalAddons],
      module: activeModule ,
      note: modalNote || undefined,
      p late: activeModule === 'carwash' ? (ps.plate  || undefined) : undefined,
      flavour: fla vourName,
      size: sizeName,
      sides:  sideName.length > 0 ? sideName : undefined,
     }
    dispatch({ type: 'ADD_TO_CART', item : cartItem })
    closeModal()
  }

  // Add  to cart directly (item with no active add-ons )
  const addToCartDirect = (item: MenuItem)  => {
    if (activeModule === 'bar' || item.m odule === 'bar') {
      const hasBarItems =  cart.some(ci => ci.module === 'bar')
      if  (!hasBarItems) { setPendingDirectItem(item);  setPendingBarAdd('direct'); return }
    }
     const cartItem: CartItem = {
      id: cry pto.randomUUID(),
      itemId: item.id,
       name: item.name,
      price: item.price,
       qty: 1,
      addons: [],
      module:  activeModule,
      plate: activeModule === ' carwash' ? (ps.plate || undefined) : undefine d,
    }
    dispatch({ type: 'ADD_TO_CART',  item: cartItem })
  }

  const confirmAge = ( ) => {
    if (pendingBarAdd === 'modal' && m odalItem) {
      const effectivePrice = moda lSizeId ? modalSizePrice : modalItem.price
       const flavourName = liveFlavours.find(f = > f.id === modalFlavourId)?.name
      const  sideName = modalSideIds.map(id => liveSides.f ind(s => s.id === id)?.name).filter(Boolean)  as string[]
      const sizeName = liveSizesD efs.find(s => s.id === modalSizeId)?.name
       dispatch({ type: 'ADD_TO_CART', item: {
         id: crypto.randomUUID(), itemId: modalI tem.id, name: modalItem.name, price: effectiv ePrice,
        qty: modalQty, addons: [...mo dalAddons], module: activeModule, note: modal Note || undefined,
        plate: activeModul e === 'carwash' ? (ps.plate || undefined) : u ndefined,
        flavour: flavourName, size:  sizeName, sides: sideName.length > 0 ? sideN ame : undefined,
      }})
      closeModal() 
    } else if (pendingBarAdd === 'direct' &&  pendingDirectItem) {
      dispatch({ type:  'ADD_TO_CART', item: {
        id: crypto.ran domUUID(), itemId: pendingDirectItem.id, name : pendingDirectItem.name,
        price: pend ingDirectItem.price, qty: 1, addons: [], modu le: activeModule,
        plate: activeModule  === 'carwash' ? (ps.plate || undefined) : un defined,
      }})
    }
    setPendingBarAdd (null)
    setPendingDirectItem(null)
  }

   const cancelAge = () => { setPendingBarAdd(nu ll); setPendingDirectItem(null) }

  // Handl e item click — open modal only if the item  has assigned add-ons/flavours/sizes/sides
  c onst handleItemClick = (item: MenuItem) => {
     const assignment = liveAssignments[item.i d]
    const hasFlavours     = (assignment?.f lavour_ids?.length ?? 0) > 0
    const hasSid es        = (assignment?.side_ids?.length ??  0) > 0
    const hasSizes        = (assignmen t?.sizes?.length ?? 0) > 0
    const hasNewAd dons    = (assignment?.addon_ids?.length ?? 0 ) > 0
    const hasCarwashAddons = activeModu le === 'carwash' && activeAddons.length > 0

     if (hasFlavours || hasSides || hasSizes | | hasNewAddons || hasCarwashAddons) {
      s etModalItem(item)
      setModalAddons([])
       setModalFlavourId(null)
      setModalSid eIds([])
      setModalSizeId(null)
      set ModalSizePrice(item.price)
      setModalQty( 1)
      setModalNote('')
    } else {
       addToCartDirect(item)
    }
  }

  const comp leteCheckout = (payData: { method: string; te nder?: number; changeDue?: number; payments?:  PaymentEntry[] }, overrideCalc?: ReturnType< typeof calcCart>) => {
    if (!currentUser)  return

    const nowTime = new Date().toLoca leTimeString('en-US', { hour: '2-digit', minu te: '2-digit' })
    const today   = new Date ().toLocaleDateString('en-US', { month: 'shor t', day: '2-digit', year: 'numeric' })
    co nst payMethodLabel = payData.method === 'gift _card' ? 'Gift Card'
      : payData.method = == 'tab' ? 'Tab'
      : payData.method

     // ── Path A: Paying an existing open (se nt) order ───────────� �─
    if (payingTicket) {
      const fina lCalc = overrideCalc ?? payCalc
      const m odules = Array.from(new Set(payingTicket.item s.map(ci => ci.module)))
      const mod2 = m odules.length === 1 ? modules[0] : 'mixed' as  const

      const tx: Transaction = {
         id: Date.now() + Math.floor(Math.random()  * 1000),
        ts: new Date().toLocaleDateS tring('en-US', { month: '2-digit', day: '2-di git' }) + ' ' + nowTime,
        mod: mod2,
         cashier:  currentUser.name,
        us erId:   currentUser.id,
        customer: pay ingTicket.customerName || (payingTicket.table  ? `Table ${payingTicket.table}` : 'Walk-in') ,
        item:     `Order #${payingTicket.or derNum} · ${payingTicket.items.length} items `,
        addons:   payingTicket.items.flatM ap(ci => ci.addons.map(a => a.name)),
         sub:      finalCalc.sub,
        disc:     f inalCalc.disc,
        tax:      finalCalc.gc t + finalCalc.serviceCharge,
        total:     finalCalc.total,
        pay:      payMetho dLabel,
        orderType: payingTicket.order Type,
        gct:           finalCalc.gct,
         serviceCharge: finalCalc.serviceCharge ,
        gratuity:      finalCalc.gratuity,
         gratuityPct,
        surchargeTotal:  finalCalc.surchargeTotal,
        guestCount:     payingTicket.guestCount,
        customer Name:  payingTicket.customerName,
        tab leNum:      payingTicket.table,
        tende r:    payData.tender,
        changeDue: payD ata.changeDue,
        payments:  payData.pay ments,
        items: [...payingTicket.items] ,
      }

      const updatedTimeline = { .. .payingTicket.timeline, paid: nowTime }
       dispatch({ type: 'ADD_TRANSACTION', tx })
       dispatch({ type: 'UPDATE_ORDER_TICKET', i d: payingTicket.id, patch: {
        status:  'paid' as const, txId: tx.id, timeline: updat edTimeline,
      }})
      dispatch({ type:  'SET_POS_STATE', mod: 'restaurant', patch: {  selTable: null } })
      dispatch({ type: 'S ET_POS_STATE', mod: 'bar',        patch: { se lTable: null } })

      const paidTicket = {  ...payingTicket, status: 'paid' as const, tx Id: tx.id, timeline: updatedTimeline }
       setPayingTicket(null)
      setSurcharges([]) 
      setGratuityOverride(false)
      setSh owPayment(false)
      setShowOpen(false)
       setLastTx(tx)
      setLastTicket(paidTick et)
      setSplitTarget(null)
      if (payD ata.method === 'cash' && biz.printers?.drawer Enabled && biz.printers?.receipt)
        qzO penDrawer(biz.printers.receipt)
      audit(' PAYMENT', `Order #${payingTicket.orderNum} � � ${fmt(finalCalc.total, sym)} · ${payMethod Label}`, 'success')
      const pw2 = (biz.pr inters?.width ?? 80) as 58 | 80
      if (biz .printers?.receipt) {
        const receiptHT ML = buildCustomerReceipt(tx, biz, { width: p w2 })
        smartPrint(receiptHTML, 'Receip t', biz.printers.receipt, pw2, true)
      }
       if (biz.printers?.receiptPreview) {
         setTimeout(() => setShowTicket(true), 20 0)
      } else {
        onPaymentComplete?. ()
      }
      return
    }

    // ──  Path B: Direct pay from current cart (quick /  counter sale) ──
    if (cart.length ===  0 && !overrideCalc) return

    const finalC alc  = overrideCalc ?? calc
    const modules     = Array.from(new Set(cart.map(ci => ci.mo dule)))
    const mod2       = modules.length  === 1 ? modules[0] : 'mixed' as const
    co nst plates     = Array.from(new Set(cart.filt er(ci => ci.plate).map(ci => ci.plate!)))
     const selTable   = posState['restaurant'].se lTable ?? posState['bar'].selTable
    const  tableInfo  = selTable ? `Table ${selTable}` :  ''
    const nameDisplay = customerPhone ? ` ${customerName || 'Customer'} · ${customerPh one}` : customerName
    const customer   = n ameDisplay || (plates.length > 0
      ? plat es.join(', ') + (tableInfo ? ` · ${tableInfo }` : '')
      : (tableInfo || 'Walk-in'))
     const itemSummary = cart.length === 1
       ? `${cart[0].name}${cart[0].qty > 1 ? ` ×${ cart[0].qty}` : ''}`
      : `${cart.length}  items (${modules.map(m => m.charAt(0).toUpper Case() + m.slice(1)).join(' + ')})`

    cons t tx: Transaction = {
      id: Date.now() +  Math.floor(Math.random() * 1000),
      ts: n ew Date().toLocaleDateString('en-US', { month : '2-digit', day: '2-digit' }) + ' ' + nowTim e,
      mod: mod2,
      cashier:  currentUs er.name,
      userId:   currentUser.id,
       customer,
      item:     itemSummary,
       addons:   cart.flatMap(ci => ci.addons.map( a => a.name)),
      sub:      finalCalc.sub, 
      disc:     finalCalc.disc,
      tax:       finalCalc.gct + finalCalc.serviceCharge,
       total:    finalCalc.total,
      pay:       payMethodLabel,
      orderType: cartOrde rType,
      gct:           finalCalc.gct,
       serviceCharge: finalCalc.serviceCharge,
       gratuity:      finalCalc.gratuity,
       gratuityPct:   gratuityPct,
      surchargeT otal: finalCalc.surchargeTotal,
      guestCo unt:  guestCount > 1 ? guestCount : undefined ,
      customerName: customerName || undefin ed,
      tableNum:  selTable ?? undefined,
       tender:    payData.tender,
      changeD ue: payData.changeDue,
      payments:  payDa ta.payments,
      items: cart,
    }

    co nst orderNum   = String(tx.id).slice(-4).padS tart(4, '0')
    const hasKitchen = cart.some (ci => ci.module === 'restaurant')
    const  hasBar     = cart.some(ci => ci.module === 'b ar')
    const hasCarwash = cart.some(ci => c i.module === 'carwash')

    const newTicket:  OrderTicket = {
      id: crypto.randomUUID( ),
      orderNum,
      txId:   tx.id,
       table:  selTable ?? undefined,
      server:  currentUser.name,
      guestCount:    guest Count > 1 ? guestCount : undefined,
      cus tomerName:  customerName || undefined,
       orderType:     cartOrderType,
      status:         'paid',
      hasKitchen,
      hasBar, 
      hasCarwash,
      kitchenStatus: 'pend ing',
      barStatus:     'pending',
      c arwashStatus: 'queued',
      items:    [...c art],
      orderNote: orderNote || undefined ,
      discPct, discFlat, gratuityPct,
       timeline: {
        created: nowTime,
         sentToKitchen: hasKitchen ? nowTime : undef ined,
        paid: nowTime,
      },
      r eprints: [],
    }
    dispatch({ type: 'ADD_ ORDER_TICKET', ticket: newTicket })

    // P rint production tickets so kitchen receives t he order
    const ticketData = {
      order Num,
      table:        selTable ?? undefine d,
      server:       currentUser.name,
       guestCount:   guestCount > 1 ? guestCount :  undefined,
      orderType:    cartOrderType ,
      date:         today,
      time:          nowTime,
      items:        [...cart],
       orderNote:    orderNote || undefined,
       customerName: customerName || undefined,
     }
    const pw = (biz.printers?.width ??  80) as 58 | 80
    // silentOnly=true: auto-p rints never open a browser dialog; they succe ed via QZ Tray or skip
    if (hasKitchen) {
       const html = buildKitchenTicket(ticketD ata, { width: pw })
      smartPrint(html, 'K itchen Ticket', biz.printers?.kitchen, pw, tr ue)
    }
    if (hasBar) {
      const html  = buildBarTicket(ticketData, { width: pw })
       smartPrint(html, 'Bar Ticket', biz.print ers?.bar || biz.printers?.kitchen, pw, true)
     }
    if (hasCarwash) {
      const html  = buildCarwashWorkOrder(ticketData, { width:  pw })
      smartPrint(html, 'Car Wash Work O rder', biz.printers?.receipt, pw, true)
    } 
    // Auto-print receipt (always, unless re ceipt preview modal is enabled in Settings)
     if (biz.printers?.receipt && !biz.printers ?.receiptPreview) {
      const receiptHTML =  buildCustomerReceipt(tx, biz, { width: pw }) 
      smartPrint(receiptHTML, 'Receipt', biz .printers.receipt, pw, true)
    }
    // Ope n cash drawer after cash payment
    if (payD ata.method === 'cash' && biz.printers?.drawer Enabled && biz.printers?.receipt)
      qzOpe nDrawer(biz.printers.receipt)

    dispatch({  type: 'ADD_TRANSACTION', tx })
    dispatch( { type: 'CLEAR_CART' })
    setLastTx(tx)
     setLastTicket(newTicket)
    setShowPayment( false)
    setDiscPct(0); setDiscFlat(0)
     setGuestCount(1); setCustomerName(''); setCus tomerPhone(''); setOrderNote('')
    setGratu ityOverride(false)
    setSurcharges([])
     setSplitTarget(null)
    audit('PAYMENT', `${ itemSummary} — ${fmt(tx.total, sym)} · ${p ayMethodLabel}`, 'success')
    dispatch({ ty pe: 'SET_POS_STATE', mod: 'restaurant', patch : { selTable: null } })
    dispatch({ type:  'SET_POS_STATE', mod: 'bar',        patch: {  selTable: null } })
    dispatch({ type: 'SET _POS_STATE', mod: 'carwash',    patch: { plat e: '' } })
    if (biz.printers?.receiptPrevi ew) {
      setTimeout(() => setShowTicket(tr ue), 200)
    } else {
      onPaymentComplet e?.()
    }
  }

  // ── Send Order: prin t kitchen/bar tickets, keep order open ── ──
  const sendOrder = () => {
    if (ac tiveCart.length === 0) { toast('Add items bef ore sending', 'warn'); return }
    if (!curr entUser) return

    const selTable   = posSt ate['restaurant'].selTable ?? posState['bar'] .selTable
    const nowTime    = new Date().t oLocaleTimeString('en-US', { hour: '2-digit',  minute: '2-digit' })
    const today      =  new Date().toLocaleDateString('en-US', { mont h: 'short', day: '2-digit', year: 'numeric' } )
    const orderNum   = String(Date.now()).s lice(-4).padStart(4, '0')
    const hasKitche n = activeCart.some(ci => ci.module === 'rest aurant')
    const hasBar     = activeCart.so me(ci => ci.module === 'bar')
    const hasCa rwash = activeCart.some(ci => ci.module === ' carwash')

    const newTicket: OrderTicket =  {
      id: crypto.randomUUID(),
      order Num,
      table:  selTable ?? undefined,
       server: currentUser.name,
      guestCount :    guestCount > 1 ? guestCount : undefined, 
      customerName:  customerName || undefin ed,
      orderType:     cartOrderType,
       status:        'sent',
      hasKitchen,
       hasBar,
      hasCarwash,
      kitchenSta tus: 'pending',
      barStatus:     'pending ',
      carwashStatus: 'queued',
      items :    [...cart],  // keep voided items for aud it; active items only go to kitchen
      ord erNote: orderNote || undefined,
      discPct , discFlat, gratuityPct,
      timeline: {
         created: nowTime,
        sentToKitchen : hasKitchen ? nowTime : undefined,
      },
       reprints: [],
    }

    const ticketDa ta = {
      orderNum,
      table:        se lTable ?? undefined,
      server:       curr entUser.name,
      guestCount:   guestCount  > 1 ? guestCount : undefined,
      orderType :    cartOrderType,
      date:         today ,
      time:         nowTime,
      items:         [...activeCart],  // only non-voided it ems to kitchen/bar
      orderNote:    orderN ote || undefined,
      customerName: custome rName || undefined,
    }
    const pw2 = (bi z.printers?.width ?? 80) as 58 | 80
    if (h asKitchen) {
      const html = buildKitchenT icket(ticketData, { width: pw2 })
      smart Print(html, 'Kitchen Ticket', biz.printers?.k itchen, pw2, true)
    }
    if (hasBar) {
       const html = buildBarTicket(ticketData, {  width: pw2 })
      smartPrint(html, 'Bar Ti cket', biz.printers?.bar || biz.printers?.kit chen, pw2, true)
    }
    if (hasCarwash) {
       const html = buildCarwashWorkOrder(tick etData, { width: pw2 })
      smartPrint(html , 'Car Wash Work Order', biz.printers?.receip t, pw2, true)
    }

    dispatch({ type: 'AD D_ORDER_TICKET', ticket: newTicket })
    dis patch({ type: 'CLEAR_CART' })
    dispatch({  type: 'SET_POS_STATE', mod: 'restaurant', pat ch: { selTable: null } })
    dispatch({ type : 'SET_POS_STATE', mod: 'bar',        patch:  { selTable: null } })
    dispatch({ type: 'S ET_POS_STATE', mod: 'carwash',    patch: { pl ate: '' } })
    setDiscPct(0); setDiscFlat(0 ); setGuestCount(1); setCustomerName(''); set OrderNote(''); setGratuityOverride(false)

     const sentTo = [hasKitchen && 'Kitchen', ha sBar && 'Bar', hasCarwash && 'Car Wash'].filt er(Boolean).join(' + ')
    audit('SEND_ORDER ', `Order #${orderNum} sent to ${sentTo}`, 'i nfo')
    setShowOpen(true)
  }

  // ──  Permission helpers ────────� �──────────────� �─────────────
  co nst role = currentUser?.role ?? ''
  const ca nVoidCartItem  = ['admin','manager','supervis or','cashier'].includes(role)
  const canVoid SentItem  = ['admin','manager','supervisor']. includes(role)

  // ── Void a cart item  (pre-send) ───────────� ��──────────────� ��─
  const handleVoidCartItem = (item: Car tItem, reason: VoidReason, reasonText: string ) => {
    if (!currentUser) return
    const  nowTime = new Date().toLocaleTimeString('en- US', { hour: '2-digit', minute: '2-digit' })
     dispatch({ type: 'VOID_CART_ITEM', id: it em.id, reason, reasonText, by: currentUser.na me, at: nowTime })
    const logEntry: VoidLo g = {
      id: crypto.randomUUID(), ts: new  Date().toLocaleString(),
      user: currentU ser.name, userId: currentUser.id, role,
       voidType: 'item', itemName: item.name,
       reason, reasonText,
      amount: (item.pric e + item.addons.reduce((s, a) => s + a.price,  0)) * item.qty,
      mod: item.module,
     }
    dispatch({ type: 'ADD_VOID_LOG', entry:  logEntry })
    audit('VOID_ITEM', `Voided $ {item.name} from cart — ${reasonText}`, 'wa rn')
    setVoidTarget(null)
  }

  // ──  Void an item on a sent open order ───� ��──────────────� ��──
  const handleVoidTicketItem = (tick et: OrderTicket, item: CartItem, reason: Void Reason, reasonText: string) => {
    if (!cur rentUser) return
    const nowTime = new Date ().toLocaleTimeString('en-US', { hour: '2-dig it', minute: '2-digit' })
    dispatch({ type : 'VOID_TICKET_ITEM', ticketId: ticket.id, it emId: item.id, reason, reasonText, by: curren tUser.name, at: nowTime })
    const logEntry : VoidLog = {
      id: crypto.randomUUID(),  ts: new Date().toLocaleString(),
      user:  currentUser.name, userId: currentUser.id, rol e,
      voidType: 'item', orderNum: ticket.o rderNum, itemName: item.name,
      reason, r easonText,
      amount: (item.price + item.a ddons.reduce((s, a) => s + a.price, 0)) * ite m.qty,
      mod: item.module,
    }
    disp atch({ type: 'ADD_VOID_LOG', entry: logEntry  })
    // Print void ticket to kitchen/bar
     const html = buildVoidTicket(
      ticket. orderNum, item.name, currentUser.name, nowTim e,
      { reason: reasonText, qty: item.qty  }
    )
    printTicket(html, 'VOID Ticket')
     audit('VOID_ITEM', `Voided ${item.name} f rom Order #${ticket.orderNum} — ${reasonTex t}`, 'warn')
    setVoidTarget(null)
  }

  / / ── Void entire open order (manager/admi n only) ────────────
   const isManager = ['admin','manager'].inclu des(role)
  const handleVoidEntireOrder = (ti cket: OrderTicket, reason: VoidReason, reason Text: string) => {
    if (!currentUser) retu rn
    const nowTime = new Date().toLocaleTim eString('en-US', { hour: '2-digit', minute: ' 2-digit' })
    const voidedItems = ticket.it ems.map(ci =>
      ci.voided ? ci : { ...ci,  voided: true, voidReason: reason, voidReason Text: reasonText, voidedBy: currentUser.name,  voidedAt: nowTime }
    )
    dispatch({ typ e: 'UPDATE_ORDER_TICKET', id: ticket.id, patc h: { status: 'voided', items: voidedItems } } )
    const totalAmt = ticket.items.filter(ci  => !ci.voided).reduce((s, ci) => s + (ci.pri ce + ci.addons.reduce((as, a) => as + a.price , 0)) * ci.qty, 0)
    dispatch({ type: 'ADD_ VOID_LOG', entry: {
      id: crypto.randomUU ID(), ts: new Date().toLocaleString(),
       user: currentUser.name, userId: currentUser.i d, role,
      voidType: 'order', orderNum: t icket.orderNum, reason, reasonText,
      amo unt: totalAmt, mod: activeModule,
    }})
     if (ticket.hasKitchen || ticket.hasBar) {
       const html = buildVoidTicket(ticket.order Num, `ENTIRE ORDER (${ticket.items.filter(ci  => !ci.voided).length} items)`, currentUser.n ame, nowTime, { reason: reasonText })
      p rintTicket(html, 'VOID — Entire Order')
     }
    audit('VOID_ORDER', `Order #${ticket.o rderNum} voided — ${reasonText}`, 'warn')
     toast(`Order #${ticket.orderNum} voided`,  'warn')
    setVoidOrderTarget(null)
  }

  / / ── Add current cart items to an existin g open order ───────
  const ad dToExistingOrder = (ticket: OrderTicket) => { 
    if (activeCart.length === 0) { toast('Ca rt is empty', 'warn'); return }
    if (!curr entUser) return
    const nowTime = new Date( ).toLocaleTimeString('en-US', { hour: '2-digi t', minute: '2-digit' })
    const today   =  new Date().toLocaleDateString('en-US', { mont h: 'short', day: '2-digit', year: 'numeric' } )
    const newHasKitchen = activeCart.some(c i => ci.module === 'restaurant')
    const ne wHasBar     = activeCart.some(ci => ci.module  === 'bar')
    const newHasCarwash = activeC art.some(ci => ci.module === 'carwash')
    d ispatch({ type: 'UPDATE_ORDER_TICKET', id: ti cket.id, patch: {
      items: [...ticket.ite ms, ...activeCart],
      hasKitchen: ticket. hasKitchen || newHasKitchen,
      hasBar: ti cket.hasBar || newHasBar,
      hasCarwash: t icket.hasCarwash || newHasCarwash,
    }})
     const addData = { orderNum: ticket.orderNum , table: ticket.table, server: currentUser.na me, orderType: ticket.orderType, date: today,  time: nowTime, items: [...activeCart], order Note: `++ ADDITIONAL ITEMS ++` }
    const pw 3 = (biz.printers?.width ?? 80) as 58 | 80
     if (newHasKitchen) { const h = buildKitchen Ticket(addData, { width: pw3 }); smartPrint(h , 'Kitchen Ticket — Addition', biz.printers ?.kitchen, pw3, true) }
    if (newHasBar)      { const h = buildBarTicket(addData, { width : pw3 });     smartPrint(h, 'Bar Ticket — A ddition', biz.printers?.bar || biz.printers?. kitchen, pw3, true) }
    dispatch({ type: 'C LEAR_CART' })
    setAddToOrderMode(false); s etShowOpen(false)
    audit('ADD_TO_ORDER', ` Added ${activeCart.length} item(s) to Order # ${ticket.orderNum}`, 'info')
  }

  // ──  Transfer table ─────────� �──────────────� �──────────────� �──
  const transferTable = (ticketId: st ring, newTable: string) => {
    dispatch({ t ype: 'UPDATE_ORDER_TICKET', id: ticketId, pat ch: { table: newTable } })
    audit('TRANSFE R_TABLE', `Order moved to Table ${newTable}`,  'info')
    setTransferTarget(null)
  }

  c onst holdOrder = () => {
    if (cart.length  === 0) { toast('Nothing to hold', 'warn'); re turn }
    if (!currentUser) return
    const  selTable = posState['restaurant'].selTable ? ? posState['bar'].selTable
    const label =  customerName || (selTable ? `Table ${selTable }` : `Order ${Date.now().toString().slice(-4) }`)
    const held: HeldOrder = {
      id: c rypto.randomUUID(),
      label,
      cart:  [...cart],
      orderType: cartOrderType,
       module: activeModule,
      selTable,
       guestCount,
      customerName,
      disc Pct,
      discFlat,
      gratuityPct,
       gratuityOverride,
      savedAt: new Date(). toLocaleTimeString('en-US', { hour: '2-digit' , minute: '2-digit' }),
      savedBy: curren tUser.name,
    }
    dispatch({ type: 'HOLD_ ORDER', order: held })
    dispatch({ type: ' CLEAR_CART' })
    setDiscPct(0)
    setDiscF lat(0)
    setCustomerName('')
    setGuestCo unt(1)
    setGratuityOverride(false)
    aud it('HOLD_ORDER', `Held: ${label}`, 'info')
   }

  const resumeOrder = (held: HeldOrder) =>  {
    dispatch({ type: 'CLEAR_CART' })
    h eld.cart.forEach(ci => dispatch({ type: 'ADD_ TO_CART', item: ci }))
    dispatch({ type: ' SET_CART_ORDER_TYPE', orderType: held.orderTy pe })
    setCustomerName(held.customerName)
     setGuestCount(held.guestCount)
    setDis cPct(held.discPct)
    setDiscFlat(held.discF lat)
    setGratuityPct(held.gratuityPct)
     setGratuityOverride(held.gratuityOverride)
     if (held.selTable) {
      dispatch({ type : 'SET_POS_STATE', mod: held.module as 'resta urant' | 'bar', patch: { selTable: held.selTa ble } })
    }
    dispatch({ type: 'REMOVE_H ELD_ORDER', id: held.id })
    setShowHeld(fa lse)
    audit('RESUME_ORDER', `Resumed: ${he ld.label}`, 'info')
  }

  // Auto-set gratui ty: 15% for dine-in restaurant, 0 otherwise
   const hasRestaurantItems = cart.some(ci => c i.module === 'restaurant')
  useEffect(() =>  {
    if (gratuityOverride) return
    if (ca rtOrderType === 'dine-in' && hasRestaurantIte ms) {
      setGratuityPct(15)
    } else {
       setGratuityPct(0)
    }
  }, [cartOrderT ype, hasRestaurantItems, gratuityOverride])

 
  // Cart totals
  const discOpts = discMode  === 'pct'
    ? { manualDiscPct: discPct ||  undefined }
    : { manualDiscFlat: discFlat  || undefined }
  const activeCart = cart.filt er(ci => !ci.voided)
  const calc = calcCart( activeCart, { orderType: cartOrderType, taxOv erride: null, ...discOpts, gratuityPct, surch arges })

  // Open (sent, unpaid) orders —  excludes legacy, paid, and voided tickets
   const openOrders = state.orderTickets.filter( t => {
    const s = t.status ?? 'paid'
    r eturn s !== 'paid' && s !== 'voided'
  })

   // Calc to use when paying an open order vs.  current cart
  const payCalc = payingTicket
     ? calcCart(payingTicket.items.filter(ci =>  !ci.voided), {
        orderType: payingTick et.orderType as OrderType,
        manualDisc Pct: payingTicket.discPct || undefined,
         manualDiscFlat: payingTicket.discFlat || u ndefined,
        gratuityPct,
        surcha rges,
      })
    : calc

  // Active add-on s for modal display
  const activeAddons = mo d.addons.filter((a: Addon) => a.active)

  //  Floor plan: map table → open ticket
  cons t tableOrderMap: Record<string, OrderTicket>  = {}
  openOrders.forEach(t => { if (t.table)  tableOrderMap[t.table] = t })

  // Quick pi cks: top 8 most ordered items in this module  (from transaction history)
  const quickPicks : MenuItem[] = (() => {
    const counts: Rec ord<string, number> = {}
    state.transactio ns.slice(-300).forEach(tx => {
      if (tx.i tems) tx.items.forEach(ci => {
        if (ci .module === activeModule && !ci.voided)
           counts[ci.itemId] = (counts[ci.itemId] ? ? 0) + ci.qty
      })
    })
    return mod. items
      .filter((i: MenuItem) => i.active  && (counts[i.id] ?? 0) > 0)
      .sort((a:  MenuItem, b: MenuItem) => (counts[b.id] ?? 0)  - (counts[a.id] ?? 0))
      .slice(0, 8)
   })()

  // Filtered items — applies search  on top of category filter
  const liveInvQty  = (() => {
    const inv = storage.get<Array< { name: string; quantity: number }>>('invento ry') ?? []
    const m: Record<string, number > = {}
    inv.forEach(i => { m[i.name.toLowe rCase()] = i.quantity })
    return m
  })()
   const isEightySixed = (itemName: string) =>  {
    const qty = liveInvQty[itemName.toLowe rCase()]
    return qty !== undefined && qty  === 0
  }
  const elapsedMins = (iso: string)  => Math.floor((Date.now() - new Date(iso).ge tTime()) / 60000)
  const elapsedTime = (iso:  string): string | null => {
    const m = el apsedMins(iso)
    if (m < 1) return null
     if (m >= 60) return Math.floor(m / 60) + 'h  ' + (m % 60) + 'm'
    return m + 'm'
  }
  c onst elapsedColor = (iso: string) => {
    co nst m = elapsedMins(iso)
    return m >= 60 ?  '#ef4444' : m >= 30 ? 'var(--ora)' : 'var(-- txt3)'
  }

  const searchFiltered = filtered Items.filter((i: MenuItem) =>
    !searchQuer y || i.name.toLowerCase().includes(searchQuer y.toLowerCase())
  )

  // Selected table for  current module
  const selTable = posState[' restaurant'].selTable ?? posState['bar'].selT able

  // Active table's open order (for kit chen status display)
  const activeTableOrder  = selTable ? openOrders.find(t => t.table == = selTable) ?? null : null

  return (
    <d iv style={{ display: 'flex', flexDirection: ' column', flex: 1, overflow: 'hidden' }}>

       {/* ── Order Workspace Header ── * /}
      {onBack && orderContext && (
         <div style={{
          display: 'flex', ali gnItems: 'center', gap: 10, padding: '10px 16 px',
          background: 'var(--bg3)', bord erBottom: '2px solid var(--bdr)', flexShrink:  0,
          flexWrap: 'wrap',
        }}>
           {/* Service type label */}
           <span style={{ fontSize: 12, fontWeight: 900 , color: mod.color, textTransform: 'uppercase ', letterSpacing: '.6px', flexShrink: 0 }}>
             {orderContext.orderType === 'dine- in' ? '🍽 Dine-In' : orderContext.orderType  === 'takeout' ? '🥡 Takeout' : '🚗 Deliv ery'}
          </span>

          {/* Table  pill */}
          {selTable && (
             <span style={{ fontSize: 15, fontWeight: 900 , color: 'var(--txt)', background: 'var(--sur f)', padding: '4px 14px', borderRadius: 'var( --r)', border: `2px solid ${mod.color}44`, fl exShrink: 0 }}>
              Table {selTable }
            </span>
          )}

           {/* Guest count — editable for dine-in */} 
          {orderContext.orderType === 'dine- in' && (
            <div style={{ display: ' flex', alignItems: 'center', gap: 5, flexShri nk: 0 }}>
              <button onClick={() = > setGuestCount(g => Math.max(1, g - 1))} sty le={{ width: 22, height: 22, borderRadius: 6,  background: 'var(--surf2)', border: '1px sol id var(--bdr)', color: 'var(--txt)', cursor:  'pointer', fontSize: 13, fontWeight: 800, dis play: 'flex', alignItems: 'center', justifyCo ntent: 'center' }}>−</button>
               <span style={{ fontSize: 12, fontWeight: 700 , color: 'var(--txt2)', minWidth: 60, textAli gn: 'center' }}>{guestCount} {guestCount ===  1 ? 'Guest' : 'Guests'}</span>
               <button onClick={() => setGuestCount(g => g +  1)} style={{ width: 22, height: 22, borderRa dius: 6, background: 'var(--surf2)', border:  '1px solid var(--bdr)', color: 'var(--txt)',  cursor: 'pointer', fontSize: 13, fontWeight:  800, display: 'flex', alignItems: 'center', j ustifyContent: 'center' }}>+</button>
             </div>
          )}

          {/* Custo mer name */}
          {customerName && (
             <span style={{ fontSize: 13, fontWei ght: 700, color: 'var(--txt)', background: 'v ar(--surf)', padding: '4px 10px', borderRadiu s: 'var(--r)', border: '1px solid var(--bdr)' , flexShrink: 0 }}>
              {customerNa me}
            </span>
          )}

           {/* Phone */}
          {customerPhone &&  (
            <span style={{ fontSize: 12, co lor: 'var(--txt3)', fontFamily: 'var(--mono)' , fontWeight: 600, flexShrink: 0 }}>
               {customerPhone}
            </span>
           )}

          {/* Delivery address */} 
          {orderContext.address && (
             <span style={{ fontSize: 12, color: 'var (--txt3)', fontWeight: 600, flexShrink: 0 }}> 
              📍 {orderContext.address}
             </span>
          )}

          {/*  Server */}
          <span style={{ fontSize : 11, color: 'var(--txt3)' }}>· {currentUser ?.name}</span>

          {/* Kitchen status  chips */}
          {activeTableOrder && (
             <div style={{ display: 'flex', gap:  5, flexShrink: 0 }}>
              {[
                 { label: 'Sent ✓', done: true },
                 { label: 'Ready', done: activ eTableOrder.kitchenStatus === 'ready' || acti veTableOrder.status === 'ready' || activeTabl eOrder.status === 'served' },
                 { label: 'Served', done: activeTableOrder.st atus === 'served' },
              ].map(s =>  (
                <span key={s.label} style= {{ fontSize: 10, fontWeight: 700, padding: '2 px 7px', borderRadius: 6, color: s.done ? 'va r(--grn)' : 'var(--txt3)', background: s.done  ? '#14532d22' : 'var(--surf)', border: `1px  solid ${s.done ? '#16a34a44' : 'var(--bdr)'}`  }}>{s.label}</span>
              ))}
             </div>
          )}

          {/* Open  / Held */}
          <div style={{ display:  'flex', gap: 5, marginLeft: 'auto' }}>
             <button onClick={() => setShowOpen(true )} style={{ padding: '3px 9px', borderRadius:  8, fontSize: 11, fontWeight: 700, cursor: 'p ointer', border: `1.5px solid ${openOrders.le ngth > 0 ? 'var(--grn)' : 'var(--bdr)'}`, bac kground: openOrders.length > 0 ? '#14532d22'  : 'transparent', color: openOrders.length > 0  ? 'var(--grn)' : 'var(--txt3)', display: 'fl ex', alignItems: 'center', gap: 4 }}>
               Open{openOrders.length > 0 && <span st yle={{ background: 'var(--grn)', color: '#fff ', borderRadius: 6, fontSize: 9, padding: '0  4px', fontWeight: 800 }}>{openOrders.length}< /span>}
            </button>
            <bu tton onClick={() => setShowHeld(true)} style= {{ padding: '3px 9px', borderRadius: 8, fontS ize: 11, fontWeight: 700, cursor: 'pointer',  border: `1.5px solid ${state.heldOrders.lengt h > 0 ? 'var(--ora)' : 'var(--bdr)'}`, backgr ound: state.heldOrders.length > 0 ? '#78350f2 2' : 'transparent', color: state.heldOrders.l ength > 0 ? 'var(--ora)' : 'var(--txt3)', dis play: 'flex', alignItems: 'center', gap: 4 }} >
              Held{state.heldOrders.length  > 0 && <span style={{ background: 'var(--ora) ', color: '#fff', borderRadius: 6, fontSize:  9, padding: '0 4px', fontWeight: 800 }}>{stat e.heldOrders.length}</span>}
            </bu tton>
          </div>

          {/* Back li nk */}
          <button onClick={onBack} sty le={{ padding: '5px 12px', borderRadius: 'var (--r)', border: '1.5px solid var(--bdr)', bac kground: 'transparent', color: 'var(--txt3)',  fontSize: 11, fontWeight: 700, cursor: 'poin ter', flexShrink: 0 }}>
            ← Back
           </button>
        </div>
      )}

       {/* ── Legacy nav bar — when onBa ck is set but no orderContext ── */}
       {onBack && !orderContext && (
        <div  style={{
          display: 'flex', alignItem s: 'center', gap: 10, padding: '8px 16px',
           background: 'var(--bg2)', borderBotto m: '1px solid var(--bdr)', flexShrink: 0,
         }}>
          <button onClick={onBack} s tyle={{
            padding: '6px 14px', bord erRadius: 'var(--r)', border: '1.5px solid va r(--bdr)',
            background: 'var(--sur f)', color: 'var(--txt2)', fontSize: 12, font Weight: 700,
            cursor: 'pointer', d isplay: 'flex', alignItems: 'center', gap: 6, 
          }}>← Dashboard</button>
           <div style={{ fontSize: 12, color: 'var(--t xt3)', fontWeight: 600 }}>
            {cartO rderType === 'dine-in'  ? '🍽 Dine-In'  :
              cartOrderType === 'takeout'  ? '� ��� Takeout'  :
             cartOrderType == = 'delivery' ? '🚗 Delivery'  : 'Order Entr y'}
            {posState['restaurant'].selTa ble ? ` · Table ${posState['restaurant'].sel Table}` : ''}
          </div>
        </div> 
      )}

      {/* ── Carwash toolbar ( bay, plate, tabs) ── */}
      {activeMod ule === 'carwash' && (

        <div style={{  padding: '8px 12px', borderBottom: '1px soli d var(--bdr)', display: 'flex', alignItems: ' center', gap: 8, flexShrink: 0, background: ' var(--bg2)' }}>
          {/* Tab switcher */ }
          {(['pos','orders'] as const).map( t => (
            <button key={t} onClick={( ) => setCwTab(t)} style={{
              padd ing: '7px 16px', borderRadius: 20, fontSize:  13, fontWeight: 700, cursor: 'pointer',
               border: `1.5px solid ${cwTab === t ?  'transparent' : 'var(--bdr)'}`,
               background: cwTab === t ? 'var(--blue)' : ' transparent',
              color: cwTab ===  t ? '#fff' : 'var(--txt2)',
              dis play: 'flex', alignItems: 'center', gap: 6, t ransition: 'all .12s', minHeight: 36,
             }}>
              {t === 'pos' ? 'New Sa le' : 'Outside Orders'}
              {t ===  'orders' && pendingCount > 0 && (
                 <span style={{ background: '#ef4444', co lor: '#fff', borderRadius: 10, fontSize: 11,  fontWeight: 800, padding: '1px 6px', minWidth : 18, textAlign: 'center' }}>
                   {pendingCount}
                </span>
               )}
            </button>
           ))}

          {/* Bay selector + plate inpu t (POS tab only) */}
          {cwTab === 'po s' && (
            <div style={{ marginLeft:  'auto', display: 'flex', alignItems: 'center ', gap: 8 }}>
              <select
                 value={ps.selTable ?? ''}
                 onChange={e => setPOS({ selTable: e.targe t.value || null })}
                style={{  padding: '7px 10px', borderRadius: 8, border:  '1px solid var(--bdr)', background: 'var(--s urf)', color: 'var(--txt)', fontSize: 12, fon tWeight: 600, cursor: 'pointer', minWidth: 11 0 }}
              >
                <option  value="">— Bay —</option>
                 {(mod.bays as string[])?.map((b: string) =>  (
                  <option key={b} value={b} >{b} {mod.bayStatus?.[b] === 'occupied' ? '(B usy)' : '(Open)'}</option>
                )) }
              </select>
              <inpu t
                value={ps.plate}
                 onChange={e => setPOS({ plate: e.target .value.toUpperCase() })}
                plac eholder="PLATE-000"
                maxLength ={10}
                style={{ padding: '7px  10px', borderRadius: 8, border: '1px solid va r(--bdr)', background: 'var(--surf)', color:  'var(--txt)', fontSize: 12, fontWeight: 700,  width: 105, fontFamily: 'var(--mono)', letter Spacing: 1 }}
              />
            </ div>
          )}
        </div>
      )}

       {/* ── Outside orders panel ── */ }
      {activeModule === 'carwash' && cwTab  === 'orders' ? (
        <OutsideOrders onCou ntChange={setPendingCount} />
      ) : (

         /* ── Redesigned 2-panel POS ──  */
        <div style={{ display: 'flex', fl ex: 1, overflow: 'hidden' }}>

          {/*  ── LEFT: Menu panel (40%) ── */}
           <div style={{ flex: '0 0 40%', display:  'flex', flexDirection: 'column', overflow: ' hidden', borderRight: '1px solid var(--bdr)'  }}>

            {/* Category tabs + search b ar */}
            <div style={{ borderBottom : '1px solid var(--bdr)', flexShrink: 0 }}>
               <div style={{ padding: '8px 12px  0', display: 'flex', gap: 6, overflowX: 'aut o' }}>
                {cats.map((cat: string ) => (
                  <button key={cat} on Click={() => { setPOS({ cat }); setSearchQuer y('') }} style={{
                    padding : '8px 18px', borderRadius: '20px 20px 0 0',  fontSize: 13, fontWeight: 700,
                     cursor: 'pointer', border: `1.5px solid  ${ps.cat === cat ? mod.color : 'var(--bdr)'} `,
                    borderBottom: ps.cat = == cat ? `2px solid ${mod.color}` : '1.5px so lid var(--bdr)',
                    color: p s.cat === cat ? mod.color : 'var(--txt2)', wh iteSpace: 'nowrap', minHeight: 40,
                     background: ps.cat === cat ? mod.co lor + '15' : 'transparent', transition: 'all  .12s', flexShrink: 0,
                  }}>{c at}</button>
                ))}
               </div>
              <div style={{ padding:  '8px 12px', display: 'flex', alignItems: 'ce nter', gap: 8 }}>
                <div style= {{ flex: 1, position: 'relative' }}>
                   <span style={{ position: 'absolute' , left: 10, top: '50%', transform: 'translate Y(-50%)', fontSize: 14, color: 'var(--txt3)',  pointerEvents: 'none' }}>🔍</span>
                   <input value={searchQuery} onChang e={e => setSearchQuery(e.target.value)} place holder="Search menu..."
                    s tyle={{ width: '100%', padding: '8px 10px 8px  34px', borderRadius: 10, border: `1.5px soli d ${searchQuery ? mod.color : 'var(--bdr)'}`,  background: 'var(--surf2)', color: 'var(--tx t)', fontSize: 13, fontWeight: 500, boxSizing : 'border-box' }} />
                </div>
                 {searchQuery && (
                   <button onClick={() => setSearchQuery(' ')} style={{ background: 'none', border: 'non e', color: 'var(--txt3)', cursor: 'pointer',  fontSize: 20, padding: '0 4px', lineHeight: 1  }}>×</button>
                )}
               </div>
            </div>

            {/ * Menu content */}
            <div style={{  flex: 1, overflowY: 'auto', padding: '10px 12 px' }}>

              {/* Quick Picks */}
               {quickPicks.length > 0 && !search Query && (
                <div style={{ marg inBottom: 14 }}>
                  <div style ={{ fontSize: 11, fontWeight: 800, color: mod .color, textTransform: 'uppercase', letterSpa cing: '.6px', marginBottom: 8 }}>⚡ Quick Pi cks</div>
                  <div style={{ dis play: 'flex', gap: 7, flexWrap: 'wrap' }}>
                     {quickPicks.map((item: Menu Item) => (
                      <button key= {item.id} onClick={() => handleItemClick(item )} style={{
                        padding:  '7px 14px', borderRadius: 20, border: `1.5px  solid ${mod.color}44`,
                         background: 'var(--surf)', color: 'var(--tx t)', cursor: 'pointer',
                         fontSize: 12, fontWeight: 700, display: 'f lex', gap: 6, alignItems: 'center',
                         whiteSpace: 'nowrap', transiti on: 'all .12s',
                      }}>
                         {item.name}
                         <span style={{ color: mod.color,  fontFamily: 'var(--mono)', fontSize: 11 }}>{f mt(item.price, sym)}</span>
                       </button>
                    ))}
                   </div>
                </div>
               )}

              {/* Search resul t count */}
              {searchQuery && (
                 <div style={{ fontSize: 12, co lor: 'var(--txt3)', marginBottom: 10 }}>
                   {searchFiltered.length} result{ searchFiltered.length !== 1 ? 's' : ''} for & ldquo;{searchQuery}&rdquo;
                </ div>
              )}

              {/* Item  grid — 3 columns */}
              {liveMe nuItems === null && (activeModule === 'restau rant' || activeModule === 'bar') ? (
                 <div style={{ textAlign: 'center', pa dding: '40px 0', color: 'var(--txt3)', fontSi ze: 13 }}>
                  Loading menu…
                 </div>
              ) : sear chFiltered.length === 0 ? (
                < div style={{ textAlign: 'center', padding: '4 0px 0', color: 'var(--txt3)', fontSize: 13 }} >
                  {searchQuery ? <>No items  match &ldquo;{searchQuery}&rdquo;</> : 'No m enu items in this category'}
                 </div>
              ) : (
                <d iv style={{ display: 'grid', gridTemplateColu mns: 'repeat(3, 1fr)', gap: 10 }}>
                   {searchFiltered.map((item: MenuItem)  => {
                    const eightySixed =  isEightySixed(item.name)
                     return (
                    <div key={item.i d} onClick={() => !eightySixed && handleItemC lick(item)} style={{
                      ba ckground: eightySixed ? 'var(--surf2)' : (ite m.gradient ?? 'var(--surf)'),
                       border: '2px solid var(--bdr)',
                       borderRadius: 'var(--r3)', cu rsor: eightySixed ? 'not-allowed' : 'pointer' , overflow: 'hidden',
                      t ransition: 'all .15s', display: 'flex', flexD irection: 'column', minHeight: 130,
                       opacity: eightySixed ? 0.55 : 1, 
                    }}>
                       {eightySixed ? (
                        <d iv style={{ padding: '3px 8px', background: ' #7f1d1d33', borderBottom: '1px solid #ef44443 3', fontSize: 10, fontWeight: 800, color: '#e f4444', textAlign: 'center', letterSpacing: ' .5px' }}>{'86\'d — OUT'}</div>
                       ) : item.duration ? (
                         <div style={{ padding: '3px 8px',  background: 'var(--surf2)', borderBottom: '1p x solid var(--bdr)', fontSize: 10, fontWeight : 700, color: 'var(--txt3)' }}>{item.duration }</div>
                      ) : null}
                       <div style={{ padding: '11px  12px 12px', flex: 1, display: 'flex', flexDi rection: 'column', justifyContent: 'space-bet ween' }}>
                        <div>
                           <div style={{ fontSize:  13, fontWeight: 800, color: eightySixed ? 'va r(--txt3)' : 'var(--txt)', lineHeight: 1.25,  textDecoration: eightySixed ? 'line-through'  : 'none' }}>{item.name}</div>
                         </div>
                        <div  style={{ fontSize: 17, fontWeight: 800, fontF amily: 'var(--mono)', color: eightySixed ? 'v ar(--txt3)' : (item.accent ?? mod.color), mar ginTop: 8, letterSpacing: '-.3px' }}>
                           {eightySixed ? '86 OUT' :  fmt(item.price, sym)}
                         </div>
                      </div>
                     </div>
                    )
                   })}
                </div>
               )}
            </div>
          </d iv>

          {/* ── RIGHT: Order ticket  (60%) ── */}
          <div style={{ fle x: '0 0 60%', minWidth: 340, display: 'flex',  flexDirection: 'column', overflow: 'hidden'  }}>

            {/* Table / Server / Status  header — hidden when workspace header is ac tive */}
            {!orderContext && <div s tyle={{ padding: '10px 14px', borderBottom: ' 1px solid var(--bdr)', background: 'var(--bg3 )', flexShrink: 0 }}>
              <div styl e={{ display: 'flex', alignItems: 'flex-start ', justifyContent: 'space-between', marginBot tom: 8 }}>
                <div>
                   {selTable ? (
                    <div  style={{ fontSize: 22, fontWeight: 900, color : 'var(--txt)', lineHeight: 1, letterSpacing:  '-.5px' }}>Table {selTable}</div>
                   ) : (
                    <div style= {{ fontSize: 14, fontWeight: 700, color: 'var (--txt3)' }}>No Table Selected</div>
                   )}
                  <div style={{  fontSize: 11, color: 'var(--txt3)', marginTop : 2 }}>
                    {currentUser?.nam e}{guestCount > 1 ? ` · ${guestCount} guests ` : ' · 1 guest'}
                  </div>
                 </div>
                <div st yle={{ display: 'flex', flexDirection: 'colum n', alignItems: 'flex-end', gap: 5 }}>
                   {cart.length > 0 && <span style={ { fontSize: 10, fontWeight: 700, padding: '3p x 9px', borderRadius: 8, background: '#14532d 22', color: 'var(--grn)', border: '1px solid  #16a34a44', whiteSpace: 'nowrap' }}>OPEN ORDE R</span>}
                  <div style={{ dis play: 'flex', gap: 4 }}>
                     <button onClick={() => setShowOpen(true)} sty le={{ padding: '3px 9px', borderRadius: 8, fo ntSize: 11, fontWeight: 700, cursor: 'pointer ', border: `1.5px solid ${openOrders.length >  0 ? 'var(--grn)' : 'var(--bdr)'}`, backgroun d: openOrders.length > 0 ? '#14532d22' : 'tra nsparent', color: openOrders.length > 0 ? 'va r(--grn)' : 'var(--txt3)', display: 'flex', a lignItems: 'center', gap: 4 }}>
                       Open{openOrders.length > 0 && <span  style={{ background: 'var(--grn)', color: '#f ff', borderRadius: 6, fontSize: 9, padding: ' 0 4px', fontWeight: 800 }}>{openOrders.length }</span>}
                    </button>
                     <button onClick={() => setShow Held(true)} style={{ padding: '3px 9px', bord erRadius: 8, fontSize: 11, fontWeight: 700, c ursor: 'pointer', border: `1.5px solid ${stat e.heldOrders.length > 0 ? 'var(--ora)' : 'var (--bdr)'}`, background: state.heldOrders.leng th > 0 ? '#78350f22' : 'transparent', color:  state.heldOrders.length > 0 ? 'var(--ora)' :  'var(--txt3)', display: 'flex', alignItems: ' center', gap: 4 }}>
                      Hel d{state.heldOrders.length > 0 && <span style= {{ background: 'var(--ora)', color: '#fff', b orderRadius: 6, fontSize: 9, padding: '0 4px' , fontWeight: 800 }}>{state.heldOrders.length }</span>}
                    </button>
                   </div>
                </div>
               </div>

              {/* Kitchen  status tracker */}
              {activeTabl eOrder && (
                <div style={{ dis play: 'flex', gap: 5, marginBottom: 8, flexWr ap: 'wrap' }}>
                  {[
                     { label: 'Kitchen Sent ✓', done:  true },
                    { label: 'Food R eady', done: activeTableOrder.kitchenStatus = == 'ready' || activeTableOrder.status === 're ady' || activeTableOrder.status === 'served'  },
                    { label: 'Served', don e: activeTableOrder.status === 'served' },
                   ].map(step => (
                     <div key={step.label} style={{ fontSiz e: 10, fontWeight: 700, padding: '3px 8px', b orderRadius: 8, color: step.done ? 'var(--grn )' : 'var(--txt3)', background: step.done ? ' #14532d22' : 'var(--surf)', border: `1px soli d ${step.done ? '#16a34a44' : 'var(--bdr)'}`  }}>{step.label}</div>
                  ))}
                 </div>
              )}

               {/* Table selector — floor plan or  dropdown */}
              {(activeModule == = 'restaurant' || activeModule === 'bar') &&  (mod.tables as string[])?.length > 0 && (
                 showFloorPlan ? (
                   <div>
                    <div style={{ d isplay: 'flex', justifyContent: 'space-betwee n', alignItems: 'center', marginBottom: 7 }}> 
                      <span style={{ fontSiz e: 10, fontWeight: 800, color: mod.color, tex tTransform: 'uppercase', letterSpacing: '.5px ' }}>Floor Plan</span>
                       <div style={{ display: 'flex', gap: 8, alignI tems: 'center', fontSize: 9, color: 'var(--tx t3)' }}>
                        <span style= {{ color: 'var(--grn)' }}>● Free</span>
                         <span style={{ color: 'v ar(--ora)' }}>● Occupied</span>
                         <span style={{ color: '#ef4444'  }}>● Pay Now</span>
                         <button onClick={() => setShowFloorPlan(fals e)} style={{ fontSize: 10, padding: '2px 8px' , borderRadius: 8, border: '1px solid var(--b dr)', background: 'transparent', color: 'var( --txt3)', cursor: 'pointer', fontWeight: 700  }}>List ▾</button>
                      </ div>
                    </div>
                     <div style={{ display: 'grid', gridTem plateColumns: 'repeat(5, 1fr)', gap: 5, maxHe ight: 160, overflowY: 'auto' }}>
                       {(mod.tables as string[]).map((tbl:  string) => {
                        const t Order = tableOrderMap[tbl]
                         const tStatus = tOrder ? ((tOrder.statu s === 'ready' || tOrder.status === 'served')  ? 'paying' : 'occupied') : 'free'
                         const tColors = tStatus === 'fre e' ? { bg: '#14532d22', border: '#16a34a55',  color: 'var(--grn)' }
                           : tStatus === 'occupied' ? { bg: '#78350f2 2', border: '#d9770055', color: 'var(--ora)'  }
                          : { bg: '#7f1d1d2 2', border: '#ef444455', color: '#ef4444' }
                         const isSel = selTable  === tbl
                        return (
                           <button key={tbl} onCl ick={() => setPOS({ selTable: isSel ? null :  tbl })} style={{ padding: '7px 4px', borderRa dius: 'var(--r2)', textAlign: 'center', curso r: 'pointer', border: `2px solid ${isSel ? mo d.color : tColors.border}`, background: isSel  ? mod.color + '33' : tColors.bg, color: isSe l ? mod.color : tColors.color }}>
                             <div style={{ fontSize: 11,  fontWeight: 800 }}>{tbl}</div>
                             <div style={{ fontSize: 8, opac ity: .75, marginTop: 1 }}>{tStatus === 'free'  ? 'Free' : tStatus === 'occupied' ? `#${tOrd er!.orderNum}` : 'Pay'}</div>
                           </button>
                         )
                      })}
                     </div>
                  </div>
                 ) : (
                  <div style={{ d isplay: 'flex', gap: 6, alignItems: 'center'  }}>
                    <select value={ps.sel Table ?? ''} onChange={e => setPOS({ selTable : e.target.value || null })}
                       style={{ flex: 1, padding: '7px 10px',  borderRadius: 8, border: '1px solid var(--bdr )', background: 'var(--surf2)', color: ps.sel Table ? 'var(--txt)' : 'var(--txt3)', fontSiz e: 12, fontWeight: 600, cursor: 'pointer' }}> 
                      <option value="">— S elect Table —</option>
                       {(mod.tables as string[]).map((tbl: string)  => {
                        const tOrder =  tableOrderMap[tbl]
                        co nst tStatus = (mod.tableStatus as Record<stri ng, string>)?.[tbl] ?? 'free'
                         return <option key={tbl} value={tbl} >{tbl}{tOrder ? ` (Order #${tOrder.orderNum}) ` : tStatus === 'reserved' ? ' (Reserved)' :  ''}</option>
                      })}
                     </select>
                    < button onClick={() => setShowFloorPlan(true)}  title="Floor plan view" style={{ flexShrink:  0, padding: '7px 11px', borderRadius: 8, bor der: '1px solid var(--bdr)', background: 'var (--surf)', color: 'var(--txt3)', cursor: 'poi nter', fontSize: 15 }}>⊞</button>
                   </div>
                )
               )}
            </div>}

            {/* Cu stomer / order type / guests — only when no  orderContext (workspace mode hides this) */} 
            {(activeModule === 'restaurant'  || activeModule === 'bar') && !orderContext & & (
              <div style={{ padding: '8px  12px', borderBottom: '1px solid var(--bdr)',  flexShrink: 0 }}>
                <div style ={{ display: 'grid', gridTemplateColumns: '1f r auto', gap: 6, marginBottom: 6 }}>
                   <input value={customerName} onChang e={e => setCustomerName(e.target.value)} plac eholder="Customer name (optional)"
                     style={{ padding: '6px 9px', border Radius: 8, border: '1px solid var(--bdr)', ba ckground: 'var(--surf2)', color: 'var(--txt)' , fontSize: 11, fontWeight: 600 }} />
                   <div style={{ display: 'flex', ali gnItems: 'center', gap: 4 }}>
                     <button onClick={() => setGuestCount(g = > Math.max(1, g-1))} style={{ width: 26, heig ht: 26, borderRadius: 7, background: 'var(--s urf2)', border: '1px solid var(--bdr)', color : 'var(--txt)', cursor: 'pointer', fontSize:  14, fontWeight: 800, display: 'flex', alignIt ems: 'center', justifyContent: 'center' }}>� �</button>
                    <span style={{  fontSize: 14, fontWeight: 800, minWidth: 20,  textAlign: 'center', color: 'var(--txt)' }}> {guestCount}</span>
                    <butt on onClick={() => setGuestCount(g => g+1)} st yle={{ width: 26, height: 26, borderRadius: 7 , background: 'var(--surf2)', border: '1px so lid var(--bdr)', color: 'var(--txt)', cursor:  'pointer', fontSize: 14, fontWeight: 800, di splay: 'flex', alignItems: 'center', justifyC ontent: 'center' }}>+</button>
                   </div>
                </div>
               </div>
            )}

            {/* Car t items — scrollable */}
            <div s tyle={{ flex: 1, overflowY: 'auto', padding:  '8px 10px', minHeight: 0 }}>
              {c art.length === 0 ? (
                <div sty le={{ textAlign: 'center', padding: '28px 10p x', color: 'var(--txt3)' }}>
                   <div style={{ fontSize: 32, marginBottom: 8  }}>🍽</div>
                  <div style={ { fontSize: 12, fontWeight: 600 }}>Tap menu i tems to add</div>
                </div>
               ) : (
                cart.map((ci:  CartItem) => {
                  const badge  = MOD_BADGE[ci.module] ?? MOD_BADGE.restaura nt
                  const lineTotal = (ci.pr ice + ci.addons.reduce((s, a) => s + a.price,  0)) * ci.qty
                  const isVoide d = !!ci.voided
                  return (
                     <div key={ci.id} style={{ b ackground: isVoided ? 'var(--surf3)' : 'var(- -surf)', borderRadius: 'var(--r)', marginBott om: 7, overflow: 'hidden', border: `1px solid  ${isVoided ? '#ef444433' : 'var(--bdr)'}`, o pacity: isVoided ? .55 : 1, display: 'flex' } }>
                      <div style={{ width:  4, background: isVoided ? '#ef4444' : badge. color, flexShrink: 0 }} />
                       <div style={{ flex: 1, padding: '9px 10px ' }}>
                        <div style={{ d isplay: 'flex', alignItems: 'flex-start', gap : 6, marginBottom: 3 }}>
                           <div style={{ flex: 1 }}>
                             <span style={{ fontSize: 13, f ontWeight: 800, color: isVoided ? 'var(--txt3 )' : 'var(--txt)', textDecoration: isVoided ?  'line-through' : 'none', lineHeight: 1.2 }}> {ci.name}</span>
                             <span style={{ fontSize: 11, color: 'var(--tx t3)', marginLeft: 5 }}>×{ci.qty}</span>
                             {isVoided && <span st yle={{ fontSize: 10, fontWeight: 700, color:  '#ef4444', marginLeft: 6 }}>VOID</span>}
                           </div>
                           <span style={{ fontSize: 13, fontWe ight: 800, fontFamily: 'var(--mono)', color:  isVoided ? 'var(--txt3)' : 'var(--txt)', flex Shrink: 0, textDecoration: isVoided ? 'line-t hrough' : 'none' }}>{fmt(lineTotal, sym)}</sp an>
                        </div>
                         {isVoided && ci.voidReason && ( 
                          <div style={{ font Size: 10, color: '#ef4444', marginBottom: 3 } }>{ci.voidReasonText || VOID_REASON_LABELS[ci .voidReason]} · {ci.voidedBy}</div>
                         )}
                        {! isVoided && (
                          <>
                             {ci.flavour && <div  style={{ fontSize: 11, color: 'var(--ora)',  marginBottom: 1 }}>Flavour: {ci.flavour}</div >}
                            {ci.size    &&  <div style={{ fontSize: 11, color: 'var(--pu r)', marginBottom: 1 }}>Size: {ci.size}</div> }
                            {ci.sides && ci .sides.length > 0 && <div style={{ fontSize:  11, color: 'var(--grn)', marginBottom: 1 }}>S ides: {ci.sides.join(', ')}</div>}
                             {ci.addons.map(a => (
                               <div key={a.id} styl e={{ display: 'flex', justifyContent: 'space- between', fontSize: 11, color: 'var(--txt3)',  marginBottom: 1 }}>
                                 <span>{a.name}</span><span>+{fmt(a.pr ice, sym)}</span>
                               </div>
                            ))}
                             {ci.plate && <div st yle={{ fontSize: 11, color: 'var(--blue)', fo ntFamily: 'var(--mono)', fontWeight: 700 }}>P late: {ci.plate}</div>}
                             {ci.note && editingNoteId !== ci.id &&  <div style={{ fontSize: 11, color: 'var(--tx t3)', fontStyle: 'italic', marginTop: 2 }}>No te: {ci.note}</div>}
                             {editingNoteId === ci.id && (
                               <div style={{ marginTop: 6 , display: 'flex', gap: 6 }}>
                                 <textarea autoFocus value={n oteInput} onChange={e => setNoteInput(e.targe t.value)} placeholder="Special instructions.. ." rows={2} style={{ flex: 1, padding: '6px 8 px', borderRadius: 'var(--r)', border: '1.5px  solid var(--blue)', background: 'var(--bg3)' , color: 'var(--txt)', fontSize: 12, resize:  'none' }} />
                                 <div style={{ display: 'flex', flexDirection:  'column', gap: 4 }}>
                                   <button onClick={() => { dispatch( { type: 'UPDATE_CART_NOTE', id: ci.id, note:  noteInput }); setEditingNoteId(null) }} style ={{ padding: '4px 8px', borderRadius: 'var(-- r)', background: 'var(--grn)', color: '#fff',  border: 'none', cursor: 'pointer', fontSize:  11, fontWeight: 700 }}>Save</button>
                                   <button onClick={( ) => setEditingNoteId(null)} style={{ padding : '4px 8px', borderRadius: 'var(--r)', backgr ound: 'var(--bg3)', color: 'var(--txt3)', bor der: '1px solid var(--bdr)', cursor: 'pointer ', fontSize: 11 }}>Cancel</button>
                                 </div>
                               </div>
                             )}
                          </>
                         )}
                        {! isVoided && (
                          <div  style={{ display: 'flex', alignItems: 'center ', gap: 6, marginTop: 7 }}>
                             {!isVoided && (<button onClick={()  => { setNoteInput(ci.note ?? ''); setEditing NoteId(editingNoteId === ci.id ? null : ci.id ) }} title="Edit note" style={{ background: e ditingNoteId === ci.id ? 'var(--blue)' : 'var (--bg3)', border: '1px solid var(--bdr)', col or: editingNoteId === ci.id ? '#fff' : ci.not e ? 'var(--blue)' : 'var(--txt3)', borderRadi us: 'var(--r)', width: 28, height: 28, cursor : 'pointer', fontSize: 13 }}>✏️</button>) }
                            <button onClick ={() => dispatch({ type: 'UPDATE_CART_QTY', i d: ci.id, qty: ci.qty - 1 })}
                               style={{ width: 28, height: 28 , borderRadius: 7, background: 'var(--surf2)' , border: '1px solid var(--bdr)', color: 'var (--txt)', cursor: 'pointer', display: 'flex',  alignItems: 'center', justifyContent: 'cente r', fontSize: 15, fontWeight: 800 }}>−</but ton>
                            <span style= {{ fontFamily: 'var(--mono)', fontSize: 14, f ontWeight: 800, minWidth: 22, textAlign: 'cen ter', color: 'var(--txt)' }}>{ci.qty}</span>
                             <button onClick={ () => dispatch({ type: 'UPDATE_CART_QTY', id:  ci.id, qty: ci.qty + 1 })}
                               style={{ width: 28, height: 28,  borderRadius: 7, background: 'var(--surf2)',  border: '1px solid var(--bdr)', color: 'var(- -txt)', cursor: 'pointer', display: 'flex', a lignItems: 'center', justifyContent: 'center' , fontSize: 15, fontWeight: 800 }}>+</button> 
                            {canVoidCartItem  && (
                              <button o nClick={() => setVoidTarget({ item: ci })}
                                 style={{ margin Left: 'auto', padding: '4px 10px', borderRadi us: 6, background: '#7f1d1d22', border: '1px  solid #ef444433', color: '#ef4444', cursor: ' pointer', fontSize: 11, fontWeight: 700 }}>VO ID</button>
                            )}
                           </div>
                         )}
                      </div>
                     </div>
                  )
                 })
              )}
             </div>

            {/* ── STICKY TOTAL S + ACTIONS ── */}
            <div style ={{ borderTop: '2px solid var(--bdr)', backgr ound: 'var(--bg3)', flexShrink: 0 }}>

               {/* Discount — visible only when Pa y is open */}
              {showDetails && < div style={{ padding: '7px 12px', borderBotto m: '1px solid var(--bdr2)', display: 'flex',  alignItems: 'center', gap: 6 }}>
                 <span style={{ fontSize: 11, color: 'var( --txt3)', flex: 1 }}>Discount</span>
                 <button onClick={() => { setDiscMode( m => m === 'pct' ? 'flat' : 'pct'); setDiscPc t(0); setDiscFlat(0) }}
                  sty le={{ fontSize: 10, padding: '2px 7px', borde rRadius: 6, border: '1px solid var(--bdr)', b ackground: 'var(--surf2)', color: 'var(--txt3 )', cursor: 'pointer', fontWeight: 700 }}>
                   {discMode === 'pct' ? '%' : s ym}
                </button>
                 {discMode === 'pct' ? (
                  <> 
                    <input type="number" min ={0} max={100} value={discPct || ''} onChange ={e => { const v = Math.min(100, Math.max(0,  Number(e.target.value)||0)); if (v > 20 && !i sManager) { toast('Large discounts require ma nager access', 'warn'); return }; setDiscPct( v) }} placeholder="0"
                      s tyle={{ width: 46, background: 'var(--surf2)' , border: `1px solid ${discPct>0?'var(--grn)' :'var(--bdr2)'}`, borderRadius: 6, padding: ' 4px 6px', fontSize: 13, color: discPct>0?'var (--grn)':'var(--txt)', textAlign: 'right' }}  />
                    <span style={{ fontSiz e: 11, color: 'var(--txt3)' }}>%</span>
                   </>
                ) : (
                   <>
                    <input typ e="number" min={0} value={discFlat || ''} onC hange={e => { const v = Math.max(0, Number(e. target.value)||0); if (v > calc.sub*0.2 && !i sManager) { toast('Large discounts require ma nager access', 'warn'); return }; setDiscFlat (v) }} placeholder="0"
                       style={{ width: 60, background: 'var(--surf2) ', border: `1px solid ${discFlat>0?'var(--grn )':'var(--bdr2)'}`, borderRadius: 6, padding:  '4px 6px', fontSize: 13, color: discFlat>0?' var(--grn)':'var(--txt)', textAlign: 'right'  }} />
                    <span style={{ font Size: 11, color: 'var(--txt3)' }}>{sym}</span >
                  </>
                )}
                 {(discPct > 0 || discFlat > 0)  && (
                  <button onClick={() =>  { setDiscPct(0); setDiscFlat(0) }} style={{  fontSize: 14, color: '#ef4444', background: ' none', border: 'none', cursor: 'pointer', pad ding: 0, lineHeight: 1 }}>✕</button>
                 )}
              </div>}

               {/* Totals */}
              <div style= {{ padding: '8px 14px' }}>
                {/ * Subtotal / disc / GCT / service — only wh en Pay is open */}
                {showDetai ls && ([
                  { label: 'Subtotal ', value: fmt(calc.sub, sym), color: 'var(--t xt3)' },
                  calc.disc > 0 && {  label: discMode==='pct' ? `Discount (${discP ct}%)` : 'Discount', value: `−${fmt(calc.di sc,sym)}`, color: 'var(--grn)' },
                   calc.gct > 0  && { label: `GCT (${(cal c.gctRate*100).toFixed(0)}%)`, value: fmt(cal c.gct,sym), color: 'var(--txt3)' },
                   calc.serviceCharge > 0 && { label: ` Service (${(calc.scRate*100).toFixed(0)}%)`,  value: fmt(calc.serviceCharge,sym), color: 'v ar(--txt3)' },
                ].filter(Boole an) as {label:string;value:string;color:strin g}[]).map((row, i) => (
                  <di v key={i} style={{ display: 'flex', justifyCo ntent: 'space-between', marginBottom: 4, font Size: 12 }}>
                    <span style= {{ color: row.color }}>{row.label}</span>
                     <span style={{ fontWeight: 7 00, color: row.color, fontFamily: 'var(--mono )' }}>{row.value}</span>
                  </ div>
                ))}

                {/*  Gratuity — only when Pay is open */}
                 {showDetails && hasRestaurantItems  && cartOrderType === 'dine-in' && (
                   <div style={{ display: 'flex', just ifyContent: 'space-between', alignItems: 'cen ter', marginBottom: 4, fontSize: 12 }}>
                     <div style={{ display: 'flex',  alignItems: 'center', gap: 4 }}>
                       <span style={{ color: 'var(--txt3) ' }}>Gratuity ({gratuityPct}%)</span>
                       {isManager && !showGratEdit &&  (
                        <button onClick={( ) => { setGratInput(String(gratuityPct)); set ShowGratEdit(true) }}
                           style={{ fontSize: 9, padding: '1px 5px',  borderRadius: 5, border: '1px solid var(--bdr )', background: 'transparent', color: 'var(-- txt3)', cursor: 'pointer' }}>edit</button>
                       )}
                       {isManager && showGratEdit && (
                         <div style={{ display: 'flex', ali gnItems: 'center', gap: 3 }}>
                           <input type="number" min={0} max={ 50} value={gratInput} onChange={e => setGratI nput(e.target.value)}
                             style={{ width: 38, padding: '1px 5px',  borderRadius: 5, border: '1px solid var(--bdr )', background: 'var(--surf2)', color: 'var(- -txt)', fontSize: 11, textAlign: 'center' }}  />
                          <span style={{ f ontSize: 9, color: 'var(--txt3)' }}>%</span>
                           <button onClick={()  => { const v = Math.max(0, Math.min(50, pars eFloat(gratInput)||0)); setGratuityPct(v); se tGratuityOverride(true); setShowGratEdit(fals e); audit('GRATUITY_OVERRIDE',`Set gratuity t o ${v}%`,'warn') }}
                             style={{ fontSize: 9, padding: '1px 5px',  borderRadius: 5, border: '1px solid var(--grn )', background: '#14532d22', color: 'var(--gr n)', cursor: 'pointer', fontWeight: 700 }}>� �</button>
                          <button  onClick={() => setShowGratEdit(false)} style= {{ fontSize: 9, padding: '1px 5px', borderRad ius: 5, border: '1px solid var(--bdr)', backg round: 'transparent', color: 'var(--txt3)', c ursor: 'pointer' }}>✕</button>
                         </div>
                      )}
                     </div>
                     <span style={{ fontWeight: 700, color: gratu ityPct>0?'var(--txt2)':'var(--txt3)', fontFam ily: 'var(--mono)', fontSize: 12 }}>{gratuity Pct>0?fmt(calc.gratuity,sym):'—'}</span>
                   </div>
                )}

                 {/* TOTAL */}
                < div style={{ display: 'flex', justifyContent:  'space-between', alignItems: 'center', margi nTop: 6, paddingTop: 8, borderTop: '2px solid  var(--bdr)' }}>
                  <span styl e={{ fontSize: 14, fontWeight: 900, color: 'v ar(--txt)', letterSpacing: '-.3px' }}>TOTAL</ span>
                  <span style={{ fontSi ze: 18, fontWeight: 900, fontFamily: 'var(--m ono)', color: cart.length > 0 ? 'var(--blue)'  : 'var(--txt3)', letterSpacing: '-.5px' }}>{ fmt(calc.total, sym)}</span>
                 </div>
              </div>

              {/ * Action buttons */}
              <div style ={{ padding: '4px 12px 12px', display: 'flex' , flexDirection: 'column', gap: 6 }}>

                 {/* Send Order + Add to Order */}
                 <div style={{ display: 'grid',  gridTemplateColumns: openOrders.length > 0 ?  '1fr 1fr' : '1fr', gap: 6 }}>
                   <button onClick={sendOrder} disabled={act iveCart.length === 0} style={{ minHeight: 32,  borderRadius: 'var(--r)', fontSize: 11, font Weight: 900, border: 'none', cursor: activeCa rt.length > 0 ? 'pointer' : 'not-allowed', co lor: activeCart.length > 0 ? '#fff' : 'var(-- txt3)', background: activeCart.length > 0 ? ' var(--grn)' : 'var(--surf3)', letterSpacing:  '.2px', transition: 'all .15s' }}>
                     Send Order
                  </butt on>
                  {openOrders.length > 0  && (
                    <button onClick={()  => { setAddToOrderMode(true); setShowOpen(tru e) }} disabled={activeCart.length === 0} styl e={{ minHeight: 32, borderRadius: 'var(--r)',  fontSize: 11, fontWeight: 800, color: active Cart.length > 0 ? 'var(--grn)' : 'var(--txt3) ', background: activeCart.length > 0 ? '#1453 2d22' : 'var(--surf3)', border: `1.5px solid  ${activeCart.length > 0 ? 'var(--grn)' : 'var (--bdr)'}`, cursor: activeCart.length > 0 ? ' pointer' : 'not-allowed', transition: 'all .1 5s' }}>
                      Add to Order
                     </button>
                   )}
                </div>

                { /* Pay */}
                <button onClick={( ) => { if (cart.length===0){toast('Add items  first','warn');return}; setShowDetails(true);  setShowPayment(true) }} disabled={cart.lengt h === 0} style={{ width: '100%', minHeight: 3 6, borderRadius: 'var(--r)', fontSize: 12, fo ntWeight: 900, border: 'none', cursor: cart.l ength > 0 ? 'pointer' : 'not-allowed', color:  cart.length > 0 ? '#fff' : 'var(--txt3)', ba ckground: cart.length > 0 ? 'var(--blue)' : ' var(--surf3)', letterSpacing: '.3px', transit ion: 'all .15s', display: 'flex', alignItems:  'center', justifyContent: 'center', gap: 8 } }>
                  ✓ Pay {cart.length > 0  ? fmt(calc.total, sym) : '—'}
                 </button>

                {/* Split / Ho ld / Clear */}
                <div style={{  display: 'grid', gridTemplateColumns: '1fr 1f r 1fr', gap: 6 }}>
                  <button  onClick={() => { if (cart.length===0){toast(' Add items first','warn');return}; setShowSpli tBill(true) }}
                    style={{ m inHeight: 44, borderRadius: 'var(--r2)', font Size: 12, fontWeight: 700, background: 'trans parent', color: 'var(--txt3)', border: '1.5px  solid var(--bdr)', cursor: 'pointer' }}>Spli t</button>
                  <button onClick= {holdOrder}
                    style={{ minH eight: 44, borderRadius: 'var(--r2)', fontSiz e: 12, fontWeight: 700, background: 'transpar ent', color: 'var(--txt3)', border: '1.5px so lid var(--bdr)', cursor: 'pointer' }}>Hold</b utton>
                  <button onClick={()  => {
                      if (cart.length == = 0) return
                      if (!confir mClear) { setConfirmClear(true); return }
                       setConfirmClear(false)
                       dispatch({ type: 'CLEAR_CA RT' })
                    }}
                     style={{ minHeight: 44, borderRadius: 'v ar(--r2)', fontSize: 12, fontWeight: 700, bac kground: confirmClear ? '#7f1d1d22' : 'transp arent', color: confirmClear ? '#ef4444' : 'va r(--txt3)', border: `1.5px solid ${confirmCle ar ? '#ef4444' : 'var(--bdr)'}`, cursor: cart .length > 0 ? 'pointer' : 'not-allowed' }}>
                     {confirmClear ? 'Confirm?'  : 'Clear'}
                  </button>
                 </div>

                {/* Reprin t */}
                {lastTx && lastTicket & & (
                  <button onClick={() =>  setShowTicket(true)} style={{ width: '100%',  padding: '8px 0', borderRadius: 'var(--r2)',  fontSize: 11, fontWeight: 700, background: 't ransparent', color: 'var(--txt3)', border: '1 .5px dashed var(--bdr)', cursor: 'pointer' }} >
                    Reprint Last Receipt
                   </button>
                )}
               </div>
            </div>
           </div>

        </div>
      )}

      { /* ── Held Orders Panel ── */}
       {showHeld && (
        <div onClick={() => se tShowHeld(false)} style={{ position: 'fixed',  inset: 0, background: 'rgba(0,0,0,.6)', zInd ex: 600, display: 'flex', alignItems: 'center ', justifyContent: 'center', padding: 20 }}>
           <div onClick={e => e.stopPropagatio n()} style={{ background: 'var(--bg2)', borde r: '1px solid var(--bdr)', borderRadius: 'var (--r4)', width: '100%', maxWidth: 400, maxHei ght: '80vh', display: 'flex', flexDirection:  'column', overflow: 'hidden' }}>
             <div style={{ padding: '14px 18px', borderBot tom: '1px solid var(--bdr)', display: 'flex',  alignItems: 'center', gap: 10 }}>
               <span style={{ fontSize: 15, fontWeight:  800, color: 'var(--txt)', flex: 1 }}>Held Ord ers</span>
              <button onClick={()  => setShowHeld(false)} style={{ background: ' none', border: 'none', color: 'var(--txt3)',  cursor: 'pointer', fontSize: 22 }}>×</button >
            </div>
            <div style={ { flex: 1, overflowY: 'auto', padding: 12 }}> 
              {state.heldOrders.length === 0  ? (
                <div style={{ textAlign:  'center', padding: 32, color: 'var(--txt3)',  fontSize: 13 }}>No held orders.</div>
               ) : state.heldOrders.map(h => (
                 <div key={h.id} style={{ backgroun d: 'var(--surf)', border: '1px solid var(--bd r)', borderRadius: 'var(--r3)', padding: '12p x 14px', marginBottom: 8 }}>
                   <div style={{ display: 'flex', alignItems:  'flex-start', gap: 10, marginBottom: 8 }}>
                     <div style={{ flex: 1 }}>
                       <div style={{ fontSize:  13, fontWeight: 800, color: 'var(--txt)' }}>{ h.label}</div>
                      <div sty le={{ fontSize: 11, color: 'var(--txt3)', mar ginTop: 2 }}>
                        {h.cart .length} items · Saved {h.savedAt} by {h.sav edBy}
                        {h.openedAt &&  (() => { const t = elapsedTime(h.openedAt!);  return t ? <span style={{ color: elapsedColor (h.openedAt!), fontWeight: 700, marginLeft: 4  }}>· {t}</span> : null })()}
                       </div>
                    </div>
                     <div style={{ fontFamily: 'v ar(--mono)', fontSize: 13, fontWeight: 700, c olor: 'var(--blue)' }}>
                       {fmt(calcCart(h.cart, { orderType: h.orderTy pe, gratuityPct: h.gratuityPct }).total, sym) }
                    </div>
                   </div>
                  <div style={{ disp lay: 'flex', gap: 8 }}>
                    < button onClick={() => resumeOrder(h)} style={ { flex: 2, padding: '9px 0', borderRadius: 'v ar(--r)', background: 'var(--blue)', color: ' #fff', border: 'none', fontWeight: 700, fontS ize: 13, cursor: 'pointer' }}>
                       Resume
                    </button>
                     <button onClick={() => {
                         if (confirmDeleteHeld  !== h.id) { setConfirmDeleteHeld(h.id); retu rn }
                        setConfirmDelete Held(null)
                        dispatch({  type: 'REMOVE_HELD_ORDER', id: h.id })
                       }}
                      sty le={{ flex: 1, padding: '9px 0', borderRadius : 'var(--r)', background: 'transparent', colo r: confirmDeleteHeld === h.id ? '#fbbf24' : ' #ef4444', border: `1px solid ${confirmDeleteH eld === h.id ? '#fbbf24' : '#ef444444'}`, fon tWeight: 700, fontSize: 13, cursor: 'pointer'  }}>
                      {confirmDeleteHeld  === h.id ? 'Sure?' : 'Delete'}
                     </button>
                  </div>
                 </div>
              ))}
             </div>
          </div>
        </div>
       )}

      {/* ── Open Orders Panel � ��─ */}
      {showOpen && (
        <div o nClick={() => { setShowOpen(false); setAddToO rderMode(false); setTransferTarget(null) }} s tyle={{ position: 'fixed', inset: 0, backgrou nd: 'rgba(0,0,0,.6)', zIndex: 600, display: ' flex', alignItems: 'center', justifyContent:  'center', padding: 20 }}>
          <div onCl ick={e => e.stopPropagation()} style={{ backg round: 'var(--bg2)', border: '1px solid var(- -bdr)', borderRadius: 'var(--r4)', width: '10 0%', maxWidth: 460, maxHeight: '85vh', displa y: 'flex', flexDirection: 'column', overflow:  'hidden' }}>
            <div style={{ paddi ng: '14px 18px', borderBottom: '1px solid var (--bdr)', display: 'flex', alignItems: 'cente r', gap: 10 }}>
              <span style={{  fontSize: 15, fontWeight: 800, color: addToOr derMode ? 'var(--grn)' : 'var(--txt)', flex:  1 }}>
                {addToOrderMode ? `Add  ${activeCart.length} item(s) to Order` : 'Ope n Orders'}
              </span>
               {addToOrderMode && <button onClick={() => s etAddToOrderMode(false)} style={{ fontSize: 1 1, fontWeight: 700, color: 'var(--txt3)', bac kground: 'var(--surf2)', border: '1px solid v ar(--bdr)', borderRadius: 8, padding: '4px 10 px', cursor: 'pointer' }}>Cancel</button>}
               <button onClick={() => { setShowO pen(false); setAddToOrderMode(false); setTran sferTarget(null) }} style={{ background: 'non e', border: 'none', color: 'var(--txt3)', cur sor: 'pointer', fontSize: 22 }}>×</button>
             </div>
            <div style={{ f lex: 1, overflowY: 'auto', padding: 12 }}>
               {openOrders.length === 0 ? (
                 <div style={{ textAlign: 'center' , padding: 32, color: 'var(--txt3)', fontSize : 13 }}>No open orders.</div>
              )  : openOrders.map(t => {
                cons t activeItems = t.items.filter(ci => !ci.void ed)
                const tCalc = calcCart(ac tiveItems, { orderType: t.orderType as OrderT ype, manualDiscPct: t.discPct, manualDiscFlat : t.discFlat, gratuityPct: t.gratuityPct ?? 0  })
                const statusColors: Recor d<string, string> = { sent: 'var(--blue)', pr eparing: 'var(--ora)', ready: 'var(--grn)', s erved: 'var(--txt2)' }
                const  statusColor = statusColors[t.status ?? 'sent' ] ?? 'var(--txt3)'
                const isTr ansferring = transferTarget === t.id
                 const allTables = [
                   ...(customTables?.restaurant ?? MODULE_DATA. restaurant.tables ?? []),
                  . ..(customTables?.bar        ?? MODULE_DATA.ba r.tables        ?? []),
                ].fil ter(tbl => tbl !== t.table && !tableOrderMap[ tbl])
                return (
                   <div key={t.id} style={{ background: 'var (--surf)', border: '1px solid var(--bdr)', bo rderRadius: 'var(--r3)', padding: '12px 14px' , marginBottom: 8 }}>
                    {/*  Header */}
                    <div style={{  display: 'flex', alignItems: 'flex-start', g ap: 10, marginBottom: 6 }}>
                       <div style={{ flex: 1 }}>
                         <div style={{ display: 'flex', alig nItems: 'center', gap: 6, flexWrap: 'wrap' }} >
                          <span style={{ fo ntSize: 13, fontWeight: 800, color: 'var(--tx t)' }}>#{t.orderNum}</span>
                           {t.table && <span style={{ fontSize:  11, color: 'var(--txt3)' }}>Table {t.table}< /span>}
                          <span style ={{ fontSize: 10, fontWeight: 700, color: sta tusColor, background: statusColor + '22', bor derRadius: 8, padding: '1px 7px', textTransfo rm: 'uppercase' }}>{t.status ?? 'sent'}</span >
                          {/* Transfer tabl e button */}
                          {canVo idSentItem && allTables.length > 0 && !isTran sferring && (
                            <bu tton onClick={() => setTransferTarget(t.id)}
                               style={{ fontSi ze: 9, fontWeight: 800, padding: '2px 7px', b orderRadius: 6, background: 'var(--surf3)', b order: '1px solid var(--bdr)', color: 'var(-- txt3)', cursor: 'pointer' }}>
                               Transfer
                             </button>
                          )} 
                        </div>
                         {/* Transfer table selector */}
                         {isTransferring && (
                           <div style={{ marginT op: 6, display: 'flex', gap: 6, alignItems: ' center' }}>
                            <sele ct onChange={e => { if (e.target.value) trans ferTable(t.id, e.target.value) }} defaultValu e=""
                              style={{ f lex: 1, padding: '5px 8px', borderRadius: 6,  border: '1px solid var(--grn)', background: ' var(--surf2)', color: 'var(--txt)', fontSize:  12 }}>
                              <option  value="">— Move to table —</option>
                               {allTables.map(tbl  => <option key={tbl} value={tbl}>{tbl}</optio n>)}
                            </select>
                             <button onClick={()  => setTransferTarget(null)} style={{ fontSiz e: 11, color: 'var(--txt3)', background: 'non e', border: 'none', cursor: 'pointer' }}>✕< /button>
                          </div>
                         )}
                         <div style={{ fontSize: 11, color: 'var(-- txt3)', marginTop: 3 }}>
                           {activeItems.length} items · {t.server }{t.customerName ? ` · ${t.customerName}` :  ''}
                        </div>
                       </div>
                      <div  style={{ fontFamily: 'var(--mono)', fontSize : 14, fontWeight: 700, color: 'var(--grn)' }} >
                        {fmt(tCalc.total, s ym)}
                      </div>
                     </div>
                    {/* Items  */}
                    <div style={{ margin Bottom: 8, maxHeight: 110, overflowY: 'auto'  }}>
                      {t.items.map((ci, i ) => (
                        <div key={i} s tyle={{ fontSize: 11, color: ci.voided ? '#ef 444488' : 'var(--txt2)', display: 'flex', jus tifyContent: 'space-between', alignItems: 'ce nter', padding: '2px 0', gap: 6, textDecorati on: ci.voided ? 'line-through' : 'none' }}>
                           <span style={{ flex:  1 }}>{ci.qty}× {ci.name}{ci.voided ? ' [VOI D]' : ''}</span>
                          <s pan style={{ fontFamily: 'var(--mono)', flexS hrink: 0 }}>{fmt(ci.price * ci.qty, sym)}</sp an>
                          {!ci.voided &&  canVoidSentItem && (
                             <button onClick={() => setVoidTarget({ it em: ci, ticketId: t.id })}
                               style={{ flexShrink: 0, padding:  '2px 7px', borderRadius: 5, background: '#7f1 d1d22', border: '1px solid #ef444433', color:  '#ef4444', cursor: 'pointer', fontSize: 9, f ontWeight: 800 }}>
                               VOID
                            </button >
                          )}
                         </div>
                      ))}
                     </div>
                     {/* Actions */}
                    {addToOrd erMode ? (
                      <button onCl ick={() => addToExistingOrder(t)}
                         style={{ width: '100%', padding:  '9px 0', borderRadius: 'var(--r)', backgroun d: 'var(--grn)', color: '#fff', border: 'none ', fontWeight: 700, fontSize: 13, cursor: 'po inter' }}>
                        Add {activ eCart.length} Item(s) to #{t.orderNum}
                       </button>
                     ) : (
                      <div style={{ di splay: 'grid', gridTemplateColumns: isManager  ? '1fr auto' : '1fr', gap: 6 }}>
                         <button onClick={() => { setPayi ngTicket(t); setGratuityPct(t.gratuityPct ??  15); setGratuityOverride(true); setShowOpen(f alse); setShowPayment(true) }}
                           style={{ padding: '9px 0', border Radius: 'var(--r)', background: 'var(--blue)' , color: '#fff', border: 'none', fontWeight:  700, fontSize: 13, cursor: 'pointer' }}>
                           Pay {fmt(tCalc.total, s ym)}
                        </button>
                         {isManager && (
                           <button onClick={() => setVoid OrderTarget(t)}
                            s tyle={{ padding: '9px 12px', borderRadius: 'v ar(--r)', background: '#7f1d1d22', color: '#e f4444', border: '1px solid #ef444433', fontWe ight: 700, fontSize: 12, cursor: 'pointer' }} >
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

      {/* ── Payment Modal ──  */}
      <PaymentModal
        isOpen={show Payment}
        onClose={() => { setShowPaym ent(false); setPayingTicket(null); setShowDet ails(false); setGratuityOverride(false); setS urcharges([]) }}
        calc={splitTarget ?  splitTarget.calc : payCalc}
        gratuityP ct={gratuityPct}
        onGratuityChange={pc t => { setGratuityPct(pct); setGratuityOverri de(true) }}
        isManager={isManager}
         sym={sym}
        selTable={payingTicket ?.table ?? posState['restaurant'].selTable ??  posState['bar'].selTable}
        guestCount ={payingTicket?.guestCount ?? guestCount}
         customerName={payingTicket?.customerName  ?? customerName}
        surcharges={surchar ges}
        onSurchargesChange={setSurcharge s}
        onComplete={payData => completeChe ckout(payData, splitTarget?.calc)}
      />

       {/* ── Ticket Modal ── */}
       {lastTx && lastTicket && (
        <TicketM odal
          isOpen={showTicket}
           onClose={() => { setShowTicket(false); onPaym entComplete?.() }}
          ticket={lastTick et}
          tx={lastTx}
          biz={biz} 
        />
      )}

      {/* ── Split  Bill Modal ── */}
      <SplitBillModal
         isOpen={showSplitBill}
        onClose ={() => setShowSplitBill(false)}
        cart ={payingTicket ? payingTicket.items : cart}
         orderType={(payingTicket?.orderType ??  cartOrderType) as OrderType}
        gratuit yPct={payingTicket?.gratuityPct ?? gratuityPc t}
        sym={sym}
        onPaySplit={spli t => {
          setShowSplitBill(false)
           setSplitTarget({ calc: split.calc, labe l: split.label })
          setShowPayment(tr ue)
        }}
        onPayAll={() => { setS howSplitBill(false); setShowPayment(true) }}
         onAllPaid={() => {
          if (payi ngTicket) {
            dispatch({ type: 'UPD ATE_ORDER_TICKET', id: payingTicket.id, patch : { status: 'paid' } })
            setPaying Ticket(null)
          }
          setShowSpl itBill(false)
          setSplitTarget(null)
           dispatch({ type: 'CLEAR_CART' })
         }}
      />

      {/* ── Void Item  Modal ── */}
      <VoidReasonModal
         isOpen={!!voidTarget}
        itemName={v oidTarget?.item.name ?? ''}
        itemQty={ voidTarget?.item.qty}
        onClose={() =>  setVoidTarget(null)}
        onConfirm={(reas on, reasonText) => {
          if (!voidTarge t) return
          if (voidTarget.ticketId)  {
            const ticket = state.orderTicke ts.find(t => t.id === voidTarget.ticketId)
             if (ticket) handleVoidTicketItem(ti cket, voidTarget.item, reason, reasonText)
           } else {
            handleVoidCartIt em(voidTarget.item, reason, reasonText)
           }
        }}
      />

      {/* ──  Void Entire Order Modal ── */}
      <Voi dReasonModal
        isOpen={!!voidOrderTarge t}
        itemName={voidOrderTarget ? `Order  #${voidOrderTarget.orderNum} (${voidOrderTar get.items.filter(ci => !ci.voided).length} it ems)` : ''}
        onClose={() => setVoidOrd erTarget(null)}
        onConfirm={(reason, r easonText) => {
          if (voidOrderTarget ) handleVoidEntireOrder(voidOrderTarget, reas on, reasonText)
        }}
      />

      {/ * ── Add-ons Modal ── */}
      {moda lItem && (
        <div
          onClick={cl oseModal}
          style={{
            posi tion: 'fixed', inset: 0, background: 'rgba(0, 0,0,.6)', zIndex: 500,
            display: ' flex', alignItems: 'center', justifyContent:  'center', padding: 20,
          }}
        > 
          <div
            ref={modalRef}
             tabIndex={-1}
            onClick={ e => e.stopPropagation()}
            onKeyDo wn={e => { if (e.key === 'Escape') closeModal () }}
            style={{
              back ground: 'var(--bg2)', border: '1px solid var( --bdr)', borderRadius: 'var(--r4)',
               width: '100%', maxWidth: 420, boxShadow:  '0 24px 60px rgba(0,0,0,.5)',
               display: 'flex', flexDirection: 'column', ove rflow: 'hidden',
              outline: 'none ',
            }}
          >
            {/*  Modal header — item name + price */}
             <div style={{ padding: '16px 18px', bo rderBottom: '1px solid var(--bdr)', display:  'flex', alignItems: 'center', gap: 10 }}>
               <div style={{ flex: 1 }}>
                 <div style={{ fontSize: 15, fontWeigh t: 800, color: 'var(--txt)' }}>{modalItem.nam e}</div>
              </div>
              < div style={{ fontSize: 17, fontWeight: 800, f ontFamily: 'var(--mono)', color: mod.color }} >
                {fmt(modalSizeId ? modalSiz ePrice : modalItem.price, sym)}
               </div>
            </div>

            {/* S crollable modal body */}
            <div sty le={{ flex: 1, overflowY: 'auto', maxHeight:  '60vh' }}>

              {/* ─── Size  picker ─── */}
              {(() => {
                 const assignment = liveAssign ments[modalItem!.id]
                const it emSizes = (assignment?.sizes ?? []).map(s =>  ({ ...liveSizesDefs.find(sz => sz.id === s.si ze_id), price: s.price })).filter(s => s.id)
                 if (itemSizes.length === 0) r eturn null
                return (
                   <div style={{ padding: '12px 18px',  borderBottom: '1px solid var(--bdr)' }}>
                     <div style={{ fontSize: 11, f ontWeight: 700, color: 'var(--txt3)', textTra nsform: 'uppercase', letterSpacing: '.5px', m arginBottom: 8 }}>Size <span style={{ color:  'var(--red)', fontSize: 10 }}>*required</span ></div>
                    <div style={{ dis play: 'flex', flexWrap: 'wrap', gap: 8 }}>
                       {itemSizes.map(sz => {
                         const selected = modalS izeId === sz.id
                        retur n (
                          <button key={sz .id} onClick={() => { setModalSizeId(sz.id!);  setModalSizePrice(sz.price) }}
                             style={{ padding: '8px 16px',  borderRadius: 'var(--r)', border: `2px solid  ${selected ? mod.color : 'var(--bdr)'}`, back ground: selected ? 'var(--surf2)' : 'transpar ent', color: selected ? 'var(--txt)' : 'var(- -txt2)', fontWeight: 700, fontSize: 13, curso r: 'pointer' }}>
                             {sz.name} — {sym}{sz.price.toLocaleString() }
                          </button>
                         )
                      })}
                     </div>
                   </div>
                )
              })()}
 
              {/* ─── Flavour picker � ��── */}
              {(() => {
                 const assignment = liveAssignments[mo dalItem!.id]
                const itemFlavou rs = (assignment?.flavour_ids ?? []).map(id = > liveFlavours.find(f => f.id === id)).filter (Boolean)
                if (itemFlavours.le ngth === 0) return null
                retur n (
                  <div style={{ padding:  '12px 18px', borderBottom: '1px solid var(--b dr)' }}>
                    <div style={{ fo ntSize: 11, fontWeight: 700, color: 'var(--tx t3)', textTransform: 'uppercase', letterSpaci ng: '.5px', marginBottom: 8 }}>Flavour <span  style={{ color: 'var(--red)', fontSize: 10 }} >*required</span></div>
                    < div style={{ display: 'flex', flexWrap: 'wrap ', gap: 8 }}>
                      {itemFlav ours.map(f => {
                        const  selected = modalFlavourId === f!.id
                         return (
                           <button key={f!.id} onClick={() => setM odalFlavourId(selected ? null : f!.id)}
                             style={{ padding: '8px  16px', borderRadius: 'var(--r)', border: `2p x solid ${selected ? mod.color : 'var(--bdr)' }`, background: selected ? 'var(--surf2)' : ' transparent', color: selected ? 'var(--txt)'  : 'var(--txt2)', fontWeight: 700, fontSize: 1 3, cursor: 'pointer' }}>
                             {f!.name}
                          < /button>
                        )
                       })}
                    </div>
                   </div>
                )
               })()}

              {/* ───  Sides picker ─── */}
              {(()  => {
                const assignment = live Assignments[modalItem!.id]
                co nst itemSides = (assignment?.side_ids ?? []). map(id => liveSides.find(s => s.id === id)).f ilter(Boolean)
                if (itemSides. length === 0) return null
                ret urn (
                  <div style={{ padding : '12px 18px', borderBottom: '1px solid var(- -bdr)' }}>
                    <div style={{  fontSize: 11, fontWeight: 700, color: 'var(-- txt3)', textTransform: 'uppercase', letterSpa cing: '.5px', marginBottom: 8 }}>Sides (optio nal)</div>
                    <div style={{  display: 'flex', flexWrap: 'wrap', gap: 8 }}> 
                      {itemSides.map(s => {
                         const selected = moda lSideIds.includes(s!.id)
                         return (
                          <butto n key={s!.id} onClick={() => setModalSideIds( prev => selected ? prev.filter(id => id !== s !.id) : [...prev, s!.id])}
                             style={{ padding: '8px 16px', borde rRadius: 'var(--r)', border: `2px solid ${sel ected ? mod.color : 'var(--bdr)'}`, backgroun d: selected ? 'var(--surf2)' : 'transparent',  color: selected ? 'var(--txt)' : 'var(--txt2 )', fontWeight: 700, fontSize: 13, cursor: 'p ointer' }}>
                            {s!.n ame}{s!.price > 0 ? ` +${sym}${s!.price}` : ' '}
                          </button>
                         )
                      })} 
                    </div>
                   </div>
                )
              })()} 

              {/* ─── Add-ons ──� �� */}
              {(() => {
                 let displayAddons: Addon[]
                 if (activeModule === 'carwash') {
                   displayAddons = activeAddons
                 } else {
                  const assig nment = liveAssignments[modalItem!.id]
                   if (assignment?.addon_ids?.length  > 0) {
                    displayAddons = a ssignment.addon_ids.map(id => {
                       const a = livePosAddons.find(x => x. id === id)
                      if (!a) retu rn null
                      return { id: a. id, name: a.name, desc: a.description, price:  a.price, icon: a.icon ?? '', active: a.activ e } as Addon
                    }).filter(Bo olean) as Addon[]
                  } else {
                     displayAddons = []
                   }
                }
                 if (displayAddons.length === 0) return nul l
                return (
                   <div style={{ padding: '14px 18px', borderBot tom: '1px solid var(--bdr)', maxHeight: 200,  overflowY: 'auto' }}>
                    <di v style={{ fontSize: 11, fontWeight: 700, col or: 'var(--txt3)', textTransform: 'uppercase' , letterSpacing: '.5px', marginBottom: 10 }}> Add-ons (optional)</div>
                     {displayAddons.map((addon: Addon) => {
                       const checked = modalAddons.s ome(a => a.id === addon.id)
                       return (
                        <div ke y={addon.id} onClick={() => toggleModalAddon( addon)}
                          style={{ di splay: 'flex', alignItems: 'center', gap: 10,  padding: '10px 12px', borderRadius: 'var(--r )', marginBottom: 6, cursor: 'pointer', backg round: checked ? 'var(--surf2)' : 'var(--surf )', border: `2px solid ${checked ? mod.color  : 'var(--bdr)'}`, transition: 'all .14s' }}>
                           <div style={{ width : 20, height: 20, borderRadius: 5, border: `2 px solid ${checked ? mod.color : 'var(--bdr2) '}`, background: checked ? mod.color : 'trans parent', flexShrink: 0, display: 'flex', alig nItems: 'center', justifyContent: 'center', f ontSize: 11, fontWeight: 800, color: '#fff' } }>{checked ? '✓' : ''}</div>
                           <div style={{ flex: 1 }}>
                             <div style={{ fontSize:  13, fontWeight: 700, color: 'var(--txt)' }}>{ addon.name}</div>
                             {addon.desc && <div style={{ fontSize: 11, c olor: 'var(--txt3)' }}>{addon.desc}</div>}
                           </div>
                           <div style={{ fontSize: 13, fontW eight: 800, fontFamily: 'var(--mono)', color:  addon.price === 0 ? 'var(--grn)' : 'var(--tx t)', flexShrink: 0 }}>{addon.price === 0 ? 'F ree' : `+${fmt(addon.price, sym)}`}</div>
                         </div>
                       )
                    })}
                   </div>
                )
              }) ()}

              {/* Qty + Note */}
               <div style={{ padding: '14px 18px', bo rderBottom: '1px solid var(--bdr)' }}>
                 {/* Qty row */}
                <di v style={{ display: 'flex', alignItems: 'cent er', gap: 10, marginBottom: 12 }}>
                   <span style={{ fontSize: 13, fontWeig ht: 700, color: 'var(--txt)', flex: 1 }}>Qty< /span>
                  <button onClick={()  => setModalQty(q => Math.max(1, q - 1))} styl e={{
                    width: 32, height: 3 2, borderRadius: 8, background: 'var(--surf2) ', border: '1px solid var(--bdr)',
                     color: 'var(--txt)', cursor: 'point er', display: 'flex', alignItems: 'center', j ustifyContent: 'center',
                     fontSize: 16, fontWeight: 800,
                   }}>−</button>
                  <span s tyle={{ fontFamily: 'var(--mono)', fontSize:  16, fontWeight: 800, minWidth: 28, textAlign:  'center' }}>{modalQty}</span>
                   <button onClick={() => setModalQty(q => q  + 1)} style={{
                    width: 32 , height: 32, borderRadius: 8, background: 'v ar(--surf2)', border: '1px solid var(--bdr)', 
                    color: 'var(--txt)', cur sor: 'pointer', display: 'flex', alignItems:  'center', justifyContent: 'center',
                     fontSize: 16, fontWeight: 800,
                   }}>+</button>
                 </div>
                {/* Note */}
                 <div style={{ fontSize: 11, fontWeight : 700, color: 'var(--txt3)', marginBottom: 5  }}>Note</div>
                <textarea
                   value={modalNote}
                   onChange={e => setModalNote(e.target.valu e)}
                  placeholder="Special in structions..."
                  rows={2}
                   style={{
                    w idth: '100%', background: 'var(--surf)', bord er: '1px solid var(--bdr)', borderRadius: 'va r(--r2)',
                    padding: '8px 1 0px', fontSize: 12, color: 'var(--txt)', resi ze: 'none', boxSizing: 'border-box',
                   }}
                />
               </div>

            </div>{/* end scrollable  body */}

            {/* Footer — Cancel  + Add to Cart */}
            {(() => {
               const assignment = modalItem ? liveA ssignments[modalItem.id] : null
               const needsSize    = (assignment?.sizes?.len gth ?? 0) > 0 && !modalSizeId
              c onst needsFlavour = (assignment?.flavour_ids? .length ?? 0) > 0 && !modalFlavourId
               const canAddToCart = !needsSize && !nee dsFlavour
              return (
                 <div style={{ padding: '14px 18px', displ ay: 'flex', gap: 10 }}>
                  <bu tton onClick={closeModal} style={{
                     flex: 1, padding: '12px 8px', borde rRadius: 'var(--r)', fontSize: 13, fontWeight : 700,
                    background: 'trans parent', color: 'var(--txt3)', border: '1.5px  solid var(--bdr)',
                    curso r: 'pointer', transition: 'all .12s',
                   }}>Cancel</button>
                   <button onClick={addToCart} disabled={!can AddToCart} style={{
                    flex:  2, padding: '12px 8px', borderRadius: 'var(- -r)', fontSize: 14, fontWeight: 800,
                     background: canAddToCart ? mod.co lor : 'var(--surf3)', color: canAddToCart ? m od.cobText : 'var(--txt3)', border: 'none',
                     cursor: canAddToCart ? 'po inter' : 'not-allowed', transition: 'all .15s ',
                  }}>
                     {needsSize ? 'Select a size' : needsFlavour ?  'Select a flavour' : `Add to Cart ×${modalQ ty}`}
                  </button>
                 </div>
              )
            })()} 
          </div>
        </div>
      )}

       {/* Age Verification overlay */}
      {p endingBarAdd && (
        <div style={{ posit ion: 'fixed', inset: 0, background: 'rgba(0,0 ,0,.75)', zIndex: 900, display: 'flex', align Items: 'center', justifyContent: 'center', pa dding: 20 }}>
          <div style={{ backgro und: 'var(--bg2)', border: '1px solid var(--b dr)', borderRadius: 'var(--r4)', width: '100% ', maxWidth: 420, padding: 28, textAlign: 'ce nter' }}>
            <div style={{ fontSize:  44, marginBottom: 12 }}>🍺</div>
             <div style={{ fontSize: 16, fontWeight: 80 0, color: 'var(--txt)', marginBottom: 10 }}>A ge Verification Required</div>
            <d iv style={{ fontSize: 13, color: 'var(--txt2) ', lineHeight: 1.7, marginBottom: 28 }}>
               Confirm that the customer has prese nted valid ID and is <strong>18 years of age  or older</strong>.<br />
              Servin g alcohol to a minor is a criminal offence un der the Jamaica Licences Act.
            </d iv>
            <div style={{ display: 'flex' , gap: 12 }}>
              <button onClick={ cancelAge} style={{ flex: 1, padding: 14, bor derRadius: 'var(--r)', background: 'transpare nt', border: '1.5px solid var(--bdr)', color:  'var(--txt3)', fontWeight: 700, fontSize: 13 , cursor: 'pointer' }}>
                ✕ U nder 18 — Decline
              </button>
               <button onClick={confirmAge} sty le={{ flex: 1, padding: 14, borderRadius: 'va r(--r)', background: 'var(--grn)', border: 'n one', color: '#fff', fontWeight: 800, fontSiz e: 13, cursor: 'pointer' }}>
                 ✓ Confirmed 18+
              </button>
             </div>
          </div>
        </di v>
      )}
    </div>
  )
}
 