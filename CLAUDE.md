# Ledger — Personal Budget Tracking App

Tauri + SvelteKit desktop app (macOS-only) for personal budget tracking: expense splitting, category insights, savings goals, net worth, and Venmo settlement tracking. Local-first — all data lives on-device.

Use TDD for new code. **Update this file whenever you change a documented area.** Plans live in `PRODUCT_ROADMAP.md` and `NET_WORTH_PLAN.md`; git history is the full changelog.

---

## Working Agreements

- **Standard workflow** after implementing: 1) run all tests 2) update docs 3) commit (descriptive message) 4) build production app 5) deploy. Don't skip unless told.
- **Build & deploy**: clear BOTH frontend and Rust caches before building: `rm -rf src-tauri/target/release/bundle && cargo clean -p ledger && npm run build`.
- **Editing tab-indented files** (Svelte/TSX): the codebase uses real tab characters. Prefer `sed`/Python over the Edit tool to avoid indentation mismatches.
- **Debugging**: never guess at root causes or explain away user observations. Verify each hypothesis with real data/logs before proposing a fix; if the first fix fails, re-examine assumptions from scratch.
- **Python**: always use a venv (`python3 -m venv .venv && source .venv/bin/activate`); never install globally.
- **Tailwind v4**: verify directories are in the content config and that classes apply at expected specificity; prefer inline styles / explicit overrides when utilities don't take effect.

---

## Status

Roadmap groups 1–9 complete: data-integrity hardening, savings goals, tags, notifications, insights redesign, undo system, design polish, performance/tech-debt, startup perf & search. Shipped since: Net Worth page + SimpleFIN sync, budget rollover, trust/insight features (stale-ledger nudge, report cards, variance card), menu-bar quick add, and an app-wide design-language refresh. See the feature sections below for current behavior.

---

## Stack

- **SvelteKit** (Svelte 5 runes: `$state`/`$derived`/`$props`, file-based routing) + **Tauri v2** (Rust backend). macOS desktop only.
- **Storage**: Dexie (in-memory IndexedDB, cleared on startup) for queries; JSON files are the source of truth in `~/Library/Application Support/app.ledger.desktop/` (`data.json` + `backups/`, max 10).
- **UI**: Tailwind v4 (`@tailwindcss/vite`, CSS-first config via `@theme` in `app.css`); "Warm Ledger" terracotta/cream design system.
- **Charts**: Chart.js (+ `chartjs-plugin-annotation` for σ bands / mean lines).
- **Other runtime deps**: `date-fns`, `lucide-svelte`, `exceljs` (Excel import). Full list in `package.json`.

---

## Design System

```css
--color-primary-500: #C45D3A;  --color-primary-600: #B5522F;  /* Terracotta */
--color-cream: #FAF8F5;         --color-charcoal: #2D2A26;
--color-success-500: #5B8C5A;   /* Sage */   --color-warning-500: #D4915D;  /* Amber */
--color-danger-500: #C17B7B;    /* Muted rose */
--color-shadow: rgba(45,42,38,0.12);          /* charcoal-tinted, not cool gray */
```

- **Type**: Fraunces (display/headings), Instrument Sans (body), DM Mono (amounts).
- **Tokens over hardcoded values**: use `bg-surface-alt`, `border-theme`, `text-charcoal-muted`, `bg-cream` (theme-aware) instead of raw Tailwind grays / `rgba()`.
- **Emoji policy**: category/account emoji appear ONLY in selection contexts (pickers, form dropdowns, CategoryChipPicker), the treemap, and CategoryManager. Every display row (dashboard, Shared, Budget, Savings, insights) uses a small full-color dot + name instead.
- **Cards**: one card per date with dashed hairline dividers; 12%-alpha tinted category chips (`.category-chip`); quiet sentence-case `.badge` pills; hover/`focus-within`-revealed row actions.

---

## Structure

