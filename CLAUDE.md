# Ledger - Personal Budget Tracking App

## Overview
A Tauri desktop application for personal budget tracking with expense splitting, category insights, and Venmo settlement tracking. Local-first architecture with all data stored on-device.

Use test-driven development (TDD) best practices when adding new code. Update CLAUDE.md whenever you make relevant changes to any of the areas listed below.

---

## Standard Workflow

Standard workflow after implementation: 1) Run all tests 2) Update relevant documentation 3) Commit with descriptive message 4) Build production app 5) Deploy. Do not skip steps unless explicitly told to.

---

## Code Editing

When editing files with tab indentation (especially Svelte/TSX files), prefer using Bash sed commands over the Edit tool to avoid indentation mismatches and repeated failures.

---

## Build & Deploy

After implementing changes, always clear BOTH frontend build artifacts AND the Rust binary cache before building the Tauri app. Run: `rm -rf src-tauri/target/release/bundle && cargo clean -p ledger && npm run build`

---

## Debugging Philosophy

When debugging, do NOT guess at root causes or explain away user observations. Systematically verify each hypothesis with actual data/logs before proposing a fix. If the first fix doesn't work, step back and re-examine assumptions from scratch.

---

## Python / Environment Rules

Always use Python virtual environments (venv) for any Python package installations. Never install packages globally. Create/activate venv first: `python3 -m venv .venv && source .venv/bin/activate`

---

## Styling / Tailwind

When making CSS/styling changes with Tailwind, verify that the relevant directories are included in the Tailwind content config and that utility classes actually apply at the expected specificity. For Tailwind v4, prefer inline styles or explicit class overrides when utility classes don't take effect.

---

## Active Development

See `PRODUCT_ROADMAP.md` for the full development plan. Groups 1–9 are complete:

1. ~~Data Integrity Hardening~~ — Backup recovery, atomic writes, checksums ✅
2. ~~Savings Goals~~ — Goal tracking with projections ✅
3. ~~Tags System~~ — Hashtag-based tagging via notes field ✅
4. ~~Notifications~~ — Daily reminders, weekly review, monthly budget setup ✅
5. ~~Insights Page Redesign~~ — Tab-based navigation (5 tabs) ✅
6. ~~Undo System~~ — Recoverable deletions with soft delete ✅
7. ~~Design Polish~~ — Accessibility, dark mode, loading states ✅
8. ~~Performance & Tech Debt~~ — N+1 fix, stats dedup, lazy-load, chunk splitting, import/export tests ✅
9. ~~Startup Perf & Search~~ — Redundant DB scan elimination, query parallelization, search/filter enhancements, pagination, lazy emoji picker, migration version stamp ✅

