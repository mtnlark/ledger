# Tags System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hashtag-based transaction tagging with filtering, displayed as clickable pills.

**Architecture:** Tags are stored as `#tagname` in the existing `notes` field (no schema change). A tag parsing utility extracts tags, an in-memory index enables fast lookups, and UI components display tags as pills with click-to-filter.

**Tech Stack:** Svelte 5, TypeScript, Vitest

---

## Task 1: Tag Parsing Utility

**Files:**
- Create: `src/lib/utils/tags.ts`
- Create: `src/lib/utils/tags.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/utils/tags.test.ts
import { describe, it, expect } from 'vitest';
import { extractTags, removeTags, matchesTag } from './tags';

describe('Tag Utilities', () => {
	describe('extractTags', () => {
		it('extracts single tag', () => {
			expect(extractTags('Dinner #italy')).toEqual(['italy']);
		});

		it('extracts multiple tags', () => {
			expect(extractTags('Got souvenirs #italy #trip')).toEqual(['italy', 'trip']);
		});

		it('returns empty array when no tags', () => {
			expect(extractTags('No tags here')).toEqual([]);
		});

		it('returns empty array for undefined', () => {
			expect(extractTags(undefined)).toEqual([]);
		});

		it('returns empty array for empty string', () => {
			expect(extractTags('')).toEqual([]);
		});

		it('normalizes to lowercase', () => {
			expect(extractTags('#Italy #TRIP')).toEqual(['italy', 'trip']);
		});

		it('deduplicates tags', () => {
			expect(extractTags('#italy #Italy #ITALY')).toEqual(['italy']);
		});

		it('handles tags with hyphens', () => {
			expect(extractTags('#italy-2026 #birthday-party')).toEqual(['italy-2026', 'birthday-party']);
		});

		it('handles tags with numbers', () => {
			expect(extractTags('#trip1 #2026vacation')).toEqual(['trip1', '2026vacation']);
		});

		it('ignores hash without word', () => {
			expect(extractTags('Cost was $50 # nothing')).toEqual([]);
		});

		it('extracts tags at start of string', () => {
			expect(extractTags('#work expense')).toEqual(['work']);
		});

		it('extracts tags at end of string', () => {
			expect(extractTags('expense #work')).toEqual(['work']);
		});
	});

	describe('removeTags', () => {
		it('removes single tag', () => {
			expect(removeTags('Dinner #italy')).toBe('Dinner');
		});

		it('removes multiple tags', () => {
			expect(removeTags('Got souvenirs #italy #trip')).toBe('Got souvenirs');
		});

		it('returns original when no tags', () => {
			expect(removeTags('No tags here')).toBe('No tags here');
		});

		it('returns empty string when only tags', () => {
			expect(removeTags('#italy #trip')).toBe('');
		});

		it('handles undefined', () => {
			expect(removeTags(undefined)).toBe('');
		});

		it('trims extra whitespace', () => {
			expect(removeTags('Dinner   #italy   #trip')).toBe('Dinner');
		});
	});

	describe('matchesTag', () => {
		it('returns true when transaction has tag', () => {
			const tx = { notes: 'Dinner #italy' };
			expect(matchesTag(tx as any, 'italy')).toBe(true);
		});

		it('returns false when transaction lacks tag', () => {
			const tx = { notes: 'Dinner #france' };
			expect(matchesTag(tx as any, 'italy')).toBe(false);
		});

		it('returns false when no notes', () => {
			const tx = {};
			expect(matchesTag(tx as any, 'italy')).toBe(false);
		});

		it('is case insensitive', () => {
			const tx = { notes: 'Dinner #ITALY' };
			expect(matchesTag(tx as any, 'italy')).toBe(true);
		});
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/utils/tags.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// src/lib/utils/tags.ts
import type { Transaction } from '$lib/db';

/**
 * Regex to match hashtags: # followed by letters, numbers, or hyphens
 * Must start with letter or number after #
 */
const TAG_REGEX = /#([a-zA-Z0-9][a-zA-Z0-9-]*)/g;

/**
 * Extract all hashtags from a notes string
 * Returns lowercase, deduplicated array
 */
export function extractTags(notes: string | undefined): string[] {
	if (!notes) return [];

	const matches = notes.matchAll(TAG_REGEX);
	const tags = new Set<string>();

	for (const match of matches) {
		tags.add(match[1].toLowerCase());
	}

	return Array.from(tags);
}

/**
 * Remove hashtag syntax from notes for clean display
 * Returns trimmed string with extra whitespace collapsed
 */
export function removeTags(notes: string | undefined): string {
	if (!notes) return '';

	return notes
		.replace(TAG_REGEX, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Check if a transaction has a specific tag (case insensitive)
 */
export function matchesTag(transaction: Transaction, tag: string): boolean {
	const tags = extractTags(transaction.notes);
	return tags.includes(tag.toLowerCase());
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/utils/tags.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/utils/tags.ts src/lib/utils/tags.test.ts
git commit -m "feat(tags): add tag parsing utility

- extractTags: parse #hashtags from notes field
- removeTags: strip tags for clean display
- matchesTag: check if transaction has specific tag"
```

