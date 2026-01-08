# Budget Tracker PWA - Technical Specification

## Overview
A lightweight Progressive Web App for personal budget tracking with expense splitting, category insights, and Venmo settlement tracking. Local-first architecture with no server required.

---

## Technology Recommendations

### Framework: **SvelteKit**
**Why Svelte:**
- **Smallest bundle size**: Compiles to vanilla JS, no runtime framework overhead (~50% smaller than Vue/React)
- **Simplest mental model**: Reactive by default, no useState/useEffect/ref - just `let x = 5` and it's reactive
- **Beautiful syntax**: HTML-first with scoped CSS built-in, very readable
- **PWA-ready**: SvelteKit has excellent static adapter + service worker support
- **Learning opportunity**: Modern framework that's gaining rapid adoption

**SvelteKit specifics:**
- File-based routing (pages in `src/routes/`)
- Built-in adapters for static site generation (perfect for local-first PWA)
- Server-side rendering disabled for pure client-side app

### Database: **Dexie.js (IndexedDB wrapper)**
**Why Dexie:**
- Zero setup, runs entirely in browser
- Has official Svelte integration (`dexie-svelte-observable` or just works with Svelte stores)
- 10x simpler API than raw IndexedDB
- Supports complex queries for reports
- Data persists across sessions, survives browser restarts

### UI Framework: **Tailwind CSS + Bits UI (or Melt UI)**
- Utility-first CSS = fast styling without fighting framework
- **Bits UI**: Headless, accessible components built specifically for Svelte
- Works beautifully on mobile and desktop
- Svelte's scoped styles means less CSS conflicts

### Charts: **Chart.js + svelte-chartjs** (or **LayerChart**)
- **Chart.js**: Lightweight, well-documented, good defaults
- **LayerChart**: Svelte-native charting library (newer, very good for custom viz)
- Both work great for category breakdowns and trend lines

---

## Data Architecture

### Database Schema (Dexie/IndexedDB)

```typescript
// Core Tables
interface Transaction {
  id?: number;              // Auto-increment
  date: Date;
  merchant: string;
  amount: number;
  categoryId: number;
  isShared: boolean;
  splitType: 'percentage' | 'fixed';  // How to calculate partner's share
  splitValue: number;       // If 'percentage': 0.5 = 50%. If 'fixed': exact dollar amount
  partnerShare: number;     // Calculated: splitType === 'percentage' ? amount * splitValue : splitValue
  isSettled: boolean;       // Venmo'd?
  settledDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Example splits:
// Gas: { splitType: 'percentage', splitValue: 0.5 } → Allee pays 50%
// Groceries: { splitType: 'fixed', splitValue: 45.22 } → Allee pays exactly $45.22
// Restaurant: { splitType: 'fixed', splitValue: 20 } → Allee pays her $20 meal

interface Category {
  id?: number;
  name: string;
  icon?: string;            // Emoji or icon name
  color?: string;           // For charts
  isActive: boolean;
  sortOrder: number;
}

interface MonthlyBudget {
  id?: number;
  month: string;            // "2025-12" format
  income: number;
  savedAmount: number;
  notes?: string;
}

interface Settings {
  id: 1;                    // Singleton
  partnerName: string;      // "Allee"
  defaultSplitType: 'percentage' | 'fixed';
  defaultSplitValue: number;  // Default 0.5 (50%) when percentage
  currency: string;
  theme: 'light' | 'dark' | 'system';
}
```

