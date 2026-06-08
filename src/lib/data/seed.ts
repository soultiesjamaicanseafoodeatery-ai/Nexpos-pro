import type { User, RoleConfig, ModuleData, BusinessConfig, Transaction, FleetAccount, PromoCode } from '@/types'

// ── Roles ────────────────────────────────────────────────────
export const ROLES: Record<string, RoleConfig> = {
  admin:      { label: 'Administrator', color: '#f56565', pages: ['pos','tables','transactions','admin','staff','settings','reports','audit','shifts','fleet','members'] },
  manager:    { label: 'Manager',       color: '#f5a623', pages: ['pos','tables','transactions','admin','staff','reports','shifts','fleet','members'] },
  supervisor: { label: 'Supervisor',    color: '#9b8afb', pages: ['pos','tables','transactions','reports','shifts'] },
  cashier:    { label: 'Cashier',       color: '#4f8ef7', pages: ['pos','tables','transactions'] },
  bartender:  { label: 'Bartender',     color: '#3ecf8e', pages: ['pos','transactions'] },
  attendant:  { label: 'Attendant',     color: '#38bdf8', pages: ['pos','transactions'] },
}

// ── Users ────────────────────────────────────────────────────
export const SEED_USERS: User[] = [
  { id:'U1', name:'Alex Rivera',   ini:'AR', pin:'1234', role:'admin',      color:'#f56565', allowedModules:['restaurant','bar','carwash'], active:true, staffId:'01' },
  { id:'U2', name:'Jordan Kim',    ini:'JK', pin:'2222', role:'cashier',    color:'#4f8ef7', allowedModules:['restaurant'],                active:true, staffId:'02' },
  { id:'U3', name:'Taylor Moss',   ini:'TM', pin:'3333', role:'bartender',  color:'#3ecf8e', allowedModules:['bar'],                       active:true, staffId:'03' },
  { id:'U4', name:'Casey Park',    ini:'CP', pin:'4444', role:'attendant',  color:'#38bdf8', allowedModules:['carwash'],                   active:true, staffId:'04' },
  { id:'U5', name:'Morgan Lee',    ini:'ML', pin:'5555', role:'manager',    color:'#f5a623', allowedModules:['restaurant','bar','carwash'], active:true, staffId:'05' },
  { id:'U6', name:'Sam Torres',    ini:'ST', pin:'6666', role:'supervisor', color:'#9b8afb', allowedModules:['restaurant','bar'],           active:true, staffId:'06' },
]