---

## Task 2: Tag Index Store

**Files:**
- Create: `src/lib/stores/tags.ts`
- Create: `src/lib/stores/tags.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/stores/tags.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TagIndex } from './tags';
import type { Transaction } from '$lib/db';

function createMockTransaction(id: number, notes?: string): Transaction {
	return {
		id,
		date: new Date(),
		merchant: 'Test',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 50,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		notes,
		createdAt: new Date(),
		updatedAt: new Date()
	};
}

describe('TagIndex', () => {
	let index: TagIndex;

	beforeEach(() => {
		index = new TagIndex();
	});

	describe('rebuild', () => {
		it('builds index from transactions', () => {
			const transactions = [
				createMockTransaction(1, 'Dinner #italy'),
				createMockTransaction(2, 'Lunch #italy #food'),
				createMockTransaction(3, 'No tags')
			];
			index.rebuild(transactions);

			expect(index.getAllTags()).toEqual(['food', 'italy']);
		});

		it('clears previous data on rebuild', () => {
			index.rebuild([createMockTransaction(1, '#old')]);
			index.rebuild([createMockTransaction(2, '#new')]);

			expect(index.getAllTags()).toEqual(['new']);
		});
	});

	describe('getAllTags', () => {
		it('returns empty array when no tags', () => {
			index.rebuild([createMockTransaction(1, 'No tags')]);
			expect(index.getAllTags()).toEqual([]);
		});

		it('returns tags sorted alphabetically', () => {
			index.rebuild([
				createMockTransaction(1, '#zebra #apple #middle')
			]);
			expect(index.getAllTags()).toEqual(['apple', 'middle', 'zebra']);
		});
	});

	describe('getTagSuggestions', () => {
		beforeEach(() => {
			index.rebuild([
				createMockTransaction(1, '#italy #ireland'),
				createMockTransaction(2, '#france #food')
			]);
		});

		it('returns tags matching prefix', () => {
			expect(index.getTagSuggestions('i')).toEqual(['ireland', 'italy']);
		});

		it('is case insensitive', () => {
			expect(index.getTagSuggestions('I')).toEqual(['ireland', 'italy']);
		});

		it('returns empty array for no matches', () => {
			expect(index.getTagSuggestions('z')).toEqual([]);
		});

		it('returns all tags for empty prefix', () => {
			expect(index.getTagSuggestions('')).toEqual(['food', 'france', 'ireland', 'italy']);
		});
	});

	describe('getTransactionIdsForTag', () => {
		it('returns transaction IDs for tag', () => {
			index.rebuild([
				createMockTransaction(1, '#italy'),
				createMockTransaction(2, '#italy #france'),
				createMockTransaction(3, '#france')
			]);

			expect(index.getTransactionIdsForTag('italy')).toEqual(new Set([1, 2]));
		});

		it('returns empty set for unknown tag', () => {
			index.rebuild([createMockTransaction(1, '#italy')]);
			expect(index.getTransactionIdsForTag('france')).toEqual(new Set());
		});

		it('is case insensitive', () => {
			index.rebuild([createMockTransaction(1, '#Italy')]);
			expect(index.getTransactionIdsForTag('ITALY')).toEqual(new Set([1]));
		});
	});

	describe('getTransactionCountForTag', () => {
		it('returns count of transactions with tag', () => {
			index.rebuild([
				createMockTransaction(1, '#italy'),
				createMockTransaction(2, '#italy'),
				createMockTransaction(3, '#france')
			]);

			expect(index.getTransactionCountForTag('italy')).toBe(2);
			expect(index.getTransactionCountForTag('france')).toBe(1);
		});

		it('returns 0 for unknown tag', () => {
			index.rebuild([createMockTransaction(1, '#italy')]);
			expect(index.getTransactionCountForTag('spain')).toBe(0);
		});
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/stores/tags.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// src/lib/stores/tags.ts
import type { Transaction } from '$lib/db';
import { extractTags } from '$lib/utils/tags';

/**
 * In-memory index of tags to transaction IDs.
 * Rebuilt when transactions change.
 */
export class TagIndex {
	private tagToIds: Map<string, Set<number>> = new Map();
	private allTags: string[] = [];

	/**
	 * Rebuild the index from a list of transactions.
	 * Call this on app load and after transaction changes.
	 */
	rebuild(transactions: Transaction[]): void {
		this.tagToIds.clear();

		for (const tx of transactions) {
			if (tx.id === undefined) continue;

			const tags = extractTags(tx.notes);
			for (const tag of tags) {
				const ids = this.tagToIds.get(tag) ?? new Set();
				ids.add(tx.id);
				this.tagToIds.set(tag, ids);
			}
		}

		this.allTags = Array.from(this.tagToIds.keys()).sort();
	}

	/**
	 * Get all unique tags, sorted alphabetically.
	 */
	getAllTags(): string[] {
		return this.allTags;
	}

	/**
	 * Get tags matching a prefix (for autocomplete).
	 * Case insensitive.
	 */
	getTagSuggestions(prefix: string): string[] {
		const lowerPrefix = prefix.toLowerCase();
		return this.allTags.filter((tag) => tag.startsWith(lowerPrefix));
	}

	/**
	 * Get transaction IDs that have a specific tag.
	 */
	getTransactionIdsForTag(tag: string): Set<number> {
		return this.tagToIds.get(tag.toLowerCase()) ?? new Set();
	}

	/**
	 * Get count of transactions with a specific tag.
	 */
	getTransactionCountForTag(tag: string): number {
		return this.getTransactionIdsForTag(tag).size;
	}
}

// Singleton instance
export const tagIndex = new TagIndex();
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/stores/tags.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/stores/tags.ts src/lib/stores/tags.test.ts
git commit -m "feat(tags): add tag index store

- TagIndex class with rebuild, getAllTags, getTagSuggestions
- getTransactionIdsForTag for filtering
- Singleton instance for app-wide use"
```

