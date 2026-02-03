# Tag Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tag popover (hover on pills showing totals), inline tag management (rename/delete), and helper text for tag format rules.

**Architecture:** New utility functions for tag total calculation, replacement, and stripping. New `renameTag`/`deleteTag` store functions that batch-update all transactions in Dexie, then persist and rebuild the tag index. A new `TagPopover.svelte` component shown on hover with delay. Inline management section in the existing filter dropdown.

**Tech Stack:** Svelte 5 (runes), TypeScript, Dexie.js, Vitest, Tailwind CSS v4

---

### Task 1: Tag Utility Functions — `calculateTagTotal`, `replaceTag`, `stripTag`

Add three functions to the existing tag utility module, with tests.

**Files:**
- Modify: `src/lib/utils/tags.ts`
- Modify: `src/lib/utils/tags.test.ts`

**Context:**
- `tags.ts` currently exports: `extractTags`, `removeTags`, `matchesTag`
- `TAG_PATTERN = /#([a-zA-Z0-9][a-zA-Z0-9-]*)/g`
- The `Transaction` type has: `amount: number`, `isShared: boolean`, `partnerShare: number`
- User's share = `isShared ? amount - partnerShare : amount`
- Use `sumCurrency` from `$lib/utils/currency` for safe float addition

**Step 1: Write failing tests**

Add to `src/lib/utils/tags.test.ts`:

```typescript
import { extractTags, removeTags, matchesTag, calculateTagTotal, replaceTag, stripTag } from './tags.js';
// Update the import at top of file to include new functions

describe('calculateTagTotal', () => {
  const createTx = (amount: number, notes?: string, isShared = false, partnerShare = 0): Transaction => ({
    id: 1,
    date: new Date(),
    merchant: 'Test',
    amount,
    categoryId: 1,
    isShared,
    splitType: 'percentage',
    splitValue: 50,
    partnerShare,
    isSettled: false,
    isEssential: false,
    isSubscription: false,
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('returns 0 for empty transactions', () => {
    expect(calculateTagTotal([], 'italy')).toBe(0);
  });

  it('sums full amounts for non-shared transactions', () => {
    const txs = [
      createTx(50, '#italy dinner'),
      createTx(30, '#italy lunch'),
    ];
    expect(calculateTagTotal(txs, 'italy')).toBe(80);
  });

  it('sums user share for shared transactions', () => {
    const txs = [
      createTx(100, '#italy hotel', true, 50),
    ];
    expect(calculateTagTotal(txs, 'italy')).toBe(50);
  });

  it('only includes transactions matching the tag', () => {
    const txs = [
      createTx(50, '#italy dinner'),
      createTx(30, '#france lunch'),
    ];
    expect(calculateTagTotal(txs, 'italy')).toBe(50);
  });

  it('handles mix of shared and non-shared', () => {
    const txs = [
      createTx(100, '#trip shared hotel', true, 40),
      createTx(25, '#trip solo coffee'),
    ];
    expect(calculateTagTotal(txs, 'trip')).toBe(85);
  });

  it('is case insensitive', () => {
    const txs = [createTx(50, '#Italy dinner')];
    expect(calculateTagTotal(txs, 'italy')).toBe(50);
  });
});

describe('replaceTag', () => {
  it('replaces a tag in notes', () => {
    expect(replaceTag('Dinner #old-tag notes', 'old-tag', 'new-tag')).toBe('Dinner #new-tag notes');
  });

  it('replaces tag case-insensitively', () => {
    expect(replaceTag('#OldTag lunch', 'oldtag', 'newtag')).toBe('#newtag lunch');
  });

  it('replaces only the exact tag', () => {
    expect(replaceTag('#italy #italy-trip', 'italy', 'france')).toBe('#france #italy-trip');
  });

  it('handles tag at end of string', () => {
    expect(replaceTag('Dinner #food', 'food', 'restaurant')).toBe('Dinner #restaurant');
  });

  it('handles tag at start of string', () => {
    expect(replaceTag('#food dinner', 'food', 'restaurant')).toBe('#restaurant dinner');
  });

  it('handles notes with only the tag', () => {
    expect(replaceTag('#food', 'food', 'restaurant')).toBe('#restaurant');
  });

  it('returns original if tag not found', () => {
    expect(replaceTag('Dinner #food', 'travel', 'trip')).toBe('Dinner #food');
  });
});

describe('stripTag', () => {
  it('removes a tag from notes', () => {
    expect(stripTag('Dinner #italy notes', 'italy')).toBe('Dinner notes');
  });

  it('removes tag case-insensitively', () => {
    expect(stripTag('#ITALY lunch', 'italy')).toBe('lunch');
  });

  it('removes only the exact tag', () => {
    expect(stripTag('#italy #italy-trip', 'italy')).toBe('#italy-trip');
  });

  it('cleans up extra whitespace', () => {
    expect(stripTag('Before  #tag  after', 'tag')).toBe('Before after');
  });

  it('returns empty string when tag is the only content', () => {
    expect(stripTag('#italy', 'italy')).toBe('');
  });

  it('returns empty string when all tags removed', () => {
    expect(stripTag('#italy #france', 'italy')).toBe('#france');
  });

  it('returns original if tag not found', () => {
    expect(stripTag('Dinner #food', 'travel')).toBe('Dinner #food');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/lib/utils/tags.test.ts`
