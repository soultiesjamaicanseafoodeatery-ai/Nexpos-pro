import type { User, RoleConfig, ModuleData, BusinessConfig, Transaction, FleetAccount, PromoCode } from '@/types'

export const SEED_VERSION = 'v2-soulties-real'

// ── Roles ────────────────────────────────────────────────────
export const ROLES: Record<string, RoleConfig> = {
  admin:      { label: 'Administrator', color: '#f56565', pages: ['pos','tables','kitchen','transactions','reports','staff','menu','settings','audit','shifts','fleet','members','loyalty','promos','voids','bookings','inventory','satisfaction','targets'] },
  manager:    { label: 'Manager',       color: '#f5a623', pages: ['pos','tables','kitchen','transactions','reports','staff','menu','shifts','fleet','members','loyalty','promos','voids','bookings','targets'] },
  supervisor: { label: 'Supervisor',    color: '#9b8afb', pages: ['pos','tables','kitchen','transactions','shifts'] },
  cashier:    { label: 'Cashier',       color: '#4f8ef7', pages: ['pos','tables','kitchen','transactions','shifts','loyalty'] },
  server:     { label: 'Server',        color: '#22c55e', pages: ['pos','tables','kitchen','shifts','loyalty'] },
  bartender:  { label: 'Bartender',     color: '#3ecf8e', pages: ['pos','kitchen','transactions','shifts'] },
  attendant:  { label: 'Attendant',     color: '#38bdf8', pages: ['pos','transactions','shifts'] },
  kitchen:    { label: 'Kitchen',       color: '#f97316', pages: ['kitchen'] },
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
    categories:['All','APPETIZER','LUNCH','MEAT','PASTA & BURGERS','SEAFOOD','SIDES','SOUPS','VEGGIE'],
    tables:['T1','T2','T3','T4','T5','T6','T7','T8'],
    tableStatus:{ T1:'free', T2:'occupied', T3:'free', T4:'occupied', T5:'free', T6:'free', T7:'occupied', T8:'free' },
    tabs:[],
    items:[
      // ── APPETIZER ──
      { id:'ITEM-A3',             name:'Ackee & Saltfish Spring Rolls', desc:'',                                     price:1200, cat:'APPETIZER', emoji:'🍽️', active:true },
      { id:'ITEM-A5',             name:'Coconut Shrimp',                desc:'',                                     price:2500, cat:'APPETIZER', emoji:'🍤', active:true },
      { id:'ITEM-A6',             name:'Fish Sticks',                   desc:'',                                     price:1000, cat:'APPETIZER', emoji:'🐟', active:true },
      { id:'ITEM-1781203340592',  name:'Jerk Chicken Spring Rolls',     desc:'',                                     price:1000, cat:'APPETIZER', emoji:'🍽️', active:true },
      { id:'ITEM-A7',             name:'Soul Bowl Salad',               desc:'',                                     price:1250, cat:'APPETIZER', emoji:'🥗', active:true },
      { id:'ITEM-A2',             name:'Vegetable Spring Rolls',        desc:'',                                     price:800,  cat:'APPETIZER', emoji:'🥟', active:true },
      { id:'ITEM-A4',             name:'Wings',                         desc:'Flavors: Plain, Honey Garlic, BBQ',    price:1600, cat:'APPETIZER', emoji:'🍗', active:true },
      // ── LUNCH ──
      { id:'ITEM-L1', name:'Jerk Chicken',    desc:'Served with a small juice or water', price:1000, cat:'LUNCH', emoji:'🍗', active:true },
      { id:'ITEM-L2', name:'Fry Chicken',     desc:'Served with a small juice or water', price:1000, cat:'LUNCH', emoji:'🍗', active:true },
      { id:'ITEM-L3', name:'BBQ Chicken',     desc:'Served with a small juice or water', price:1200, cat:'LUNCH', emoji:'🍗', active:true },
      { id:'ITEM-L4', name:'Curry Goat',      desc:'Served with a small juice or water', price:1200, cat:'LUNCH', emoji:'🍽️', active:true },
      { id:'ITEM-L5', name:'Cow Foot',        desc:'Served with a small juice or water', price:1200, cat:'LUNCH', emoji:'🍽️', active:true },
      { id:'ITEM-L6', name:'Chicken & Chips', desc:'Served with a small juice or water', price:1000, cat:'LUNCH', emoji:'🍟', active:true },
      { id:'ITEM-L7', name:'Fish & Chips',    desc:'Served with a small juice or water', price:1200, cat:'LUNCH', emoji:'🐟', active:true },
      // ── MEAT ──
      { id:'ITEM-M1', name:'Jerk Chicken',    desc:'Served with Rice & Peas & Macaroni Salad', price:1200, cat:'MEAT', emoji:'🍗', active:true },
      { id:'ITEM-M2', name:'Fry Chicken',     desc:'Served with Rice & Peas & Macaroni Salad', price:1200, cat:'MEAT', emoji:'🍗', active:true },
      { id:'ITEM-M3', name:'BBQ Fry',         desc:'Served with Rice & Peas & Macaroni Salad', price:1200, cat:'MEAT', emoji:'🍽️', active:true },
      { id:'ITEM-M4', name:'Jerk Pork',       desc:'Served with Rice & Peas & Macaroni Salad', price:1200, cat:'MEAT', emoji:'🥩', active:true },
      { id:'ITEM-M5', name:'Brown Stew Pork', desc:'Served with Rice & Peas & Macaroni Salad', price:1400, cat:'MEAT', emoji:'🥩', active:true },
      { id:'ITEM-M6', name:'Ox Tail',         desc:'Served with Rice & Peas & Macaroni Salad', price:3500, cat:'MEAT', emoji:'🍽️', active:true },
      { id:'ITEM-M7', name:'Curry Goat',      desc:'Served with Rice & Peas & Macaroni Salad', price:2200, cat:'MEAT', emoji:'🍽️', active:true },
      { id:'ITEM-M8', name:'Cow Foot',        desc:'Served with Rice & Peas & Macaroni Salad', price:1800, cat:'MEAT', emoji:'🍽️', active:true },
      // ── PASTA & BURGERS ──
      { id:'ITEM-P1', name:'Shrimp Pasta',        desc:'', price:2100, cat:'PASTA & BURGERS', emoji:'🍝', active:true },
      { id:'ITEM-P2', name:'Fish Burger & Fries',  desc:'', price:1450, cat:'PASTA & BURGERS', emoji:'🍔', active:true },
      { id:'ITEM-P3', name:'Beef Burger & Fries',  desc:'', price:1250, cat:'PASTA & BURGERS', emoji:'🍔', active:true },
      // ── SEAFOOD ──
      { id:'11111111-1111-1111-1111-111111111111', name:'Snapper',          desc:'',                                                                              price:3000,  cat:'SEAFOOD', emoji:'🐟', active:true },
      { id:'ITEM-SF1',                            name:'Lobster',           desc:'From J$3,500. Served with Rice & Peas & Macaroni Salad',                       price:3500,  cat:'SEAFOOD', emoji:'🦞', active:true },
      { id:'22222222-2222-2222-2222-222222222222', name:'Shrimp',           desc:'',                                                                              price:3000,  cat:'SEAFOOD', emoji:'🍤', active:true },
      { id:'ITEM-SF2',                            name:'Shrimp',            desc:'Served with Rice & Peas & Macaroni Salad',                                      price:3100,  cat:'SEAFOOD', emoji:'🍤', active:true },
      { id:'ITEM-SF3',                            name:'Crab',              desc:'From J$4,000. Served with Rice & Peas & Macaroni Salad',                       price:4000,  cat:'SEAFOOD', emoji:'🦀', active:true },
      { id:'ITEM-SF4',                            name:'Conch',             desc:'',                                                                              price:3500,  cat:'SEAFOOD', emoji:'🐚', active:true },
      { id:'ITEM-SF5',                            name:'Salmon',            desc:'Served with Rice & Peas & Macaroni Salad',                                      price:3500,  cat:'SEAFOOD', emoji:'🐟', active:true },
      { id:'ITEM-SF6',                            name:'Seafood Boil',      desc:'',                                                                              price:12000, cat:'SEAFOOD', emoji:'🦐', active:true },
      { id:'ITEM-SF7',                            name:'Fish',              desc:'From J$3,000. Choose: Escovitch, Steam or Brown Stew. Served with Rice & Peas & Macaroni Salad', price:3000, cat:'SEAFOOD', emoji:'🐟', active:true },
      { id:'ITEM-SF8',                            name:'Seafood Stew Peas', desc:'Served with Rice & Peas & Macaroni Salad',                                      price:4500,  cat:'SEAFOOD', emoji:'🍲', active:true },
      // ── SIDES ──
      { id:'ITEM-SD1', name:'Bammy',            desc:'', price:500, cat:'SIDES', emoji:'🫓', active:true },
      { id:'ITEM-SD2', name:'Ripe Plantain',    desc:'', price:500, cat:'SIDES', emoji:'🍌', active:true },
      { id:'ITEM-SD3', name:'Green Plantain',   desc:'', price:500, cat:'SIDES', emoji:'🍌', active:true },
      { id:'ITEM-SD4', name:'Festival',         desc:'', price:500, cat:'SIDES', emoji:'🫓', active:true },
      { id:'ITEM-SD5', name:'Fries',            desc:'', price:500, cat:'SIDES', emoji:'🍟', active:true },
      { id:'ITEM-SD6', name:'Triple Cheese Mash', desc:'', price:500, cat:'SIDES', emoji:'🥔', active:true },
      { id:'ITEM-SD7', name:'Macaroni Salad',   desc:'', price:500, cat:'SIDES', emoji:'🍜', active:true },
      { id:'ITEM-SD8', name:'Steam Vegetables', desc:'', price:850, cat:'SIDES', emoji:'🥦', active:true },
      // ── SOUPS ──
      { id:'ITEM-S1',            name:'Med Seafood Soup', desc:'', price:500,  cat:'SOUPS', emoji:'🍲', active:true },
      { id:'ITEM-S2',            name:'Med Meat Soup',    desc:'', price:500,  cat:'SOUPS', emoji:'🍲', active:true },
      { id:'ITEM-S3',            name:'Med Veggie Sip',   desc:'', price:500,  cat:'SOUPS', emoji:'🥣', active:true },
      { id:'ITEM-1781233977106', name:'Lrg Meat Soup',    desc:'', price:1000, cat:'SOUPS', emoji:'🍲', active:true },
      { id:'ITEM-1781234082991', name:'Lrg Seafood Soup', desc:'', price:1000, cat:'SOUPS', emoji:'🍲', active:true },
      // ── VEGGIE ──
      { id:'ITEM-V1', name:'Veggie Chunks', desc:'', price:2000, cat:'VEGGIE', emoji:'🥦', active:true },
      { id:'ITEM-V2', name:'Tofu',          desc:'', price:2000, cat:'VEGGIE', emoji:'🫘', active:true },
      { id:'ITEM-V3', name:'Veggies',       desc:'', price:2000, cat:'VEGGIE', emoji:'🥗', active:true },
    ],
    addons:[
      { id:'ra1', name:'Extra Sauce',  desc:'Choice of sauce', price:0,   icon:'🫙', active:true },
      { id:'ra2', name:'Side Salad',   desc:'Mixed greens',    price:500, icon:'🥗', active:true },
      { id:'ra3', name:'Extra Protein',desc:'Add protein',     price:500, icon:'🥩', active:true },
    ],
  },
  bar: {
    label:'Bar', icon:'🍺', color:'var(--pur)', cobText:'#0d0028', selCls:'s-p', aoCls:'p',
    taxRate:0.15,
    categories:['All','Cognac','Gin','Rum','Shots','Tequila','Vodka','Whiskey'],
    tables:['B1','B2','B3','B4','B5'],
    tableStatus:{ B1:'free', B2:'occupied', B3:'free', B4:'free', B5:'occupied' },
    tabs:[],
    items:[
      // ── Cognac ──
      { id:'ITEM-BAR-C1', name:'Hennessy VS',      desc:'Cognac', price:20000, cat:'Cognac', emoji:'🥃', active:true },
      { id:'ITEM-BAR-C2', name:'Hennessy VSOP',    desc:'Cognac', price:30000, cat:'Cognac', emoji:'🥃', active:true },
      { id:'ITEM-BAR-C3', name:'Hennessy White',   desc:'Cognac', price:35000, cat:'Cognac', emoji:'🥃', active:true },
      { id:'ITEM-BAR-C4', name:'Remy Martin VSOP', desc:'Cognac', price:40000, cat:'Cognac', emoji:'🥃', active:true },
      { id:'ITEM-BAR-C5', name:'Remy Martin XO',   desc:'Cognac', price:65000, cat:'Cognac', emoji:'🥃', active:true },
      { id:'ITEM-BAR-C6', name:'Courvoisier',      desc:'Cognac', price:25000, cat:'Cognac', emoji:'🥃', active:true },
      { id:'ITEM-BAR-C7', name:"D'USSE",           desc:'Cognac', price:45000, cat:'Cognac', emoji:'🥃', active:true },
      // ── Gin ──
      { id:'ITEM-BAR-G1', name:"Gordon's Gin Shot",   desc:'Gin', price:800,  cat:'Gin', emoji:'🍸', active:true },
      { id:'ITEM-BAR-G2', name:'Tanqueray Shot',       desc:'Gin', price:1500, cat:'Gin', emoji:'🍸', active:true },
      { id:'ITEM-BAR-G3', name:'Bombay Sapphire Shot', desc:'Gin', price:1200, cat:'Gin', emoji:'🍸', active:true },
      { id:'ITEM-BAR-G4', name:'Beefeater Shot',       desc:'Gin', price:1200, cat:'Gin', emoji:'🍸', active:true },
      { id:'ITEM-BAR-G5', name:"Hendrick's Gin Shot",  desc:'Gin', price:1200, cat:'Gin', emoji:'🍸', active:true },
      // ── Rum ──
      { id:'ITEM-BAR-R1',  name:'Appleton 8yr',               desc:'Rum', price:15000, cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R2',  name:'Appleton 12yr',              desc:'Rum', price:18000, cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R3',  name:'Appleton 15yr',              desc:'Rum', price:25000, cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R4',  name:'Appleton 21yr',              desc:'Rum', price:35000, cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R5',  name:'Wray & Nephew',              desc:'Rum', price:8000,  cat:'Rum', emoji:'🍶', active:true },
      { id:'ITEM-BAR-R6',  name:'Malibu',                     desc:'Rum', price:8000,  cat:'Rum', emoji:'🥥', active:true },
      { id:'ITEM-BAR-R7',  name:'Captain Morgan Spiced Rum',  desc:'Rum', price:8000,  cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R8',  name:'Kingston 62',                desc:'Rum', price:8000,  cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R9',  name:'Bacardi Gold',               desc:'Rum', price:12000, cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R10', name:'Bacardi Silver',             desc:'Rum', price:12000, cat:'Rum', emoji:'🥃', active:true },
      { id:'ITEM-BAR-R11', name:'Appleton White',             desc:'Rum', price:8000,  cat:'Rum', emoji:'🥃', active:true },
      // ── Shots ──
      { id:'ITEM-1781324300531', name:'Patron Silver Shot',    desc:'Tequila',         price:3000, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781324478977', name:'Donjulio Reposado Shot',desc:'Tequila',         price:3500, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781324550823', name:'Donjulio Blanco Shot',  desc:'Tequila',         price:3000, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781324768852', name:'Patron Gold Shot',      desc:'Tequila',         price:3500, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781325081765', name:'Cuervo Gold Shot',      desc:'Tequila',         price:1200, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781325194200', name:'Casamigos Shot',        desc:'Tequila',         price:2500, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781325323228', name:"Jack Daniel's Shot",    desc:'Whiskey/Bourbon', price:1500, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781325425926', name:'Crown Royal Shot',      desc:'Whiskey/Bourbon', price:2000, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781326730256', name:'Absolute Shot',         desc:'Vodka',           price:1200, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781327030298', name:'Titos Shot',            desc:'Vodka',           price:1500, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781327096130', name:'Grey Goose Shot',       desc:'Vodka',           price:1500, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781327313196', name:'Belvedere Shot',        desc:'Vodka',           price:2000, cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781327571211', name:'Smirnoff Apple Shot',   desc:'Vodka',           price:800,  cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781328796028', name:'Smirnoff Regular Shot', desc:'Vodka',           price:800,  cat:'Shots', emoji:'🥃', active:true },
      { id:'ITEM-1781328911562', name:'Wray & Nephew Shot',    desc:'Rum',             price:800,  cat:'Shots', emoji:'🥃', active:true },
      // ── Tequila ──
      { id:'ITEM-BAR-T1', name:'Don Julio Reposado', desc:'Tequila', price:35000, cat:'Tequila', emoji:'🥃', active:true },
      { id:'ITEM-BAR-T2', name:'Don Julio Blanco',   desc:'Tequila', price:30000, cat:'Tequila', emoji:'🥃', active:true },
      { id:'ITEM-BAR-T3', name:'Rancho Gold',         desc:'Tequila', price:800,   cat:'Tequila', emoji:'🍹', active:true },
      { id:'ITEM-BAR-T4', name:'Rancho Silver',       desc:'Tequila', price:800,   cat:'Tequila', emoji:'🍹', active:true },
      { id:'ITEM-BAR-T5', name:'Patron Silver',       desc:'Tequila', price:30000, cat:'Tequila', emoji:'🥃', active:true },
      { id:'ITEM-BAR-T6', name:'Patron Gold',         desc:'Tequila', price:35000, cat:'Tequila', emoji:'🥃', active:true },
      { id:'ITEM-BAR-T7', name:'Cuervo Gold',         desc:'Tequila', price:12000, cat:'Tequila', emoji:'🥃', active:true },
      // ── Vodka ──
      { id:'ITEM-BAR-V1',  name:'Smirnoff Regular',      desc:'Vodka', price:8000,  cat:'Vodka', emoji:'🍾', active:true },
      { id:'ITEM-BAR-V2',  name:'Smirnoff Apple',         desc:'Vodka', price:8000,  cat:'Vodka', emoji:'🍾', active:true },
      { id:'ITEM-BAR-V3',  name:"Tito's Handmade Vodka",  desc:'Vodka', price:18000, cat:'Vodka', emoji:'🥃', active:true },
      { id:'ITEM-BAR-V4',  name:'Ciroc Regular',           desc:'Vodka', price:25000, cat:'Vodka', emoji:'🍾', active:true },
      { id:'ITEM-BAR-V5',  name:'Ciroc Pineapple',         desc:'Vodka', price:25000, cat:'Vodka', emoji:'🍍', active:true },
      { id:'ITEM-BAR-V6',  name:'Ciroc Coconut',           desc:'Vodka', price:25000, cat:'Vodka', emoji:'🥥', active:true },
      { id:'ITEM-BAR-V7',  name:'Ciroc Redberry',          desc:'Vodka', price:25000, cat:'Vodka', emoji:'🫐', active:true },
      { id:'ITEM-BAR-V8',  name:'Absolute',                desc:'Vodka', price:12000, cat:'Vodka', emoji:'🍾', active:true },
      { id:'ITEM-BAR-V9',  name:'Grey Goose',              desc:'Vodka', price:18000, cat:'Vodka', emoji:'🍾', active:true },
      { id:'ITEM-BAR-V10', name:'Belvedere',               desc:'Vodka', price:28000, cat:'Vodka', emoji:'🍾', active:true },
      // ── Whiskey ──
      { id:'ITEM-BAR-W1', name:"Jack Daniel's", desc:'Whiskey / Bourbon', price:25000, cat:'Whiskey', emoji:'🥃', active:true },
      { id:'ITEM-BAR-W2', name:'Crown Royal',   desc:'Whiskey / Bourbon', price:25000, cat:'Whiskey', emoji:'🥃', active:true },
      { id:'ITEM-BAR-W3', name:'Jameson Shot',  desc:'Whiskey / Bourbon', price:1500,  cat:'Whiskey', emoji:'🥃', active:true },
      { id:'ITEM-BAR-W4', name:'Jim Beam',      desc:'Whiskey / Bourbon', price:1500,  cat:'Whiskey', emoji:'🥃', active:true },
    ],
    addons:[
      { id:'ba1', name:'Extra Ice',     desc:'More ice',           price:0,    icon:'🧊', active:true },
      { id:'ba2', name:'Double Up',     desc:'Double the spirit',  price:1000, icon:'✌️', active:true },
      { id:'ba3', name:'Bar Snack',     desc:'Nuts, olives',       price:500,  icon:'🥜', active:true },
      { id:'ba4', name:'Premium Mixer', desc:'Upgrade tonic/soda', price:500,  icon:'🫧', active:true },
    ],
  },
  carwash: {
    label:'Car Wash', icon:'🚗', color:'var(--blue)', cobText:'#fff', selCls:'s-b', aoCls:'g',
    taxRate:0.15,
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
  { id:1001, ts:'09/05 09:14', mod:'restaurant', cashier:'Jordan Kim',   userId:'U2', customer:'Table T2',       item:'Ox Tail',          addons:[],                   sub:3500, disc:0,   tax:525,  total:4025,  pay:'Card', orderType:'dine-in' },
  { id:1002, ts:'09/05 10:32', mod:'bar',         cashier:'Taylor Moss',  userId:'U3', customer:'Tab – Alex',     item:'Hennessy VS',      addons:[],                   sub:20000,disc:0,   tax:3000, total:23000, pay:'Tab' },
  { id:1003, ts:'09/05 11:05', mod:'carwash',     cashier:'Casey Park',   userId:'U4', customer:'Marcus Johnson', item:'Full Detail',       addons:['Engine Wash','Wax'],sub:65,   disc:13,  tax:7.8,  total:59.8,  pay:'Card' },
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
      { id:'fv1', plate:'MTX-001', make:'Toyota',  model:'Camry', year:2022, color:'Yellow', type:'Sedan', washes:12 },
      { id:'fv2', plate:'MTX-002', make:'Toyota',  model:'Camry', year:2022, color:'Yellow', type:'Sedan', washes:10 },
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
