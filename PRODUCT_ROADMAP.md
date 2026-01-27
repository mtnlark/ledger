# Ledger Product Roadmap

**Author**: Head of Product
**Date**: January 2026
**Status**: Planning Document for Engineering Review

This document outlines feature ideas and implementation considerations for future development. Items are organized by priority and complexity.

---

## Recently Shipped

### Savings Tracking
- **Status**: Shipped
- **Implementation**: Complete savings module with accounts, contributions, and insights
- **Features**:
  - Track contributions to savings, retirement, and investment accounts
  - Default accounts: Emergency Fund, High-Yield Savings, 401(k), Roth IRA, Brokerage
  - Contribution sources: payroll deduction, bank transfer, interest, employer match, other
  - Balance tracking for savings-type accounts only
  - Savings rate calculation (only bank_transfer/other reduce "available to spend")
  - New Savings page between Budget and Insights in navigation
  - SavingsInsights card on Insights page with totals and trends
  - Integration with CashFlowCard for accurate "available to spend" calculation
- **Files touched**:
  - New: `src/lib/stores/savingsAccounts.ts`, `savingsContributions.ts`, `src/routes/savings/+page.svelte`
  - New: `src/lib/components/insights/SavingsInsights.svelte`
  - Modified: `src/lib/db/index.ts` (schema v4), `SideNav.svelte`, `CashFlowCard.svelte`

### Month in Review Redesign
- **Status**: Shipped
- **Implementation**: Hero stat + expandable grouped insights for completed months
- **UX improvements**:
  - Hero stat displays most impactful insight at top (rank superlative or savings achievement)
  - "See more" toggle expands all grouped insights
  - Insights grouped by: Spending, Savings, Highlights
  - Narrative-style labels ("Biggest purchase:", "Most visited merchant:")
  - Consistent subcopy format ("out of X months")
  - Icons: Flame for high spending, Trophy for savings achievements, TrendingDown for low spending
- **Files touched**: `src/lib/components/insights/SmartTakeaways.svelte`

### 12-Month Rolling Window for Historical Comparisons
- **Status**: Shipped
- **Implementation**: Historical rank and vs-average calculations now use rolling 12-month window
- **Rationale**: Prevents ancient history from skewing comparisons; more relevant baseline
- **Files touched**: `src/lib/insights/calculations/month-review.ts`, `month-review.test.ts`

### Savings Insights in SmartTakeaways
- **Status**: Shipped
- **Implementation**: Positive-only savings insights integrated into Month in Review
- **Design decision**: Never flag low savings rates (avoids false alarms from bimonthly paycheck timing)
- **Insights shown**: Highest savings month, savings rate above average (10%+ threshold)
- **Files touched**: `src/lib/insights/calculations/month-review.ts` (computeSavingsReview)

### Search Across All Time
- **Status**: Shipped
- **Implementation**: Added "All Time" toggle to TransactionFilters component
- **Files touched**: `TransactionFilters.svelte`, `+page.svelte` (dashboard)

### Keyboard Shortcuts
- **Status**: Shipped
- **Implementation**: New `KeyboardShortcuts.svelte` component with global listener
- **Shortcuts implemented**:
  - `Cmd+K` - Focus search input
  - `Cmd+N` - Open quick add transaction
  - `Cmd+/` - Show shortcuts help modal
  - `Esc` - Close modals / blur inputs

### Recurring Transaction Auto-Entry
- **Status**: Shipped
- **Implementation**: Banner + modal suggestion system for expected recurring transactions
- **Features**:
  - Dashboard banner appears at start of each month when suggestions available
  - Two-step modal flow: selection (checkboxes) → confirmation (editable dates/amounts)
  - Merges auto-detected recurring expenses with user-tagged subscriptions
  - Frequency-aware filtering: monthly items always shown, annual/semi-annual only in due months
  - Filters out already-added transactions by merchant name (handles price changes)
  - Uses most recent transaction amount (not average) for accuracy
  - "Remind me next month" defers without adding
  - Banner persists until all suggestions added or explicitly deferred