---

## Task 3: Integrate Tag Index with Transaction Cache

**Files:**
- Modify: `src/lib/stores/transactions.ts`

**Step 1: Read current transactions.ts to find initialization point**

Find where `transactionCache.initialize()` is called and add `tagIndex.rebuild()` there.

**Step 2: Add tag index rebuild after cache changes**

```typescript
// At top of file, add import:
import { tagIndex } from './tags';

// In initializeTransactionCache() or wherever cache is initialized:
// After: transactionCache.initialize(transactions);
// Add: tagIndex.rebuild(transactions);

// In any function that modifies transactions (add, update, delete):
// After the cache update, add: tagIndex.rebuild(transactionCache.getAll());
```

**Step 3: Run existing tests**

Run: `npm test -- src/lib/stores/transactions`
Expected: Existing tests still pass

**Step 4: Commit**

```bash
git add src/lib/stores/transactions.ts
git commit -m "feat(tags): integrate tag index with transaction cache

Rebuild tag index whenever transaction cache changes"
```

---

## Task 4: Tag Pills Component

**Files:**
- Create: `src/lib/components/TagPill.svelte`

**Step 1: Create the component**

```svelte
<!-- src/lib/components/TagPill.svelte -->
<script lang="ts">
	interface Props {
		tag: string;
		onClick?: (tag: string) => void;
	}

	let { tag, onClick }: Props = $props();

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		onClick?.(tag);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			onClick?.(tag);
		}
	}
</script>

{#if onClick}
	<button
		type="button"
		onclick={handleClick}
		onkeydown={handleKeydown}
		class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors cursor-pointer"
	>
		{tag}
	</button>
{:else}
	<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
		{tag}
	</span>
{/if}
```

**Step 2: Commit**

```bash
git add src/lib/components/TagPill.svelte
git commit -m "feat(tags): add TagPill component

Clickable pill for displaying tags with hover state"
```

