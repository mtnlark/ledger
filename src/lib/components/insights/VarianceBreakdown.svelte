<script lang="ts" module>
	import type { Transaction, Category } from '$lib/db';
	import { getMonthKey } from '$lib/db';
	import { roundCurrency } from '$lib/utils/currency';
	import { computeStdDev } from '$lib/insights/calculations/stats';
	import { detectAnomalies } from '$lib/insights/calculations/anomalies';
	import { config } from '$lib/config';

	export interface VarianceItem {
		categoryId: number;
		name: string;
		icon: string;
		current: number;
		baseline: number;
		delta: number;
		/** Statistically anomalous vs the baseline months (z-score based). */
		isUnusual: boolean;
	}

	export interface VarianceResult {
		items: VarianceItem[];
		/** Net spending difference vs the baseline average (all categories, unfiltered). */
		totalDelta: number;
		baselineMonthCount: number;
		/** When comparing a partial (current) month, both sides are clipped to this day-of-month. */
		throughDay: number | null;
	}

	export interface VarianceOptions {
		monthsBack?: number;
		/** Categories with |delta| below this are folded out of the list (still in totalDelta). */
		minDelta?: number;
		maxItems?: number;
		/** Injectable for tests. */
		today?: Date;
	}

	function userShare(t: Transaction): number {
		return t.isShared ? t.amount - t.partnerShare : t.amount;
	}

	function previousMonthKeys(monthKey: string, count: number): string[] {
		const [y, m] = monthKey.split('-').map(Number);
		const keys: string[] = [];
		let year = y;
		let month = m;
		for (let i = 0; i < count; i++) {
			month -= 1;
			if (month === 0) {
				month = 12;
				year -= 1;
			}
			keys.push(`${year}-${String(month).padStart(2, '0')}`);
		}
		return keys;
	}

	/**
	 * "Why is this month different?" — per-category spending vs the average of
	 * recent months. When the selected month is the current calendar month, both
	 * sides are clipped to the same day-of-month so a half-finished month is
	 * compared against half-finished baselines rather than full ones.
	 */
	export function computeCategoryVariance(
		transactions: Transaction[],
		categories: Category[],
		selectedMonth: string,
		options: VarianceOptions = {}
	): VarianceResult | null {
		const { monthsBack = 6, minDelta = 15, maxItems = 6, today = new Date() } = options;

		const throughDay = selectedMonth === getMonthKey(today) ? today.getDate() : null;
		const baselineKeys = previousMonthKeys(selectedMonth, monthsBack);

		const currentByCategory = new Map<number, number>();
		const baselineByCategory = new Map<number, number>();
		// Per-category, per-month baseline totals (for stdDev / anomaly flagging)
		const baselineMonthly = new Map<number, Map<string, number>>();
		const monthsWithData = new Set<string>();

		for (const t of transactions) {
			if (t.isDeleted || t.isSplitParent) continue;
			const date = new Date(t.date);
			const key = getMonthKey(date);
			const isCurrent = key === selectedMonth;
			const isBaseline = baselineKeys.includes(key);
			if (!isCurrent && !isBaseline) continue;
			if (throughDay !== null && date.getDate() > throughDay) continue;

			const share = userShare(t);
			if (isCurrent) {
				currentByCategory.set(t.categoryId, (currentByCategory.get(t.categoryId) || 0) + share);
			} else {
				monthsWithData.add(key);
				baselineByCategory.set(t.categoryId, (baselineByCategory.get(t.categoryId) || 0) + share);
				let perMonth = baselineMonthly.get(t.categoryId);
				if (!perMonth) {
					perMonth = new Map();
					baselineMonthly.set(t.categoryId, perMonth);
				}
				perMonth.set(key, (perMonth.get(key) || 0) + share);
			}
		}

		// Need a meaningful baseline: at least two prior months with activity
		const baselineMonthCount = monthsWithData.size;
		if (baselineMonthCount < 2) return null;

		// Reuse the production anomaly detector (adaptive z-score thresholds) to
		// flag categories whose current spending is statistically unusual.
		// Baseline values are zero-filled across active months so a category that
		// only appears occasionally still gets a meaningful spread.
		const categoryStats = new Map<number, { mean: number; stdDev: number; sampleCount: number }>();
		for (const [id, perMonth] of baselineMonthly) {
			const values = [...monthsWithData].map((m) => perMonth.get(m) || 0);
			const mean = values.reduce((s, v) => s + v, 0) / baselineMonthCount;
			categoryStats.set(id, { mean, stdDev: computeStdDev(values), sampleCount: baselineMonthCount });
		}
		const unusualIds = new Set(
			detectAnomalies(currentByCategory, categoryStats, categories, {
				...config.insights.anomaly,
				maxToShow: Number.MAX_SAFE_INTEGER
			}).map((a) => a.catId)
		);

		const categoryIds = new Set([...currentByCategory.keys(), ...baselineByCategory.keys()]);
		const items: VarianceItem[] = [];
		let totalDelta = 0;

		for (const id of categoryIds) {
			const current = roundCurrency(currentByCategory.get(id) || 0);
			const baseline = roundCurrency((baselineByCategory.get(id) || 0) / baselineMonthCount);
			const delta = roundCurrency(current - baseline);
			totalDelta += delta;
			if (Math.abs(delta) < minDelta) continue;
			const cat = categories.find((c) => c.id === id);
			items.push({
				categoryId: id,
				name: cat?.name ?? 'Unknown',
				icon: cat?.icon ?? '📁',
				current,
				baseline,
				delta,
				isUnusual: delta > 0 && unusualIds.has(id)
			});
		}

		items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

		return {
			items: items.slice(0, maxItems),
			totalDelta: roundCurrency(totalDelta),
			baselineMonthCount,
			throughDay
		};
	}