**Recent**: Tag toggle + bulk tag management — Clicking a filtered tag pill now un-filters it (toggle behavior). Bulk select toolbar adds "Tag" button with dropdown for adding/removing tags across selected transactions. New `appendTag()` utility, `bulkAddTag`/`bulkRemoveTag` store operations and dashboard actions.

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
│   │   │   ├── constants.ts  # Type definitions & default data
│   │   │   └── migrations.ts # Database migration logic
│   │   ├── storage/
│   │   │   ├── index.ts      # Storage abstraction layer (UI-agnostic, uses registered callbacks)
│   │   │   ├── types.ts      # StoredData interface
│   │   │   └── tauri-adapter.ts  # File persistence
│   │   ├── config/
│   │   │   └── index.ts          # Centralized configuration constants
│   │   ├── stores/           # Data operations
│   │   │   ├── transactions.ts
│   │   │   ├── transactionCache.ts    # In-memory transaction cache with versioning
│   │   │   ├── categories.ts
│   │   │   ├── settings.ts
│   │   │   ├── budget.ts
│   │   │   ├── categoryBudget.ts   # Per-category budget tracking
│   │   │   ├── savingsAccounts.ts  # Savings account CRUD
│   │   │   ├── savingsContributions.ts  # Contribution tracking + goal projections
│   │   │   ├── merchants.ts
│   │   │   ├── recurring.ts
│   │   │   ├── recurringCache.ts       # Recurring detection cache management
│   │   │   ├── recurringSuggestions.ts  # Monthly recurring transaction suggestions
│   │   │   ├── subscriptionSettings.ts # Cancel/confirm/reactivate subscription state
│   │   │   ├── dashboardActions.ts     # Dashboard transaction CRUD operations
│   │   │   ├── tags.ts              # TagIndex class for tag lookups (incremental + bulk)
│   │   │   ├── tags.svelte.ts       # Reactive TagIndex wrapper ($state version)
│   │   │   ├── selectedMonth.ts    # UI state for month selection
│   │   │   ├── theme.ts            # Light/dark/system theme
│   │   │   ├── toast.ts            # Toast notification system
│   │   │   └── undo.ts             # Undo store for recoverable deletions
│   │   ├── notifications/        # Native macOS notification system
│   │   │   ├── index.ts          # Public API (init, cleanup)
│   │   │   ├── tauri-notifications.ts  # Tauri plugin wrapper
│   │   │   ├── scheduler.ts      # setInterval-based scheduler
│   │   │   └── app-open-checks.ts # One-shot app-open fallback
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
│   │   │       ├── month-review.ts   # End-of-month spending review calculations
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
│   │   │   ├── ModalContainer.svelte     # Reusable modal wrapper (focus trap, backdrop)
│   │   │   ├── ToastContainer.svelte
│   │   │   ├── EmptyState.svelte
│   │   │   ├── Skeleton.svelte
│   │   │   ├── ChartWrapper.svelte
│   │   │   ├── SharedExpenseFields.svelte  # Shared expense toggle + split options
│   │   │   ├── EssentialToggle.svelte      # Needs vs wants toggle
│   │   │   ├── SubscriptionFields.svelte   # Subscription toggle + frequency
│   │   │   ├── SavingsAccountCard.svelte   # Individual savings account display
│   │   │   ├── AddContributionModal.svelte # Add savings contribution
│   │   │   ├── EditContributionModal.svelte # Edit/delete contribution
│   │   │   ├── AddAccountModal.svelte      # Add savings account
│   │   │   ├── EditAccountModal.svelte     # Edit savings account/balance
│   │   │   ├── RecurringSuggestionsBanner.svelte  # Banner for recurring suggestions
│   │   │   ├── RecurringSuggestionsModal.svelte   # Modal to review/add recurring
│   │   │   ├── DashboardInsightWidget.svelte      # Quick insight widget for dashboard
│   │   │   ├── TagPill.svelte             # Tag pill display with hover popover
│   │   │   ├── TagPopover.svelte          # Tag hover popover (total + count)
│   │   │   ├── TagAutocomplete.svelte     # Tag autocomplete for notes input
│   │   │   ├── WeekInReviewCard.svelte    # Week in Review dashboard card
│   │   │   ├── KeyboardShortcuts.svelte  # Global keyboard shortcut handler
│   │   │   ├── __tests__/             # Component test utilities
│   │   │   │   ├── setup.ts
│   │   │   │   └── test-utils.test.ts
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
│   │   │       ├── SavingsInsights.svelte      # Savings breakdown and trends
│   │   │       ├── SavingsRateTrendChart.svelte # Savings rate over time
│   │   │       ├── CalendarHeatmap.svelte
│   │   │       ├── InsightTabs.svelte         # Pill tab bar for insights navigation
│   │   │       ├── QuickStatsRow.svelte       # Overview tab quick stats (total, budget, savings rate)
│   │   │       └── NeedsWantsTrendChart.svelte # Needs/wants % trend line chart
│   │   ├── utils/
│   │   │   ├── currency.ts            # Currency/percentage utilities (rounding, comparison)
│   │   │   ├── budget-status.ts       # Budget status calculation (under/approaching/at/over)
│   │   │   ├── budget-alerts.ts       # Budget alert message generation
│   │   │   ├── dashboard-insight.ts   # Dashboard insight widget calculations
│   │   │   ├── format-helpers.ts      # Currency/percentage display formatting
│   │   │   ├── import.ts              # Excel import
│   │   │   ├── export.ts              # CSV/JSON export
│   │   │   ├── category-helpers.ts
│   │   │   ├── chart-theme.ts         # Chart.js theme configuration
│   │   │   ├── date-helpers.ts        # Date parsing, filterUpToDate
│   │   │   ├── string-helpers.ts      # Merchant normalization, subscription keys, supersession
│   │   │   ├── focus-trap.ts          # Modal focus trapping utility
│   │   │   ├── modal-helpers.ts       # Modal event handlers (backdrop click, escape key)
│   │   │   ├── form-validation.ts     # Shared form validation helpers
│   │   │   ├── transaction-validation.ts  # Transaction data validation
│   │   │   ├── transaction-grouping.ts    # Group transactions by date/category
│   │   │   ├── trie.ts                # Trie for merchant autocomplete
│   │   │   ├── pagination.ts          # List pagination utilities
│   │   │   ├── retry.ts               # Async retry with backoff
│   │   │   ├── tags.ts                # Tag parsing, replace, strip, append, total calculation
│   │   │   ├── errors.ts              # Error class definitions & type guards
│   │   │   ├── error-handler.ts       # Centralized error handler (logging + toast)
│   │   │   ├── week-in-review.ts      # Week in Review calculations + dismiss logic
│   │   │   └── debug.ts               # Debugging utilities
│   │   └── assets/
│   │       └── favicon.svg
│   ├── routes/
│   │   ├── +layout.svelte    # App shell with SideNav
│   │   ├── +layout.ts
│   │   ├── +page.svelte      # Dashboard
│   │   ├── budget/+page.svelte
│   │   ├── savings/+page.svelte  # Savings tracking
│   │   ├── insights/+page.svelte
│   │   ├── shared/+page.svelte
│   │   └── settings/+page.svelte
│   └── tests/
│       ├── setup.ts          # Vitest test setup
│       ├── stores/           # Store integration tests
│       │   ├── dashboardActions.test.ts
│       │   ├── recurringCache.test.ts
│       │   ├── recurringSuggestions.test.ts
│       │   ├── splitTransaction.test.ts   # Split transaction edge cases
│       │   ├── subscriptionSettings.test.ts
│       │   ├── tagIndex.test.ts           # TagIndex incremental add/remove/update
│       │   └── tagOperations.test.ts      # Tag rename/delete batch operations
│       └── utils/            # Utility tests
│           ├── cash-flow.test.ts          # Cash flow + total spent calculations
│           ├── dashboard-insight.test.ts  # Budget status edges + pace warning
│           ├── error-handler.test.ts
│           ├── export.test.ts
│           ├── import.test.ts
│           ├── stats.test.ts
│           ├── string-helpers.test.ts
│           ├── tags.test.ts               # appendTag utility tests
│           └── week-in-review.test.ts     # Week in Review calculations + dismiss
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
  subscriptionFrequency?: 'monthly' | 'semi-annual' | 'annual';
  parentTransactionId?: number;   // Links split children to parent
  isSplitParent?: boolean;        // True if split into children
  notes?: string;
  isDeleted?: boolean;            // Soft delete flag (for undo support)
  deletedAt?: Date;               // When transaction was soft-deleted
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
  savedAmount: number;     // DEPRECATED: Use SavingsContribution instead
  notes?: string;
}