---

## Task 5: Display Tags in Transaction List

**Files:**
- Modify: `src/lib/components/TransactionList.svelte`

**Step 1: Add imports and props**

```typescript
// Add to imports at top:
import { extractTags, removeTags } from '$lib/utils/tags';
import TagPill from './TagPill.svelte';

// Add to Props interface:
onTagClick?: (tag: string) => void;

// Add to destructured props:
let { ..., onTagClick }: Props = $props();
```

**Step 2: Update notes display (around line 223)**

Replace:
```svelte
{#if transaction.notes}
	<p class="text-xs text-charcoal-muted/70 mt-1 italic truncate">{transaction.notes}</p>
{/if}
```

With:
```svelte
{@const tags = extractTags(transaction.notes)}
{@const cleanNotes = removeTags(transaction.notes)}
{#if cleanNotes || tags.length > 0}
	<div class="mt-1 flex flex-wrap items-center gap-1">
		{#if cleanNotes}
			<p class="text-xs text-charcoal-muted/70 italic truncate mr-1">{cleanNotes}</p>
		{/if}
		{#each tags as tag (tag)}
			<TagPill {tag} onClick={onTagClick} />
		{/each}
	</div>
{/if}
```

**Step 3: Test manually**

1. Add a transaction with notes containing `#test #tag`
2. Verify pills appear below the transaction
3. Verify clicking a pill triggers the callback (if provided)

**Step 4: Commit**

```bash
git add src/lib/components/TransactionList.svelte
git commit -m "feat(tags): display tag pills in transaction list

- Extract and display tags as clickable pills
- Show clean notes text without # syntax
- Support onTagClick callback for filtering"
```

---

## Task 6: Add Tags to FilterState

**Files:**
- Modify: `src/lib/components/TransactionFilters.svelte`

**Step 1: Update FilterState interface**

```typescript
export interface FilterState {
	searchQuery: string;
	categoryId: number | null;
	dateFrom: string;
	dateTo: string;
	searchAllTime: boolean;
	tags: string[];  // Add this
}
```

**Step 2: Update hasActiveFilters and hasAdvancedFilters**

```typescript
let hasActiveFilters = $derived(
	filters.searchQuery.trim() !== '' ||
	filters.categoryId !== null ||
	filters.dateFrom !== '' ||
	filters.dateTo !== '' ||
	filters.searchAllTime ||
	filters.tags.length > 0  // Add this
);

let hasAdvancedFilters = $derived(
	filters.categoryId !== null ||
	filters.dateFrom !== '' ||
	filters.dateTo !== '' ||
	filters.tags.length > 0  // Add this
);
```

**Step 3: Update clearFilters**

```typescript
function clearFilters() {
	onFilterChange({
		searchQuery: '',
		categoryId: null,
		dateFrom: '',
		dateTo: '',
		searchAllTime: false,
		tags: []  // Add this
	});
}
```

**Step 4: Commit**

```bash
git add src/lib/components/TransactionFilters.svelte
git commit -m "feat(tags): add tags to FilterState interface

Extend filter state to support tag filtering"
```

---

## Task 7: Tag Filter Dropdown

**Files:**
- Modify: `src/lib/components/TransactionFilters.svelte`

**Step 1: Add imports and tag index**

```typescript
// Add imports:
import { tagIndex } from '$lib/stores/tags';
import { X } from 'lucide-svelte';  // Already imported, just ensure it's there
import TagPill from './TagPill.svelte';

// Add derived for available tags:
let availableTags = $derived(tagIndex.getAllTags());
```

**Step 2: Add tag filter UI in advanced filters section (after category filter)**

```svelte
<!-- Tag Filter -->
<div>
	<label for="tag-filter" class="block text-xs font-medium text-charcoal-muted mb-1">Tags</label>
	<select
		id="tag-filter"
		value=""
		onchange={(e) => {
			const tag = e.currentTarget.value;
			if (tag && !filters.tags.includes(tag)) {
				onFilterChange({ ...filters, tags: [...filters.tags, tag] });
			}
			e.currentTarget.value = '';
		}}
		class="w-full px-3 py-2 bg-cream rounded-lg border border-transparent focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:bg-surface transition-all text-charcoal"
	>
		<option value="">Add tag filter...</option>
		{#each availableTags as tag (tag)}
			{#if !filters.tags.includes(tag)}
				<option value={tag}>
					{tag} ({tagIndex.getTransactionCountForTag(tag)})
				</option>
			{/if}
		{/each}
	</select>

	{#if filters.tags.length > 0}
		<div class="flex flex-wrap gap-1 mt-2">
			{#each filters.tags as tag (tag)}
				<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
					{tag}
					<button
						type="button"
						onclick={() => onFilterChange({ ...filters, tags: filters.tags.filter(t => t !== tag) })}
						class="hover:text-primary-900"
					>
						<X size={12} />
					</button>
				</span>
			{/each}
		</div>
	{/if}
</div>
```

