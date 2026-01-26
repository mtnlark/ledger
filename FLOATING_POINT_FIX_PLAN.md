# Floating Point & Rounding Fix Plan

## Overview

This plan addresses floating point precision and rounding mismatch issues discovered during the budget progress bar bug investigation. The fixes are organized into phases by priority and logical grouping.

**Guiding Principles:**
1. Round at calculation time, not display time
2. Use consistent tolerance (0.01) for all currency comparisons
3. When displaying rounded values, calculate status using the same rounding
4. Document rounding decisions in code comments

---

## Phase 1: Data Integrity (High Priority) ✅ COMPLETE

These issues affect actual data calculations and could cause incorrect behavior.

### 1.1 Shared Expense Split Validation ✅
**Files:** `src/lib/utils/format-helpers.ts`

**Problem:** Partner share was rounded to 2 decimals, but yourShare was calculated from unrounded partnerShare.

**Fix Applied:**
- Updated `calculateSplitShares()` to use `roundCurrency()` for both partnerShare and yourShare
- Created `src/lib/utils/currency.ts` with centralized currency utilities

### 1.2 Outstanding Balance Calculation ✅
**Files:** `src/lib/stores/transactions.ts`

**Problem:** Summing many rounded `partnerShare` values without accounting for accumulated floating point error.

**Fix Applied:**
- Updated `calculateOutstandingBalance()` to use `sumCurrency()` for final rounding
- Ensures final balance is always a clean 2-decimal number

### 1.3 Transaction Form Split Validation ✅
**Files:** `src/lib/components/TransactionForm.svelte`, `src/lib/components/SplitTransactionModal.svelte`

**Problem:** Used hardcoded `Math.abs(remaining) < 0.01` tolerance.

**Fix Applied:**
- Created `isSplitBalanced()` utility in currency.ts with proper tolerance (0.005)
- Updated both forms to use the centralized utility
- Updated amount calculations to use `roundCurrency()`

---

## Phase 2: Display/Calculation Consistency (Medium-High Priority) ✅ COMPLETE

These issues cause the same type of bug we just fixed—displayed values don't match calculated status.

### 2.1 CategoryBudgetList Percentage Passing ✅
**File:** `src/lib/components/CategoryBudgetList.svelte`

**Problem:** Raw floating point percentage passed to children; each child rounds differently.

**Fix Applied:**
- Removed unused `percentSpent` calculation from groupedCategories
- Components now calculate percentage from raw spent/budget values (same pattern as BudgetProgressBar)
- Each component applies its own rounding for display consistency

### 2.2 Pace Projection Comparison ✅ (No changes needed)
**File:** `src/lib/insights/calculations/pace-projection.ts`

**Review Result:** Upon closer inspection, this file is already correct.
- It compares raw values for logic (`projected > available`)
- Rounds only for display purposes
- No fix needed

### 2.3 CashFlowCard Surplus Percentage ✅
**File:** `src/lib/components/CashFlowCard.svelte`

**Problem:** `surplusPercent` was calculated but unused.

**Fix Applied:**
- Removed unused `surplusPercent` variable
- Added `getBudgetStatus()` integration for progress bar colors (matching BudgetProgressBar pattern)
- Uses rounded values for status calculation to match displayed values

---

## Phase 3: Insights Consistency (Medium Priority) ✅ COMPLETE

These issues affect the insights/analytics display but not core data.

### 3.1 Needs/Wants Dual Function Inconsistency ✅
**File:** `src/lib/insights/calculations/needs-wants.ts`

**Problem:** Two functions return percentages with different precision:
- `calculateNeedsVsWants()` rounds to integer
- `calculateNeedsVsWantsFull()` doesn't round

**Fix Applied:**
- Added `Math.round()` to `calculateNeedsVsWantsFull()` to match `calculateNeedsVsWants()`
- Both functions now return integer percentages for display consistency
- Added tests verifying functions produce consistent results for same input

### 3.2 Velocity Threshold Comparison ✅
**File:** `src/lib/insights/calculations/velocity.ts`

**Problem:** `percentChange` rounded to integer, compared against floating point threshold.

