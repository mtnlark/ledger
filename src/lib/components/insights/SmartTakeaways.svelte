<script lang="ts">
	import { TrendingUp, TrendingDown, AlertTriangle, Gauge, Receipt, Store } from 'lucide-svelte';
	import { getMonthKey, navigateMonth, parseMonthKey } from '$lib/db';
	import type { Transaction, Category, MonthlyBudget } from '$lib/db';

	interface Props {
		currentMonthTransactions: Transaction[];
		allTransactions: Transaction[];
		categories: Category[];
		availableMonths: string[];
		budget: MonthlyBudget | null;
	}

	let { currentMonthTransactions, allTransactions, categories, availableMonths, budget }: Props =
		$props();

	// Current month key
	let currentMonthKey = getMonthKey(new Date());

	// Get category name helper
	function getCategoryName(catId: number): string {
		return categories.find((c) => c.id === catId)?.name ?? 'Unknown';
	}

	// Calculate spending by category for a given month's transactions
	function getSpendingByCategory(transactions: Transaction[]): Map<number, number> {
		const spending = new Map<number, number>();
		for (const t of transactions) {
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(t.categoryId, (spending.get(t.categoryId) || 0) + amount);
		}
		return spending;
	}

	// Get transactions for a specific month from all transactions
	function getTransactionsForMonth(month: string): Transaction[] {
		const monthDate = parseMonthKey(month);
		const year = monthDate.getFullYear();
		const monthNum = monthDate.getMonth();
		return allTransactions.filter((t) => {
			const d = new Date(t.date);
			return d.getFullYear() === year && d.getMonth() === monthNum;
		});
	}

	// Calculate 3-month average per category (excluding current month)
	let categoryAverages = $derived.by(() => {
		const averages = new Map<number, number>();
		if (availableMonths.length < 2) return averages;

		// Get last 3 months excluding current
		const recentMonths: string[] = [];
		let month = navigateMonth(currentMonthKey, -1);
		for (let i = 0; i < 3; i++) {
			if (availableMonths.includes(month)) {
				recentMonths.push(month);
			}
			month = navigateMonth(month, -1);
		}

		if (recentMonths.length === 0) return averages;

		// Sum spending per category across recent months
		const categoryTotals = new Map<number, number>();
		for (const m of recentMonths) {
			const transactions = getTransactionsForMonth(m);
			const spending = getSpendingByCategory(transactions);
			for (const [catId, amount] of spending) {
				categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + amount);
			}
		}

		// Calculate averages
		for (const [catId, total] of categoryTotals) {
			averages.set(catId, total / recentMonths.length);
		}

		return averages;
	});

	// Detect anomalies (categories significantly above average)
	let anomalies = $derived.by(() => {
		const currentSpending = getSpendingByCategory(currentMonthTransactions);
		const results: { catId: number; name: string; current: number; avg: number; ratio: number }[] =
			[];

		for (const [catId, current] of currentSpending) {
			const avg = categoryAverages.get(catId) || 0;
			if (avg > 20) {
				// Only flag if there's meaningful historical spending
				const ratio = current / avg;
				if (ratio > 1.5) {
					results.push({
						catId,
						name: getCategoryName(catId),
						current,
						avg,
						ratio
					});
				}
			}
		}

		return results.sort((a, b) => b.ratio - a.ratio).slice(0, 2); // Top 2 anomalies
	});

	// Calculate pace projection
	let paceProjection = $derived.by(() => {
		if (!budget) return null;

		const today = new Date();
		const currentDay = today.getDate();
		const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

		if (currentDay === 0) return null;

		const totalSpent = currentMonthTransactions.reduce(
			(sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount),
			0
		);

		const dailyAvg = totalSpent / currentDay;
		const projected = totalSpent + dailyAvg * (daysInMonth - currentDay);
		const available = budget.income - budget.savedAmount;
		const percentOfBudget = available > 0 ? (projected / available) * 100 : 0;

		return {
			projected: Math.round(projected),
			available: Math.round(available),
			percentOfBudget: Math.round(percentOfBudget),
			isOverBudget: projected > available
		};
	});

	// Get previous month for comparison
	let previousMonthKey = $derived(navigateMonth(currentMonthKey, -1));

	// Calculate top category shift (biggest change from last month)
	let topShift = $derived.by(() => {
		const prevTransactions = getTransactionsForMonth(previousMonthKey);
		if (prevTransactions.length === 0) return null;

		const currentSpending = getSpendingByCategory(currentMonthTransactions);
		const prevSpending = getSpendingByCategory(prevTransactions);

		// Check how far into the month we are
		const today = new Date();
		const currentDay = today.getDate();
		const isEarlyInMonth = currentDay <= 15;

		let biggestShift: {
			name: string;
			current: number;
			previous: number;
			diff: number;
			isIncrease: boolean;
		} | null = null;
		let biggestAbsDiff = 0;

		// Check all categories with spending in either month
		const allCatIds = new Set([...currentSpending.keys(), ...prevSpending.keys()]);

		for (const catId of allCatIds) {
			const current = currentSpending.get(catId) || 0;
			const previous = prevSpending.get(catId) || 0;
			const diff = current - previous;
			const absDiff = Math.abs(diff);
			const isDecrease = diff < 0;

			// Skip "down" shifts if:
			// 1. Current spending is $0 or very low (expense likely hasn't hit yet)
			// 2. We're early in the month and it looks like a recurring expense that hasn't posted
			if (isDecrease) {
				// Don't show "down" for categories with $0 this month - likely just hasn't hit yet
				if (current === 0) continue;
				// Don't show "down" if we're early in month and current is <20% of previous
				// (likely a recurring expense that hasn't posted)
				if (isEarlyInMonth && previous > 0 && current / previous < 0.2) continue;
			}

			// Only consider meaningful shifts (at least $30 difference and some base amount)
			if (absDiff > biggestAbsDiff && absDiff >= 30 && (current > 20 || previous > 20)) {
				biggestAbsDiff = absDiff;
				biggestShift = {
					name: getCategoryName(catId),
					current,
					previous,
					diff,
					isIncrease: diff > 0
				};
			}
		}

		// Don't show if it's already an anomaly (avoid duplication)
		if (biggestShift && anomalies.some((a) => a.name === biggestShift!.name)) {
			return null;
		}

		return biggestShift;
	});

	// Fallback: Needs vs wants ratio
	let needsVsWants = $derived.by(() => {
		if (currentMonthTransactions.length === 0) return null;

		let needsTotal = 0;
		let wantsTotal = 0;

		for (const t of currentMonthTransactions) {
			const amount = t.isShared ? t.amount - t.partnerShare : t.amount;
			if (t.isEssential) {
				needsTotal += amount;
			} else {
				wantsTotal += amount;
			}
		}

		const total = needsTotal + wantsTotal;
		if (total === 0) return null;

		const needsPercent = Math.round((needsTotal / total) * 100);
		return { needsTotal, wantsTotal, needsPercent };
	});

	// Fallback: Spending velocity comparison (daily average this month vs last month)
	let velocityComparison = $derived.by(() => {
		const prevTransactions = getTransactionsForMonth(previousMonthKey);
		if (prevTransactions.length === 0) return null;

		const today = new Date();
		const currentDay = today.getDate();
		if (currentDay === 0) return null;

		// Current month: total / days elapsed
		const currentTotal = currentMonthTransactions.reduce(
			(sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount),
			0
		);
		const currentDailyAvg = currentTotal / currentDay;

		// Previous month: total / days in that month
		const prevMonthDate = parseMonthKey(previousMonthKey);
		const daysInPrevMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
		const prevTotal = prevTransactions.reduce(
			(sum, t) => sum + (t.isShared ? t.amount - t.partnerShare : t.amount),
			0
		);
		const prevDailyAvg = prevTotal / daysInPrevMonth;

		if (prevDailyAvg === 0) return null;

		const percentChange = Math.round(((currentDailyAvg - prevDailyAvg) / prevDailyAvg) * 100);

		// Only show if there's a meaningful difference (>5%)
		if (Math.abs(percentChange) < 5) return null;

		return { currentDailyAvg, prevDailyAvg, percentChange, isUp: percentChange > 0 };
	});

	// Fallback: Most frequent merchant this month
	let topMerchant = $derived.by(() => {
		if (currentMonthTransactions.length === 0) return null;

		const freq = new Map<string, number>();
		for (const t of currentMonthTransactions) {
			freq.set(t.merchant, (freq.get(t.merchant) || 0) + 1);
		}

		let top = { merchant: '', count: 0 };
		for (const [merchant, count] of freq) {
			if (count > top.count) {
				top = { merchant, count };
			}
		}

		return top.count >= 2 ? top : null; // Only show if visited at least twice
	});

	// Build takeaways list
	interface Takeaway {
		type: 'anomaly' | 'pace' | 'shift' | 'needsWants' | 'monthComparison' | 'topMerchant';
		icon: typeof AlertTriangle;
		iconColor: string;
		text: string;
	}

	let takeaways = $derived.by(() => {
		const items: Takeaway[] = [];

		// Add anomalies first (highest priority)
		for (const anomaly of anomalies) {
			const percent = Math.round((anomaly.ratio - 1) * 100);
			items.push({
				type: 'anomaly',
				icon: AlertTriangle,
				iconColor: 'text-warning-500',
				text: `${anomaly.name} is ${percent}% higher than usual`
			});
		}

		// Add pace projection
		if (paceProjection) {
			items.push({
				type: 'pace',
				icon: Gauge,
				iconColor: paceProjection.isOverBudget ? 'text-danger-500' : 'text-success-500',
				text: paceProjection.isOverBudget
					? `On pace to spend $${paceProjection.projected.toLocaleString()} (${paceProjection.percentOfBudget}% of budget)`
					: `On pace to spend $${paceProjection.projected.toLocaleString()} this month`
			});
		}

		// Add top category shift
		if (topShift) {
			items.push({
				type: 'shift',
				icon: topShift.isIncrease ? TrendingUp : TrendingDown,
				iconColor: topShift.isIncrease ? 'text-warning-500' : 'text-success-500',
				text: topShift.isIncrease
					? `${topShift.name} up $${Math.abs(topShift.diff).toLocaleString()} from last month`
					: `${topShift.name} down $${Math.abs(topShift.diff).toLocaleString()} from last month`
			});
		}

		// Add fallbacks to reach 3 items
		if (items.length < 3 && velocityComparison) {
			const verb = velocityComparison.isUp ? 'faster' : 'slower';
			items.push({
				type: 'monthComparison',
				icon: velocityComparison.isUp ? TrendingUp : TrendingDown,
				iconColor: velocityComparison.isUp ? 'text-warning-500' : 'text-success-500',
				text: `Spending ${Math.abs(velocityComparison.percentChange)}% ${verb} than last month's pace`
			});
		}

		if (items.length < 3 && needsVsWants) {
			items.push({
				type: 'needsWants',
				icon: Receipt,
				iconColor: 'text-primary-500',
				text: `${needsVsWants.needsPercent}% of spending is on needs this month`
			});
		}

		if (items.length < 3 && topMerchant) {
			items.push({
				type: 'topMerchant',
				icon: Store,
				iconColor: 'text-charcoal-muted',
				text: `${topMerchant.merchant} visited ${topMerchant.count} times this month`
			});
		}

		return items.slice(0, 3); // Always show exactly 3
	});

	// Check if we have any takeaways to show
	let hasTakeaways = $derived(takeaways.length > 0);
</script>

{#if hasTakeaways}
	<div class="bg-surface rounded-xl shadow-md shadow-[var(--color-shadow)] overflow-hidden">
		<div class="px-6 py-4">
			<h2 class="font-display text-lg font-medium text-charcoal mb-3">Highlights</h2>
			<div class="space-y-2">
				{#each takeaways as takeaway}
					<div class="flex items-start gap-3">
						<div class="flex-shrink-0 mt-0.5">
							<takeaway.icon size={18} class={takeaway.iconColor} />
						</div>
						<p class="text-sm text-charcoal-soft">{takeaway.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
