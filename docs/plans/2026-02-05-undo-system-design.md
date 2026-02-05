# Undo System Design

**Date**: 2026-02-05
**Status**: Approved
**Roadmap Reference**: Group 6

## Overview

Add recoverable deletions to the transaction system. When users delete transactions, they have a 5-second window to undo the action. This uses a soft-delete pattern for robustness—deleted items survive app crashes during the undo window and are permanently purged on next app launch.

## Design Decisions

### Soft Delete vs In-Memory Hold

**Chosen**: Soft delete pattern

- More robust—undo survives app crashes during the window
- Follows existing pattern (`isSplitParent` filtering)
- No breaking changes to data format (new optional fields)

### Toast System Extension vs Separate Component

**Chosen**: Extend existing toast system

- Unified UI logic for all notifications
- Add `actionLabel`, `onAction`, `onDismiss`, `key`, `showCountdown` fields
- Undo toast rendered with distinct styling and countdown progress bar

## Implementation

### 1. Schema Changes (`src/lib/db/constants.ts`)

Add to `Transaction` interface:

```typescript
isDeleted?: boolean;    // true = soft-deleted, awaiting permanent removal
deletedAt?: Date;       // Timestamp of soft deletion (for cleanup)
```

No migration needed—existing transactions won't have these fields, which equals "not deleted."

### 2. Query Filtering (`src/lib/stores/transactions.ts`)

Update all queries that filter `!t.isSplitParent` to also filter `!t.isDeleted`:

```typescript
.filter((t) => !t.isSplitParent && !t.isDeleted)
```

Affected functions:
- `createTransactionsStore()`
- `getTransactionsByMonth()`
- `getTransactionsByDateRange()`
- `getUnsettledTransactions()`
- `getMonthlySpendingTrends()`
- `getCategoryTrends()`
- `getDailySpending()`
- `transactionCache.getAll()` filtering

### 3. New Transaction Functions (`src/lib/stores/transactions.ts`)

```typescript
// Soft delete - marks as deleted but keeps in DB
// Returns the deleted transaction for undo capture
export async function softDeleteTransaction(id: number): Promise<Transaction | null>

// Soft delete multiple - returns deleted transactions
export async function softDeleteTransactions(ids: number[]): Promise<Transaction[]>

// Restore from soft delete
export async function restoreTransaction(id: number): Promise<void>

// Restore multiple
export async function restoreTransactions(ids: number[]): Promise<void>

// Permanently remove all soft-deleted items (called on app startup)
export async function purgeDeletedTransactions(): Promise<number>
```

### 4. Toast System Extension (`src/lib/stores/toast.ts`)

Extend `ToastType`:
```typescript
export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'undo';
```

Extend `Toast` interface:
```typescript
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;

  // New fields for interactive toasts
  key?: string;              // Toasts with same key replace each other
  actionLabel?: string;      // Button text (e.g., "Undo")
  onAction?: () => void;     // Called when action button clicked
  onDismiss?: () => void;    // Called when toast dismissed (timeout or X)
  showCountdown?: boolean;   // Show visual countdown progress bar
}
```

Add singleton behavior:
```typescript
// In add() function - dismiss existing toast with same key
if (options.key) {
  const existing = state.toasts.find(t => t.key === options.key);
  if (existing) {
    dismiss(existing.id);
  }
}
```

### 5. Toast Container Updates (`src/lib/components/ToastContainer.svelte`)

Add undo toast rendering with:
- Trash icon
- Message
- Action button (styled as primary)
- Dismiss button
- CSS-animated countdown progress bar (5s transition)

### 6. Undo Store (`src/lib/stores/undo.ts`)

```typescript
interface UndoState {
  transactions: Transaction[];  // Soft-deleted transactions
  toastId: string | null;       // Reference to active toast
}

const UNDO_WINDOW_MS = 5000;

export const undoStore = {
  subscribe,

  // Called after soft delete - shows undo toast
  capture(transactions: Transaction[]): void,

  // User clicks "Undo" - restores transactions
  async undo(): Promise<boolean>,

  // Timer expired or dismissed - clears state
  clear(): void,
}
```

### 7. Dashboard Actions Integration (`src/lib/stores/dashboardActions.ts`)

Update `deleteTransaction()`:
```typescript
async deleteTransaction(id: number): Promise<void> {
  const deleted = await softDeleteTransaction(id);
  if (deleted) {
    undoStore.capture([deleted]);
  }
  await reloadAfterMutation();
  // Undo toast handles messaging - no toast.success()
}
```

Update `bulkDelete()`:
```typescript
async bulkDelete(ids: number[]): Promise<void> {
  const deleted = await softDeleteTransactions(ids);
  if (deleted.length > 0) {
    undoStore.capture(deleted);
  }
  await reloadAfterMutation();
}
```

### 8. Cleanup on Startup (`src/routes/+layout.svelte`)

```typescript
onMount(async () => {
  const purgedCount = await purgeDeletedTransactions();
  if (purgedCount > 0 && import.meta.env.DEV) {
    console.log(`Purged ${purgedCount} soft-deleted transactions`);
  }
});
```

## User Flow

```
User clicks Delete
       ↓
softDeleteTransaction(id)
  → Sets isDeleted=true, deletedAt=now
  → Returns the transaction data
       ↓
undoStore.capture([tx])
  → Shows undo toast with 5s countdown
       ↓
┌─────────────────────────────────────┐
│ If user clicks "Undo" (within 5s)   │
│   → restoreTransactions([id])       │
│   → Clears isDeleted flag           │
│   → toast.success('Restored')       │
├─────────────────────────────────────┤
│ If timeout expires or user dismisses│
│   → undoStore.clear()               │
│   → Transaction stays soft-deleted  │
│   → Purged on next app launch       │
└─────────────────────────────────────┘
```

## Edge Cases

- **Multiple rapid deletes**: Only most recent is undoable (previous undo toast dismissed)
- **Bulk delete**: All items captured together, undo restores all
- **App closes during window**: Items stay soft-deleted, purged on next launch
- **App crashes during window**: Same as above—soft delete is durable

## Testing

- Soft delete marks transaction correctly
- Queries exclude soft-deleted items
- Restore clears isDeleted flag
- Purge removes old soft-deleted items
- Undo toast appears with countdown
- Undo action restores transaction
- Timeout dismisses without restore
- Singleton behavior (new delete replaces previous undo)

## Files to Create/Modify

**Create:**
- `src/lib/stores/undo.ts`
- `src/lib/stores/undo.test.ts`

**Modify:**
- `src/lib/db/constants.ts` (Transaction interface)
- `src/lib/stores/transactions.ts` (queries + new functions)
- `src/lib/stores/toast.ts` (extended interface)
- `src/lib/components/ToastContainer.svelte` (undo rendering)
- `src/lib/stores/dashboardActions.ts` (integration)
- `src/routes/+layout.svelte` (startup cleanup)
- `CLAUDE.md` (document new undo system)
