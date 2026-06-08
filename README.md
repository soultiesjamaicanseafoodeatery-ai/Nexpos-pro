# NexPOS Pro — Next.js

Multi-module Point of Sale system for Soulties Seafood Eatery, Bar & Car Wash.
Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **ESLint**.

---

## 📁 Project Structure

```
nexpos-pro/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, fonts, providers
│   │   └── page.tsx            # Entry point (auth → app shell)
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthScreen.tsx  # Login: name selection + PIN pad
│   │   ├── layout/
│   │   │   ├── AppShell.tsx    # Main layout + page router
│   │   │   ├── Sidebar.tsx     # Module switcher + nav
│   │   │   └── Topbar.tsx      # Module badge, clock, user info
│   │   ├── pos/
│   │   │   └── POSPage.tsx     # Item grid, add-ons, order panel, checkout
│   │   ├── admin/
│   │   │   ├── TransactionsPage.tsx
│   │   │   ├── ReportsPage.tsx
│   │   │   └── StaffPage.tsx
│   │   └── shared/
│   │       ├── ToastContainer.tsx
│   │       └── PlaceholderPage.tsx
│   ├── lib/
│   │   ├── data/
│   │   │   └── seed.ts         # All seed data (users, menu, biz config)
│   │   ├── hooks/
│   │   │   └── useAppStore.tsx # Global state (React context + useReducer)
│   │   └── utils/
│   │       ├── storage.ts      # SSR-safe localStorage wrapper
│   │       └── tax.ts          # Jamaica GCT tax engine
│   ├── styles/
│   │   └── globals.css         # CSS variables, base styles, animations
│   └── types/
│       └── index.ts            # All TypeScript types
├── .eslintrc.json
├── .gitignore
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Run development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Build for production
```bash
npm run build
npm start
```

---

## 🔐 Default Login Credentials

| Name         | PIN  | Role       | Modules              |
|--------------|------|------------|----------------------|
| Alex Rivera  | 1234 | Admin      | All                  |
| Jordan Kim   | 2222 | Cashier    | Restaurant           |
| Taylor Moss  | 3333 | Bartender  | Bar                  |
| Casey Park   | 4444 | Attendant  | Car Wash             |
| Morgan Lee   | 5555 | Manager    | All                  |
| Sam Torres   | 6666 | Supervisor | Restaurant + Bar     |

---

## 🐙 Push to GitHub

### First time setup

```bash
# 1. Inside the project folder
git init
git add .
git commit -m "Initial commit — NexPOS Pro Next.js migration"

# 2. Create repo on GitHub (using GitHub CLI)
gh repo create nexpos-pro --public --source=. --remote=origin --push

# OR manually link an existing repo:
git remote add origin https://github.com/YOUR_USERNAME/nexpos-pro.git
git branch -M main
git push -u origin main
```

### Subsequent pushes
```bash
git add .
git commit -m "Your message"
git push
```

---

## 🌐 Deploy to Vercel (recommended)

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repo at [vercel.com](https://vercel.com) for automatic deploys on every push.

---

## 🗺️ Pages Still To Build

These pages render a placeholder and are ready for development:

- `tables` — Table management (drag-and-drop layout)
- `members` — Car wash membership management
- `fleet` — Fleet account invoicing
- `settings` — Business config editor
- `audit` — Audit log viewer
- `shifts` — Shift management
- `loyalty` — Loyalty points program
- `promos` — Promo code management
- `bookings` — Reservation system
- `inventory` — Stock management
- `satisfaction` — Customer feedback
- `targets` — Performance KPIs

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 14 (App Router) | Framework |
| TypeScript | Type safety |
| Tailwind CSS | Utility styling |
| ESLint | Code quality |
| React Context + useReducer | Global state |
| localStorage | Data persistence |
