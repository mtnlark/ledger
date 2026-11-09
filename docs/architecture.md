# Ledger architecture and invariants

This describes the current implementation. [AGENTS.md](../AGENTS.md) owns working agreements; [development.md](development.md) owns commands. Types and defaults live in code rather than duplicated interface definitions here.

## Source map

| Area | Entry points and responsibilities |
| --- | --- |
| App shell | `src/routes/+layout.svelte`: startup, save banner, data-replacement remount, notifications, Quick Add listener and launch sync |
| Pages | `src/routes/`: dashboard (`/`), budget, savings, insights, networth, shared, settings and quick-add |
| Database | `src/lib/db/constants.ts`: types/defaults; `index.ts`: schema and write barrier; `migrations.ts`: idempotent data transforms; `settings.ts`: shared singleton writer |
| Persistence | `src/lib/storage/`: mutation queue, status, serialization, checksums/validation, Tauri file adapter, backup/restore and historical repair |
| Data operations | `src/lib/stores/`: transaction/category/budget/savings/linked-account operations; settings, caches, undo and reactive UI state |
| Dashboard and forecast | `src/lib/stores/dashboard.ts`: complete dashboard load; `stores/forecast.ts`: inferred bills; `planning/forecast-index.ts`: refresh-owned purchase lookups; `planning/forecast.ts`: pure estimate; `planning/types.ts` / `validation.ts`: preserved planning data |
| Insights | `src/lib/insights/`: memoized engine and pure `calculations/`; UI in `src/lib/components/insights/` |
| Native services | `src/lib/services/`: SimpleFIN and Quick Add boundaries; `src/lib/notifications/`: scheduling and app-open checks |
| Shared UI | `src/lib/components/`: forms, modals, charts, transaction lists; `settings/`: connected accounts and data reviews |
| Financial helpers | `src/lib/utils/`: currency, dates, validation, purchase grouping, split allocation, rollover, import/export, tags and net worth |
| Desktop shell | `src-tauri/src/lib.rs`: plugins, tray/windows and commands; `simplefin.rs`: HTTP and Keychain; permissions/CSP in `src-tauri/capabilities/default.json` and `tauri.conf.json` |
| Tests | Colocated `src/lib/**/*.test.ts` and integration/rendered tests in `src/tests/`; Rust tests in `simplefin.rs` |

## Persistence lifecycle

The desktop source of truth is `~/Library/Application Support/app.ledger.desktop/data.json`. Dexie provides IndexedDB queries and reactive data while the app runs. It is persistent browser storage, but on native startup its tables are replaced by the selected file snapshot; do not treat it as an independent durable copy.

Normal logical writes go through `runMutation` in [mutation.ts](../src/lib/storage/mutation.ts):

1. Wait for the shared exclusive queue and check the save barrier.
2. Read, validate and write related records inside one Dexie transaction.
3. Track changed tables through the database middleware.
4. After commit, persist the changed snapshot and wait for disk acknowledgment.

Nested operations share the outer transaction. Its scope must include every table read or written by nested work, including category validation when accepting recurring suggestions and savings-reference cleanup when removing linked accounts. `withPersistence` is an older wrapper and alone does not provide the exclusive transaction flow; new normal writes should use `runMutation`.

[serialization.ts](../src/lib/storage/serialization.ts) centralizes full hydration/dehydration and incremental table reads. The adapter reuses unchanged serialized table content, validates before serialization or rotation, calculates a SHA-256 checksum, writes `data.json.tmp`, rotates the previous primary to `data.json.bak`, then renames the temporary file to the primary. File saves have their own coalescing queue.

A rejected Dexie transaction rolls back. A failed disk save after commit leaves the changes in the running database and sets the persistent unsaved banner. The write barrier blocks further mutations; Retry saves the current state without replaying the operation. Callers must distinguish applied-but-unsaved errors from unapplied failures. Export Backup remains available.

Storage reports warnings/errors through registered callbacks, keeping it independent of toast/UI imports. Shared settings writes use `db/settings.ts` to avoid an import cycle through store compatibility re-exports.

## Startup, backups and review

