# Ledger Product Roadmap

**Last Updated**: February 2026

This document organizes planned work by logical groupings and engineering dependencies. Items within each group should be implemented together; groups are ordered by what needs to land first.

---

## Group 1: Data Integrity Hardening

**Why first**: Everything else depends on reliable persistence. These changes protect against data loss and should land before adding new features that create more data.

**Dependencies**: None (foundational)

### 1.1 Backup Recovery on Corruption

**Problem**: If `data.json` becomes corrupted (power failure, crash during write), the app silently initializes defaults and the user loses all data. The backup system exists but is never consulted during recovery.

**Solution**:
- In `tauri-adapter.ts`, when JSON parse fails, attempt to restore from the most recent backup in `backups/`
- Show user notification: "Data file was corrupted. Restored from backup (timestamp)."
- If no valid backup exists, warn user before initializing defaults
- Log recovery events for debugging

**Files**: `src/lib/storage/tauri-adapter.ts`

### 1.2 Atomic Writes

**Problem**: Writing directly to `data.json` risks partial writes if the process crashes mid-write.

**Solution**:
- Write to `data.json.tmp` first
- Rename `data.json` → `data.json.bak` (immediate backup of previous state)
- Rename `data.json.tmp` → `data.json`
- This ensures `data.json` is always in a complete state

**Files**: `src/lib/storage/tauri-adapter.ts`

### 1.3 Data File Checksums

**Problem**: No way to detect partial or corrupted writes without attempting to parse.

**Solution**:
- Add `checksum` field to `StoredData` interface (hash of stringified content excluding checksum field)
- Verify checksum on load; if mismatch, treat as corruption and trigger recovery flow
- Update checksum on every save

**Files**: `src/lib/storage/types.ts`, `src/lib/storage/tauri-adapter.ts`

### 1.4 Fix Partial Success in Split Transactions

**Problem**: `addSplitTransactions` in dashboardActions adds transactions sequentially. If transaction 2 of 5 fails, transactions 1-4 may be added but user sees generic "Failed" error.

**Solution**:
- Use `Promise.allSettled()` pattern
- Report mixed success: "4 of 5 transactions added. 1 failed."
- Consider whether to roll back partial success (probably not — user can delete manually)

**Files**: `src/lib/stores/dashboardActions.ts`

### 1.5 Storage Layer Tests

**Problem**: `tauri-adapter.ts` has zero test coverage despite being the critical persistence layer.

**Solution**:
- Test backup creation and rotation
- Test recovery flow when data.json is corrupted
- Test atomic write behavior
- Test checksum validation
- Mock Tauri FS APIs for unit testing

**Files**: Create `src/lib/storage/tauri-adapter.test.ts`

---

## Group 2: Savings Goals

**Why here**: High-value feature that extends existing infrastructure. Schema change should happen early so subsequent work can build on it.

