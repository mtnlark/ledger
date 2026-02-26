# Insights Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve visual hierarchy, reduce redundancy, and standardize patterns across the Insights page.

**Architecture:** Incremental component updates with 4 new components (TopCategoriesBar, Treemap, CategoryChipPicker, EditDetectedBillModal). Changes are organized by tab/section to minimize conflicts.

**Tech Stack:** Svelte 5 (runes), Tailwind CSS v4, Chart.js (for treemap), existing design tokens

---

## Task 1: TopCategoriesBar Component

Create the horizontal bar chart for top 5 categories on Overview tab.

**Files:**
- Create: `src/lib/components/insights/TopCategoriesBar.svelte`
- Create: `src/tests/components/TopCategoriesBar.test.ts`

**Step 1: Write the test file**

```typescript
// src/tests/components/TopCategoriesBar.test.ts
import { describe, it, expect } from 'vitest';
import { computeTopCategories } from '$lib/components/insights/TopCategoriesBar.svelte';

describe('computeTopCategories', () => {
	const mockCategories = [
		{ id: 1, name: 'Groceries', icon: '🛒', isActive: true, sortOrder: 0, isEssential: true },
		{ id: 2, name: 'Restaurants', icon: '🍽️', isActive: true, sortOrder: 1, isEssential: false },
		{ id: 3, name: 'Rent', icon: '🏠', isActive: true, sortOrder: 2, isEssential: true },
		{ id: 4, name: 'Fun', icon: '🎉', isActive: true, sortOrder: 3, isEssential: false },
		{ id: 5, name: 'Gas', icon: '⛽', isActive: true, sortOrder: 4, isEssential: true },
		{ id: 6, name: 'Utilities', icon: '💡', isActive: true, sortOrder: 5, isEssential: true },
	];

	const mockTransactions = [
		{ categoryId: 1, amount: 620, isShared: false, partnerShare: 0 },
		{ categoryId: 2, amount: 412, isShared: false, partnerShare: 0 },
		{ categoryId: 3, amount: 350, isShared: false, partnerShare: 0 },
		{ categoryId: 4, amount: 245, isShared: false, partnerShare: 0 },
		{ categoryId: 5, amount: 180, isShared: false, partnerShare: 0 },
		{ categoryId: 6, amount: 143, isShared: false, partnerShare: 0 },
	];

	it('returns top 5 categories plus Other', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		expect(result.length).toBe(6); // 5 + Other
		expect(result[5].name).toBe('Other');
	});

	it('sorts by spending descending', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		expect(result[0].name).toBe('Groceries');
		expect(result[0].amount).toBe(620);
	});

	it('groups remaining categories into Other with count', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		const other = result.find(r => r.name === 'Other');
		expect(other?.amount).toBe(143); // Just Utilities
		expect(other?.count).toBe(1);
	});

	it('calculates percentages correctly', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		const total = 620 + 412 + 350 + 245 + 180 + 143;
		expect(result[0].percent).toBe(Math.round((620 / total) * 100));
	});

	it('handles shared transactions (user portion only)', () => {
		const sharedTxns = [
			{ categoryId: 1, amount: 100, isShared: true, partnerShare: 50 },
		];
		const result = computeTopCategories(sharedTxns as any, mockCategories, 5);
		expect(result[0].amount).toBe(50);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/components/TopCategoriesBar.test.ts`
Expected: FAIL - module not found

**Step 3: Create component with exported computation function**

```svelte
<!-- src/lib/components/insights/TopCategoriesBar.svelte -->
<script lang="ts" module>
	import type { Transaction, Category } from '$lib/db';
	import { roundCurrency } from '$lib/utils/currency';

	export interface TopCategory {
		id: number | null;
		name: string;
		icon: string;
		amount: number;
		percent: number;
		count?: number; // Only for "Other"
	}

	export function computeTopCategories(
		transactions: Transaction[],
		categories: Category[],
		limit: number = 5
	): TopCategory[] {
		// Sum spending by category (user portion)
		const byCategory = new Map<number, number>();
		for (const t of transactions) {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + userAmount);
		}

		// Convert to array with category details
		const categorySpending: TopCategory[] = [];
		for (const [catId, amount] of byCategory) {
			const cat = categories.find(c => c.id === catId);
			if (cat && amount > 0) {
				categorySpending.push({
					id: catId,
					name: cat.name,
					icon: cat.icon || '📁',
					amount: roundCurrency(amount),
					percent: 0
				});
			}
		}

		// Sort descending
		categorySpending.sort((a, b) => b.amount - a.amount);

		// Calculate total
		const total = categorySpending.reduce((sum, c) => sum + c.amount, 0);

		// Take top N, group rest as Other
		const top = categorySpending.slice(0, limit);
		const rest = categorySpending.slice(limit);

		// Calculate percentages for top
		for (const cat of top) {
			cat.percent = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
		}

		// Add Other if there are remaining categories
		if (rest.length > 0) {
			const otherAmount = roundCurrency(rest.reduce((sum, c) => sum + c.amount, 0));
			top.push({
				id: null,
				name: 'Other',
				icon: '',
				amount: otherAmount,
				percent: total > 0 ? Math.round((otherAmount / total) * 100) : 0,
				count: rest.length
			});
		}

		return top;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Transaction, Category } from '$lib/db';
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		limit?: number;
	}

	let { transactions, categories, limit = 5 }: Props = $props();

	let topCategories = $derived(computeTopCategories(transactions, categories, limit));
	let maxAmount = $derived(topCategories[0]?.amount || 1);
</script>

{#if topCategories.length > 0}
	<div class="space-y-1">
		{#each topCategories as cat, i}
			{@const pct = (cat.amount / maxAmount) * 100}
			<button
				type="button"
				class="relative flex items-center w-full px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover transition-colors text-left"
				onclick={() => cat.name === 'Other' ? goto('/insights?tab=spending') : null}
				disabled={cat.name !== 'Other'}
			>
				<!-- Fill bar background -->
				<div
					class="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-primary-500/15 via-primary-500/7 to-transparent transition-all duration-500"
					style="width: {pct}%"
				></div>

				<!-- Icon -->
				<span class="relative z-10 w-6 text-center shrink-0">
					{#if cat.icon}
						{cat.icon}
					{:else if cat.count}
						<span class="text-xs text-charcoal-muted">+{cat.count}</span>
					{/if}
				</span>

				<!-- Name -->
				<span class="relative z-10 text-sm text-charcoal truncate ml-2 min-w-0 flex-1">
					{cat.name}
					{#if cat.count}
						<span class="text-charcoal-muted">({cat.count})</span>
					{/if}
				</span>

				<!-- Ledger dot leader -->
				<span class="ledger-line relative z-10"></span>

				<!-- Amount + percentage -->
				<span class="relative z-10 font-mono text-sm font-medium text-charcoal shrink-0">
					{formatCurrency(cat.amount)}
				</span>
				<span class="relative z-10 text-xs text-charcoal-muted ml-1.5 shrink-0 w-8 text-right">
					{cat.percent}%
				</span>
			</button>
		{/each}
	</div>
{/if}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/components/TopCategoriesBar.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/components/insights/TopCategoriesBar.svelte src/tests/components/TopCategoriesBar.test.ts
git commit -m "feat(insights): add TopCategoriesBar component for Overview tab"
```