// ── Module Data ───────────────────────────────────────────────
export const MODULE_DATA: Record<string, ModuleData> = {
  restaurant: {
    label:'Restaurant', icon:'🍽️', color:'var(--ora)', cobText:'#1a0800', selCls:'s-o', aoCls:'o',
    taxConfig:{ name:'GCT', rate:0.15, enabled:true, taxableOrderTypes:['dine-in'], serviceChargeRate:0.10, serviceChargeEnabled:true },
    taxRate:0.15,
    categories:['All','Starters','Mains','Seafood','Sides','Desserts','Drinks'],
    tables:['T1','T2','T3','T4','T5','T6','T7','T8'],
    tableStatus:{ T1:'free', T2:'occupied', T3:'free', T4:'occupied', T5:'free', T6:'free', T7:'occupied', T8:'free' },
    tabs:[],
    items:[
      { id:'r1',  name:'Grilled Lobster',    desc:'Whole Caribbean lobster, garlic butter, lemon',   price:65,  cat:'Seafood', emoji:'🦞', active:true },
      { id:'r2',  name:'Jerk Chicken',       desc:'Authentic Jamaican jerk, festival dumplings',     price:28,  cat:'Mains',   emoji:'🍗', active:true },
      { id:'r3',  name:'Fish & Chips',       desc:'Beer-battered snapper, seasoned fries',           price:24,  cat:'Seafood', emoji:'🐟', active:true },
      { id:'r4',  name:'Ribeye Steak',       desc:'12oz grass-fed ribeye, herb butter',              price:52,  cat:'Mains',   emoji:'🥩', active:true },
      { id:'r5',  name:'Shrimp Platter',     desc:'Garlic shrimp, cocktail sauce, coleslaw',         price:38,  cat:'Seafood', emoji:'🍤', active:true },
      { id:'r6',  name:'Caesar Salad',       desc:'Romaine, parmesan, house dressing, croutons',     price:16,  cat:'Starters',emoji:'🥗', active:true },
      { id:'r7',  name:'Calamari',           desc:'Crispy rings, marinara dip',                      price:18,  cat:'Starters',emoji:'🦑', active:true },
      { id:'r8',  name:'Rice & Peas',        desc:'Jamaican coconut rice with kidney beans',         price:8,   cat:'Sides',   emoji:'🍚', active:true },
      { id:'r9',  name:'Plantain',           desc:'Sweet fried ripe plantain',                       price:6,   cat:'Sides',   emoji:'🍌', active:true },
      { id:'r10', name:'Cheesecake',         desc:'New York style, berry compote',                   price:12,  cat:'Desserts',emoji:'🍰', active:true },
      { id:'r11', name:'Rum Punch',          desc:'House blend, tropical fruits',                    price:9,   cat:'Drinks',  emoji:'🍹', active:true },
      { id:'r12', name:'Fresh Coconut Water',desc:'Straight from the shell',                         price:5,   cat:'Drinks',  emoji:'🥥', active:true },
    ],
    addons:[
      { id:'ra1', name:'Extra Sauce',  desc:'Choice of sauce', price:2,  icon:'🫙', active:true },
      { id:'ra2', name:'Side Salad',   desc:'Mixed greens',    price:5,  icon:'🥗', active:true },
      { id:'ra3', name:'Garlic Bread', desc:'4 slices',        price:4,  icon:'🍞', active:true },
      { id:'ra4', name:'Extra Protein',desc:'Add 4oz protein', price:12, icon:'🥩', active:true },
    ],
  },
  bar: {
    label:'Bar', icon:'🍺', color:'var(--pur)', cobText:'#0d0028', selCls:'s-p', aoCls:'p',
    taxRate:0.10,
    categories:['All','Cocktails','Beer','Wine','Spirits','Shots','Non-Alc'],
    tables:['B1','B2','B3','B4','B5'],
    tableStatus:{ B1:'free', B2:'occupied', B3:'free', B4:'free', B5:'occupied' },
    tabs:[],
    items:[
      { id:'b1',  name:'Old Fashioned',  desc:'Bourbon, bitters, sugar, orange',       price:14, cat:'Cocktails', emoji:'🥃', active:true },
      { id:'b2',  name:'Mojito',         desc:'Rum, mint, lime, soda',                 price:12, cat:'Cocktails', emoji:'🍹', active:true },
      { id:'b3',  name:'Margarita',      desc:'Tequila, triple sec, lime',             price:13, cat:'Cocktails', emoji:'🍋', active:true },
      { id:'b4',  name:'Negroni',        desc:'Gin, Campari, sweet vermouth',          price:14, cat:'Cocktails', emoji:'🍊', active:true },
      { id:'b5',  name:'Red Stripe',     desc:'Jamaican lager, 330ml',                 price:5,  cat:'Beer',      emoji:'🍺', active:true },
      { id:'b6',  name:'Heineken',       desc:'330ml bottle',                          price:5,  cat:'Beer',      emoji:'🍺', active:true },
      { id:'b7',  name:'House Red',      desc:'175ml glass',                           price:8,  cat:'Wine',      emoji:'🍷', active:true },
      { id:'b8',  name:'House White',    desc:'175ml glass',                           price:8,  cat:'Wine',      emoji:'🥂', active:true },
      { id:'b9',  name:'Rum & Coke',     desc:'Appleton rum, Coca-Cola',               price:10, cat:'Spirits',   emoji:'🥤', active:true },
      { id:'b10', name:'G&T',            desc:'Tanqueray gin, tonic, lime',            price:11, cat:'Spirits',   emoji:'🫧', active:true },
      { id:'b13', name:'Jäger Bomb',     desc:'Jägermeister + energy',                price:10, cat:'Shots',     emoji:'💣', active:true },
      { id:'b14', name:'Coke',           desc:'330ml can',                             price:3.5,cat:'Non-Alc',   emoji:'🥤', active:true },
    ],
    addons:[
      { id:'ba1', name:'Extra Ice',      desc:'More ice',            price:0,  icon:'🧊', active:true },
      { id:'ba2', name:'Double Up',      desc:'Double the spirit',   price:6,  icon:'✌️', active:true },
      { id:'ba3', name:'Bar Snack',      desc:'Nuts, olives, crisps',price:4,  icon:'🥜', active:true },
      { id:'ba4', name:'Premium Mixer',  desc:'Upgrade tonic/soda',  price:2,  icon:'🫧', active:true },
    ],
  },
  carwash: {
    label:'Car Wash', icon:'🚗', color:'var(--blue)', cobText:'#fff', selCls:'s-b', aoCls:'g',
    taxRate:0.08,
    categories:['All','Basic','Deluxe','Premium'],
    tables:[], tableStatus:{}, tabs:[],
    bays:['Bay 1','Bay 2','Bay 3'],
    bayStatus:{ 'Bay 1':'occupied', 'Bay 2':'free', 'Bay 3':'free' },
    plans:[
      { id:'plan-basic',    name:'Basic',    price:29.99, discount:5,  color:'#4f8ef7', freeAddons:[],                          unlimited:false, description:'5% off all washes' },
      { id:'plan-gold',     name:'Gold',     price:49.99, discount:15, color:'#f5a623', freeAddons:['Tire Shine'],              unlimited:false, description:'15% off + free Tire Shine' },
      { id:'plan-platinum', name:'Platinum', price:89.99, discount:20, color:'#38bdf8', freeAddons:['Tire Shine','Wax Protection'], unlimited:true, description:'20% off + unlimited washes + free add-ons' },
    ],
    members:[
      { id:'M1', name:'Marcus Johnson', email:'marcus@email.com', phone:'(305) 555-0101', planId:'plan-platinum', type:'Platinum', discount:20,
        vehicles:[{ plate:'ABC-1234', make:'Toyota', model:'Camry', year:2021, color:'Silver' }],
        washes:47, joined:'2024-01-15',
        billing:{ status:'active', autoRenew:true, monthlyFee:89.99, nextBillingDate:'2025-06-15', lastBillingDate:'2025-05-15', lastBillingStatus:'paid', failedAttempts:0, paymentMethod:'Visa ****4242', billingHistory:[{ date:'2025-05-15', amount:89.99, status:'paid' }] }
      },
      { id:'M2', name:'Sarah Chen', email:'sarah@email.com', phone:'(305) 555-0102', planId:'plan-gold', type:'Gold', discount:15,
        vehicles:[{ plate:'XYZ-9876', make:'Honda', model:'Civic', year:2020, color:'Blue' }],
        washes:23, joined:'2024-03-10',
        billing:{ status:'failed', autoRenew:true, monthlyFee:49.99, nextBillingDate:'2025-05-20', lastBillingDate:'2025-04-20', lastBillingStatus:'failed', failedAttempts:2, paymentMethod:'Mastercard ****8891', billingHistory:[{ date:'2025-05-20', amount:49.99, status:'failed' }] }
      },
    ],
    items:[
      { id:'w1', name:'Express Wash',   desc:'Quick rinse & air dry',        price:8,   cat:'Basic',   emoji:'💨', duration:'10 min', active:true, gradient:'linear-gradient(135deg,#1e3a5f,#2d6a9f)', accent:'#4f9fd4' },
      { id:'w2', name:'Basic Wash',     desc:'Foam wash, rinse & blow-dry',  price:12,  cat:'Basic',   emoji:'🫧', duration:'15 min', active:true, gradient:'linear-gradient(135deg,#1a3d2e,#2d7a52)', accent:'#3ecf8e' },
      { id:'w3', name:'Deluxe Wash',    desc:'Exterior + interior vacuum',   price:22,  cat:'Deluxe',  emoji:'✨', duration:'25 min', active:true, gradient:'linear-gradient(135deg,#3a2a6e,#6b4fad)', accent:'#9b8afb' },
      { id:'w4', name:'Full Detail',    desc:'Complete interior & exterior', price:65,  cat:'Deluxe',  emoji:'🔆', duration:'60 min', active:true, gradient:'linear-gradient(135deg,#2d2100,#7a5c00)', accent:'#f5a623' },
      { id:'w5', name:'Premium Detail', desc:'Detail + wax + tire dressing', price:85,  cat:'Premium', emoji:'⭐', duration:'90 min', active:true, gradient:'linear-gradient(135deg,#3d1a00,#a04400)', accent:'#ff7c4c' },
      { id:'w6', name:'Ceramic Coat',   desc:'Nano-ceramic protection',      price:149, cat:'Premium', emoji:'💎', duration:'120 min',active:true, gradient:'linear-gradient(135deg,#001a3d,#003d8f)', accent:'#38bdf8' },
    ],
    addons:[
      { id:'wa1', name:'Engine Wash',    desc:'Degreased engine bay',     price:25, icon:'⚙️', active:true },
      { id:'wa2', name:'Undercarriage',  desc:'High-pressure underbody',  price:15, icon:'🔩', active:true },
      { id:'wa3', name:'Steam Seats',    desc:'Deep steam sanitize',      price:30, icon:'💨', active:true },
      { id:'wa4', name:'Tire Shine',     desc:'Long-lasting protectant',  price:10, icon:'🔄', active:true },
      { id:'wa5', name:'Wax Protection', desc:'Carnauba hand wax',        price:18, icon:'✨', active:true },
      { id:'wa6', name:'Odor Removal',   desc:'Ozone treatment',          price:22, icon:'🌸', active:true },
      { id:'wa7', name:'Rain Repellent', desc:'Hydrophobic glass coat',   price:12, icon:'🌧️',active:true },
    ],
  },
}