Startup reads and validates the snapshot before replacing Dexie. A primary I/O failure gets one retry; a repeated failure blocks initialization/writes and exposes Retry loading, preserving existing records/files. Content corruption and checksum mismatch follow a different path: select a recovery candidate from `data.json.bak` or routine backups newest first, and preserve the damaged original before replacing records or writing the primary. Backup I/O errors also propagate rather than masquerading as content corruption.

A valid primary with legacy dangling references loads with warnings. It must not be silently rolled back to an older backup. Recovery and explicit restore use strict reference validation. Current fallback behavior after corruption/missing primary with unusable recovery candidates is to initialize defaults and show a data-loss error. A first run with no candidates initializes defaults normally. This fallback is implemented behavior, not a guarantee that all startup failures preserve a loaded ledger.

Routine `backups/data-*.json` files are capped at ten and debounced for one minute. Explicit restore forces a fresh verified recovery backup. Historical repair also keeps verified originals under `originals/`, outside routine pruning and automatic recovery. iCloud backup optionally overwrites `~/Library/Mobile Documents/com~apple~CloudDocs/Ledger/ledger-backup.json`; automatic startup recovery does not read iCloud.

Settings → Data & Backup also provides **Correct savings counted as income**. Its immutable preview reduces the selected month’s income and inserts one missing withdrawal without category funding. The balance-already-adjusted option defaults off; explicitly enabling it preserves the confirmed current fund balance. Applying uses the same original preservation, strict validation, fingerprint checks, atomic replacement and consumed-plan save barrier as other historical repairs. A disk failure retries the current snapshot without replaying the event.

Settings → Data & Backup provides JSON restore previews, Excel import previews, fixed-share review, integrity review and selected damaged-file review. Previews write nothing. Applying a repair requires complete explicit corrections, a current fingerprint checked under the exclusive queue and in the transaction, successful preservation, strict final validation, atomic writes, one save and cache/view refresh. Missing categories use approved inactive placeholders at their original IDs; orphan contributions require an explicit account recreation with a confirmed balance or explicit deletion. Contribution totals do not establish an opening balance.

Full backup exports contain every persisted table using the shared checksummed format. Legacy exports are normalized (`budgets` → `monthlyBudgets`); omitted legacy tables are emptied on replacement. Excel import reads the `Expenses` sheet, previews duplicate/invalid/blank rows and unknown-category mappings, then commits approved rows in one transaction/save. Fixed partner amounts stay fixed.

## Changing persisted data

Three versions have separate meanings: Dexie schema (`db/index.ts`, currently 5), app data migrations (`CURRENT_MIGRATION_VERSION` in `db/migrations.ts`, currently 11), and JSON format (`StoredData.version`, currently `1.0`). An optional field alone does not automatically require changing all three.

Check each applicable location when adding a field or entity:

1. `db/constants.ts` types/defaults and `db/index.ts` exports, table fields and a new schema version if indexes/tables change. Preserve earlier schema declarations.
2. `storage/types.ts`: `StoredData` and `PersistedTableName` for a new table.
3. `storage/serialization.ts`: full/incremental reads, transaction table scope, hydration and date revival.
4. `storage/tauri-adapter.ts`: persisted-table list and serialized snapshot/checksum behavior.
5. `storage/backup.ts`: table names, required fields, dates, numeric/enumerated values and reference validation. Nested planning data uses `planning/validation.ts`.
6. Store mutation scopes, cache updates, `storage/index.ts` export/replace/refresh behavior, import/export and historical-repair handling where applicable. These flows delegate to shared serialization; do not reintroduce separate manual loaders.
7. Idempotent migrations if existing data needs transformation. Native migration changes must be saved to disk; changing only Dexie loses them on the next startup.
8. Synthetic legacy/full/incremental round trips, strict restore, failure/rollback/retry and native relaunch verification appropriate to the change.

The nine persisted tables are transactions, categories, monthlyBudgets, categoryBudgets, settings, savingsAccounts, savingsContributions, linkedAccounts and balanceSnapshots. Planning is nested in the settings singleton, not a tenth table. `MonthlyBudget.savedAmount` is a legacy field; contribution records supply current savings calculations.