**Fix Applied:**
- Calculate `rawPercentChange` first for accurate threshold comparison
- Compare raw value against threshold: `if (Math.abs(rawPercentChange) < effectiveThreshold)`
- Round only after comparison for the return value
- Added boundary tests verifying edge cases (e.g., 9.5% raw shouldn't be flagged at 10% threshold)

### 3.3 Category Shift Percentage ✅
**File:** `src/lib/insights/calculations/category-shift.ts`

**Problem:** Unrounded percentage returned, could display ugly decimals.

**Fix Applied:**
- Added `Math.round()` to `changePercent` calculation in `computeCategoryDeepDiveShift()`
- Added tests for rounding positive and negative percentages

### 3.4 Recurring Expense Detection ✅ (No changes needed)
**File:** `src/lib/stores/recurring.ts`

**Review Result:** Already correctly implemented!
- All calculations use raw floating-point values
- Threshold comparisons (`variance >= maxVariance`, `variance <= fixedThreshold`) use raw values
- Rounding only happens at the end for stored values (lines 273, 274, 279)
- This is the correct pattern - no changes needed

---

## Phase 4: Standardization & Cleanup (Lower Priority)

Create utilities and patterns to prevent future issues.

### 4.1 Create Currency Utility Module
**New file:** `src/lib/utils/currency.ts`

```typescript
/** Epsilon for currency comparisons (half a cent) */
export const CURRENCY_EPSILON = 0.005;

/** Round to 2 decimal places (cents) */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Compare two currency values with tolerance */
export function currencyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < CURRENCY_EPSILON;
}

/** Check if currency value is effectively zero */
export function isZeroCurrency(value: number): boolean {
  return Math.abs(value) < CURRENCY_EPSILON;
}

/** Sum currency values with final rounding */
export function sumCurrency(values: number[]): number {
  return roundCurrency(values.reduce((sum, v) => sum + v, 0));
}
```

### 4.2 Create Percentage Utility Functions
**Add to:** `src/lib/utils/currency.ts` or new file

```typescript
/** Calculate percentage, optionally rounded */
export function calculatePercent(
  part: number,
  whole: number,
  round: boolean = false
): number {
  if (whole === 0) return 0;
  const percent = (part / whole) * 100;
  return round ? Math.round(percent) : percent;
}

/** Compare percentage against threshold */
export function percentExceeds(
  part: number,
  whole: number,
  threshold: number
): boolean {
  // Use raw calculation for comparison, not rounded
  return whole > 0 && (part / whole) * 100 > threshold;
}
```

### 4.3 Update Existing Code to Use Utilities
- Replace inline `Math.round(value * 100) / 100` with `roundCurrency()`
- Replace `Math.abs(a - b) < 0.01` with `currencyEquals()` or `isZeroCurrency()`
- Replace direct percentage comparisons with `percentExceeds()`

### 4.4 Add Documentation
- Add JSDoc comments explaining rounding strategy
- Document in CLAUDE.md the currency handling conventions

---

## Testing Strategy

### Unit Tests for New Utilities
- `currency.test.ts` with edge cases:
  - Values ending in .005 (rounding boundary)
  - Very small differences (0.001, 0.004, 0.006)
  - Accumulated sums of many values
  - Negative values

### Integration Tests
- Add realistic transaction scenarios to existing test files
- Test threshold boundaries with values like 79.5%, 80.4%, 99.5%

### Regression Tests
- Verify budget progress bar still works correctly
- Verify split transactions validate correctly
- Verify insights display consistently

---

## Implementation Order

```
Phase 1 (Data Integrity)     ✅ COMPLETE
├── 1.1 Shared expense splits ✅
├── 1.2 Outstanding balance ✅
└── 1.3 Split validation tolerance ✅

Phase 2 (Display/Calc)       ✅ COMPLETE
├── 2.1 CategoryBudgetList ✅
├── 2.2 Pace projection ✅ (already correct)
└── 2.3 CashFlowCard ✅

Phase 3 (Insights)           ✅ COMPLETE
├── 3.1 Needs/wants functions ✅
├── 3.2 Velocity threshold ✅
├── 3.3 Category shift ✅
└── 3.4 Recurring detection ✅ (already correct)

Phase 4 (Standardization)    OPTIONAL
├── 4.1 Currency utilities ✅ (created in Phase 1)
├── 4.2 Percentage utilities (optional)
├── 4.3 Refactor existing code (optional)
└── 4.4 Documentation (optional)
```

---

## Success Criteria

- [x] All currency comparisons use tolerance-based checks (Phase 1)
- [x] Displayed values match calculation inputs (no display/logic mismatch) (Phases 1-3)
- [x] New utility functions have 100% test coverage (Phase 1 - currency.ts has 36 tests)
- [ ] No new floating point warnings from static analysis
- [x] Existing tests continue to pass (875 tests passing)
- [x] New realistic-value tests added for each phase

---

## Rollback Plan

Each phase should be a separate commit. If issues arise:
1. Revert the specific phase commit
2. Investigate in isolation
3. Re-apply with fixes

Keep the fix for the budget progress bar (already committed) as the reference implementation for the pattern.