// ── Business Config ───────────────────────────────────────────
export const DEFAULT_BIZ_CONFIG: BusinessConfig = {
  name:       'Soulties Seafood Eatery Bar & Car Wash',
  tagline:    'Fresh · Fun · Flavour',
  address:    '15 Milford Road, Ocho Rios, Jamaica',
  phone:      '876-389-5343',
  email:      'info@soulties.com',
  website:    'www.soulties.com',
  gctRegNo:   'GCT-123456789',
  trn:        '123-456-789',
  currency:   'JMD',
  currencySymbol: 'J$',
  logo:       '🦞',
  logoUrl:    '',
  primaryColor: '#1a5276',
  accentColor:  '#e67e22',
  receiptWidth: 320,
  footer: {
    message:      'Thank you for dining with us! We hope to see you again.',
    refundPolicy: 'All sales final. Issues? Call us within 24 hours.',
    social: { instagram: '@soulties_ocho_rios', facebook: 'Soulties Seafood Bar', whatsapp: '876-389-5343' },
    qrEnabled: true,
    qrText:    'Scan to rate your experience & earn loyalty points!',
    promoMsg:  '',
  },
  modules: {
    restaurant: { terminalName: 'Restaurant POS — Main Floor', dineInFooter: 'GCT Reg: GCT-123456789 · Jamaica Tax Authority', takeoutFooter: 'Order ready? Call 876-389-5343', deliveryFooter: 'Driver will contact you shortly.' },
    bar:        { terminalName: 'Bar Terminal',   footer: 'Please drink responsibly. Must be 18+ to purchase alcohol.' },
    carwash:    { terminalName: 'Car Wash Terminal', footer: 'Your vehicle looks amazing! See you next time.' },
  },
}