```
src/lib/
  db/            # Dexie schema (index.ts), type defs + defaults (constants.ts), migrations.ts
  storage/       # UI-agnostic abstraction (index.ts) + tauri-adapter.ts (file persistence; queued/coalesced
                 #   saves) + serialization.ts (single hydrate/dehydrate for all tables); types.ts = StoredData
  config/        # Centralized constants (insights pace, subscription staleness thresholds, …)
  stores/        # Data ops: transactions(+Cache), categories, settings, budget, categoryBudget,
                 #   savings{Accounts,Contributions}, linkedAccounts (net worth; recordBalance = 1 snapshot/account/day),
                 #   merchants, recurring(+Cache,Suggestions), subscriptionSettings, dashboardActions,
                 #   tags(+.svelte reactive), selectedMonth, shortcuts (kbd handler registry), theme, toast, undo
  notifications/ # Tauri-plugin scheduler (setInterval 60s tick) + one-shot app-open fallback checks
  insights/      # Memoized engine (getInsightsEngine) + pure calculations/ (spending, needs-wants,
                 #   anomalies, category-shift, pace-projection, velocity, top-merchant, ytd-stats, month-review, stats)
  components/    # ~60 Svelte components incl. insights/ and settings/ subfolders; key behaviors documented below
  utils/         # currency, budget-{status,alerts,rollover}, date-helpers (filterUpToDate),
                 #   string-helpers (merchant norm, subscriptionKey, supersession), tags, net-worth,
                 #   transaction-grouping (buildListRows/groupRowsByDate), import/export, errors, report-cards
src/routes/      # +layout (app shell + quick-add submit listener) + pages: dashboard (+page),
                 #   budget, savings, insights, networth, shared, settings, quick-add
src/tests/       # Vitest specs under stores/ and utils/
src-tauri/src/   # main.rs; lib.rs (plugins, tray/quick-add window toggle, invoke_handler); simplefin.rs
```

---

## Data Schema

Source of truth: `src/lib/db/constants.ts`. Core shapes:

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
  isEssential: boolean;            // needs vs wants
  isSubscription: boolean;
  subscriptionFrequency?: 'monthly' | 'semi-annual' | 'annual';
  parentTransactionId?: number;    // links split children to parent
  isSplitParent?: boolean;
  notes?: string;                  // also holds #hashtags
  isDeleted?: boolean;             // soft delete (undo support)
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface Category {
  id?: number; name: string; icon?: string; color?: string;
  isActive: boolean; sortOrder: number; isEssential: boolean;
}

interface MonthlyBudget {
  id?: number; month: string;  // "YYYY-MM"
  income: number;
  savedAmount: number;         // DEPRECATED → use SavingsContribution
  notes?: string;
}

type SavingsAccountType = 'savings' | 'retirement' | 'investment';
type ContributionSource =
  | 'payroll_deduction' | 'interest' | 'employer_match'  // don't affect available
  | 'bank_transfer' | 'other';                           // affect available
// CONTRIBUTION_SOURCES (from '$lib/db') has labels, descriptions, affectsAvailable flags.

interface SavingsAccount {
  id?: number; name: string; accountType: SavingsAccountType;
  icon?: string; color?: string; sortOrder: number;
  currentBalance?: number;   // 'savings' type only
  targetAmount?: number; targetDate?: Date;   // goal
  createdAt: Date; updatedAt: Date;
}

interface SavingsContribution {
  id?: number; date: Date; accountId: number; amount: number;
  source: ContributionSource; notes?: string; createdAt: Date; updatedAt: Date;
}

interface CategoryBudget {
  id?: number; month: string; categoryId: number; budgetAmount: number;
  rollsOver?: boolean;       // undefined = off (no migration needed)
  createdAt: Date; updatedAt: Date;
}

interface CancelledSubscription { merchant: string; cancelledDate: string; amount?: number; }
interface CompletedGoal { accountName: string; targetAmount: number; completedDate: string; icon?: string; color?: string; }