- **Files touched**:
  - New: `src/lib/stores/recurringSuggestions.ts`, `recurringSuggestions.test.ts`
  - New: `src/lib/components/RecurringSuggestionsBanner.svelte`, `RecurringSuggestionsModal.svelte`
  - Modified: `src/lib/db/index.ts` (added `lastAutoSuggestedMonth` to Settings)
  - Modified: `src/lib/stores/settings.ts` (dismiss/reset functions)
  - Modified: `src/routes/+page.svelte` (integrated banner and modal)

### Quick Insights Dashboard Widget
- **Status**: Shipped
- **Implementation**: Single rotating insight widget above CashFlowCard
- **Features**:
  - Priority-based insight selection (first matching wins):
    1. Budget alert (over/approaching) - uses same `getBudgetStatus()` as Budget page
    2. Pace warning (mid-month, projected to exceed income)
    3. Positive reinforcement (all budgeted categories on track)
    4. Transaction count fallback
  - Clickable navigation to Budget or Insights page
  - 24-hour dismiss via localStorage
  - Configurable thresholds in `config.dashboardInsight`
  - Consistent with Budget page status logic (no false alerts for "at budget")
- **Design decisions**:
  - Skipped anomaly detection for MVP (requires loading all historical transactions)
  - Uses warning colors (yellow) for approaching, danger colors (red) for over budget
  - Race condition protection with sequence numbering for async calculations
- **Files touched**:
  - New: `src/lib/utils/dashboard-insight.ts`, `src/lib/components/DashboardInsightWidget.svelte`
  - Modified: `src/lib/config/index.ts` (added `dashboardInsight` config section)
  - Modified: `src/routes/+page.svelte` (integrated widget above CashFlowCard)
  - Modified: `CLAUDE.md` (documentation)

---

## High Priority Features

### 1. Budget Rollover

**Problem**: YNAB-style "roll with the punches" budgeting - underspending in one category should carry forward.

**Proposed Solution**: Simple rollover with manual control

**Data Model Changes**:
```typescript
interface CategoryBudget {
  // ... existing fields
  rolledOver?: number;  // Amount rolled from previous month
}
```

**UX Flow**:
1. End of month: Show "Month Summary" with surplus/deficit per category
2. "Roll Forward" button on categories with surplus
3. Next month: "Available" = budgetAmount + rolledOver
4. Progress bar shows both base budget and rolled amount visually

**Key Decisions**:
- **No negative rollover**: Overspending resets to 0 (simplifies mental model)
- **Manual opt-in**: User chooses which categories to roll (not automatic)
- **Copy forward behavior**: "Copy from Last Month" includes rolled amounts

**Complexity**: Medium (2-3 days)

**Edge Cases**:
- What if user deletes a category that has rolled amount?
- How to display on Budget page (separate line or combined)?

---

### 2. Tags / Notes Enhancement

**Problem**: Users want flexible categorization beyond fixed categories.

**Proposed Solution**: Hashtag-based tagging in existing notes field

**Implementation**:
- Notes field already exists in schema (`notes?: string`)
- Parse hashtags from notes: "Business dinner #work #reimbursable"
- Build tag index on app load (in-memory, not persisted)
- Add tag filter to TransactionFilters (alongside category filter)

**UI Changes**:
- Add "Add note" link below transaction form (expands to show notes field)
- In transaction list, show tags as small pills: `#work` `#reimbursable`
- In filters, add tag autocomplete dropdown

**Technical Approach**:
```typescript
function extractTags(notes: string): string[] {
  return (notes.match(/#\w+/g) || []).map(t => t.toLowerCase());
}
```

**Complexity**: Low-Medium (1-2 days)

**Future Enhancement**: Tag suggestions based on merchant/category patterns

---

### 3. Reports Export (PDF)