// ── Seed Transactions ─────────────────────────────────────────
export const SEED_TRANSACTIONS: Transaction[] = [
  { id:1001, ts:'09/05 09:14', mod:'restaurant', cashier:'Jordan Kim',   userId:'U2', customer:'Table T2',       item:'Ribeye Steak',     addons:['Side Fries'],        sub:53,  disc:0,    tax:4.5,  total:57.5,  pay:'Card', orderType:'dine-in' },
  { id:1002, ts:'09/05 10:32', mod:'bar',        cashier:'Taylor Moss',  userId:'U3', customer:'Tab – Alex',     item:'Old Fashioned ×2', addons:[],                    sub:32,  disc:0,    tax:3.2,  total:35.2,  pay:'Tab' },
  { id:1003, ts:'09/05 11:05', mod:'carwash',    cashier:'Casey Park',   userId:'U4', customer:'Marcus Johnson', item:'Ceramic Coat',     addons:['Engine Wash','Wax'], sub:192, disc:38.4, tax:12.3, total:165.9, pay:'Card' },
]

// ── Fleet Accounts ────────────────────────────────────────────
export const SEED_FLEET: FleetAccount[] = [
  {
    id:'FL1', companyName:'Miami Metro Taxis', contactName:'James Rivera', email:'james@miamimetro.com',
    phone:'(305) 555-1001', address:'450 Biscayne Blvd, Miami FL',
    accountType:'commercial', discount:25, creditLimit:2000, currentBalance:0,
    billingCycle:'monthly', invoiceDay:1, paymentTerms:'Net 30',
    status:'active', created:'2024-01-10', accountManager:'Alex Rivera',
    notes:'30-vehicle fleet. Priority bay access.',
    vehicles:[
      { id:'fv1', plate:'MTX-001', make:'Toyota',  model:'Camry',     year:2022, color:'Yellow', type:'Sedan', washes:12 },
      { id:'fv2', plate:'MTX-002', make:'Toyota',  model:'Camry',     year:2022, color:'Yellow', type:'Sedan', washes:10 },
    ],
    invoices:[
      { id:'INV-001', date:'2025-05-01', dueDate:'2025-05-31', amount:480.00, status:'paid',   items:38 },
      { id:'INV-002', date:'2025-04-01', dueDate:'2025-04-30', amount:420.00, status:'paid',   items:33 },
    ],
  },
]

// ── Promo Codes ───────────────────────────────────────────────
export const SEED_PROMOS: PromoCode[] = [
  { code:'WELCOME10', type:'pct',  value:10, minOrder:20,  uses:0, maxUses:100, expiry:'2025-12-31', active:true },
  { code:'FLAT5',     type:'flat', value:5,  minOrder:25,  uses:0, maxUses:50,  expiry:'2025-09-30', active:true },
  { code:'VIP20',     type:'pct',  value:20, minOrder:50,  uses:0, maxUses:20,  expiry:'2025-07-31', active:true },
]