### Computed Values (not stored, calculated on-the-fly)
- `available = income - savedAmount`
- `totalSpent = SUM(transactions.amount) for month` (user's portion only for shared)
- `surplus = available - totalSpent`
- `outstandingBalance = SUM(partnerShare) WHERE isShared=true AND isSettled=false`

---

## Application Structure

```
budget-tracker/
├── svelte.config.js
├── vite.config.ts
├── package.json
├── tailwind.config.js
├── static/
│   ├── manifest.json       # PWA manifest
│   └── icons/              # App icons (192x192, 512x512)
├── src/
│   ├── app.html            # HTML template
│   ├── app.css             # Global styles (Tailwind imports)
│   ├── lib/
│   │   ├── db/
│   │   │   └── index.ts    # Dexie database setup & schema
│   │   ├── stores/
│   │   │   ├── transactions.ts   # Svelte store for transactions
│   │   │   ├── categories.ts     # Svelte store for categories
│   │   │   └── settings.ts       # App settings store
│   │   ├── components/
│   │   │   ├── TransactionForm.svelte
│   │   │   ├── TransactionList.svelte
│   │   │   ├── CategoryChart.svelte
│   │   │   ├── CashFlowCard.svelte
│   │   │   ├── SettlementTracker.svelte
│   │   │   ├── MonthSelector.svelte
│   │   │   └── BottomNav.svelte
│   │   └── utils/
│   │       ├── import.ts       # Excel/CSV import logic
│   │       └── export.ts       # Export to CSV
│   └── routes/
│       ├── +layout.svelte      # App shell with navigation
│       ├── +page.svelte        # Dashboard (home)
│       ├── transactions/
│       │   └── +page.svelte    # Transaction list + entry
│       ├── insights/
│       │   └── +page.svelte    # Category charts, trends
│       ├── settlements/
│       │   └── +page.svelte    # Venmo tracking with Allee
│       └── settings/
│           └── +page.svelte    # Categories, import/export
└── README.md
```

**SvelteKit routing note:** Each `+page.svelte` is automatically a route. No router config needed!

---

## Core Features Specification

### 1. Transaction Entry
**Mobile-optimized form:**
- Date picker (defaults to today)
- Merchant input with autocomplete (learns from history)
- Amount input (numeric keyboard on mobile)
- Category dropdown (23 categories from your spreadsheet)
- "Shared with Allee" toggle
  - When ON: Shows split options:
    - **Percentage mode**: Slider or input (default 50%) → auto-calculates partner's share
    - **Fixed amount mode**: Direct dollar input for Allee's exact share
  - Toggle between modes with a "%" / "$" switcher
  - Useful for: Groceries (item-by-item calc), Restaurants (separate meals), etc.
- Save button

**Desktop enhancement:**
- Keyboard shortcuts (Cmd+N for new transaction)
- Inline editing in transaction list

### 2. Expense Splitting & Settlement Tracker
**Settlement Dashboard:**
```
┌─────────────────────────────────────────┐
│  Outstanding Balance with Allee         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  $247.63 owed to you                    │
│                                         │
│  [Mark All Settled] [View Details]      │
└─────────────────────────────────────────┘

Unsettled Transactions:
☐ Dec 15 - Shell (Gas)           $16.49
☐ Dec 14 - MOM's Organic         $45.22
☐ Dec 12 - JCC Fitness           $77.00
...
[Select All] [Mark Selected as Settled]
```

**Features:**
- Running total of unsettled shared expenses
- Batch settlement (select multiple, mark as Venmo'd)
- Settlement history with dates

### 3. Category Insights
**Monthly Breakdown Chart:**
- Pie/donut chart showing spend by category
- Click category to see transactions
- Color-coded (consistent colors per category)

**Trend Analysis:**
- Line chart: Total spending over past 6 months
- Bar chart: Category comparison month-over-month
- Top 5 categories this month vs. last month

**Budget vs. Actual (optional future feature):**
- Set category budgets
- Progress bars showing % used

### 4. Cash Flow Summary
**Dashboard Widget:**
```
┌─────────────────────────────────────────┐
│  December 2025                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Income         $7,657.54               │
│  - Saved        $1,135.76               │
│  ────────────────────────────           │
│  Available      $6,521.78               │
│  - Spent        $5,161.46               │
│  ────────────────────────────           │
│  Surplus        $1,360.32  ✓            │
└─────────────────────────────────────────┘
```

### 5. Data Import (from existing spreadsheets)
**Import Flow:**
1. User uploads .xlsx file
2. App detects sheet structure (your Nov+ format)
3. Preview imported data in table
4. Map columns if needed (usually auto-detected)
5. Confirm import
6. Transactions added to database

**Technical approach:**
- Use `xlsx` library (SheetJS) for parsing
- Handle both your Oct format and Nov+ format
- Deduplicate by date+merchant+amount

### 6. Export
- Export current month or date range to CSV
- Full backup to JSON (all data)
- Restore from JSON backup

---

## PWA Configuration

### Manifest (public/manifest.json)
```json
{
  "name": "Budget Tracker",
  "short_name": "Budget",
  "description": "Personal budget tracking with expense splitting",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker (via vite-plugin-pwa)
- Cache app shell for offline use
- Cache transaction data locally
- Background sync when online (future: if adding cloud sync)

---

## UI/UX Design Principles

1. **Mobile-first responsive**: Works great on phone, enhanced on desktop
2. **Thumb-friendly**: Important actions in bottom navigation on mobile
3. **Quick entry**: Minimal taps to log a transaction
4. **Glanceable dashboard**: See financial health at a glance
5. **Dark mode support**: Easy on the eyes, respects system preference

### Navigation Structure
**Mobile (bottom nav):**
```
[Dashboard] [Transactions] [Insights] [Settlements] [Settings]
     🏠          📝            📊          🤝           ⚙️
```

**Desktop (sidebar):**
- Same sections, vertical sidebar on left
- More space for charts and tables

---

## Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Project setup (SvelteKit + Tailwind + Dexie)
- [ ] Database schema implementation
- [ ] Basic transaction CRUD
- [ ] Category management (seed with your 23 categories)
- [ ] Simple transaction list view

### Phase 2: Core Features
- [ ] Transaction form with sharing toggle
- [ ] Cash flow summary component
- [ ] Month selector/navigation
- [ ] Settlement tracking (mark as Venmo'd)

### Phase 3: Insights & Polish
- [ ] Category breakdown chart
- [ ] Monthly trends chart
- [ ] Excel import functionality
- [ ] CSV export

### Phase 4: PWA & Mobile
- [ ] PWA configuration (manifest, service worker)
- [ ] Mobile-optimized navigation
- [ ] Install prompt
- [ ] Offline support

### Phase 5: Enhancements (Future)
- [ ] Recurring transaction templates
- [ ] Budget goals per category
- [ ] Data backup to cloud (optional)
- [ ] Push notifications for settlement reminders

---

## Dependencies

```json
{
  "dependencies": {
    "dexie": "^4.0",
    "chart.js": "^4.4",
    "svelte-chartjs": "^3.1",
    "xlsx": "^0.18",
    "bits-ui": "^0.21",
    "date-fns": "^3.0"
  },
  "devDependencies": {
    "@sveltejs/kit": "^2.0",
    "@sveltejs/adapter-static": "^3.0",
    "svelte": "^4.2",
    "vite": "^5.0",
    "vite-plugin-pwa": "^0.17",
    "tailwindcss": "^3.4",
    "autoprefixer": "^10.4",
    "typescript": "^5.3"
  }
}
```

Estimated bundle size: ~80-120KB gzipped (Svelte compiles away the framework!)

---

## Your Existing Categories (23 total)
From your spreadsheets:
- Car
- Cash withdrawals
- Clothes & accessories
- Coffee & snacks
- Donations
- Electronics
- Fitness & wellness
- Fun & hobbies
- Gas
- Gifts
- Groceries
- Grooming
- Health
- Home
- Household supplies
- Insurance
- Parking & tolls
- Pet
- Rent
- Restaurants
- Subscriptions
- Travel
- Utilities

---

## Questions Resolved
- Framework: **SvelteKit** (smallest bundle, simplest syntax, user preference)
- Device: Responsive design for both mobile and desktop
- Data migration: Import from existing Excel files (Oct 2025 - present)
- Priority features: Expense splitting, category insights, Venmo tracking
- Split calculation: Supports both **percentage** (e.g., 50%) and **fixed amount** (e.g., $45.22) modes

---

## Next Steps
1. Initialize SvelteKit project with TypeScript
2. Set up Tailwind CSS and Dexie database
3. Build Phase 1 (Foundation/MVP)
4. Import your existing spreadsheet data