type SavingsAccountType = 'savings' | 'retirement' | 'investment';

type ContributionSource =
  | 'payroll_deduction'    // Pre-tax (doesn't affect available)
  | 'bank_transfer'        // From checking (affects available)
  | 'interest'             // Interest earned (doesn't affect available)
  | 'employer_match'       // 401k match (doesn't affect available)
  | 'other';               // Other source (affects available)

// CONTRIBUTION_SOURCES constant provides labels, descriptions, and affectsAvailable flags
// Use: import { CONTRIBUTION_SOURCES } from '$lib/db';

interface SavingsAccount {
  id?: number;
  name: string;
  accountType: SavingsAccountType;
  icon?: string;           // Emoji
  color?: string;          // Hex color
  sortOrder: number;
  currentBalance?: number; // Only tracked for 'savings' type
  targetAmount?: number;   // Goal target (e.g., $10,000)
  targetDate?: Date;       // Goal deadline (e.g., Dec 31, 2026)
  createdAt: Date;
  updatedAt: Date;
}

interface SavingsContribution {
  id?: number;
  date: Date;
  accountId: number;       // References SavingsAccount.id
  amount: number;
  source: ContributionSource;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
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
  amount?: number;         // When set, cancellation targets this specific subscription amount
}

interface CompletedGoal {
  accountName: string;     // Name of the savings account
  targetAmount: number;    // Goal target that was reached
  completedDate: string;   // ISO date string
  icon?: string;           // Preserved for display
  color?: string;
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
  lastAutoSuggestedMonth?: string;        // "YYYY-MM" - tracks recurring suggestion dismissal
  completedGoals: CompletedGoal[];        // Archived savings goals that have been completed
  notificationsEnabled: boolean;          // Master toggle (opt-in, default false)
  dailyReminderEnabled: boolean;          // Daily expense reminder (default true)
  dailyReminderTime: string;             // "HH:MM" 24h format (default "20:00")
  weeklyReviewEnabled: boolean;           // Monday 9am review prompt (default true)
  monthlyBudgetSetupEnabled: boolean;     // 1st-of-month budget prompt (default true)
  migrationVersion?: number;              // Tracks applied migrations (skip all if current); currently v11
}
```

---

## Navigation

**Collapsible Sidebar:**
- Dashboard (home)
- Budget (category budgets)
- Savings (contribution tracking)
- Insights (charts & trends)
- Shared (settlement tracking)
- Settings (categories, import/export)

Sidebar state persists to localStorage (`ledger-sidebar-expanded`).

---

## Key Features

### Dashboard
- Cash flow summary (income, saved, available, spent, surplus)
- Collapsible "Add Transaction" form with merchant autocomplete
- Transaction list with search/filters (searches merchant names and notes), amount range filter, progressive pagination (50 at a time)
- Quick-add FAB for fast entry
- Edit/split transaction modals
- Bulk action toolbar for multi-select operations
- Month picker for navigating between months
- **Quick Insight Widget**: Single rotating insight above cash flow card
  - Priority order: budget alert (>90%) → pace warning → all on track → transaction count
  - Clickable to navigate to Budget or Insights page
  - Dismiss button hides for 24 hours (localStorage)
  - Configurable thresholds in `config.dashboardInsight`
- **Recurring suggestions banner**: Prompts to add expected recurring transactions at start of month
  - Two-step flow: selection → confirmation with editable dates/amounts
  - Merges detected recurring with user-tagged subscriptions
  - Filters by frequency (monthly/semi-annual/annual)
  - Persists until all added or user defers to next month

### Budget
- Per-category budget tracking
- Visual progress bars showing spending vs budget
- Summary card scoped to budgeted categories: total budgeted, spent (with % of budget), remaining
  - Inline progress bar fills remaining horizontal space in the metrics row
  - Unbudgeted spending callout (count + amount of categories without budgets)
  - Income allocation stacked bar (savings, budgeted, unallocated) — shown when income is set
  - Uses `sumCurrency()`/`roundCurrency()` for all aggregations
- Alerts for categories approaching or over budget
- Month picker for viewing different months

### Savings
- Track contributions to savings, retirement, and investment accounts
- Multiple account types: savings (balance tracked), retirement, investment
- Contribution sources: bank transfer, payroll deduction, interest, employer match
- Only bank transfers and "other" reduce available to spend
- Account cards with contribution history
- **Goal tracking**: Set target amount and target date for savings accounts
  - Progress bar visualization with percentage complete
  - Projected completion date based on average monthly contribution (6-month rolling)
  - On-track/behind-pace status with recommended monthly contribution
  - Goal insights integration showing X of Y goals on track
- Savings rate calculation based on contributions
- Integration with Dashboard (available = income - savings contributions)

### Insights
- **Tab-based architecture** with 5 tabs: Overview, Spending, Savings, Recurring, Year in Review
  - Selected tab persisted to localStorage (`ledger-insights-tab`)
  - Month picker remains global, applies to all tabs
- **Overview tab**: Smart Takeaways (forward-looking current month / retrospective past month), Quick Stats Row (total spent, budget status, savings rate)
  - Highlights: pace projection, anomalies (with dollar amounts), category shifts
  - Pace projection and velocity exclude future-dated transactions via `filterUpToDate()`
  - Month in Review (past months): hero stat + grouped insights with 12-month rolling window
  - Hero priority chain: rank superlative → goal completion → savings highest → vs-average → rank quartile → savings above avg → category standout → total
  - Anomalies show dollar context ($current vs $avg avg), vs-average shows typical month amount + sample size
  - Budget context in spending group: over/under count for budgeted categories
  - Needs/wants only shown when skewed (>75% or <25%), with descriptive prefix
  - Positive-only savings insights (never flags low rates due to paycheck timing)
- **Spending tab**: Total + velocity, top 5 merchants, shared vs personal breakdown, category breakdown chart, category deep dives with trend charts, month-over-month comparison
  - Variability classification (Steady/Moderate/Variable) uses only completed months
    — current calendar month excluded to prevent partial-month distortion of weighted stats
- **Savings tab**: Contribution breakdown by account/source, goal progress, savings rate trend chart
- **Recurring tab**: Active subscriptions, upcoming annual renewals, possibly inactive alerts, detected recurring bills
- **Year in Review tab**: Calendar heatmap, best/worst spending months, needs vs wants with trend chart, tag spending summary, shared expense annual summary, YTD stats

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

### Tags
- Hashtag-based tagging in transaction notes field (e.g. `#vacation`, `#italy-trip`)
- Tag format: letters, numbers, hyphens; must start with letter or number
- Tag pills displayed on transactions with click-to-filter toggle behavior (click to filter, click again to un-filter)
- **Tag popover**: Hover a tag pill to see total spent (user's share) and transaction count
- **Tag filtering**: Filter transactions by one or more tags in the advanced filters panel
- **Manage tags**: Inline section in filters panel to rename or delete tags across all transactions
  - Rename: batch-updates all transaction notes replacing `#oldtag` with `#newtag`
  - Delete: strips `#tag` from all matching transaction notes
- **Tag autocomplete**: Suggests existing tags when typing `#` in notes input
- Helper text below notes input clarifies tag format rules
- **Bulk tag management**: Add or remove tags from multiple selected transactions via BulkActionBar
  - Tag button in bulk action bar with dropdown: text input for new tags + existing tag list
  - Each existing tag has + (add) and − (remove) action buttons
  - Uses `appendTag()` (idempotent add) and `stripTag()` (remove) utilities
- Tag index (`TagIndex` class) provides fast lookups, rebuilt from transaction cache

### Notifications
- Native macOS notifications via Tauri plugin (opt-in)
- **Daily expense reminder**: Fires at configured time if no transactions logged today (schedule-only)
- **Weekly review prompt**: Monday mornings (schedule + app-open fallback)
- **Monthly budget setup prompt**: 1st of month (schedule + app-open fallback, catches up on 2nd+)
- Scheduler uses `setInterval` (60s tick) with localStorage for last-fired tracking
- App stays alive in dock when window is closed (Cmd+W hides, Cmd+Q quits)
- Permission requested on first enable; silently disables if OS permission revoked

### Subscriptions
- Mark transactions as subscriptions (monthly/semi-annual/annual)
- Track cancelled subscriptions
- Confirm active subscriptions to override staleness detection
- **Multiple subscriptions per merchant**: Same merchant with different amounts (e.g., Apple iCloud $2.99 + Apple Music $2.16) tracked independently using composite key `merchant|amount` via `subscriptionKey()` from `string-helpers.ts`
- **Supersession detection**: `findSupersededSubscriptionKeys()` identifies price changes (old amount stops before new amount starts) vs concurrent subscriptions (charges overlap). Old prices are automatically filtered from the active subscription list.
- Cancellations with `amount` target a specific subscription; without `amount` they cancel all subscriptions from that merchant (backward compatible)
- Staleness thresholds configurable in `config.subscription` (60 days monthly, 8 months semi-annual, 13 months annual)

### Undo System
- Recoverable deletions with 5-second undo window
- **Soft delete pattern**: Deleted transactions marked with `isDeleted: true` rather than hard delete
- Toast notification with "Undo" action button and countdown progress bar
- Singleton behavior: new deletes replace previous undo toast
- **Startup cleanup**: Soft-deleted transactions permanently purged on app launch
- Survives app crashes during undo window (transactions can be recovered until next app launch)
- Integrated with both single and bulk delete operations

---

## localStorage Keys

UI state persisted across sessions:
- `ledger-sidebar-expanded` - Sidebar collapse state
- `ledger-cashflow-expanded` - Cash flow card state
- `ledger-addform-expanded` - Transaction form state
- `ledger-insight-{title}` - Each insight group state
- `ledger-dashboard-insight-dismissed` - Dashboard insight widget dismiss timestamp
- `ledger-insights-tab` - Selected insights tab
- `ledger-notif-daily-last-fired` - Daily notification last-fired date ("YYYY-MM-DD")
- `ledger-notif-weekly-last-fired` - Weekly notification last-fired date ("YYYY-MM-DD")
- `ledger-notif-monthly-last-fired` - Monthly notification last-fired month ("YYYY-MM")
- `ledger-week-review-dismissed` - Week in Review dismiss date (this Monday's "YYYY-MM-DD")

---

## Currency & Percentage Handling

To avoid floating-point precision issues, use the utilities in `src/lib/utils/currency.ts`:

### Currency Functions
```typescript
import { roundCurrency, currencyEquals, isZeroCurrency, sumCurrency, isSplitBalanced, roundCoefficient } from '$lib/utils/currency';

// Round to 2 decimal places
roundCurrency(33.333)     // 33.33

// Compare with tolerance (0.005)
currencyEquals(10.0, 10.001)  // true

// Check if effectively zero
isZeroCurrency(0.001)     // true

// Sum with final rounding
sumCurrency([0.1, 0.2])   // 0.30

// Validate split transactions
isSplitBalanced(remaining) // true if ~0

// Round coefficients/ratios (default 4 decimals)
roundCoefficient(0.12345678)     // 0.1235
roundCoefficient(0.12345678, 2)  // 0.12
```

### Percentage Functions
```typescript
import { calculatePercent, percentExceeds, percentMeetsOrExceeds } from '$lib/utils/currency';

// Calculate percentage (optionally rounded)
calculatePercent(85, 100)       // 85
calculatePercent(1, 3, true)    // 33 (rounded)

// Compare percentages (use raw values)
percentExceeds(81, 100, 80)     // true (81% > 80%)
percentMeetsOrExceeds(80, 100, 80)  // true (80% >= 80%)
```

### Key Conventions
1. **Round at calculation time**, not display time
2. Use `roundCurrency()` instead of `Math.round(value * 100) / 100`
3. For threshold comparisons, compare raw values first, then round for display
4. Use `CURRENCY_EPSILON` (0.005) for tolerance-based comparisons
5. When displayed values don't match internal calculations, round both to the same precision
6. Use `roundCoefficient()` for ratios/coefficients (variance, percentages as decimals) - NOT `roundCurrency()`

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