interface Settings {
  id: 1;                     // singleton
  partnerName: string;
  defaultSplitType: 'percentage' | 'fixed';
  defaultSplitValue: number;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  dismissedRecurring: string[];
  cancelledSubscriptions: CancelledSubscription[];
  confirmedActiveSubscriptions: string[];
  iCloudBackupEnabled: boolean;
  lastAutoSuggestedMonth?: string;       // "YYYY-MM"
  completedGoals: CompletedGoal[];
  notificationsEnabled: boolean;         // master toggle, opt-in (default false)
  dailyReminderEnabled: boolean;         // default true
  dailyReminderTime: string;             // "HH:MM" 24h (default "20:00")
  weeklyReviewEnabled: boolean;          // Mon 9am (default true)
  monthlyBudgetSetupEnabled: boolean;    // 1st of month (default true)
  migrationVersion?: number;             // currently v11; skip all if current
}
```

Net worth uses separate tables `linkedAccounts` / `balanceSnapshots` (`LinkedAccount` / `BalanceSnapshot`, Dexie v5) — see Net Worth feature.

**Migration persistence**: migrations that create/modify records MUST `saveToFile()` after running (Dexie is cleared every startup).

---

## Features

**Navigation** — collapsible sidebar (state in `ledger-sidebar-expanded`): Dashboard, Budget, Savings, Insights, Net Worth (⌘6), Shared, Settings. ⌘1–5/⌘N/⌘K work app-wide via the layout-mounted `KeyboardShortcuts` + `stores/shortcuts.ts` handler registry. Pages use in-content Fraunces titles (no HeaderNav).

### Dashboard
- Two-column (`max-w-6xl`): ledger main column + sticky right rail (Cash Flow, Week in Review, Top Categories). Month name is the title and the picker (`MonthPicker variant="title"`).
- **One add entry point**: "Add" button / ⌘N → `AddTransactionModal` (wraps the full `TransactionForm`: split, shared, subscription, tags).
- Transaction list: search (merchant + notes) + amount-range + advanced filters, 50-row progressive pagination. Sticky Transactions heading + toolbar (`bind:clientHeight` → `toolbarHeight`); date headers stick below via `stickyOffset`.
- Day-grouped cards: sticky date headers with day totals (your share); shared rows show your share primary with "of $full" beneath; monthly/semi-annual subs show a ↻ icon.
- **Upcoming hidden by default**: future-dated rows behind a "Show N upcoming" toggle (`ledger-show-upcoming`); skipped when viewing a future month.
- **Split nesting**: children (same `parentTransactionId`) collapse into one summary row (merchant + Split badge + total + your-share) with a chevron to expand. Grouping/pagination at the row level so a split never splits across a page; groups with <2 visible children fall back to a plain row; selection mode renders flat. Summary row has group Edit (`EditSplitModal` → `updateSplitGroup()`: keeps hidden parent, recreates children, total = sum of lines) and Delete (`onDeleteSplit(childIds)` → soft-delete with undo).
- **Recurring suggestions banner** (start of month): two-step selection → confirmation with editable dates/amounts; merges detected recurring with user-tagged subs; persists until added or deferred.

### Budget
- Per-category tracking with progress bars; summary card (total budgeted, spent + % of budget, remaining, unbudgeted callout, income-allocation stacked bar when income set). Alerts for approaching/over budget. Month picker.
- **Rollover** (opt-in per category-month, ↻ toggle): surpluses on `rollsOver` rows chain into the same category's later months (gap or flag-off breaks the chain; 24-month cap). **Deficits never reduce a category** — last month's overspend is pooled into `deficitCarried` (one-month memory). Math in `utils/budget-rollover.ts` (`computeEffectiveBudgets`, returns `carryoverTotal`/`deficitCarried`/`effectiveTotal`), via `getEffectiveBudgetsForMonth()`; flag set by `setCategoryBudgetRollover()`, propagated by Copy from Last Month. Effective budgets flow to cards/metrics/alerts/insights. Display: summary card shows base Total Budgeted with explicit adjustment lines (+ rolled over, − prev-month overspend, = "This month's budget"); category cards show ↻ whenever the row rolls over plus an "incl. $X rollover" subline under `spent / effective`; the income-allocation bar intentionally keeps BASE totals. When a carryover exists, the card's inline editor shows/accepts the MONTH TOTAL (base + rollover) with a live "→ $X budget" hint; save converts via `baseFromEffective()` (clamped at 0 so a cap below the carryover keeps the row — and the chain — alive).

### Savings
- Track contributions to savings/retirement/investment accounts; only `bank_transfer` and `other` reduce available-to-spend. Account cards with contribution history; savings-rate calc; Dashboard integration (available = income − savings contributions).
- **Goals**: target amount + date → progress bar, projected completion (6-month rolling avg), on-track/behind status with recommended monthly contribution.

### Insights — 5 tabs (Overview, Spending, Savings, Recurring, Year in Review)
- Tab persisted (`ledger-insights-tab`); arrow-key roving tabindex; lazy tabs show skeletons. Global month picker (hidden on Recurring; Year in Review follows the selected year, clamped to Dec 31 for past years).
- **Overview**: Smart Takeaways (forward-looking current / retrospective past month), Quick Stats Row (total, budget, savings rate), **What Changed** (`VarianceBreakdown`: per-category deltas vs each category's 6-month **median** "typical month", day-clipped — median avoids one-off spikes inflating the baseline; anomalous rows get an "Unusual" badge via `detectAnomalies`; rows jump to the category's Deep Dive — the single home for change detection), **Wealth card** (`NetWorthOverviewCard`: net worth, monthly delta, runway = liquid ÷ 6-month avg spend; liquid = checking + savings + investment, retirement/other excluded). Highlights: pace projection, savings wins, goal completions, velocity, needs/wants, top merchant. Pace projection + velocity exclude future-dated rows (`filterUpToDate`); pace suppressed early in the month (config `pace.minMonthFraction`, default 0.25 ≈ day 8).
- **Spending**: total + velocity, top 5 merchants (open `ReportCardModal`), shared-vs-personal, treemap, category deep dives + trend charts, MoM comparison, needs-vs-wants. Variability classification uses completed months only.
- **Savings**: contribution breakdown by account/source, goal progress, savings-rate trend chart.
- **Recurring**: active subscriptions, upcoming annual renewals, possibly-inactive alerts, detected recurring bills.
- **Year in Review**: calendar heatmap, best/worst months, tag summary (open tag report cards), shared annual summary, YTD stats, `NetWorthYearCard` (delta since year start / first record, $10k milestone crossings).
- Monthly Trends chart overlays an income line when `MonthlyBudget.income` is set (`incomeByMonth` prop).

### Shared Expenses
Outstanding balance with partner ("{partner} owes you" hero), unsettled list with category chips, batch settlement marking.

### Settings
Sticky section nav (Expense Sharing / Appearance / Notifications / Keyboard Shortcuts / Categories / Data & Backup / About; persists to `ledger-settings-section`): partner name, default split, category management, Excel import / JSON export, iCloud backup toggle, Connected Accounts (SimpleFIN).

### Tags
Hashtags in the notes field (`#vacation`; letters/numbers/hyphens, must start alphanumeric). Pills with click-to-filter toggle + hover popover (total your-share + count). Filter by multiple tags; inline rename/delete across all transactions; autocomplete on `#`. Bulk add/remove via BulkActionBar (`appendTag()` idempotent add, `stripTag()` remove). `TagIndex` (rebuilt from the transaction cache) provides fast lookups.

