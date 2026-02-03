# Tags System Design

**Date**: February 3, 2026
**Status**: Approved

## Overview

Add tag-based filtering to transactions using the existing `notes` field. Users type `#tagname` in notes, which displays as clean pills in the UI and enables filtering by tag.

**Primary use case**: Track costs for events/occasions (trips, parties, projects) across categories.

---

## 1. Tag Parsing & Storage

### Storage
- Tags stored as `#tagname` in existing `notes` field (no schema change)
- Case-insensitive, stored/displayed lowercase
- Valid characters: letters, numbers, hyphens (e.g., `#italy-2026`, `#birthday-party`)
- Multiple tags allowed: `"Dinner with friends #italy #food"`

### Parsing Utility
**File**: `src/lib/utils/tags.ts`

```typescript
// Extract tags from notes
extractTags("Got souvenirs #italy #trip")
// → ["italy", "trip"]

// Remove tag syntax for clean display
removeTags("Dinner #italy #food")
// → "Dinner"

// Check if transaction matches tag
matchesTag(transaction, "italy")
// → true/false
```

---

## 2. Tag Index & Autocomplete

### In-Memory Index
**File**: `src/lib/stores/tags.ts`

- Build `Map<tag, transactionIds[]>` on app load
- Rebuild on transaction add/edit/delete (via cache invalidation)

```typescript
getAllTags()
// → ["italy", "trip", "work"] (sorted alphabetically)

getTagSuggestions("it")
// → ["italy"] (prefix match)

getTransactionCountForTag("italy")
// → 12
```

### Autocomplete Behavior
- Triggered when user types `#` in notes textarea
- Dropdown appears below textarea
- Filters as user types: `#it` → shows "italy"
- Select from dropdown or keep typing for new tag
- Space/Enter closes dropdown

---

## 3. Tag Filter UI

### Filter Bar Addition
**File**: `src/lib/components/TransactionFilters.svelte`

- New "Tags" dropdown next to category filter
- Shows tags with counts: "italy (12)", "work (8)"
- Multi-select with OR logic (transactions matching ANY selected tag)
- Active tags shown as dismissible pills

### Click-to-Filter
- Clicking tag pill on transaction applies it as filter
- Adds to existing filters (doesn't replace)
- Brief highlight feedback on clicked pill

### Clear Behavior
- "Clear filters" resets tags with other filters
- Individual × buttons on tag pills in filter bar

---

## 4. Transaction List Display

### Tag Pills
**File**: `src/lib/components/TransactionList.svelte`

- Extract tags from notes, render as pills below transaction
- Strip `#tags` from displayed note text
- If note is only tags, show just pills (no empty text)
- Pills always visible (not truncated with long notes)
- Clickable to filter

### Example
```
🍽️ Trattoria Roma                           $45.00
   Dinner with friends                    [italy] [food]
```

### Pill Styling
- Subtle background (similar to category badges)
- Rounded corners, small text
- Hover state indicating clickable

---

## 5. Notes Entry UX

### TransactionForm Enhancement
**File**: `src/lib/components/TransactionForm.svelte`

- Add tag autocomplete to existing notes textarea
- Dropdown appears below textarea when `#` typed
- Placeholder: `"Add notes... use #tags for filtering"`

### Edit Modal
- Same autocomplete behavior
- User sees `#` syntax while editing

---

## Implementation Order

1. **Tag parsing utility** (`tags.ts` + tests)
2. **Tag index store** (`stores/tags.ts`)
3. **Transaction list display** (pills, click-to-filter)
4. **Filter bar integration** (tag dropdown)
5. **Notes autocomplete** (form + edit modal)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/utils/tags.ts` | Create - parsing functions |
| `src/lib/utils/tags.test.ts` | Create - tests |
| `src/lib/stores/tags.ts` | Create - tag index |
| `src/lib/components/TransactionList.svelte` | Modify - tag pills |
| `src/lib/components/TransactionFilters.svelte` | Modify - tag dropdown |
| `src/lib/components/TransactionForm.svelte` | Modify - autocomplete |
| `src/lib/components/EditTransactionModal.svelte` | Modify - autocomplete |

---

## Future Considerations (Not in Scope)

- Tag management UI (rename, merge, delete tags)
- Tag colors/icons
- Tag-based insights ("You spent $X on #italy")
- AND logic option for multi-tag filtering