**Problem**: Users want to generate reports for personal records, tax preparation, or sharing with financial advisors.

**Proposed Solution**: Monthly report PDF generation

**Report Contents**:
1. **Header**: Month, date range, generated date
2. **Summary**: Income, total spent, saved, surplus/deficit
3. **Category Breakdown**: Table + pie chart
4. **Needs vs Wants**: Split with percentages
5. **Top Merchants**: Top 5 by spend amount
6. **Budget Status**: Categories over/under budget
7. **Transaction List**: Optional, paginated

**Technical Options**:
1. **jsPDF**: Pure JS, no server needed, but limited styling
2. **html2pdf.js**: Better styling via HTML/CSS rendering
3. **Tauri print-to-PDF**: Native macOS print dialog → Save as PDF

**Recommendation**: Start with Tauri print-to-PDF (simplest), upgrade to jsPDF if users want direct file save.

**UI Location**: Settings page → "Export" section → "Generate Monthly Report" button

**Complexity**: Medium (2-3 days)

---

## Medium Priority Features

### 6. Category Budget Visualization on Dashboard

**Problem**: Users don't see budget status without navigating to Budget page.

**Proposed Solutions** (choose one):

**Option A: Traffic Light Summary**
```
Budgets: 🟢🟢🟢🟡🔴 (3 on track, 1 approaching, 1 over)
```
- Compact, single line in CashFlowCard
- Click to expand to full list

**Option B: Summary Text**
```
"5 categories on track, 2 approaching limit"
```
- More readable, less visual noise
- Link to Budget page

**Option C: Mini Progress Bars**
- Show top 3-5 categories with small progress bars
- Color-coded (green/yellow/red)
- Risk: Could feel cluttered

**Recommendation**: Option B for cleanliness, with hover/tap to show Option A details

**Complexity**: Low (0.5-1 day)

---

### 7. Goals Feature

**Problem**: Users want to track savings toward specific targets (vacation, emergency fund, big purchase).