---

## Task 2: Integrate TopCategoriesBar into Overview Tab

Replace the pie chart on Overview with the new TopCategoriesBar.

**Files:**
- Modify: `src/routes/insights/+page.svelte`

**Step 1: Update imports and replace CategoryBreakdownChart**

In `src/routes/insights/+page.svelte`, update the lazy loading:

```svelte
// Change line 37-40 from:
const lazyOverviewCharts = () => Promise.all([
	import('$lib/components/CategoryBreakdownChart.svelte'),
	import('$lib/components/MonthlyTrendsChart.svelte')
]);

// To:
const lazyOverviewCharts = () => Promise.all([
	import('$lib/components/insights/TopCategoriesBar.svelte'),
	import('$lib/components/MonthlyTrendsChart.svelte')
]);
```

**Step 2: Update the template section**

Replace the "Where It Goes" section (around lines 223-235):

```svelte
{#await lazyOverviewCharts() then [TopCategoriesBarMod, MonthlyTrendsChartMod]}
	<!-- Where It Goes - Top Categories -->
	{#if selectedMonthTransactions.length > 0}
		<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
			<div class="px-6 py-4">
				<h2 class="font-display text-xl font-medium text-charcoal">Where It Goes</h2>
				<p class="text-sm text-charcoal-muted mt-0.5">Top spending categories</p>
			</div>
			<div class="px-6 pb-6">
				<TopCategoriesBarMod.default
					transactions={selectedMonthTransactions}
					{categories}
				/>
			</div>
		</div>
	{/if}

	<!-- Monthly Trends (unchanged) -->
	{#if monthlyTrends.size > 1}
		<!-- ... existing code ... -->
	{/if}
{/await}
```

**Step 3: Manually verify in browser**

Open Insights page, Overview tab. Should see horizontal bars instead of pie chart.

**Step 4: Commit**

```bash
git add src/routes/insights/+page.svelte
git commit -m "feat(insights): replace Overview pie chart with TopCategoriesBar"
```

---

## Task 3: SmartTakeaways Hero Styling

Elevate SmartTakeaways as the visual hero.

**Files:**
- Modify: `src/lib/components/insights/SmartTakeaways.svelte`

**Step 1: Update the container styling**

Find the main container div (around line 604) and update:

```svelte
<!-- Change from: -->
<div class="{isCurrentMonth ? 'bg-surface' : 'bg-primary-50/40'} rounded-xl overflow-hidden card-primary">

<!-- To: -->
<div class="{isCurrentMonth ? 'bg-surface' : 'bg-primary-50/40'} rounded-xl overflow-hidden card-primary border-l-4 border-primary-400">
```

**Step 2: Increase headline size**

Find the h2 title (around line 606) and update:

```svelte
<!-- Change from: -->
<h2 class="font-display text-lg font-medium text-charcoal mb-3">{title}</h2>

<!-- To: -->
<h2 class="font-display text-xl font-medium text-charcoal mb-3">{title}</h2>
```

**Step 3: Style expand/collapse as pill button**

Find the "See more" / "Show less" button (around line 637) and update:

```svelte
<!-- Change from: -->
<button
	type="button"
	onclick={() => isExpanded = !isExpanded}
	class="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
>

<!-- To: -->
<button
	type="button"
	onclick={() => isExpanded = !isExpanded}
	class="flex items-center gap-1 text-sm text-primary-600 font-medium px-3 py-1 rounded-full bg-surface-alt hover:bg-cream-dark transition-colors"
>
```

**Step 4: Manually verify in browser**

Check that SmartTakeaways now has left accent border and larger title.

**Step 5: Commit**

```bash
git add src/lib/components/insights/SmartTakeaways.svelte
git commit -m "style(insights): elevate SmartTakeaways as hero with accent border"
```

---

## Task 4: QuickStatsRow Color Indicators

Add colored indicators based on thresholds.

**Files:**
- Modify: `src/lib/components/insights/QuickStatsRow.svelte`

**Step 1: Add budget status color logic**

After the `budgetStatus` derived (around line 55), add:

```svelte
// Budget color based on thresholds
let budgetColor = $derived.by(() => {
	if (!budgetStatus) return 'text-charcoal';
	const { onTrack, total } = budgetStatus;
	if (onTrack === total) return 'text-success-600'; // All on track
	if (onTrack >= total / 2) return 'text-warning-600'; // >= half on track
	return 'text-danger-600'; // < half on track
});

// Savings rate color (green if > 0, neutral otherwise)
let savingsColor = $derived(savingsRate !== null && savingsRate > 0 ? 'text-success-600' : 'text-charcoal');
```

