# Ledger - Personal Budget Tracking App

## Overview
A Tauri desktop application for personal budget tracking with expense splitting, category insights, and Venmo settlement tracking. Local-first architecture with all data stored on-device.

Use test-driven development (TDD) best practices when adding new code. Update CLAUDE.md whenever you make relevant changes to any of the areas listed below.

---

## Technology Stack

### Framework: **SvelteKit + Tauri**
- **SvelteKit**: File-based routing, Svelte 5 with runes (`$state`, `$derived`, `$props`)
- **Tauri v2**: Native desktop app with Rust backend
- **Target Platform**: macOS (desktop-only, no mobile/PWA)

### Storage: **Dexie.js + JSON File Persistence**
- **Dexie**: In-memory database for queries (IndexedDB cleared on startup)
- **JSON Files**: Source of truth in `~/Library/Application Support/app.ledger.desktop/`
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
ledger/
├── src/
│   ├── app.html              # HTML template
│   ├── app.css               # Tailwind + design system
│   ├── app.d.ts              # TypeScript definitions
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts      # Dexie schema & defaults
│   │   │   └── migrations.ts # Database migration logic
│   │   ├── storage/
│   │   │   ├── index.ts      # Storage abstraction layer
│   │   │   └── tauri-adapter.ts  # File persistence
│   │   ├── stores/           # Data operations
│   │   │   ├── transactions.ts
│   │   │   ├── categories.ts
│   │   │   ├── settings.ts
│   │   │   ├── budget.ts
│   │   │   ├── categoryBudget.ts   # Per-category budget tracking
│   │   │   ├── merchants.ts
│   │   │   ├── recurring.ts
│   │   │   ├── selectedMonth.ts    # UI state for month selection
│   │   │   ├── theme.ts            # Light/dark/system theme
│   │   │   └── toast.ts            # Toast notification system
│   │   ├── insights/             # Memoized insight calculations
│   │   │   ├── index.ts          # Public API (getInsightsEngine)
│   │   │   ├── types.ts          # Type definitions
│   │   │   ├── memo.ts           # Version-based memoization utilities
│   │   │   ├── insights-engine.ts # InsightsEngine singleton
│   │   │   └── calculations/     # Pure calculation functions
│   │   │       ├── index.ts
│   │   │       ├── spending.ts
│   │   │       ├── needs-wants.ts
│   │   │       ├── category-shift.ts
│   │   │       ├── category-averages.ts
│   │   │       ├── anomalies.ts
│   │   │       ├── pace-projection.ts
│   │   │       ├── velocity.ts
│   │   │       ├── top-merchant.ts
│   │   │       ├── ytd-stats.ts
│   │   │       └── stats.ts          # Shared statistical helpers (stdDev, zScore)
│   │   ├── components/
│   │   │   ├── SideNav.svelte         # Collapsible sidebar
│   │   │   ├── HeaderNav.svelte       # Page headers
│   │   │   ├── TransactionForm.svelte
│   │   │   ├── TransactionList.svelte
│   │   │   ├── TransactionListSkeleton.svelte
│   │   │   ├── TransactionFilters.svelte
│   │   │   ├── EditTransactionModal.svelte
│   │   │   ├── SplitTransactionModal.svelte
│   │   │   ├── CashFlowCard.svelte
│   │   │   ├── CashFlowCardSkeleton.svelte
│   │   │   ├── SettlementTracker.svelte
│   │   │   ├── QuickAddFAB.svelte
│   │   │   ├── BulkActionBar.svelte
│   │   │   ├── BudgetModal.svelte
│   │   │   ├── BudgetProgressBar.svelte
│   │   │   ├── CategoryBudgetCard.svelte
│   │   │   ├── CategoryBudgetList.svelte
│   │   │   ├── CategoryManager.svelte
│   │   │   ├── CategoryCombobox.svelte
│   │   │   ├── CategoryEditModal.svelte
│   │   │   ├── CategoryBreakdownChart.svelte
│   │   │   ├── MonthlyTrendsChart.svelte
│   │   │   ├── MonthPicker.svelte
│   │   │   ├── MerchantAutocomplete.svelte
│   │   │   ├── ConfirmDialog.svelte
│   │   │   ├── ToastContainer.svelte
│   │   │   ├── EmptyState.svelte
│   │   │   ├── Skeleton.svelte
│   │   │   ├── ChartWrapper.svelte
│   │   │   ├── SharedExpenseFields.svelte  # Shared expense toggle + split options
│   │   │   ├── EssentialToggle.svelte      # Needs vs wants toggle
│   │   │   ├── SubscriptionFields.svelte   # Subscription toggle + frequency
│   │   │   └── insights/              # Insight components
│   │   │       ├── InsightGroup.svelte
│   │   │       ├── InsightMetric.svelte
│   │   │       ├── SmartTakeaways.svelte
│   │   │       ├── SpendingThisMonth.svelte
│   │   │       ├── YTDSummary.svelte
│   │   │       ├── YTDStats.svelte
│   │   │       ├── NeedsWantsInsights.svelte
│   │   │       ├── RecurringInsights.svelte
│   │   │       ├── CategoryDeepDives.svelte
│   │   │       ├── CategoryComparison.svelte
│   │   │       ├── CategoryTrendsChart.svelte
│   │   │       ├── SavingsRateChart.svelte
│   │   │       └── CalendarHeatmap.svelte
│   │   ├── utils/
│   │   │   ├── import.ts          # Excel import
│   │   │   ├── export.ts          # CSV/JSON export
│   │   │   ├── category-helpers.ts
│   │   │   ├── chart-theme.ts     # Chart.js theme configuration
│   │   │   ├── date-helpers.ts
│   │   │   ├── debug.ts           # Debugging utilities
│   │   │   ├── string-helpers.ts
│   │   │   ├── focus-trap.ts      # Modal focus trapping utility
│   │   │   └── form-validation.ts # Shared form validation helpers
│   │   └── assets/
│   │       └── favicon.svg
│   ├── routes/
│   │   ├── +layout.svelte    # App shell with SideNav
│   │   ├── +layout.ts
│   │   ├── +page.svelte      # Dashboard
│   │   ├── budget/+page.svelte
│   │   ├── insights/+page.svelte
│   │   ├── shared/+page.svelte
│   │   └── settings/+page.svelte
│   └── tests/
│       └── setup.ts          # Vitest test setup
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs            # Tauri plugins setup
│   ├── capabilities/
│   │   └── default.json      # Capability configuration
│   ├── icons/                # App icons (all sizes)
│   ├── tauri.conf.json       # Tauri configuration
│   └── Cargo.toml
├── static/
│   └── robots.txt
├── vite.config.ts
└── vitest.config.ts
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
  isEssential: boolean;           // Needs vs wants
  isSubscription: boolean;        // Recurring subscription payment
  subscriptionFrequency?: 'monthly' | 'annual';
  parentTransactionId?: number;   // Links split children to parent
  isSplitParent?: boolean;        // True if split into children
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