## Financial behavior

**Transactions and splits.** Spending uses `getUserAmount` and excludes deleted rows/hidden split parents. Group purchases with `utils/transaction-grouping.ts`. `allocatePartnerShares` distributes the purchase's partner share in integer cents using largest remainders with line-order ties. Percentage values are fractional coefficients; fixed values are dollars. Group editing updates the parent and recreates children atomically; it rejects groups whose allocations have refunds or recorded payments so their IDs survive. Refunds are negative dated events linked to the original allocation; recorded partial payments reduce outstanding partner shares. Their creation forms are absent, but saved events still affect totals and protect IDs.

**Dates.** Transaction/contribution dates represent local days. Use the date/month helpers for inputs and storage revival. Creation/update/sync/snapshot fields are instants. Velocity/pace computations exclude future purchases; savings reservations include future cash contributions within the month.

**Budgets and rollover.** Per-category opt-in surpluses chain through adjacent enabled months (a gap or disabled flag breaks the chain; capped at 24 months). Prior-month deficits pool into one summary adjustment and never reduce an individual category. `utils/budget-rollover.ts` owns effective totals. Budget cards, alerts and insights use effective budgets. Effective allowance is base + rollover + optional savings funding, including categories without a base row. Budget Funding compares base budgets plus category savings allocations against income plus withdrawals, reserving positive cash contributions once; it excludes rollover from that allocation comparison. An inline category editor with carryover accepts the effective month total and converts through `baseFromEffective` after subtracting rollover and savings funding, clamped at zero. Savings funding stays on its withdrawal; removing or editing base budgets does not remove it, and Copy last month copies only base rows. Unused funding follows the category’s existing rollover setting; a funding-only month has rollover off until a base row enables it.

**Savings.** `bank_transfer` and `other` reserve available cash; payroll deductions, interest and employer matches do not. Signed saved withdrawals release cash. `utils/savings-summary.ts` separates positive cash contributions, withdrawals, total additions and net savings. Available = income + withdrawals − positive cash contributions + rollover adjustment. Payroll deductions, interest and matches stay outside cash funding. The take-home net savings rate can be negative. Use savings accepts a positive cent amount, a savings-type fund and an actual local day through today, storing `kind: 'withdrawal'`, negative amount and `source: 'bank_transfer'`. Optional `SavingsContribution.budgetCategoryId` allocates that same released cash to a category; it creates no second cash credit. The field survives full/incremental serialization and legacy backups without a schema/index change or automatic migration. Validation, historical review and deletion protections treat it as a withdrawal-only category reference. Balance checks and reversals run inside the mutation queue. Savings-type account balances change when contributions are added/moved/deleted; retirement/investment behavior stays distinct. Account deletion cascades contributions atomically. Categories referenced by transactions, budgets, templates or schedules cannot be deleted; deactivate them instead.

**Net worth.** Actual linked balances stay separate from savings intent. Liabilities store debt as a positive balance; class determines subtraction. Balance writes update both current balance and one snapshot/account/local day. See [the current net-worth design](../NET_WORTH_PLAN.md).

**Forecast.** The current-month dashboard estimates spending from actuals, future entries, bill reservations and ordinary historical spending; it also explains saved cash reservations and budget remainder. Pure calculations live under `planning/` despite removal of the Planning page. Never drop saved schedules, savings plans, templates, settlements, completeness dates, refunds, withdrawals or bank references just because their creation UI was removed. See [planning.md](planning.md).

## Reactivity and native boundaries

Transaction-cache versions drive memoized insights. Tag indexes rebuild from that cache; merchant/recurring caches need invalidation after mutations. Needs/wants memoization retains its category-essential map while IDs/flags are unchanged. `refreshDataCaches(true)` also emits `ledger:data-replaced`, remounting page content. Settings loads on mount as well as navigation, so reviewed repairs and restores reload the selected section after replacement; narrower transaction and net-worth events refresh mounted consumers. Acknowledged changes to savings, income or category budgets refresh funding consumers and transaction-version insight caches. Savings, Budget and Insights guard month changes and unmount against stale publication. Funding events refresh mounted Insights without resetting its selected month.