**Step 2: Apply colors in template**

Update the Budget Status section (around line 77-89):

```svelte
<!-- Budget Status -->
<div class="bg-surface rounded-xl p-4 text-center shadow-sm shadow-[var(--color-shadow)]">
	{#if budgetStatus}
		<p class="font-mono text-xl font-medium {budgetColor}">
			{budgetStatus.onTrack}/{budgetStatus.total}
		</p>
		<p class="text-xs text-charcoal-muted mt-1">
			budget {budgetStatus.total === 1 ? 'category' : 'categories'} {isCurrentMonth ? 'on track' : 'within budget'}
		</p>
	{:else}
		<p class="font-mono text-xl font-medium text-charcoal-muted">—</p>
		<p class="text-xs text-charcoal-muted mt-1">no budgets set</p>
	{/if}
</div>
```

Update the Savings Rate section (around line 91-100):

```svelte
<!-- Savings Rate -->
<div class="bg-surface rounded-xl p-4 text-center shadow-sm shadow-[var(--color-shadow)]">
	{#if savingsRate !== null}
		<p class="font-mono text-xl font-medium {savingsColor}">{savingsRate}%</p>
		<p class="text-xs text-charcoal-muted mt-1">savings rate</p>
	{:else}
		<p class="font-mono text-xl font-medium text-charcoal-muted">—</p>
		<p class="text-xs text-charcoal-muted mt-1">savings rate</p>
	{/if}
</div>
```

**Step 3: Manually verify colors appear correctly**

**Step 4: Commit**

```bash
git add src/lib/components/insights/QuickStatsRow.svelte
git commit -m "feat(insights): add color indicators to QuickStatsRow"
```

---

## Task 5: SpendingThisMonth — Remove Pace Card, Update Badge

Simplify by removing the Spending Pace card section.

**Files:**
- Modify: `src/lib/components/insights/SpendingThisMonth.svelte`

**Step 1: Update velocity badge label**

Find the velocity badge section (around line 128-144) and update the labels:

```svelte
{#if paceStats && paceStats.percentChange !== 0}
	<div class="text-right flex items-center gap-2">
		{#if paceStats.isUp}
			<TrendingUp size={18} class={isPaceSignificant ? 'text-warning-500' : 'text-charcoal-muted'} />
		{:else}
			<TrendingDown size={18} class={isPaceSignificant ? 'text-success-500' : 'text-charcoal-muted'} />
		{/if}
		<div>
			<p class="font-mono text-lg font-medium {isPaceSignificant ? (paceStats.isUp ? 'text-warning-600' : 'text-success-600') : 'text-charcoal-soft'}">
				{Math.abs(paceStats.percentChange)}%
			</p>
			<p class="text-sm text-charcoal-muted">
				{paceStats.isUp ? 'faster pace' : 'slower pace'}
			</p>
		</div>
	</div>
{/if}
```

**Step 2: Remove the Spending Pace card section**

Delete the entire "Spending Pace" section (lines 167-201 approximately):

```svelte
<!-- DELETE THIS ENTIRE BLOCK -->
<!-- Spending Pace -->
{#if paceStats}
	<div class="bg-surface-alt rounded-lg p-4 border border-theme">
		...
	</div>
{:else if monthlyTrends.size < 2}
	<div class="bg-surface-alt rounded-lg p-4 border border-theme text-center">
		...
	</div>
{/if}
```

**Step 3: Verify the page still renders correctly**

**Step 4: Commit**

```bash
git add src/lib/components/insights/SpendingThisMonth.svelte
git commit -m "refactor(insights): remove Spending Pace card, simplify to badge only"
```

---

## Task 6: CategoryChipPicker Component

Create horizontal scrolling chip picker for category selection.

**Files:**
- Create: `src/lib/components/insights/CategoryChipPicker.svelte`

**Step 1: Create the component**

```svelte
<!-- src/lib/components/insights/CategoryChipPicker.svelte -->
<script lang="ts">
	import type { Category } from '$lib/db';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';

	interface Props {
		categories: Category[];
		selectedId: number | null;
		spending?: Map<number, number>;
		onSelect: (id: number) => void;
	}

	let { categories, selectedId, spending, onSelect }: Props = $props();

	// Sort alphabetically
	let sortedCategories = $derived(
		[...categories].sort((a, b) => a.name.localeCompare(b.name))
	);
</script>

<div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
	{#each sortedCategories as cat}
		{@const isSelected = cat.id === selectedId}
		{@const spent = spending?.get(cat.id!) || 0}
		<button
			type="button"
			onclick={() => onSelect(cat.id!)}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0
				{isSelected
					? 'bg-primary-500 text-white'
					: 'bg-surface-alt text-charcoal-soft hover:bg-cream-dark'}"
		>
			<span>{cat.icon || '📁'}</span>
			<span>{cat.name}</span>
			{#if spent > 0}
				<span class="text-xs {isSelected ? 'text-white/70' : 'text-charcoal-muted'}">
					{formatCurrencyWhole(spent)}
				</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.scrollbar-thin::-webkit-scrollbar {
		height: 4px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: transparent;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background: var(--color-charcoal-muted);
		border-radius: 2px;
		opacity: 0.3;
	}
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/insights/CategoryChipPicker.svelte
git commit -m "feat(insights): add CategoryChipPicker component"
```

---

## Task 7: CategoryDeepDives — Integrate Chip Picker, Simplify Stats

Update CategoryDeepDives to use chip picker and simplify display.

**Files:**
- Modify: `src/lib/components/insights/CategoryDeepDives.svelte`

**Step 1: Import CategoryChipPicker**

Add import at top:

```svelte
import CategoryChipPicker from './CategoryChipPicker.svelte';
```

**Step 2: Replace select dropdown with chip picker**

Find the category selector section (around lines 206-237) and replace:

```svelte
<!-- Change from select dropdown to chip picker -->
<div>
	<label class="block text-sm font-semibold text-charcoal-soft mb-2">
		Explore Category Trends
	</label>
	<CategoryChipPicker
		categories={sortedCategories}
		selectedId={selectedCategoryId}
		spending={categorySpending}
		onSelect={(id) => { selectedCategoryId = id; hasUserSelected = true; }}
	/>

	{#if selectedStats && selectedStats.mean > 0 && selectedCV !== null}
		<div class="flex items-center gap-2 mt-3 text-sm text-charcoal-muted">
			<span class="inline-block w-2.5 h-2.5 rounded-full {cvColor}"></span>
			<span class="font-medium text-charcoal-soft">{cvLabel}</span>
			<span>·</span>
			<span class="font-mono">${Math.round(selectedStats.mean)}/mo ± ${Math.round(selectedStats.stdDev)}</span>
		</div>
	{/if}
</div>
```

Note: We removed the "Range $X–$Y" portion as specified.

**Step 3: Update cvColor for Variable badge**

Find the cvColor derived (around line 90-95) and change:

```svelte
let cvColor = $derived.by(() => {
	if (selectedCV === null) return '';
	if (selectedCV < cvThresholds.steady) return 'bg-success-500';
	if (selectedCV <= cvThresholds.moderate) return 'bg-warning-500';
	return 'bg-neutral-500'; // Changed from bg-danger-500
});
```

**Step 4: Remove CategoryBreakdownChart from this component**

Find and remove the CategoryBreakdownChart usage (around line 203-204):

```svelte
<!-- DELETE THIS LINE -->
<CategoryBreakdownChart {transactions} {categories} />
```

Also remove the import at the top if it exists.

**Step 5: Commit**

```bash
git add src/lib/components/insights/CategoryDeepDives.svelte
git commit -m "refactor(insights): use chip picker, simplify stats, remove pie chart"
```

---

## Task 8: Treemap Component

Create treemap visualization for category breakdown.

**Files:**
- Create: `src/lib/components/insights/CategoryTreemap.svelte`

**Step 1: Create the component**

```svelte
<!-- src/lib/components/insights/CategoryTreemap.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Transaction, Category } from '$lib/db';
	import { roundCurrency } from '$lib/utils/currency';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
	}

	let { transactions, categories }: Props = $props();

	interface TreemapItem {
		id: number;
		name: string;
		icon: string;
		amount: number;
		percent: number;
		color: string;
	}

	// Compute category spending
	let categoryData = $derived.by(() => {
		const byCategory = new Map<number, number>();
		for (const t of transactions) {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + userAmount);
		}

		const items: TreemapItem[] = [];
		let total = 0;

		for (const [catId, amount] of byCategory) {
			if (amount <= 0) continue;
			const cat = categories.find(c => c.id === catId);
			if (!cat) continue;
			total += amount;
			items.push({
				id: catId,
				name: cat.name,
				icon: cat.icon || '📁',
				amount: roundCurrency(amount),
				percent: 0,
				color: cat.color || '#C45D3A'
			});
		}

		// Calculate percentages and sort
		for (const item of items) {
			item.percent = Math.round((item.amount / total) * 100);
		}
		items.sort((a, b) => b.amount - a.amount);

		return { items, total };
	});

	// Simple squarified treemap layout
	function computeLayout(items: TreemapItem[], width: number, height: number) {
		if (items.length === 0) return [];

		const total = items.reduce((sum, i) => sum + i.amount, 0);
		const rects: Array<TreemapItem & { x: number; y: number; w: number; h: number }> = [];

		let x = 0, y = 0, remainingWidth = width, remainingHeight = height;
		let isHorizontal = width >= height;

		for (const item of items) {
			const ratio = item.amount / total;
			let w: number, h: number;

			if (isHorizontal) {
				w = remainingWidth * ratio * (items.length / (items.length - rects.length));
				h = remainingHeight;
				if (rects.length === items.length - 1) w = remainingWidth; // Last item takes rest
			} else {
				w = remainingWidth;
				h = remainingHeight * ratio * (items.length / (items.length - rects.length));
				if (rects.length === items.length - 1) h = remainingHeight;
			}

			rects.push({ ...item, x, y, w: Math.max(w, 0), h: Math.max(h, 0) });

			if (isHorizontal) {
				x += w;
				remainingWidth -= w;
			} else {
				y += h;
				remainingHeight -= h;
			}

			// Alternate direction for better squarification
			if (rects.length % 3 === 0) isHorizontal = !isHorizontal;
		}

		return rects;
	}

	let containerWidth = $state(400);
	let containerHeight = $state(250);

	let layout = $derived(computeLayout(categoryData.items, containerWidth, containerHeight));
</script>

<div
	class="relative w-full rounded-lg overflow-hidden"
	style="height: {containerHeight}px"
	bind:clientWidth={containerWidth}
>
	{#each layout as rect}
		{@const showLabel = rect.w > 60 && rect.h > 40}
		{@const showAmount = rect.w > 80 && rect.h > 50}
		<div
			class="absolute flex flex-col items-center justify-center text-white text-center p-1 transition-opacity hover:opacity-90"
			style="
				left: {rect.x}px;
				top: {rect.y}px;
				width: {rect.w}px;
				height: {rect.h}px;
				background-color: {rect.color};
			"
			title="{rect.icon} {rect.name}: {formatCurrencyWhole(rect.amount)} ({rect.percent}%)"
		>
			{#if showLabel}
				<span class="text-lg">{rect.icon}</span>
				{#if showAmount}
					<span class="text-xs font-mono font-medium mt-0.5">{formatCurrencyWhole(rect.amount)}</span>
				{/if}
			{/if}
		</div>
	{/each}
</div>

{#if categoryData.items.length === 0}
	<p class="text-sm text-charcoal-muted text-center py-8">No spending data</p>
{/if}
```

**Step 2: Commit**