</script>

<script lang="ts">
	import { formatCurrency } from '$lib/utils/format-helpers';

	interface Props {
		transactions: Transaction[];
		categories: Category[];
		selectedMonth: string;
	}

	let { transactions, categories, selectedMonth }: Props = $props();

	let result = $derived(computeCategoryVariance(transactions, categories, selectedMonth));
	let maxAbsDelta = $derived(
		result ? Math.max(...result.items.map((i) => Math.abs(i.delta)), 1) : 1
	);

	function signed(amount: number): string {
		return `${amount >= 0 ? '+' : '−'}${formatCurrency(Math.abs(amount))}`;
	}
</script>

{#if result && result.items.length > 0}
	<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
		<div class="px-6 py-4">
			<h2 class="font-display text-xl font-medium text-charcoal">What Changed</h2>
			<p class="text-sm text-charcoal-muted mt-0.5">
				<span class="font-mono font-medium {result.totalDelta > 0 ? 'text-danger-600' : 'text-success-600'}">{signed(result.totalDelta)}</span>
				vs your {result.baselineMonthCount}-month average{result.throughDay !== null ? ` (through day ${result.throughDay})` : ''}
			</p>
		</div>
		<div class="px-6 pb-5 space-y-2.5">
			{#each result.items as item (item.categoryId)}
				{@const pct = (Math.abs(item.delta) / maxAbsDelta) * 50}
				<div class="flex items-center gap-3">
					<span class="w-6 text-center shrink-0">{item.icon}</span>
					<span class="text-sm text-charcoal truncate min-w-0 flex-1">
						{item.name}
						{#if item.isUnusual}
							<span class="badge bg-warning-500/10 text-warning-700 ml-1.5" title="Statistically unusual vs your recent months">Unusual</span>
						{/if}
					</span>
					<!-- Diverging bar: spending above baseline grows right, below grows left -->
					<div class="relative h-1.5 w-28 shrink-0 rounded-full bg-surface-alt overflow-hidden" aria-hidden="true">
						<span class="absolute inset-y-0 left-1/2 w-px bg-charcoal-muted/30"></span>
						{#if item.delta >= 0}
							<span class="absolute inset-y-0 left-1/2 rounded-r-full bg-danger-400" style="width: {pct}%"></span>
						{:else}
							<span class="absolute inset-y-0 right-1/2 rounded-l-full bg-success-400" style="width: {pct}%"></span>
						{/if}
					</div>
					<span
						class="font-mono text-sm font-medium w-20 text-right shrink-0 {item.delta > 0 ? 'text-danger-600' : 'text-success-600'}"
						title="{formatCurrency(item.current)} this month vs {formatCurrency(item.baseline)} typical"
					>
						{signed(item.delta)}
					</span>
				</div>
			{/each}
		</div>
	</div>
{/if}