**Step 3: Commit**

```bash
git add src/lib/components/TransactionFilters.svelte
git commit -m "feat(tags): add tag filter dropdown

- Dropdown shows all tags with transaction counts
- Selected tags shown as dismissible pills
- Multi-select support with OR logic"
```

---

## Task 8: Wire Up Tag Filtering in Dashboard

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Find the filter state initialization and add tags**

Look for where `FilterState` is initialized and ensure `tags: []` is included.

**Step 2: Find where transactions are filtered and add tag filtering**

Add tag filtering logic using OR:
```typescript
// In the filtering logic:
if (filters.tags.length > 0) {
	filtered = filtered.filter(tx =>
		filters.tags.some(tag => matchesTag(tx, tag))
	);
}
```

**Step 3: Wire up onTagClick from TransactionList**

```svelte
<TransactionList
	...
	onTagClick={(tag) => {
		if (!filters.tags.includes(tag)) {
			filters = { ...filters, tags: [...filters.tags, tag] };
		}
	}}
/>
```

**Step 4: Test manually**

1. Add transactions with various tags
2. Click a tag pill → should filter to that tag
3. Select additional tag from dropdown → should show OR of both
4. Clear filters → should reset tags

**Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(tags): wire up tag filtering in dashboard

- Filter transactions by selected tags (OR logic)
- Click-to-filter from tag pills
- Tags included in clear filters"
```

---

## Task 9: Tag Autocomplete in Notes Field

**Files:**
- Create: `src/lib/components/TagAutocomplete.svelte`
- Modify: `src/lib/components/TransactionForm.svelte`

**Step 1: Create TagAutocomplete component**

```svelte
<!-- src/lib/components/TagAutocomplete.svelte -->
<script lang="ts">
	import { tagIndex } from '$lib/stores/tags';

	interface Props {
		value: string;
		onInput: (value: string) => void;
		placeholder?: string;
		id?: string;
	}

	let { value, onInput, placeholder = '', id }: Props = $props();

	let inputElement = $state<HTMLInputElement | null>(null);
	let showSuggestions = $state(false);
	let suggestions = $state<string[]>([]);
	let selectedIndex = $state(-1);

	// Track cursor position and # detection
	let hashStartIndex = $state(-1);

	function handleInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const newValue = input.value;
		const cursorPos = input.selectionStart ?? 0;

		onInput(newValue);

		// Find if we're in a hashtag context
		const beforeCursor = newValue.slice(0, cursorPos);
		const hashMatch = beforeCursor.match(/#([a-zA-Z0-9-]*)$/);

		if (hashMatch) {
			hashStartIndex = beforeCursor.lastIndexOf('#');
			const prefix = hashMatch[1];
			suggestions = tagIndex.getTagSuggestions(prefix).slice(0, 5);
			showSuggestions = suggestions.length > 0;
			selectedIndex = -1;
		} else {
			showSuggestions = false;
			hashStartIndex = -1;
		}
	}

	function selectSuggestion(tag: string) {
		if (hashStartIndex === -1) return;

		const before = value.slice(0, hashStartIndex);
		const cursorPos = inputElement?.selectionStart ?? value.length;
		const after = value.slice(cursorPos);

		const newValue = `${before}#${tag}${after ? ' ' + after.trimStart() : ' '}`;
		onInput(newValue);

		showSuggestions = false;
		hashStartIndex = -1;

		// Focus back and set cursor after the inserted tag
		setTimeout(() => {
			inputElement?.focus();
			const newCursorPos = before.length + tag.length + 2; // +2 for # and space
			inputElement?.setSelectionRange(newCursorPos, newCursorPos);
		}, 0);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!showSuggestions) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
		} else if (e.key === 'Enter' && selectedIndex >= 0) {
			e.preventDefault();
			selectSuggestion(suggestions[selectedIndex]);
		} else if (e.key === 'Escape') {
			showSuggestions = false;
		}
	}

	function handleBlur() {
		// Delay to allow click on suggestion
		setTimeout(() => {
			showSuggestions = false;
		}, 150);
	}