```bash
git add src/lib/components/insights/CategoryTreemap.svelte
git commit -m "feat(insights): add CategoryTreemap component"
```

---

## Task 9: Integrate Treemap into CategoryDeepDives

Add treemap to the Spending tab's CategoryDeepDives.

**Files:**
- Modify: `src/lib/components/insights/CategoryDeepDives.svelte`

**Step 1: Import and add treemap**

Add import:

```svelte
import CategoryTreemap from './CategoryTreemap.svelte';
```

**Step 2: Add treemap section in the expanded content**

In the `{#snippet children()}` section, add treemap before the chip picker:

```svelte
{#snippet children()}
	<div class="space-y-6">
		<!-- Category Treemap -->
		<div>
			<h3 class="text-sm font-semibold text-charcoal-soft mb-3">Category Breakdown</h3>
			<CategoryTreemap {transactions} {categories} />
		</div>

		<!-- Category Selector for Trends -->
		<div>
			<!-- ... existing chip picker code ... -->
		</div>

		<!-- ... rest of existing content ... -->
	</div>
{/snippet}
```

**Step 3: Verify in browser**

**Step 4: Commit**

```bash
git add src/lib/components/insights/CategoryDeepDives.svelte
git commit -m "feat(insights): integrate treemap into CategoryDeepDives"
```

---

## Task 10: RecurringInsights — Grouped Headers

Add frequency group headers with totals.

**Files:**
- Modify: `src/lib/components/insights/RecurringInsights.svelte`

**Step 1: Update the Active Subscriptions section**

Replace the flat list with grouped sections (around lines 401-477):

```svelte
<!-- Active Subscriptions Section -->
{#if activeSubscriptions.length > 0}
	<div class="space-y-4">
		<!-- Monthly Subscriptions -->
		{#if monthlySubscriptions.length > 0}
			<div>
				<h4 class="text-sm font-semibold text-charcoal-soft mb-2 pb-2 border-b border-theme flex items-center justify-between">
					<span class="flex items-center gap-2">
						<RefreshCw size={14} />
						Monthly
					</span>
					<span class="font-mono text-charcoal">{formatCurrencyWhole(monthlySubCost)}/mo</span>
				</h4>
				<div class="space-y-2">
					{#each monthlySubscriptions as sub}
						{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
						<div class="flex items-center gap-3 py-2 px-3 bg-cream rounded-lg">
							<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
								<p class="text-xs text-charcoal-muted">{getCategoryName(sub.categoryId)}</p>
							</div>
							<div class="text-right">
								<p class="font-mono text-sm font-medium text-charcoal">
									{formatCurrency(userAmount)}/mo
								</p>
								{#if sub.isShared}
									<p class="text-xs text-success-600">Shared</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Semi-Annual Subscriptions -->
		{#if semiAnnualSubscriptions.length > 0}
			<div>
				<h4 class="text-sm font-semibold text-charcoal-soft mb-2 pb-2 border-b border-theme flex items-center justify-between">
					<span>Semi-Annual</span>
					<span class="font-mono text-charcoal">
						{formatCurrencyWhole(semiAnnualSubCost)}/6mo
						<span class="text-xs text-charcoal-muted">(~{formatCurrencyWhole(semiAnnualSubCost / 6)}/mo)</span>
					</span>
				</h4>
				<div class="space-y-2">
					{#each semiAnnualSubscriptions as sub}
						{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
						{@const monthlyEquiv = userAmount / 6}
						<div class="flex items-center gap-3 py-2 px-3 bg-cream rounded-lg">
							<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
								<p class="text-xs text-charcoal-muted">{getCategoryName(sub.categoryId)}</p>
							</div>
							<div class="text-right">
								<p class="font-mono text-sm font-medium text-charcoal">
									{formatCurrency(userAmount)}/6mo
								</p>
								<p class="text-xs text-charcoal-muted">
									~{formatCurrency(monthlyEquiv)}/mo
								</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Annual Subscriptions -->
		{#if annualSubscriptions.length > 0}
			<div>
				<h4 class="text-sm font-semibold text-charcoal-soft mb-2 pb-2 border-b border-theme flex items-center justify-between">
					<span class="flex items-center gap-2">
						<Calendar size={14} />
						Annual
					</span>
					<span class="font-mono text-charcoal">
						{formatCurrencyWhole(annualSubCost)}/yr
						<span class="text-xs text-charcoal-muted">(~{formatCurrencyWhole(annualSubCost / 12)}/mo)</span>
					</span>
				</h4>
				<div class="space-y-2">
					{#each annualSubscriptions as sub}
						{@const userAmount = sub.isShared ? sub.amount - sub.partnerShare : sub.amount}
						{@const monthlyEquiv = userAmount / 12}
						<div class="flex items-center gap-3 py-2 px-3 bg-cream rounded-lg">
							<span class="text-lg">{getCategoryIcon(sub.categoryId)}</span>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-charcoal truncate">{sub.merchant}</p>
								<p class="text-xs text-charcoal-muted">{getCategoryName(sub.categoryId)}</p>
							</div>
							<div class="text-right">
								<p class="font-mono text-sm font-medium text-charcoal">
									{formatCurrency(userAmount)}/yr
								</p>
								<p class="text-xs text-charcoal-muted">
									~{formatCurrency(monthlyEquiv)}/mo
								</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
```

**Step 2: Make Possibly Inactive more prominent**

Update the section header (around line 510-516):

```svelte
<!-- Possibly Inactive Subscriptions -->
{#if possiblyInactiveSubscriptions.length > 0}
	<div>
		<div class="bg-warning-50 rounded-lg px-4 py-2 mb-3">
			<h4 class="text-sm font-semibold text-warning-700 flex items-center gap-2">
				<AlertCircle size={14} />
				Possibly Inactive
				<span class="text-xs font-normal">({possiblyInactiveSubscriptions.length})</span>
			</h4>
		</div>

		<div class="space-y-2">
			<!-- ... existing cards ... -->
		</div>
	</div>
{/if}
```