Expected: FAIL — functions not exported

**Step 3: Implement the functions**

Add to `src/lib/utils/tags.ts`:

```typescript
import { sumCurrency } from '$lib/utils/currency.js';

/**
 * Calculate total spending for a tag across transactions.
 * Uses user's share (amount - partnerShare) for shared transactions.
 */
export function calculateTagTotal(transactions: Transaction[], tag: string): number {
  const normalizedTag = tag.replace(/^#/, '').toLowerCase();
  const amounts = transactions
    .filter(tx => extractTags(tx.notes).includes(normalizedTag))
    .map(tx => tx.isShared ? tx.amount - tx.partnerShare : tx.amount);
  return sumCurrency(amounts);
}

/**
 * Replace a specific tag in notes text with a new tag name.
 * Matches case-insensitively but replaces with the new tag as provided (lowercase).
 * Only replaces the exact tag, not tags that start with the same prefix.
 */
export function replaceTag(notes: string, oldTag: string, newTag: string): string {
  const normalizedOld = oldTag.replace(/^#/, '').toLowerCase();
  const normalizedNew = newTag.replace(/^#/, '').toLowerCase();
  // Match #oldtag that is NOT followed by more word chars or hyphens
  const pattern = new RegExp(`#${escapeRegex(normalizedOld)}(?![a-zA-Z0-9-])`, 'gi');
  return notes.replace(pattern, `#${normalizedNew}`);
}

/**
 * Strip a specific tag from notes text.
 * Cleans up whitespace after removal. Returns empty string if nothing remains.
 */
