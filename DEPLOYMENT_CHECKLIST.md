# NexPOS Pro — Deployment Testing Checklist

## Pre-Deployment Setup

### QZ Tray (Required for Printing & Cash Drawer)
- [ ] Download and install QZ Tray from qz.io (free)
- [ ] Launch QZ Tray — its icon appears in the Windows system tray
- [ ] Right-click QZ Tray icon → Site Manager → add your site URL
- [ ] Open NexPOS Pro → Settings → Printers → click "Refresh" — status turns green

### Printer Setup
- [ ] Receipt printer (EPOSNOW POS80GXa) driver installed — visible in Windows Settings → Printers & scanners
- [ ] Kitchen printer (POS-5890K) driver installed — visible in Windows Settings → Printers & scanners
- [ ] Go to NexPOS Pro → Settings → Printers → click "Detect Printers"
- [ ] Assign Receipt Printer to the 80mm printer
- [ ] Assign Kitchen Printer to the 58mm printer
- [ ] Set paper width to 80mm for receipt printer

---

## Phase 1 — Receipt Printing

- [ ] **Test receipt print**: Settings → Printers → "Test Receipt Printer" — paper comes out of 80mm printer
- [ ] **Auto-print on payment**: Settings → Printers → enable "Auto-print receipt after payment"
- [ ] Take a dine-in order, pay with Cash → receipt prints automatically with:
  - [ ] Business name and address
  - [ ] Date, time, cashier name
  - [ ] Order number
  - [ ] All items with prices
  - [ ] GCT (15%) line
  - [ ] Service charge line (if applicable)
  - [ ] Gratuity line (if applicable)
  - [ ] Grand total
  - [ ] Payment method (Cash)
  - [ ] Tendered / Change due
- [ ] Take a card payment → receipt prints with "Card" payment method
- [ ] Repeat for Takeout and Delivery orders
- [ ] Refund a transaction → void is noted correctly

---

## Phase 2 — Kitchen Printing

- [ ] **Test kitchen print**: Settings → Printers → "Test Kitchen Printer" — paper comes out of 58mm printer
- [ ] Start a Dine-In order, add food items, click "Send Order" → kitchen ticket prints automatically with:
  - [ ] "KITCHEN TICKET" header
  - [ ] Table number
  - [ ] Server name
  - [ ] Each food item in large text
  - [ ] Flavour / size / sides / add-ons for each item
  - [ ] Special instructions (if any)
  - [ ] Preparing / Ready / Served checkboxes
- [ ] Add items to an existing open order → "ADDITIONAL ITEMS" ticket prints
- [ ] Void an item → void ticket prints at kitchen
- [ ] Verify food items route to Kitchen Printer, bar items route to Bar Printer

---

## Phase 3 — Bar Printing

- [ ] **Test bar print**: Settings → Printers → "Test Bar Printer"
- [ ] Add a bar item (drink) to an order, send → bar ticket prints at bar printer with:
  - [ ] "BAR TICKET" header
  - [ ] Order number and table
  - [ ] Each drink in large text
  - [ ] Size / flavour / add-ons
  - [ ] Preparing / Ready checkboxes
- [ ] Verify food items do NOT print at bar, drinks do NOT print at kitchen
- [ ] Test bar fallback: if bar printer is blank, bar items print at kitchen printer

---

## Phase 4 — Cash Drawer

- [ ] Settings → Printers → enable "Open cash drawer automatically after cash payments"
- [ ] Click "Open Cash Drawer" test button → drawer opens (confirm receipt printer name is set)
- [ ] Take a cash payment → drawer opens automatically after completion
- [ ] Take a card payment → drawer does NOT open
- [ ] Drawer does NOT open for tab / gift card payments

---

## Phase 5 — Offline Operation

- [ ] Connect to internet → verify green "Online" status (no badge shown in Topbar)
- [ ] Disconnect network cable / turn off WiFi
- [ ] Topbar shows **Offline** badge (red)
- [ ] Complete a full dine-in order while offline:
  - [ ] Log in
  - [ ] Select table
  - [ ] Add items to cart
  - [ ] Send to kitchen
  - [ ] Accept cash payment
  - [ ] Receipt prints (if QZ Tray is running locally — it works offline)
  - [ ] Cash drawer opens
- [ ] Complete a takeout order while offline
- [ ] Complete a carwash transaction while offline
- [ ] Close shift while offline — shift data saves locally
- [ ] Reconnect to internet → Supabase syncs automatically
- [ ] Verify offline transactions appear in Reports after reconnect

---

## Phase 6 — Shift Operations

- [ ] Open a shift: set opening float (cash in drawer at start)
- [ ] Complete several transactions (cash, card, mixed)
- [ ] Close shift: wizard shows expected vs. actual cash
- [ ] Verify cash variance is calculated correctly
- [ ] Verify held orders clear when shift closes
- [ ] Verify refunded transactions excluded from cash totals

---

## Phase 7 — End-of-Day Reporting

- [ ] Navigate to Reports → verify transaction totals match the day's sales
- [ ] Reports → Menu Sales → verify correct item counts (not duplicated)
- [ ] Reports → Revenue by Module (Restaurant / Bar / Car Wash)
- [ ] Reports → Payment Breakdown (Cash / Card)
- [ ] Void Report → shows all voided items with reasons
- [ ] Transaction History → searchable, correct amounts

---

## Phase 8 — Multi-User Operations

- [ ] Log in as Admin → all pages accessible
- [ ] Log in as Cashier → Point of Sale accessible, Settings blocked
- [ ] Log in as Server → Point of Sale accessible, Transactions accessible
- [ ] Log in as Kitchen → Kitchen Display accessible only
- [ ] Two users logged in at different terminals (two browser windows):
  - [ ] Table T1 assigned by User A — appears occupied for User B
  - [ ] Table transfer works correctly
  - [ ] Held orders visible to both users

---

## Electron Desktop App

### Build
```
# Install dependencies
npm install

# Build the desktop installer
npm run electron:pack
```
This creates `dist-electron/NexPOS Pro Setup.exe` and `dist-electron/NexPOS-Pro-portable.exe`

### Installation
- [ ] Run `NexPOS Pro Setup.exe` → installs to C:\Program Files\NexPOS Pro
- [ ] Desktop shortcut created: "NexPOS Pro"
- [ ] Start menu shortcut created
- [ ] Double-click desktop shortcut → app opens without browser
- [ ] Loading screen appears while server starts (~3-5 seconds)
- [ ] POS interface loads correctly
- [ ] All printer/drawer features work in the desktop app
- [ ] App works with no internet connection (offline mode)

### Windows Compatibility
- [ ] Windows 10 (64-bit) — tested
- [ ] Windows 11 (64-bit) — tested

---

## Icon Replacement (Before Production)

The placeholder `electron/icon.ico` must be replaced with the real Soulties logo before building for production:

1. Create a 256×256 PNG of the Soulties logo
2. Convert to ICO format (use any online ICO converter)
3. Replace `electron/icon.ico` with the new file
4. Run `npm run electron:pack` again

---

## Known Limitations

- QZ Tray must be running for silent printing (no popup dialogs)
- Cash drawer must be wired through the receipt printer
- Supabase sync requires internet — local localStorage is always the source of truth offline
- Electron desktop app serves on port 3100 locally