**Step 3: Commit**

```bash
git add src/lib/components/insights/RecurringInsights.svelte
git commit -m "feat(insights): add grouped headers to RecurringInsights"
```

---

## Task 11: EditDetectedBillModal Component

Create modal for editing detected recurring bills.

**Files:**
- Create: `src/lib/components/EditDetectedBillModal.svelte`

**Step 1: Create the modal component**

```svelte
<!-- src/lib/components/EditDetectedBillModal.svelte -->
<script lang="ts">
	import { X } from 'lucide-svelte';
	import ModalContainer from './ModalContainer.svelte';
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		isOpen: boolean;
		merchant: string;
		detectedAmount: number;
		isVariable: boolean;
		onSave: (action: 'keep' | 'fixed' | 'remove', fixedAmount?: number) => void;
		onClose: () => void;
	}

	let { isOpen, merchant, detectedAmount, isVariable, onSave, onClose }: Props = $props();

	let selectedAction = $state<'keep' | 'fixed' | 'remove'>('keep');
	let fixedAmount = $state('');
	let isSubmitting = $state(false);

	// Reset state when modal opens
	$effect(() => {
		if (isOpen) {
			selectedAction = 'keep';
			fixedAmount = detectedAmount.toFixed(2);
			isSubmitting = false;
		}
	});

	async function handleSave() {
		if (isSubmitting) return;
		isSubmitting = true;

		try {
			if (selectedAction === 'fixed') {
				const amount = parseFloat(fixedAmount);
				if (isNaN(amount) || amount <= 0) {
					isSubmitting = false;
					return;
				}
				onSave('fixed', amount);
			} else {
				onSave(selectedAction);
			}
			onClose();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<ModalContainer {isOpen} onClose={onClose} title="Edit Detected Bill">
	<div class="space-y-4">
		<div>
			<p class="font-medium text-charcoal">{merchant}</p>
			<p class="text-sm text-charcoal-muted">
				Detected: ~{formatCurrency(detectedAmount)}/mo
				{#if isVariable}
					<span class="text-warning-600">(varies)</span>
				{/if}
			</p>
		</div>

		<div class="space-y-3">
			<label class="flex items-start gap-3 p-3 rounded-lg border border-theme hover:bg-surface-hover cursor-pointer transition-colors">
				<input
					type="radio"
					name="action"
					value="keep"
					bind:group={selectedAction}
					class="mt-0.5"
				/>
				<div>
					<p class="text-sm font-medium text-charcoal">Keep as detected</p>
					<p class="text-xs text-charcoal-muted">Use the auto-calculated amount{isVariable ? ' (variable)' : ''}</p>
				</div>
			</label>

			<label class="flex items-start gap-3 p-3 rounded-lg border border-theme hover:bg-surface-hover cursor-pointer transition-colors">
				<input
					type="radio"
					name="action"
					value="fixed"
					bind:group={selectedAction}
					class="mt-0.5"
				/>
				<div class="flex-1">
					<p class="text-sm font-medium text-charcoal">Set fixed amount</p>
					{#if selectedAction === 'fixed'}
						<div class="mt-2">
							<div class="relative">
								<span class="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-muted">$</span>
								<input
									type="number"
									step="0.01"
									min="0.01"
									bind:value={fixedAmount}
									class="w-full pl-7 pr-3 py-2 text-sm border border-theme rounded-lg bg-surface focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
									placeholder="0.00"
								/>
							</div>
						</div>
					{/if}
				</div>
			</label>

			<label class="flex items-start gap-3 p-3 rounded-lg border border-danger-200 hover:bg-danger-50 cursor-pointer transition-colors">
				<input
					type="radio"
					name="action"
					value="remove"
					bind:group={selectedAction}
					class="mt-0.5"
				/>
				<div>
					<p class="text-sm font-medium text-danger-700">Remove from recurring list</p>
					<p class="text-xs text-charcoal-muted">This bill won't appear in your recurring expenses</p>
				</div>
			</label>
		</div>
	</div>

	{#snippet footer()}
		<div class="flex justify-end gap-3">
			<button
				type="button"
				onclick={onClose}
				class="px-4 py-2 text-sm font-medium text-charcoal-soft hover:text-charcoal transition-colors"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={handleSave}
				disabled={isSubmitting || (selectedAction === 'fixed' && (!fixedAmount || parseFloat(fixedAmount) <= 0))}
				class="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
			>
				{#if isSubmitting}
					<span class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></span>
				{/if}
				Save
			</button>
		</div>
	{/snippet}
</ModalContainer>
```

**Step 2: Commit**

```bash
git add src/lib/components/EditDetectedBillModal.svelte
git commit -m "feat: add EditDetectedBillModal for detected recurring bills"
```

---

## Task 12: Integrate EditDetectedBillModal into RecurringInsights

Replace X buttons with edit modal trigger.

**Files:**
- Modify: `src/lib/components/insights/RecurringInsights.svelte`

**Step 1: Import modal and add state**

Add imports and state:

```svelte
import EditDetectedBillModal from '$lib/components/EditDetectedBillModal.svelte';

// Add after existing state
let editModal = $state({
	isOpen: false,
	merchant: '',
	amount: 0,
	isVariable: false
});

function openEditModal(item: DetectedRecurring) {
	editModal = {
		isOpen: true,
		merchant: item.merchant,
		amount: item.averageUserAmount,
		isVariable: item.amountType === 'variable'
	};
}

function closeEditModal() {
	editModal = { ...editModal, isOpen: false };
}

async function handleEditSave(action: 'keep' | 'fixed' | 'remove', fixedAmount?: number) {
	if (action === 'remove') {
		await dismissRecurring(editModal.merchant);
		onDismiss?.();
	}
	// TODO: Handle 'keep' and 'fixed' actions when backend support is added
	// For now, these just close the modal
}
```

**Step 2: Replace X button with clickable row**

In the Detected Bills section, update the item rendering:

```svelte
{#each activeRecurring as item (item.merchant)}
	{@const freqLabel = item.frequency === 'monthly' ? '/mo' : item.frequency === 'semi-annual' ? '/6mo' : '/yr'}
	{@const freqDesc = item.frequency === 'monthly' ? 'monthly' : item.frequency === 'semi-annual' ? 'every 6 months' : 'annually'}
	<button
		type="button"
		onclick={() => openEditModal(item)}
		class="flex items-center gap-3 py-2 px-3 bg-cream/50 rounded-lg w-full text-left hover:bg-cream transition-colors"
	>
		<span class="text-lg">{getCategoryIcon(item.categoryId)}</span>
		<div class="flex-1 min-w-0">
			<p class="text-sm font-medium text-charcoal truncate">{item.merchant}</p>
			<p class="text-xs text-charcoal-muted">
				{getCategoryName(item.categoryId)}
				<span class="mx-1">·</span>
				{freqDesc}
				{#if item.amountType === 'variable'}
					<span class="mx-1">·</span>
					<span class="text-warning-600">varies</span>
				{/if}
			</p>
		</div>
		<div class="text-right flex-shrink-0">
			<p class="font-mono text-sm font-medium text-charcoal">
				~{formatCurrency(item.averageUserAmount)}{freqLabel}
			</p>
			{#if item.isShared}
				<p class="text-xs text-success-600">Shared</p>
			{:else}
				<p class="text-xs text-charcoal-muted">
					{item.occurrenceCount}x
				</p>
			{/if}
		</div>
	</button>
{/each}
```

**Step 3: Add modal to template**

At the end of the component, add:

```svelte
<EditDetectedBillModal
	isOpen={editModal.isOpen}
	merchant={editModal.merchant}
	detectedAmount={editModal.amount}
	isVariable={editModal.isVariable}
	onSave={handleEditSave}
	onClose={closeEditModal}
/>
```

**Step 4: Commit**

```bash
git add src/lib/components/insights/RecurringInsights.svelte
git commit -m "feat(insights): integrate EditDetectedBillModal, replace X buttons"
```

---

## Task 13: YTDSummary — Remove Mini Heatmap and Needs/Wants Row

Clean up redundant elements.

**Files:**
- Modify: `src/lib/components/insights/YTDSummary.svelte`

**Step 1: Remove mini heatmap section**

Delete lines 128-144 (the "Last 30 days" mini heatmap):

```svelte
<!-- DELETE THIS ENTIRE BLOCK -->
<!-- Mini heatmap preview (last 30 days) -->
<div class="pt-2">
	<p class="text-xs text-charcoal-muted mb-1">Last 30 days</p>
	<div class="flex gap-1">
		{#each Array.from(recentDailySpending.entries()) as [dateKey, amount]}
			...
		{/each}
	</div>
</div>
```

Also remove the `recentDailySpending` derived since it's no longer needed.

**Step 2: Remove inline needs vs wants row**

Delete lines 199-207:

```svelte
<!-- DELETE THIS ENTIRE BLOCK -->
{#if needsWantsStats.total > 0}
	<div class="flex items-center justify-between p-4 bg-cream-dark rounded-lg border border-dashed border-theme">
		<span class="text-sm text-charcoal-soft">All-time needs vs wants:</span>
		<span class="font-mono text-sm text-charcoal">
			{needsWantsStats.needsPercent.toFixed(0)}% needs / {needsWantsStats.wantsPercent.toFixed(0)}% wants
		</span>
	</div>
{/if}
```

Also remove the `needsWantsStats` derived and import since it's no longer needed here.

**Step 3: Commit**

```bash
git add src/lib/components/insights/YTDSummary.svelte
git commit -m "refactor(insights): remove mini heatmap and duplicate needs/wants from YTD"
```

---

## Task 14: Tags Section — Wrap in InsightGroup

Make Tags collapsible and default to collapsed.

**Files:**
- Modify: `src/lib/components/insights/YTDSummary.svelte`

**Step 1: Import InsightGroup**

```svelte
import InsightGroup from './InsightGroup.svelte';
```

**Step 2: Wrap Tags section in InsightGroup**

Replace the Tags section (around lines 209-225):

```svelte
<!-- Tag Spending Summary -->
{#if tagSummary.length > 0}
	<InsightGroup
		title="Tags This Year"
		description="{tagSummary.length} tag{tagSummary.length !== 1 ? 's' : ''} used"
		defaultExpanded={false}
	>
		{#snippet preview()}
			<p class="text-sm text-charcoal">
				{#each tagSummary.slice(0, 2) as { tag, total }, i}
					{#if i > 0} · {/if}
					<span class="text-primary-600">#{tag}</span> {formatCurrencyWhole(total)}
				{/each}
				{#if tagSummary.length > 2}
					<span class="text-charcoal-muted"> +{tagSummary.length - 2} more</span>
				{/if}
			</p>
		{/snippet}

		{#snippet children()}
			<div class="space-y-2">
				{#each tagSummary as { tag, total, count }}
					<div class="flex items-center justify-between py-1.5">
						<span class="text-sm text-primary-600 font-medium">#{tag}</span>
						<div class="text-right">
							<span class="font-mono text-sm text-charcoal">{formatCurrencyWhole(total)}</span>
							<span class="text-xs text-charcoal-muted ml-2">{count} txn{count !== 1 ? 's' : ''}</span>
						</div>
					</div>
				{/each}
			</div>
		{/snippet}
	</InsightGroup>
{/if}
```

**Step 3: Commit**

```bash
git add src/lib/components/insights/YTDSummary.svelte
git commit -m "feat(insights): wrap Tags in collapsible InsightGroup"
```

---

## Task 15: NeedsWantsInsights Bar Colors

Update bar colors to match personal/shared scheme.

**Files:**
- Modify: `src/lib/components/insights/NeedsWantsInsights.svelte`

**Step 1: Read the current file to find the bar section**