export function stripTag(notes: string, tag: string): string {
  const normalizedTag = tag.replace(/^#/, '').toLowerCase();
  const pattern = new RegExp(`#${escapeRegex(normalizedTag)}(?![a-zA-Z0-9-])`, 'gi');
  return notes.replace(pattern, '').replace(/\s+/g, ' ').trim();
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

Note: The `import { sumCurrency }` is a new import to add at the top of the file. The `escapeRegex` helper is private (not exported).

**Step 4: Run tests to verify they pass**

Run: `npm run test -- --run src/lib/utils/tags.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/utils/tags.ts src/lib/utils/tags.test.ts
git commit -m "feat: add calculateTagTotal, replaceTag, stripTag utilities"
```

---

### Task 2: Store Functions — `renameTag` and `deleteTag`

Add batch operations in the transactions store to rename and delete tags across all transactions.

**Files:**
- Modify: `src/lib/stores/transactions.ts`

**Context:**
- The file imports `db` (Dexie), `persistData`, `getTransactionCache`, and `tagIndex`
- Existing pattern for batch updates: query matching transactions from Dexie, update each, update cache, rebuild tag index, persist
- `replaceTag` and `stripTag` come from `$lib/utils/tags`
- The cache has `getAll()`, `update(id, fields)` methods
- After mutations: call `invalidateTransactionCaches()`, `tagIndex.rebuild(cache.getAll())`, `persistData()`

**Step 1: Implement `renameTag`**

Add to `src/lib/stores/transactions.ts`:

```typescript
import { replaceTag, stripTag } from '$lib/utils/tags';

/**
 * Rename a tag across all transactions that use it.
 * Updates the notes field, replacing #oldTag with #newTag.
 */
export async function renameTag(oldTag: string, newTag: string): Promise<number> {
	const normalizedOld = oldTag.replace(/^#/, '').toLowerCase();
	const normalizedNew = newTag.replace(/^#/, '').toLowerCase();

	if (normalizedOld === normalizedNew) return 0;
	if (!normalizedNew || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(normalizedNew)) {
		throw new Error('Invalid tag name. Use letters, numbers, and hyphens.');
	}

	// Find all transactions with the old tag
	const allTransactions = await db.transactions.toArray();
	const matching = allTransactions.filter(tx => {
		if (!tx.notes) return false;
		const pattern = new RegExp(`#${normalizedOld}(?![a-zA-Z0-9-])`, 'i');
		return pattern.test(tx.notes);
	});

	if (matching.length === 0) return 0;

	const now = new Date();
	await db.transaction('rw', db.transactions, async () => {
		for (const tx of matching) {
			const newNotes = replaceTag(tx.notes!, normalizedOld, normalizedNew);
			await db.transactions.update(tx.id!, { notes: newNotes, updatedAt: now });
		}
	});

	// Update cache
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		for (const tx of matching) {
			const newNotes = replaceTag(tx.notes!, normalizedOld, normalizedNew);
			cache.update(tx.id!, { notes: newNotes, updatedAt: now });
		}
		tagIndex.rebuild(cache.getAll());
	}

	invalidateTransactionCaches();
	await persistData();
	return matching.length;
}
```

**Step 2: Implement `deleteTag`**

Add to `src/lib/stores/transactions.ts`:

```typescript
/**
 * Remove a tag from all transactions that use it.
 * Strips #tag from notes, clearing notes entirely if nothing remains.
 */
export async function deleteTag(tag: string): Promise<number> {
	const normalizedTag = tag.replace(/^#/, '').toLowerCase();

	// Find all transactions with this tag
	const allTransactions = await db.transactions.toArray();
	const matching = allTransactions.filter(tx => {
		if (!tx.notes) return false;
		const pattern = new RegExp(`#${normalizedTag}(?![a-zA-Z0-9-])`, 'i');
		return pattern.test(tx.notes);
	});

	if (matching.length === 0) return 0;

	const now = new Date();
	await db.transaction('rw', db.transactions, async () => {
		for (const tx of matching) {
			const newNotes = stripTag(tx.notes!, normalizedTag);
			await db.transactions.update(tx.id!, {
				notes: newNotes || undefined,
				updatedAt: now
			});
		}
	});

	// Update cache
	const cache = getTransactionCache();
	if (cache.isLoaded) {
		for (const tx of matching) {
			const newNotes = stripTag(tx.notes!, normalizedTag);
			cache.update(tx.id!, { notes: newNotes || undefined, updatedAt: now });
		}
		tagIndex.rebuild(cache.getAll());
	}

	invalidateTransactionCaches();
	await persistData();
	return matching.length;
}
```

**Step 3: Run all tests**

Run: `npm run test -- --run`
Expected: All 1160+ tests PASS (no regressions)

**Step 4: Commit**

```bash
git add src/lib/stores/transactions.ts
git commit -m "feat: add renameTag and deleteTag batch operations"
```

---

### Task 3: TagPopover Component

Create the hover popover that shows tag total and count.

**Files:**
- Create: `src/lib/components/TagPopover.svelte`
- Modify: `src/lib/components/TagPill.svelte`

**Context:**
- The popover appears on hover after 300ms delay, disappears when mouse leaves both pill and popover
- Shows: total spent (formatted as currency), transaction count
- `calculateTagTotal` comes from `$lib/utils/tags`
- `formatCurrency` comes from `$lib/utils/format-helpers`
- `tagIndex.getTransactionCountForTag(tag)` returns count
- The popover needs access to the full transaction list to calculate the total. Pass `allTransactions` as a prop.
- Design system colors: `bg-surface`, `text-charcoal`, `text-charcoal-muted`, `shadow-md`, `border-theme`
- Fonts: amounts use `font-mono`, labels use default DM Sans

**Step 1: Create `TagPopover.svelte`**

```svelte
<script lang="ts">
	import type { Transaction } from '$lib/db';
	import { calculateTagTotal } from '$lib/utils/tags';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import { tagIndex } from '$lib/stores/tags.svelte';

	interface Props {
		tag: string;
		transactions: Transaction[];
		visible: boolean;
	}

	let { tag, transactions, visible }: Props = $props();

	let total = $derived(calculateTagTotal(transactions, tag));
	let count = $derived(tagIndex.getTransactionCountForTag(tag));
</script>

{#if visible}
	<div
		class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-auto"
		role="tooltip"
	>
		<div class="bg-surface rounded-lg shadow-lg border border-theme px-3 py-2 whitespace-nowrap text-sm">
			<div class="font-mono font-semibold text-charcoal">{formatCurrency(total)}</div>
			<div class="text-xs text-charcoal-muted">across {count} transaction{count !== 1 ? 's' : ''}</div>
		</div>
		<!-- Arrow -->
		<div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--color-border)]"></div>
	</div>
{/if}
```

**Step 2: Update `TagPill.svelte` to show popover on hover**

Replace the entire content of `src/lib/components/TagPill.svelte`:

```svelte
<script lang="ts">
	import type { Transaction } from '$lib/db';
	import TagPopover from './TagPopover.svelte';

	interface Props {
		tag: string;
		onClick?: (tag: string) => void;
		transactions?: Transaction[];
	}

	let { tag, onClick, transactions = [] }: Props = $props();

	let showPopover = $state(false);
	let hoverTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	function handleMouseEnter(): void {
		hoverTimeout = setTimeout(() => {
			showPopover = true;
		}, 300);
	}

	function handleMouseLeave(): void {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		showPopover = false;
	}

	function handleClick(e: MouseEvent): void {
		e.stopPropagation();
		onClick?.(tag);
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			onClick?.(tag);
		}
	}
