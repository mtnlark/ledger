# Ledger - Personal Budget Tracking App

## Overview
A Tauri desktop application for personal budget tracking with expense splitting, category insights, and Venmo settlement tracking. Local-first architecture with all data stored on-device.

---

## Technology Stack

### Framework: **SvelteKit + Tauri**
- **SvelteKit**: File-based routing, Svelte 5 with runes (`$state`, `$derived`, `$props`)
- **Tauri v2**: Native desktop app with Rust backend
- **Target Platform**: macOS (desktop-only, no mobile/PWA)

### Storage: **Dexie.js + JSON File Persistence**
- **Dexie**: In-memory IndexedDB wrapper for queries
- **JSON Files**: Persistent storage in `~/Library/Application Support/com.levcraig.budget-tracker/`
  - `data.json`: All app data
  - `backups/`: Timestamped backups (max 10 retained)

### UI: **Tailwind CSS v4**
- Tailwind v4 with `@tailwindcss/vite` plugin
- CSS-first configuration via `@theme` blocks in `app.css`
- Custom "Warm Ledger" design system with terracotta/cream palette

### Charts: **Chart.js**
- Category breakdown pie/donut charts
- Monthly spending trends

---

## Design System

### Colors
```css
/* Primary - Terracotta */
--color-primary-500: #C45D3A;
--color-primary-600: #B5522F;

/* Semantic */
--color-cream: #FAF8F5;
--color-charcoal: #2D2A26;

/* Success - Sage Green */
--color-success-500: #5B8C5A;

/* Warning - Amber */
--color-warning-500: #D4915D;

/* Danger - Muted Rose */
--color-danger-500: #C17B7B;
```

### Typography
- **Display**: Fraunces (serif, for headings)
- **Body**: DM Sans (sans-serif)
- **Mono**: DM Mono (for amounts)

---

## Application Structure

```
budget-tracker/
├── src/
│   ├── app.html              # HTML template
│   ├── app.css               # Tailwind + design system
│   ├── lib/
│   │   ├── db/
│   │   │   └── index.ts      # Dexie schema & defaults
│   │   ├── storage/
│   │   │   ├── index.ts      # Storage abstraction layer
│   │   │   └── tauri-adapter.ts  # File persistence
│   │   ├── stores/           # Data operations
│   │   │   ├── transactions.ts
│   │   │   ├── categories.ts
│   │   │   ├── settings.ts
│   │   │   ├── budget.ts
│   │   │   ├── merchants.ts
│   │   │   └── recurring.ts
│   │   ├── components/
│   │   │   ├── SideNav.svelte        # Collapsible sidebar
│   │   │   ├── HeaderNav.svelte      # Page headers
│   │   │   ├── TransactionForm.svelte
│   │   │   ├── TransactionList.svelte
│   │   │   ├── CashFlowCard.svelte
│   │   │   ├── SettlementTracker.svelte
│   │   │   └── insights/             # Insight components
│   │   └── utils/
│   │       ├── import.ts     # Excel import
│   │       └── export.ts     # CSV/JSON export
│   └── routes/
│       ├── +layout.svelte    # App shell with SideNav
│       ├── +page.svelte      # Dashboard
│       ├── insights/+page.svelte
│       ├── shared/+page.svelte
│       └── settings/+page.svelte
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs            # Tauri plugins setup
│   ├── icons/                # App icons (all sizes)
│   ├── tauri.conf.json       # Tauri configuration
│   └── Cargo.toml
└── static/
    └── (empty - no PWA assets)
```

---

## Data Schema

```typescript
interface Transaction {
  id?: number;
  date: Date;
  merchant: string;
  amount: number;
  categoryId: number;
  isShared: boolean;
  splitType: 'percentage' | 'fixed';
  splitValue: number;
  partnerShare: number;
  isSettled: boolean;
  settledDate?: Date;
  isEssential: boolean;  // Needs vs wants
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Category {
  id?: number;
  name: string;
  icon?: string;           // Emoji
  color?: string;          // Hex color for charts
  isActive: boolean;
  sortOrder: number;
  isEssential: boolean;    // Default needs/wants
}

interface MonthlyBudget {
  id?: number;
  month: string;           // "YYYY-MM" format
  income: number;
  savedAmount: number;
  notes?: string;
}

interface Settings {
  id: 1;                   // Singleton
  partnerName: string;
  defaultSplitType: 'percentage' | 'fixed';
  defaultSplitValue: number;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  dismissedRecurring: string[];
}
```

---

## Navigation

**Collapsible Sidebar:**
- Dashboard (home)
- Insights (charts & trends)
- Shared (settlement tracking)
- Settings (categories, import/export)

Sidebar state persists to localStorage (`ledger-sidebar-expanded`).

---

## Key Features

### Dashboard
- Cash flow summary (income, saved, available, spent, surplus)
- Collapsible "Add Transaction" form
- Transaction list with search/filters
- Quick-add FAB for fast entry

### Insights
- Category breakdown chart
- Monthly spending trends
- Needs vs wants analysis
- Year-to-date summary
- Recurring expense detection
- Category deep dives

### Shared Expenses
- Outstanding balance with partner
- Unsettled transaction list
- Batch settlement marking

### Settings
- Partner name configuration
- Default split settings
- Category management (add/edit/reorder)
- Excel import / JSON export
- Data repair tools

---

## localStorage Keys

UI state persisted across sessions:
- `ledger-sidebar-expanded` - Sidebar collapse state
- `ledger-cashflow-expanded` - Cash flow card state
- `ledger-addform-expanded` - Transaction form state
- `ledger-insight-{title}` - Each insight group state

---

## Development

```bash
# Install dependencies
npm install

# Run in development (web only)
npm run dev

# Run Tauri development
npm run tauri:dev

# Build production app
npm run tauri:build

# Run tests
npm run test
```

### Build Output
- **App**: `src-tauri/target/release/bundle/macos/Ledger.app`
- **DMG**: `src-tauri/target/release/bundle/dmg/Ledger_0.1.0_aarch64.dmg`

---

## Categories (24 total)

Car, Cash withdrawals, Clothes & accessories, Coffee & snacks, Donations, Electronics, Fitness & wellness, Fun & hobbies, Gas, Gifts, Groceries, Grooming, Health, Home, Household supplies, Insurance, Parking & tolls, Pet, Rent, Restaurants, Subscriptions, Travel, Utilities, Other

---

## File Storage Location

macOS: `~/Library/Application Support/com.levcraig.budget-tracker/`
- `data.json` - Main data file
- `backups/` - Auto-timestamped backups before each save

---

## Dependencies

### Runtime
- `@tauri-apps/plugin-fs` - File system access
- `@tauri-apps/api` - Tauri API
- `dexie` - IndexedDB wrapper
- `chart.js` - Charts
- `date-fns` - Date utilities
- `lucide-svelte` - Icons
- `xlsx` - Excel parsing

### Development
- `@sveltejs/kit` - Framework
- `@sveltejs/adapter-static` - Static build for Tauri
- `@tailwindcss/vite` - Tailwind v4
- `@tauri-apps/cli` - Tauri CLI
- `svelte` v5 - UI framework
- `typescript` - Type checking
- `vitest` - Testing