**Data Model**:
```typescript
interface SavingsGoal {
  id?: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: Date;
  linkedCategoryId?: number;  // Optional: link to a category
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Features**:
- Create goal with name, target, optional deadline
- Manual "Add funds" action (doesn't create transaction, just updates goal)
- Visual progress bar with percentage
- Optional: Link to category (auto-tracks spending in that category)
- Celebrate when goal is reached (confetti? toast?)

**UI Location Options**:
1. **New "Goals" tab** in sidebar (5th nav item)
2. **Section in Budget page** (collapsible, above category budgets)
3. **Dashboard widget** (compact view of active goals)

**Recommendation**: Start with Budget page section, promote to tab if users engage heavily

**Complexity**: Medium-High (3-4 days)

---

### 8. Time-Based Views Enhancement

**Problem**: Insights are month-centric; users want to see longer trends.

**Proposed Enhancements**:

**Year View**:
- Full 12-month calendar with spending intensity (heatmap already exists, expand it)
- Monthly totals in a bar chart
- Year-over-year comparison (if 2+ years of data)

**Custom Date Range**:
- "Custom" option in month picker
- Date range selector (from/to)
- Applies to all insights on page

**Preset Ranges**:
- "Last 90 days"
- "This quarter"
- "Year to date"

**UI Location**: Insights page, add view toggle next to month picker

**Complexity**: Medium (2-3 days)

---

### 9. Daily Push Notifications

**Problem**: Users forget to log transactions.

**Proposed Solution**: Optional daily reminder

**Implementation**:
- Use Tauri's notification API (`@tauri-apps/plugin-notification`)
- Settings toggle: "Daily reminder to log expenses"
- Time picker: "Remind me at [8:00 PM]"
- Notification text: "Don't forget to log today's expenses!"
- Click notification → opens app

**Complexity**: Low (1 day)

**Note**: Requires Tauri plugin addition

---

### 10. Weekly Email Digest

**Problem**: Users want a summary without opening the app.

**Considerations**:
- Requires email capture (privacy implications)
- Needs server component (or third-party service like SendGrid)
- Scope creep: local-first philosophy conflict

**Alternative**: Weekly in-app summary notification
- Shows when app is opened after 7+ days
- "Your week in review: $342 spent across 18 transactions"

**Recommendation**: Defer email digest, implement in-app weekly summary instead

**Complexity**: Low for in-app (1 day), High for email (requires backend)

---

## Lower Priority (Nice-to-Have)

### 11. Bank Import via CSV/OFX

**Problem**: Manual entry is tedious for high-volume users.

**Implementation**:
- Support common bank export formats: CSV, OFX, QFX
- Field mapping UI: "Which column is the amount?"
- Duplicate detection: warn if transaction appears to already exist
- Review screen before import

**Complexity**: High (4-5 days)

---

### 12. Receipt Scanning (OCR)

**Problem**: Users want to capture receipts quickly.

**Implementation Options**:
1. **Tesseract.js**: Client-side OCR, no server needed
2. **Cloud API** (Google Vision, AWS Textract): Better accuracy, requires account

**MVP Approach**:
- "Scan Receipt" button in quick add
- Opens camera / file picker
- Extracts: amount, merchant name (date if possible)
- Pre-fills form, user confirms

**Complexity**: High (5-7 days)

---

### 13. Merchant Normalization

**Problem**: "AMZN*1234XY" and "Amazon" are the same merchant.

**Implementation**:
- Merchant alias table: `{ pattern: "AMZN*", canonical: "Amazon" }`
- Auto-suggest normalization when detecting pattern
- User can add custom aliases

**Complexity**: Medium (2-3 days)

---

### 14. Multi-Currency Support

**Problem**: Users with international expenses need currency conversion.

**Implementation**:
- Add `currency` field to Transaction
- Exchange rate API integration (Open Exchange Rates)
- Display in home currency with original amount noted

**Complexity**: High (4-5 days)

---

## Technical Debt & Infrastructure

### Testing Coverage
- Add integration tests for keyboard shortcuts
- Add E2E tests for search all time flow
- Component tests for new features

### Performance
- Consider virtual scrolling for transaction list (if >1000 transactions)
- Profile insights calculations for large datasets
- Lazy load insights components

### Accessibility
- Audit keyboard navigation
- Screen reader testing
- Color contrast verification for budget status colors

---

## Implementation Notes for Engineering

### State Management Patterns
- Use `$bindable()` for components that need external control (see QuickAddFAB)
- Use localStorage for UI state that should persist across sessions
- Use Svelte 5 `$effect()` for side effects, not `$derived()`

### Data Flow
- All writes go through store functions → persist to JSON → update Dexie
- Reads prefer Dexie (in-memory) for performance
- InsightsEngine handles memoization automatically

### Component Conventions
- Props interface at top of `<script>`
- Exported types use `export interface`
- Event handlers named `handle*` or `on*`
- Derived state uses `$derived` or `$derived.by()`

---

## Prioritization Matrix

| Feature | User Value | Effort | Priority |
|---------|------------|--------|----------|
| ~~Recurring Auto-Entry~~ | ~~High~~ | ~~Medium~~ | **Shipped** |
| ~~Quick Insights Widget~~ | ~~Medium~~ | ~~Low~~ | **Shipped** |
| Budget Rollover | High | Medium | **P0** |
| Tags/Notes | Medium | Low | **P1** |
| Reports Export | Medium | Medium | **P1** |
| Dashboard Budget Viz | Low | Low | **P2** |
| Goals | High | High | **P2** |
| Time-Based Views | Medium | Medium | **P2** |
| Push Notifications | Low | Low | **P3** |
| Bank Import | High | High | **P3** |
| Receipt Scanning | Medium | High | **P3** |

---

*This document should be updated as features are shipped or requirements change.*