</script>

<span
	class="relative inline-flex"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
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

	{#if transactions.length > 0}
		<TagPopover {tag} {transactions} visible={showPopover} />
	{/if}
</span>
```

**Step 3: Update `TransactionList.svelte` to pass `allTransactions` to TagPill**

Find the `TagPill` usage in `TransactionList.svelte`. It currently looks like:

```svelte
<TagPill {tag} onClick={onTagClick} />
```

The component needs access to `allTransactions`. Look at its props — it likely receives a `transactions` array prop already. Check what prop name is used and add a new `allTransactions` prop if needed.

Search for the Props interface in `TransactionList.svelte`. Add an `allTransactions` prop:

```typescript
// In the Props interface, add:
allTransactions?: Transaction[];
```

Then pass it to TagPill:

```svelte
<TagPill {tag} onClick={onTagClick} transactions={allTransactions ?? []} />
```

Also update `+page.svelte` where `TransactionList` is used to pass the prop:

```svelte
<TransactionList ... allTransactions={allTransactions} />
```

**Step 4: Run tests and verify build**

Run: `npm run test -- --run && npm run build`
Expected: All tests pass, build succeeds

**Step 5: Commit**

```bash
git add src/lib/components/TagPopover.svelte src/lib/components/TagPill.svelte src/lib/components/TransactionList.svelte src/routes/+page.svelte
git commit -m "feat: add tag popover showing total spent and count on hover"
```

---

### Task 4: Manage Tags — Inline Section in Filter Dropdown

Add a "Manage tags" link in the filter dropdown that expands an inline section for renaming and deleting tags.

**Files:**
- Modify: `src/lib/components/TransactionFilters.svelte`

**Context:**
- The filter dropdown is in `TransactionFilters.svelte`, lines 180–221
- `tagIndex.getAllTags()` returns all tags, `tagIndex.getTransactionCountForTag(tag)` returns counts
- `renameTag(old, new)` and `deleteTag(tag)` are in `$lib/stores/transactions`
- `calculateTagTotal` is in `$lib/utils/tags`
- `formatCurrency` is in `$lib/utils/format-helpers`
- The component needs `allTransactions` passed as a prop from the parent to calculate totals
- Use the existing design system: `bg-cream`, `text-charcoal-muted`, `text-primary-600` for links
- Validation regex for tag names: `/^[a-zA-Z0-9][a-zA-Z0-9-]*$/`

**Step 1: Add props and imports**

In the `<script>` section of `TransactionFilters.svelte`:

```typescript
import type { Category, Transaction } from '$lib/db';
import { renameTag, deleteTag } from '$lib/stores/transactions';
import { calculateTagTotal } from '$lib/utils/tags';
import { formatCurrency } from '$lib/utils/format-helpers';

// Add to Props interface:
allTransactions?: Transaction[];

// Add to destructured props:
let { categories, filters, onFilterChange, resultCount, totalCount, allTimeCount, onSearchInputRef, allTransactions = [] }: Props = $props();

// Add local state:
let showManageTags = $state(false);
let editingTag = $state<string | null>(null);
let editValue = $state('');
let confirmingDelete = $state<string | null>(null);
let isProcessing = $state(false);
```

**Step 2: Add rename and delete handlers**

```typescript
async function handleRename(oldTag: string): Promise<void> {
	const newTag = editValue.trim().toLowerCase();
	if (!newTag || newTag === oldTag || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(newTag)) {
		editingTag = null;
		return;
	}
	isProcessing = true;
	try {
		await renameTag(oldTag, newTag);
	} finally {
		editingTag = null;
		isProcessing = false;
	}
}

async function handleDelete(tag: string): Promise<void> {
	isProcessing = true;
	try {
		await deleteTag(tag);
		// Remove from active filters if present
		if (filters.tags.includes(tag)) {
			onFilterChange({ ...filters, tags: filters.tags.filter(t => t !== tag) });
		}
	} finally {
		confirmingDelete = null;
		isProcessing = false;
	}
}

function startEdit(tag: string): void {
	editingTag = tag;
	editValue = tag;
}

function handleEditKeydown(e: KeyboardEvent, tag: string): void {
	if (e.key === 'Enter') {
		e.preventDefault();
		handleRename(tag);
	} else if (e.key === 'Escape') {
		editingTag = null;
	}
}
```

**Step 3: Add the manage tags UI in the template**

In the template, find the Tag Filter `<div>` section (currently lines ~180–221). After the closing `</select>` and the active tag pills section, add the manage tags link and inline section.

Replace the entire tag filter `<div>` block (the one with `<label for="tag-filter">`) with:

```svelte
<!-- Tag Filter -->
<div>
	<div class="flex items-center justify-between mb-1">
		<label for="tag-filter" class="block text-xs font-medium text-charcoal-muted">Tags</label>
		{#if availableTags.length > 0 && !showManageTags}
			<button
				type="button"
				onclick={() => showManageTags = true}
				class="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
			>
				Manage tags
			</button>
		{/if}
	</div>

	{#if showManageTags}
		<!-- Manage Tags Section -->
		<div class="space-y-1">
			<div class="flex items-center justify-between mb-2">
				<span class="text-xs font-medium text-charcoal-muted">Manage Tags</span>
				<button
					type="button"
					onclick={() => { showManageTags = false; editingTag = null; confirmingDelete = null; }}
					class="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
				>
					Done
				</button>
			</div>
			{#each availableTags as tag (tag)}
				<div class="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-cream/50 group">
					{#if editingTag === tag}
						<input
							type="text"
							bind:value={editValue}
							onblur={() => handleRename(tag)}
							onkeydown={(e) => handleEditKeydown(e, tag)}
							disabled={isProcessing}
							class="flex-1 px-2 py-1 text-sm bg-surface border border-primary-300 rounded focus:ring-2 focus:ring-primary-100 focus:outline-none"
							autofocus
						/>
					{:else if confirmingDelete === tag}
						<span class="flex-1 text-sm text-charcoal">
							Remove from {tagIndex.getTransactionCountForTag(tag)} transactions?
						</span>
						<button
							type="button"
							onclick={() => handleDelete(tag)}
							disabled={isProcessing}
							class="text-xs text-danger-600 hover:text-danger-700 font-medium"
						>
							Confirm
						</button>
						<button
							type="button"
							onclick={() => confirmingDelete = null}
							class="text-xs text-charcoal-muted hover:text-charcoal font-medium"
						>
							Cancel
						</button>
					{:else}
						<button
							type="button"
							onclick={() => startEdit(tag)}
							class="flex-1 text-left text-sm text-charcoal hover:text-primary-600 transition-colors"
							title="Click to rename"
						>
							{tag}
						</button>
						<span class="text-xs text-charcoal-muted font-mono">
							{tagIndex.getTransactionCountForTag(tag)} txns · {formatCurrency(calculateTagTotal(allTransactions, tag))}
						</span>
						<button
							type="button"
							onclick={() => confirmingDelete = tag}
							class="opacity-0 group-hover:opacity-100 text-charcoal-muted hover:text-danger-500 transition-all"
							title="Delete tag"
						>
							<X size={14} />
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<!-- Normal Tag Selection -->
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
	{/if}

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

**Step 4: Update `+page.svelte` to pass `allTransactions` to `TransactionFilters`**

Find where `TransactionFilters` is used in `src/routes/+page.svelte` and add the prop:

```svelte
<TransactionFilters ... allTransactions={allTransactions} />
```

**Step 5: Run tests and verify build**

Run: `npm run test -- --run && npm run build`
Expected: All tests pass, build succeeds

**Step 6: Commit**

```bash
git add src/lib/components/TransactionFilters.svelte src/routes/+page.svelte
git commit -m "feat: add inline tag management with rename and delete"
```

---

### Task 5: Helper Text Below Notes Input

Add format hint text below the notes field in both forms.

**Files:**
- Modify: `src/lib/components/TransactionForm.svelte`
- Modify: `src/lib/components/EditTransactionModal.svelte`

**Context:**
- In `TransactionForm.svelte`, the TagAutocomplete is at ~line 556
- In `EditTransactionModal.svelte`, the TagAutocomplete is at ~line 299
- Helper text style: `text-xs text-charcoal-muted mt-1`
- Text: `Use #tags to group transactions (letters, numbers, hyphens)`

**Step 1: Add helper text to `TransactionForm.svelte`**

Find the TagAutocomplete usage (around line 556–561). After the closing `/>` of TagAutocomplete, add:

```svelte
<p class="text-xs text-charcoal-muted mt-1">Use #tags to group transactions (letters, numbers, hyphens)</p>
```

**Step 2: Add helper text to `EditTransactionModal.svelte`**

Find the TagAutocomplete usage (around line 299–304). After the closing `/>` of TagAutocomplete, add:

```svelte
<p class="text-xs text-charcoal-muted mt-1">Use #tags to group transactions (letters, numbers, hyphens)</p>
```

**Step 3: Run tests and verify build**

Run: `npm run test -- --run && npm run build`
Expected: All tests pass, build succeeds

**Step 4: Commit**

```bash
git add src/lib/components/TransactionForm.svelte src/lib/components/EditTransactionModal.svelte
git commit -m "feat: add tag format helper text below notes input"
```

---

### Task 6: Reload Dashboard Data After Tag Rename/Delete

After renaming or deleting a tag, the dashboard's `transactions` and `allTransactions` arrays still hold stale data in memory. The tag index is rebuilt, but the Svelte page state won't reflect the updated notes fields.

**Files:**
- Modify: `src/lib/components/TransactionFilters.svelte`

**Context:**
- `TransactionFilters` currently calls `renameTag`/`deleteTag` directly
- The parent (`+page.svelte`) owns `transactions` and `allTransactions` state
- After a batch tag update, the parent needs to re-fetch transaction data
- Pattern: Add an `onTagsChanged` callback prop so the parent can reload

**Step 1: Add callback prop to `TransactionFilters`**

In the Props interface:

```typescript
onTagsChanged?: () => void;
```

Destructure it with the other props.

In `handleRename` and `handleDelete`, after the `renameTag`/`deleteTag` call, invoke:

```typescript
onTagsChanged?.();
```

**Step 2: Wire up in `+page.svelte`**

Find where `TransactionFilters` is used. Add the callback that reloads data:

```svelte
<TransactionFilters
	...
	onTagsChanged={async () => {
		transactions = await getTransactionsByMonth(currentMonth);
		allTransactions = await getAllTransactions();
	}}
/>
```

**Step 3: Run tests and verify build**

Run: `npm run test -- --run && npm run build`
Expected: All tests pass, build succeeds

**Step 4: Commit**

```bash
git add src/lib/components/TransactionFilters.svelte src/routes/+page.svelte
git commit -m "feat: reload dashboard data after tag rename/delete"
```