### Net Worth (`/networth`, ⌘6)
- Hero total + 30-day delta over an area chart (assets/liabilities sub-line when debt exists); accounts split into Assets/Liabilities with collapsible per-type subgroups (`ledger-networth-collapsed`); health badges (Manual/Synced green, Stale amber, Sync error red); hover reorder/edit; rail breakdown by type (liabilities negative) + SimpleFIN card.
- Account class derived from type (`accountClassForType`): credit/loan → liability, else asset. Sync normalizes liability balances with `Math.abs` (SimpleFIN reports debt negative; model stores amount owed positive, class carries the sign).
- **Intent vs actual (critical)**: `LinkedAccount` (actual balances) is deliberately separate from `SavingsAccount` (intent: contributions, goals). Synced balances must NEVER write to `SavingsAccount.currentBalance` — it would corrupt the "planned as spent" signal and goal math. See `NET_WORTH_PLAN.md` §7.
- **Snapshots**: `recordBalance()` updates `currentBalance` AND upserts that day's `BalanceSnapshot` (max one/account/day; same-day overwrites). Manual edits flow through it. Series math in `utils/net-worth.ts` (forward-fill per account).
- **SimpleFIN (read-only)**: Rust commands in `simplefin.rs`; the access URL lives ONLY in the macOS Keychain (`app.ledger.desktop.simplefin`) — JS never sees it, so it can't reach `data.json` or backups. Link in Settings → Connected Accounts. Sync: app-open max once/day (`ledger-simplefin-last-sync`) + manual Refresh; per-account failures mark error/stale without blocking others.

### Menu-bar Quick Add
- Tray icon (left-click) toggles a small always-on-top `quick-add` window rendering the full `TransactionForm`. Icon is a monochrome template glyph (`icons/tray.png`, `icon_as_template(true)`; needs the `image-png` cargo feature).
- **Single-writer rule**: both windows share one IndexedDB origin. The quick window READS categories/settings/merchants from shared Dexie but NEVER calls `initializeStorage()` and never writes. Submits emit `ledger://quick-add-submit` (date as ISO string); the main window's layout listener performs the add, toasts, and dispatches the `ledger:transactions-changed` DOM event so the dashboard refreshes.
- Layout renders a bare shell for `/quick-add` (no SideNav/KeyboardShortcuts) and skips purge + notification effects. Rust `SUPPRESS_NEXT_ACTIVATE` atomic stops the activation observer from popping the main window; CloseRequested hides (not closes) the quick window.