interface CategoryBudget {
  id?: number;
  month: string;           // "YYYY-MM" format
  categoryId: number;      // References Category.id
  budgetAmount: number;    // Target spending limit
  createdAt: Date;
  updatedAt: Date;
}

interface CancelledSubscription {
  merchant: string;        // Normalized merchant name
  cancelledDate: string;   // ISO date string
}

interface Settings {
  id: 1;                   // Singleton
  partnerName: string;
  defaultSplitType: 'percentage' | 'fixed';
  defaultSplitValue: number;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  dismissedRecurring: string[];           // Hidden from recurring detection
  cancelledSubscriptions: CancelledSubscription[];
  confirmedActiveSubscriptions: string[]; // Override staleness detection
  iCloudBackupEnabled: boolean;           // Copy backups to iCloud Drive
}
```

---

## Navigation

**Collapsible Sidebar:**
- Dashboard (home)
- Budget (category budgets)
- Insights (charts & trends)
- Shared (settlement tracking)
- Settings (categories, import/export)

Sidebar state persists to localStorage (`ledger-sidebar-expanded`).

---

## Key Features

### Dashboard
- Cash flow summary (income, saved, available, spent, surplus)
- Collapsible "Add Transaction" form with merchant autocomplete
- Transaction list with search/filters
- Quick-add FAB for fast entry
- Edit/split transaction modals
- Bulk action toolbar for multi-select operations
- Month picker for navigating between months

### Budget
- Per-category budget tracking
- Visual progress bars showing spending vs budget
- Summary card with total budgeted, spent, and remaining
- Alerts for categories approaching or over budget
- Month picker for viewing different months

### Insights
- Smart takeaways with AI-generated highlights
- Category breakdown chart (pie/donut)
- Monthly spending trends
- Needs vs wants analysis
- Year-to-date summary and statistics
- Recurring expense detection with subscription tracking
- Category deep dives and comparisons
- Savings rate visualization
- Calendar heatmap of daily spending

### Shared Expenses
- Outstanding balance with partner
- Unsettled transaction list
- Batch settlement marking

### Settings
- Partner name configuration
- Default split settings
- Category management (add/edit/reorder)
- Excel import / JSON export
- iCloud backup toggle (copies backups to iCloud Drive when enabled)

### Subscriptions
- Mark transactions as subscriptions (monthly/annual)
- Track cancelled subscriptions
- Confirm active subscriptions to override staleness detection

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

## Categories (22 default)

Car, Cash withdrawals, Clothes & accessories, Coffee & snacks, Donations, Electronics, Fitness & wellness, Fun & hobbies, Gas, Gifts, Groceries, Grooming, Health, Home, Household supplies, Insurance, Parking & tolls, Pet, Rent, Restaurants, Travel, Utilities

---

## File Storage Location

macOS: `~/Library/Application Support/app.ledger.desktop/`
- `data.json` - Main data file
- `backups/` - Auto-timestamped backups before each save (max 10, debounced 1 min)

### iCloud Backup (Optional)
When enabled in Settings, backups are also copied to iCloud Drive:
- `~/Library/Mobile Documents/com~apple~CloudDocs/Ledger/ledger-backup.json`
- Single file overwritten on each backup (not versioned in iCloud)
- Requires iCloud Drive to be enabled on the Mac

---

## Dependencies

### Runtime
- `@tauri-apps/plugin-fs` - File system access
- `@tauri-apps/api` - Tauri API
- `dexie` - IndexedDB wrapper
- `chart.js` - Charts
- `chartjs-plugin-annotation` - Chart.js annotation overlays (σ bands, mean lines)
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