**Step 2: Update bar colors**

Find the proportional bar visualization and update colors:

```svelte
<!-- Change needs bar from whatever color to neutral-500 -->
<div
	class="bg-neutral-500 transition-all duration-500"
	style="width: {needsPercent}%"
></div>

<!-- Change wants bar from whatever color to primary-400 -->
<div
	class="bg-primary-400 transition-all duration-500"
	style="width: {wantsPercent}%"
></div>
```

Also update any legend/label colors to match:
- Needs indicator: `bg-neutral-500`
- Wants indicator: `bg-primary-400`

**Step 3: Commit**

```bash
git add src/lib/components/insights/NeedsWantsInsights.svelte
git commit -m "style(insights): update needs/wants bar to match personal/shared colors"
```

---

## Task 16: InsightGroup — Add cursor-pointer

Fix missing cursor affordance.

**Files:**
- Modify: `src/lib/components/insights/InsightGroup.svelte`

**Step 1: Add cursor-pointer to header button**

Find the header button (around line 38) and add cursor-pointer:

```svelte
<button
	class="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors cursor-pointer"
	onclick={toggleExpanded}
>
```

**Step 2: Commit**

```bash
git add src/lib/components/insights/InsightGroup.svelte
git commit -m "fix(insights): add cursor-pointer to InsightGroup header"
```

---

## Task 17: Typography Audit — Standardize Subsection Headers

Audit and fix typography inconsistencies.

**Files:**
- Modify: Multiple insight components

**Step 1: Search for inconsistent subsection headers**

Run: `grep -r "text-sm font-medium" src/lib/components/insights/`

**Step 2: Update to standardized style**

Change all subsection headers from:
```
text-sm font-medium text-charcoal-soft
```
To:
```
text-sm font-semibold text-charcoal-soft
```

Files to check:
- SpendingThisMonth.svelte (h3 elements)
- SavingsInsights.svelte (h3 elements)
- CategoryDeepDives.svelte (h3 elements)
- RecurringInsights.svelte (h4 elements - already done in Task 10)

**Step 3: Commit**

```bash
git add src/lib/components/insights/
git commit -m "style(insights): standardize subsection headers to font-semibold"
```

---

## Task 18: Empty States — Standardize

Add EmptyState to components that need it.

**Files:**
- Modify: `src/lib/components/insights/SpendingThisMonth.svelte`
- Modify: `src/lib/components/insights/CategoryDeepDives.svelte`

**Step 1: Add EmptyState to SpendingThisMonth for Top Merchants**

Import and add:

```svelte
import EmptyState from '$lib/components/EmptyState.svelte';
import { Store } from 'lucide-svelte';

<!-- In Top Merchants section -->
{#if topMerchants.length > 0}
	<!-- existing code -->
{:else if transactions.length > 0}
	<EmptyState
		icon={Store}
		title="No merchant data"
		description="Transactions don't have merchant names"
		compact={true}
	/>
{/if}
```

**Step 2: Add EmptyState to CategoryDeepDives**

```svelte
import EmptyState from '$lib/components/EmptyState.svelte';
import { BarChart3 } from 'lucide-svelte';

<!-- At start of children snippet -->
{#if transactions.length === 0}
	<EmptyState
		icon={BarChart3}
		title="No transactions"
		description="Add transactions to see category insights"
		compact={true}
	/>
{:else}
	<!-- existing content -->
{/if}
```

**Step 3: Commit**

```bash
git add src/lib/components/insights/SpendingThisMonth.svelte src/lib/components/insights/CategoryDeepDives.svelte
git commit -m "feat(insights): add standardized EmptyState to components"
```

---

## Task 19: Final Visual QA

Manual verification of all changes.

**Checklist:**

1. [ ] Overview tab: SmartTakeaways has accent border and larger title
2. [ ] Overview tab: QuickStatsRow shows colored indicators
3. [ ] Overview tab: TopCategoriesBar shows instead of pie chart
4. [ ] Spending tab: No Spending Pace card, only velocity badge
5. [ ] Spending tab: Velocity badge says "faster pace" / "slower pace"
6. [ ] Spending tab: CategoryDeepDives has treemap, chip picker, simplified stats
7. [ ] Spending tab: Variable badge is gray, not red
8. [ ] Recurring tab: Grouped headers with totals
9. [ ] Recurring tab: Possibly Inactive has warning banner
10. [ ] Recurring tab: Detected bills open edit modal (no X buttons)
11. [ ] Year in Review tab: No mini heatmap
12. [ ] Year in Review tab: Tags section is collapsed by default
13. [ ] Year in Review tab: No duplicate needs/wants row
14. [ ] Year in Review tab: NeedsWantsInsights bar uses neutral/primary colors
15. [ ] All tabs: Subsection headers use font-semibold
16. [ ] All tabs: InsightGroup headers show pointer cursor

**Step 1: Test each item in browser**

**Step 2: Fix any issues found**

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(insights): visual QA fixes"
```

---

## Summary

**New Components Created:**
- `TopCategoriesBar.svelte` — Horizontal bar chart for top 5 categories
- `CategoryChipPicker.svelte` — Horizontal scrolling chip selector
- `CategoryTreemap.svelte` — Treemap visualization
- `EditDetectedBillModal.svelte` — Modal for editing detected bills

**Components Modified:**
- `+page.svelte` (insights) — Swap pie chart for TopCategoriesBar
- `SmartTakeaways.svelte` — Hero styling, pill button
- `QuickStatsRow.svelte` — Color indicators
- `SpendingThisMonth.svelte` — Remove pace card, update label
- `CategoryDeepDives.svelte` — Treemap, chip picker, simplified stats
- `RecurringInsights.svelte` — Grouped headers, edit modal
- `YTDSummary.svelte` — Remove mini heatmap, collapse tags
- `NeedsWantsInsights.svelte` — Bar color update
- `InsightGroup.svelte` — cursor-pointer fix

**Total Commits:** ~19
