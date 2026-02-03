# Tag Management Design

**Date**: February 3, 2026
**Status**: Approved

## Overview

Add tag popover (hover on pills), inline tag management (rename/delete), and helper text for tag format. Builds on the existing tags system.

**Primary use cases**:
- See total spending for a tag at a glance (user's share for splits)
- Rename a tag across all transactions without editing each one
- Delete a tag from all transactions
- Clarify tag format rules for new users

---

## 1. Tag Pill Popover

### Behavior
- Hover a tag pill on any transaction → popover appears after 300ms delay
- Popover positioned above or below the pill (auto-flip if near edge)
- Disappears when mouse leaves both pill and popover
- Clicking the pill still filters as before (no change)

### Popover Content
- **Total spent**: User's share across all transactions with this tag
- **Transaction count**: "across N transactions"
- Informational only — no actions in the popover

### Total Calculation
For each transaction matching the tag:
- If `isShared`: user's share = `amount - partnerShare`
- If not shared: full `amount`

Sum all user shares.

### Component
**Create**: `src/lib/components/TagPopover.svelte`

**Modify**: `src/lib/components/TagPill.svelte`
- Add mouseenter/mouseleave handlers
- Show TagPopover on hover with delay

---

## 2. Manage Tags (Inline Section)

### Location
Inside the Tags filter dropdown in `TransactionFilters.svelte`.

### Entry Point
- "Manage tags" link at the bottom of the tag list
- Clicking it replaces the tag selection list with the management view

### Layout Per Tag Row
- Tag name (click to edit → becomes text input)
- Stats: "12 txns · $342.50" (count + user's share total)
- Delete button (× icon)

### Rename Flow
1. Click tag name → editable input, pre-filled with current name
2. Type new name → validated (letters, numbers, hyphens, lowercase)
3. Enter or blur → batch-update all transactions: replace `#oldtag` with `#newtag` in notes
4. Escape → cancel edit

### Delete Flow
1. Click × → inline confirmation: "Remove from N transactions?"
2. Confirm → strip `#tagname` from all matching transaction notes
3. If notes becomes empty/whitespace-only after stripping, clear it entirely

### Navigation
- "Done" link at top switches back to normal tag filter view

---

## 3. Tag Format Helper Text

### Location
Below the notes input in both:
- `src/lib/components/TransactionForm.svelte`
- `src/lib/components/EditTransactionModal.svelte`

### Text
`Use #tags to group transactions (letters, numbers, hyphens)`

### Styling
Small, muted gray text — consistent with other form helper text.

---

## 4. Store Functions

### Tag Operations (`src/lib/stores/transactions.ts`)

```typescript
renameTag(oldTag: string, newTag: string): Promise<void>
// Batch-updates all transaction notes, replacing #oldtag with #newtag
// Validates newTag format before proceeding
// Rebuilds tag index after update

deleteTag(tag: string): Promise<void>
// Strips #tag from all matching transaction notes
// Clears notes field if it becomes empty/whitespace after stripping
// Rebuilds tag index after update
```

### Tag Utility (`src/lib/utils/tags.ts`)

```typescript
calculateTagTotal(transactions: Transaction[], tag: string): number
// Sums user's share for all transactions matching the tag
// Shared: amount - partnerShare
// Non-shared: full amount

replaceTag(notes: string, oldTag: string, newTag: string): string
// Replaces #oldtag with #newtag in notes string
// Preserves surrounding text

stripTag(notes: string, tag: string): string
// Removes #tag from notes string
// Cleans up extra whitespace
```

---

## 5. Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/components/TagPopover.svelte` | Create — hover popover |
| `src/lib/components/TagPill.svelte` | Modify — add hover handlers |
| `src/lib/components/TransactionFilters.svelte` | Modify — add manage tags section |
| `src/lib/components/TransactionForm.svelte` | Modify — add helper text |
| `src/lib/components/EditTransactionModal.svelte` | Modify — add helper text |
| `src/lib/utils/tags.ts` | Modify — add calculateTagTotal, replaceTag, stripTag |
| `src/lib/utils/tags.test.ts` | Modify — add tests for new functions |
| `src/lib/stores/transactions.ts` | Modify — add renameTag, deleteTag |

---

## 6. Future Considerations (Not in Scope)

- Tag colors/icons
- Tag-based insights page ("You spent $X on #italy")
- Merge two tags into one
- Tag suggestions based on merchant/category patterns