Dashboard mutations await a complete load through `stores/dashboard.ts`: history is loaded even for an empty ledger, inferred bills are rebuilt, and the forecast is calculated from plain results before state publication. Inference and calculation share a purchase index owned by that refresh. Dashboard and Budget both listen for `ledger:transactions-changed`, including Quick Add and undo. Async refreshes publish only for the latest request and selected month; unmount invalidates pending requests and removes listeners. A read/refresh failure after a successful disk acknowledgment is reported separately and never makes the form replay its saved operation.

Quick Add shares IndexedDB with the main window and reads categories/settings/merchants. It submits `ledger://quick-add-submit` with a request ID and ISO date; the main window deduplicates and responds via `ledger://quick-add-result` after durable save. Applied-but-unsaved retries save without reinserting. The quick window renders a bare shell and skips initialization, purge, sync, scheduling and global shortcuts.

Rust owns the tray and window lifecycle. Closing the main window hides it; quitting exits. Tray activation toggles an always-on-top quick window and suppresses the activation observer from also opening the main window. SimpleFIN HTTP and credential access run in Rust; the frontend receives account data/link status only.

Notifications are opt-in, use native permission and a 60-second scheduler, and have app-open fallbacks for weekly/monthly reminders. Daily reminders query current visible, undeleted transactions when due, excluding split parents. Eligibility checks cannot overlap; stopped/replaced generations discard pending results, and failed queries remain retryable.

## UI conventions and navigation

[app.css](../src/app.css) defines the Warm Ledger palette and light/dark semantic tokens with CSS-first `@theme`. Use `bg-surface`, `bg-surface-alt`, `border-theme`, `text-charcoal-muted` and other existing utilities rather than adding raw grays. Typography is Fraunces for headings, Instrument Sans for body, DM Mono for amounts. Charts share `ChartWrapper` and `utils/chart-theme.ts`.

Reuse `ModalContainer`, existing confirm dialogs and form components; keep Cancel left and primary action right, submitting states, focus management and keyboard access. Category/account emoji belong in selection/management contexts and the treemap. Display rows use color dots and names. Transactions use date-grouped cards, dashed dividers, tinted `.category-chip` labels, sentence-case `.badge` pills and actions revealed on hover/focus.

Navigation is Dashboard, Budget, Savings, Insights, Net Worth, Shared and Settings. Keyboard routes are ⌘1 Dashboard, ⌘2 Budget, ⌘3 Savings, ⌘4 Insights, ⌘5 Shared, ⌘6 Net Worth. `KeyboardShortcuts` delegates search/add to the page handler registry; ⌘/ opens help. `/quick-add` is a window entry point. There is no Planning route or sidebar item.

The dashboard uses a ledger column plus cash-flow/forecast/week-review/category rail. Add/⌘N opens the full `TransactionForm`. Regular transaction notes and each category line in the split editor share `TagAutocomplete`, suggesting existing tags after `#` with mouse or arrow-key/Enter selection. Upcoming entries are hidden by default for current/past months. Transaction pagination counts grouped rows, preserving split groups; selection mode is flat. Recurring suggestions remain a reviewable selection/confirmation workflow.

Insights has Overview, Spending, Savings, Recurring and Year in Review tabs with lazy loading and keyboard navigation. Category variance uses day-clipped six-month medians; subscriptions use composite `merchant|amount` keys, cancellation overrides and price-supersession detection. Staleness thresholds live in `src/lib/config/index.ts`. Settings has separate sections for sharing, appearance, notifications, shortcuts, categories, data/backup, connected accounts and about.

UI state keys include `ledger-selected-month`, `ledger-sidebar-expanded`, `ledger-show-upcoming`, `ledger-networth-collapsed`, `ledger-insights-tab` and `ledger-settings-section`. Dismissal and notification timestamps also live in localStorage. Find the exact key in the owning component/store before changing it; these preferences are not exported financial data. Soft-deleted transactions have a five-second undo window and are purged on the next main-window startup.