### Notifications (opt-in, native macOS via Tauri plugin)
Daily expense reminder (configured time, if nothing logged today — schedule-only), weekly review (Mon AM, schedule + app-open fallback), monthly budget setup (1st, fallback catches up on 2nd+). `setInterval` 60s tick with localStorage last-fired tracking. App stays in dock when window closed (⌘W hides, ⌘Q quits); silently disables if OS permission revoked.

### Subscriptions
Mark monthly/semi-annual/annual; track cancellations and confirmed-active overrides. **Multiple per merchant** via composite key `merchant|amount` (`subscriptionKey()`). **Supersession** (`findSupersededSubscriptionKeys()`) distinguishes price changes (old stops before new starts) from concurrent subs; old prices auto-filtered. Cancellation with `amount` targets one sub, without cancels all from that merchant. Staleness thresholds in `config.subscription` (60d monthly, 8mo semi-annual, 13mo annual).

### Undo
Recoverable deletions with a 5-second window via soft delete (`isDeleted: true`). Toast with Undo + countdown; singleton (new deletes replace the prior toast). Soft-deleted rows are permanently purged on next app launch (so deletes survive crashes during the window). Covers single + bulk deletes.

---

## localStorage Keys

- `ledger-sidebar-expanded`, `ledger-show-upcoming`, `ledger-networth-collapsed`
- `ledger-stale-nudge-dismissed` (ISO date), `ledger-week-review-dismissed` (this Monday)
- `ledger-simplefin-last-sync` ("YYYY-MM-DD")
- `ledger-insight-{title}`, `ledger-insights-tab`, `ledger-settings-section`
- `ledger-notif-{daily,weekly}-last-fired` ("YYYY-MM-DD"), `ledger-notif-monthly-last-fired` ("YYYY-MM")

---

## Currency & Percentage Handling

Always use `src/lib/utils/currency.ts` to avoid float drift:

- `roundCurrency(v)` — round to 2dp (use instead of `Math.round(v*100)/100`).
- `currencyEquals(a,b)` / `isZeroCurrency(v)` — tolerance `CURRENCY_EPSILON` (0.005).
- `sumCurrency([…])` — sum with final rounding. `isSplitBalanced(remaining)` — split validation.
- `roundCoefficient(v, dp=4)` — for ratios/coefficients, NOT `roundCurrency`.
- `calculatePercent(part, whole, round?)`; `percentExceeds` / `percentMeetsOrExceeds` — compare raw values, round only for display.

Conventions: round at calculation time (not display); for thresholds compare raw then round to display; when displayed and internal values disagree, round both to the same precision.

---

## Development

```bash
npm install
npm run dev          # web only
npm run tauri:dev    # Tauri dev
npm run tauri:build  # production app
npm run test
npm run check        # svelte-check (clean tripwire: 0 errors/warnings)
npm run lint         # eslint (0 errors; each-key/svelte-reactivity surfaced as warnings)
```

CI (GitHub Actions) runs lint + check + tests on ubuntu and clippy `-D warnings` + cargo test on macos. Dependabot watches npm/cargo/actions. Component tests render via `@testing-library/svelte` (vitest resolves the `browser` condition). Tauri ships with a strict CSP (`tauri.conf.json`; dev variant allows Vite HMR).

Build output: `src-tauri/target/release/bundle/macos/Ledger.app` and `.../dmg/Ledger_0.1.0_aarch64.dmg`.

## Tools

`tools/sankey/` — Monarch-style money-flow Sankey generator (self-contained `ledger-sankey.html`, D3 inlined) from live `data.json`. Regenerate: `python3 tools/sankey/gen_sankey.py && open ledger-sankey.html`. Scoped to YTD; see its README.

## Categories (22 default)

Car, Cash withdrawals, Clothes & accessories, Coffee & snacks, Donations, Electronics, Fitness & wellness, Fun & hobbies, Gas, Gifts, Groceries, Grooming, Health, Home, Household supplies, Insurance, Parking & tolls, Pet, Rent, Restaurants, Travel, Utilities.

## File Storage

macOS: `~/Library/Application Support/app.ledger.desktop/` — `data.json` (main) + `data.json.bak` (previous atomic write) + `backups/` (auto-timestamped before each save, max 10, debounced 1 min). Saves are serialized through a coalescing queue (`saveToFile`). Startup recovery order when `data.json` is missing or corrupted: `.bak` first (freshest), then timestamped backups; only a truly empty slate initializes fresh. With iCloud backup enabled, a single `~/Library/Mobile Documents/com~apple~CloudDocs/Ledger/ledger-backup.json` is overwritten each backup (requires iCloud Drive).