</script>

<div class="relative">
	<input
		type="text"
		{id}
		bind:this={inputElement}
		{value}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onblur={handleBlur}
		{placeholder}
		class="w-full px-3 py-2.5 bg-surface-alt border border-theme rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors placeholder:text-charcoal-muted"
	/>

	{#if showSuggestions}
		<div class="absolute left-0 right-0 top-full mt-1 bg-surface rounded-lg shadow-lg border border-theme z-50 py-1">
			{#each suggestions as tag, i (tag)}
				<button
					type="button"
					onclick={() => selectSuggestion(tag)}
					class="w-full px-3 py-2 text-left text-sm hover:bg-surface-hover transition-colors {i === selectedIndex ? 'bg-primary-50' : ''}"
				>
					#{tag}
				</button>
			{/each}
		</div>
	{/if}
</div>
```

**Step 2: Update TransactionForm to use TagAutocomplete**

Replace the notes input (around line 555-561) with:

```svelte
<script>
// Add import at top:
import TagAutocomplete from './TagAutocomplete.svelte';
</script>

<!-- Replace the notes input div with: -->
<div>
	<label for="notes" class="block text-sm font-medium text-charcoal-soft mb-1.5">
		Notes <span class="text-charcoal-muted font-normal">(optional)</span>
	</label>
	<TagAutocomplete
		id="notes"
		value={notes}
		onInput={(v) => notes = v}
		placeholder="Add notes... use #tags for filtering"
	/>
</div>
```

**Step 3: Test manually**

1. In transaction form, type `#` in notes
2. Verify dropdown appears with existing tags
3. Arrow keys navigate, Enter selects
4. Verify tag is inserted with space after

**Step 4: Commit**

```bash
git add src/lib/components/TagAutocomplete.svelte src/lib/components/TransactionForm.svelte
git commit -m "feat(tags): add tag autocomplete to notes field

- TagAutocomplete component with keyboard navigation
- Shows suggestions when typing #
- Auto-inserts selected tag at cursor position"
```

---

## Task 10: Add Autocomplete to Edit Modal

**Files:**
- Modify: `src/lib/components/EditTransactionModal.svelte`

**Step 1: Add import and replace notes input**

Same pattern as TransactionForm - import TagAutocomplete and replace the notes input field.

**Step 2: Commit**

```bash
git add src/lib/components/EditTransactionModal.svelte
git commit -m "feat(tags): add tag autocomplete to edit modal

Same autocomplete behavior as add transaction form"
```

---

## Task 11: Final Testing & Documentation

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Manual testing checklist**

- [ ] Add transaction with `#trip #italy` in notes
- [ ] Verify pills display in transaction list
- [ ] Click pill → filters to that tag
- [ ] Open filters → select additional tag
- [ ] Verify OR logic (shows both tags' transactions)
- [ ] Clear filters → tags reset
- [ ] Edit transaction → autocomplete works
- [ ] Add new transaction → autocomplete works

**Step 3: Update CLAUDE.md if needed**

Add tags to the Transaction interface documentation if not already there.

**Step 4: Final commit**

```bash
git add -A
git commit -m "docs: update CLAUDE.md with tags documentation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Tag parsing utility | `utils/tags.ts`, `utils/tags.test.ts` |
| 2 | Tag index store | `stores/tags.ts`, `stores/tags.test.ts` |
| 3 | Integrate with cache | `stores/transactions.ts` |
| 4 | TagPill component | `components/TagPill.svelte` |
| 5 | Display in list | `components/TransactionList.svelte` |
| 6 | FilterState update | `components/TransactionFilters.svelte` |
| 7 | Tag filter dropdown | `components/TransactionFilters.svelte` |
| 8 | Dashboard wiring | `routes/+page.svelte` |
| 9 | Notes autocomplete | `components/TagAutocomplete.svelte`, `TransactionForm.svelte` |
| 10 | Edit modal autocomplete | `components/EditTransactionModal.svelte` |
| 11 | Final testing | All files |