**Dependencies**: Group 1 (don't add new data types until persistence is solid)

### 2.1 Schema Extension

**Changes to `SavingsAccount`**:
```typescript
interface SavingsAccount {
  // ... existing fields ...
  targetAmount?: number;      // Goal target (e.g., $10,000)
  targetDate?: Date;          // Goal deadline (e.g., Dec 31, 2026)
}
```

**Migration**: Existing accounts get `undefined` for new fields (no goal set).

**Files**: `src/lib/db/constants.ts`, `src/lib/db/migrations.ts`

### 2.2 Goal Projection Calculations

**New functions in savingsContributions.ts or new file**:

```typescript
// Calculate average monthly contribution for an account
function getAverageMonthlyContribution(accountId: number, months: number): Promise<number>

// Project when goal will be reached at current pace
function projectGoalCompletion(
  currentBalance: number,
  targetAmount: number,
  averageMonthlyContribution: number
): Date | null

// Check if on track to hit target by target date
function isOnTrackForGoal(
  accountId: number,
  currentBalance: number,
  targetAmount: number,
  targetDate: Date
): Promise<{ isOnTrack: boolean; shortfall: number; recommendedMonthly: number }>
```

**Files**: `src/lib/stores/savingsContributions.ts` or create `src/lib/stores/savingsGoals.ts`

### 2.3 Goal Progress UI

**Update `SavingsAccountCard.svelte`**:
- Show progress bar when `targetAmount` is set: "$5,200 / $10,000 (52%)"
- Show projected completion: "On track to complete by Nov 2026"
- Show shortfall alert if off-track: "Increase to $450/month to hit your goal"
- Add edit flow to set/update goal target and date

**New component considerations**:
- `GoalProgressBar.svelte` — reusable progress visualization
- Extend `EditAccountModal.svelte` with goal fields

**Files**: `src/lib/components/SavingsAccountCard.svelte`, `src/lib/components/EditAccountModal.svelte`

### 2.4 Goal Insights Integration

**Add to Savings insights**:
- "2 of 3 goals on track"
- Alert for goals that are behind pace
- Celebration state when goal is reached

**Files**: `src/lib/components/insights/SavingsInsights.svelte`

### 2.5 Tests for Goal Calculations

Cover projection edge cases:
- Zero contributions (can't project)
- Already exceeded goal
- Target date in the past
- Negative contribution average (withdrawals)

**Files**: Create tests alongside implementation

---

## Group 3: Tags System

**Why here**: Self-contained feature with no schema changes (uses existing `notes` field). Good candidate for parallel work.

**Dependencies**: None (can be worked on alongside Group 2)

### 3.1 Tag Parsing Utility

**Create `src/lib/utils/tags.ts`**:
```typescript
// Extract hashtags from notes field
function extractTags(notes: string | undefined): string[]
// Returns lowercase, deduplicated: ["work", "reimbursable"]

// Check if transaction matches a tag filter
function matchesTag(transaction: Transaction, tag: string): boolean
```

**Files**: Create `src/lib/utils/tags.ts`, `src/lib/utils/tags.test.ts`

### 3.2 Tag Index

**Build in-memory tag index on app load**:
- `Map<string, Set<number>>` mapping tag → transaction IDs
- Rebuild when transactions change (hook into cache invalidation)
- Function: `getTagSuggestions(prefix: string): string[]` for autocomplete

**Files**: Create `src/lib/stores/tags.ts`

### 3.3 Tag Filter UI

**Update `TransactionFilters.svelte`**:
- Add tag autocomplete dropdown (similar to category filter)
- Filter transactions by selected tag(s)
- Show active tag filters as dismissible chips

**Files**: `src/lib/components/TransactionFilters.svelte`

### 3.4 Tag Display in Transaction List

**Update `TransactionList.svelte`**:
- Parse tags from notes field
- Display as small pills below transaction: `#work` `#reimbursable`
- Clicking a tag applies it as a filter

**Files**: `src/lib/components/TransactionList.svelte`

### 3.5 Notes Field Visibility

**Improve notes entry UX**:
- In `TransactionForm.svelte`, add expandable "Add note" link
- Show tag autocomplete as user types `#`
- In `TransactionList.svelte`, show truncated note preview (not just tags)

**Files**: `src/lib/components/TransactionForm.svelte`, `src/lib/components/TransactionList.svelte`

---

## Group 4: Notifications

**Why here**: Requires Tauri plugin integration. Self-contained infrastructure that multiple features build on.

**Dependencies**: None (can be worked on alongside Groups 2-3)

### 4.1 Tauri Notification Plugin Setup

**Add `@tauri-apps/plugin-notification`**:
- Install and configure in `src-tauri/`
- Add capability permissions
- Create `src/lib/notifications/index.ts` wrapper with permission request flow

**Files**: `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, create `src/lib/notifications/`

### 4.2 Notification Settings

**Extend Settings schema**:
```typescript
interface Settings {
  // ... existing ...
  notifications: {
    dailyReminder: boolean;
    dailyReminderTime: string;  // "20:00" format
    weeklyReview: boolean;      // Monday morning
    monthlyBudgetSetup: boolean; // 1st of month
  };
}
```

**Files**: `src/lib/db/constants.ts`, `src/routes/settings/+page.svelte`

### 4.3 Daily Expense Reminder

**Implementation**:
- Check on app launch if reminder time has passed today and no transactions logged
- Schedule notification for configured time
- "Don't forget to log today's expenses!"
- Clicking opens app

**Files**: `src/lib/notifications/daily-reminder.ts`

### 4.4 Weekly Review Notification

**Implementation**:
- Monday morning notification (configurable time, default 9am)
- "Your week in review is ready — you spent $X across Y transactions"
- Links to Insights page

**Files**: `src/lib/notifications/weekly-review.ts`

### 4.5 Monthly Budget Setup Notification

**Implementation**:
- 1st of each month
- "Time to set up your [Month] budgets and review [Previous Month]"
- Links to Budget page

**Files**: `src/lib/notifications/monthly-setup.ts`

---

## Group 5: Insights Page Redesign

**Why here**: After core features (goals, tags), restructure how we surface data. This is a more ambitious redesign that provides flexibility for future power-user features.

**Dependencies**: None, but benefits from Groups 2-3 being complete (more data to show)

### 5.1 Tab-Based Architecture

**Replace linear scroll with tabbed navigation**:

| Tab | Contents |
|-----|----------|
| **Overview** | Smart Takeaways (headline insights, alerts, anomalies) |
| **Spending** | Spending This Month + Category Deep Dives + Category Comparison |
| **Savings** | Savings This Month + Savings Rate Trend + Goal Progress (from Group 2) |
| **Recurring** | Recurring Expenses + Subscription breakdown + Stale subscription alerts |
| **Year-to-Date** | Calendar Heatmap + YTD Stats + Needs vs Wants breakdown |

**Benefits**:
- Reduces cognitive load (one tab at a time)
- Groups related insights logically
- Month picker remains global, applies to all tabs
- Each tab can be extended independently as we add features
- Remembers last-viewed tab per session

**Implementation**:
- Create `InsightTabs.svelte` component with tab state management
- Refactor `insights/+page.svelte` to render content conditionally by tab
- Move existing InsightGroup components into tab containers
- Persist selected tab to localStorage

**Files**: `src/routes/insights/+page.svelte`, create `src/lib/components/insights/InsightTabs.svelte`

### 5.2 Overview Tab Design

**The "what do I need to know" view**:
- Smart Takeaways expanded by default (the headlines)
- Quick stats row: Total Spent | Budget Status | Savings Rate
- Alert cards for anything needing attention (over budget, off-track goals, anomalies)
- Links to relevant tabs for drill-down ("View spending details →")

**Files**: `src/lib/components/insights/SmartTakeaways.svelte`, new `InsightAlerts.svelte`

### 5.3 Spending Tab Consolidation

**Merge related spending views**:
- Spending summary at top (total, daily average, pace projection)
- Category breakdown pie chart
- Category deep dive selector (click category → see trends)
- Month-over-month comparison
- All on one scrollable tab, no collapsible sections needed

**Files**: Refactor existing `SpendingThisMonth.svelte`, `CategoryDeepDives.svelte`, `CategoryComparison.svelte`

### 5.4 Recurring Tab Enhancements

**Dedicated space for subscription management**:
- Active subscriptions with variance indicators (📌 Fixed vs 📊 Variable)
- Stale/inactive subscriptions section
- Total monthly recurring cost
- Upcoming renewals (annual subscriptions due soon)

**Files**: `src/lib/components/insights/RecurringInsights.svelte`

### 5.5 Year-to-Date Tab

**Annual perspective**:
- Calendar heatmap (daily spending intensity)
- YTD totals by category
- Needs vs Wants annual breakdown with trend line
- Best/worst spending months comparison

**Files**: Refactor existing `CalendarHeatmap.svelte`, `YTDStats.svelte`, `NeedsWantsInsights.svelte`

### 5.6 Insight Enhancements (within new structure)

**Improvements that fit into the new tabs**:

- **Variance visibility** (Recurring tab): Show "📌 Fixed" vs "📊 Variable ($120 ± $15)" using existing `DetectedRecurring.variance` data
- **Needs vs Wants trend** (YTD tab): "Oct: 68% Needs → Nov: 74% Needs — more conservative this month"
- **Budget health** (Overview tab): "3/4 categories on track" with anomaly alerts

**Files**: Various insight components

---

## Group 6: Undo System

**Why here**: Quality-of-life feature that's self-contained.

**Dependencies**: None

### 6.1 Undo Toast Component

**Create `UndoToast.svelte`**:
- Appears after destructive action (delete, bulk delete)
- Shows "Transaction deleted. Undo?" with countdown (5 seconds)
- Stores deleted item(s) temporarily
- "Undo" button restores the item(s)
- Auto-dismisses after timeout

**Files**: Create `src/lib/components/UndoToast.svelte`

### 6.2 Undo Store

**Create undo state management**:
- Store last deleted transaction(s) with timestamp
- `undo()` function re-adds to database
- Clear undo state after timeout or successful undo
- Only track most recent deletion (not a full history)

**Files**: Create `src/lib/stores/undo.ts`

### 6.3 Integration with Delete Actions

**Hook into existing delete flows**:
- `dashboardActions.deleteTransaction` — soft delete, show undo toast
- `dashboardActions.bulkDelete` — same pattern
- After timeout, deletion is permanent (already reflected in DB, just clear undo state)

**Files**: `src/lib/stores/dashboardActions.ts`

---

## Group 7: Design Polish

**Why here**: After features are complete, polish the experience.

**Dependencies**: Groups 2-6 complete (polish what's been built)

### 7.1 Dark Mode Contrast Audit

**Problem**: `--color-text-muted` (#8A847C) may fail WCAG contrast on dark backgrounds.

**Solution**:
- Audit all text colors against backgrounds in dark mode
- Adjust muted text color for sufficient contrast (4.5:1 minimum)
- Test with browser accessibility tools

**Files**: `src/app.css`

### 7.2 ARIA Labels Audit

**Problem areas identified**:
- `TransactionFilters.svelte` — search input missing `aria-label`
- `BulkActionBar.svelte` — missing `role="toolbar"`, selection count not announced
- `MonthPicker.svelte` — buttons missing `aria-disabled`
- `SharedExpenseFields.svelte` — range slider missing `aria-label`

**Solution**: Systematic audit and fix of all interactive elements.

**Files**: Multiple components (see Design audit for full list)

### 7.3 Loading and Success Feedback

**Problems**:
- Form submissions have no loading spinner (TransactionForm)
- Month changes have no loading indicator
- Edit/delete operations have no success feedback

**Solution**:
- Add loading spinners to all async form submissions
- Show brief success toast after edit/save operations
- Add loading state to month picker during data fetch

**Files**: `TransactionForm.svelte`, `MonthPicker.svelte`, modal components

### 7.4 Button Style Consistency

**Problem**: Hover/active states vary across components. Some buttons lift on hover, others don't.

**Solution**:
- Standardize on one primary button style with consistent hover/active states
- Add `active:scale-95` press feedback to all buttons
- Consider creating a shared Button component or CSS utility classes

**Files**: Multiple components, possibly `src/app.css`

### 7.5 Skeleton Loader Theme Matching

**Problem**: Skeletons use `bg-gray-200` instead of design system colors.

**Solution**:
- Update `Skeleton.svelte` to use `bg-surface-alt` or appropriate theme color
- Ensure pulse animation works with new colors
- Apply consistently across all loading states

**Files**: `src/lib/components/Skeleton.svelte`, `CashFlowCardSkeleton.svelte`

---

## Group 8: Performance & Tech Debt

**Why here**: Cleanup and optimization after features are stable.

**Dependencies**: Groups 2-6 complete

### 8.1 Fix N+1 Query in Recurring Suggestions

**Problem**: `getLastOccurrence()` in `recurringSuggestions.ts` scans all transactions once per suggestion.

**Solution**:
- Batch the lookup: build `Map<merchant, lastDate>` in one pass
- Replace per-suggestion DB queries with map lookups

**Files**: `src/lib/stores/recurringSuggestions.ts`

### 8.2 TransactionCache Version Tracking Fix

**Problem**: Insights can go stale if cache version doesn't increment properly when cache wasn't initially loaded.

**Solution**:
- Ensure version always increments on mutation, regardless of cache load state
- Add test coverage for this edge case

**Files**: `src/lib/stores/transactionCache.ts`

### 8.3 Extract Shared Statistics Utility

**Problem**: `mode()` function is duplicated in `recurring.ts` and `recurringSuggestions.ts`.

**Solution**:
- Create `src/lib/utils/stats.ts` with shared statistical functions
- Move `mode()`, consider consolidating other stats helpers

**Files**: Create `src/lib/utils/stats.ts`, update `recurring.ts`, `recurringSuggestions.ts`

### 8.4 Lazy-Load Insights Components

**Problem**: Insights page loads all chart/calculation components upfront.

**Solution**:
- Use Svelte's `{#await import(...)}` for heavy components
- Load chart components only when their section is expanded
- Reduces initial bundle and speeds up page load

**Files**: `src/routes/insights/+page.svelte`

### 8.5 Import/Export Test Coverage

**Problem**: `import.ts` and `export.ts` have zero tests despite handling user data.

**Solution**:
- Test Excel parsing edge cases (different formats, missing columns)
- Test CSV/JSON export structure
- Test round-trip: export → import → data unchanged

**Files**: Create `src/lib/utils/import.test.ts`, `src/lib/utils/export.test.ts`

---

## Future Considerations (Not in Current Sprint)

These are ideas that came up but aren't prioritized for immediate work:

### Virtual Scrolling for Transaction List
Large transaction lists (500+) could benefit from virtualization, but this adds complexity and may be premature optimization. Revisit if users report lag.

### Transaction Rules / Automation
A rules engine ("always categorize Shell as Gas") would reduce manual work. Current auto-fill based on historical usage covers 80% of the use case. Full rules system is a larger project.

### Bank Import via CSV/OFX
Direct bank statement import would reduce manual entry. High effort (format parsing, duplicate detection, field mapping UI). Consider after core features stabilize.

### PDF Reports
Monthly report generation for tax prep or sharing. Consider whether enhanced CSV export serves the same need with less effort.

### Multi-Currency Support
`Settings.currency` exists but is unused. Low priority unless user base expands internationally.

### Year-over-Year Comparison
Current insights compare to rolling averages but not same-month-last-year. Would require >12 months of data to be useful.

---

## Implementation Notes

### Testing Strategy
- Test what you build: add tests alongside each feature
- Prioritize data layer tests (storage, import/export) for integrity
- Component tests remain low priority (store/util coverage is more valuable)

### Commit Granularity
Each subsection (1.1, 1.2, etc.) should be a single atomic commit. This keeps changes reviewable and allows easy rollback if needed.

### Migration Safety
Schema changes (Goals, Notifications settings) need migrations. Test migrations with real data exports before deploying.

---

*This document should be updated as features ship or priorities change.*
