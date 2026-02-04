<script lang="ts">
	import type { Transaction, MonthlyBudget, SavingsContribution } from '$lib/db';
	import { getMonthKey } from '$lib/db';
	import type { CategoryBudget } from '$lib/db';
	import { sumCurrency, calculatePercent, roundCurrency } from '$lib/utils/currency';
	import { formatCurrencyWhole } from '$lib/utils/format-helpers';
	import { getBudgetStatus } from '$lib/utils/budget-status';

	interface Props {
		transactions: Transaction[];
		selectedMonth: string;
		categoryBudgets: CategoryBudget[];
		budget: MonthlyBudget | null;
		contributions: SavingsContribution[];
	}

	let { transactions, selectedMonth, categoryBudgets, budget, contributions }: Props = $props();

	let isCurrentMonth = $derived(selectedMonth === getMonthKey(new Date()));

	// Total Spent (user's portion)
	let totalSpent = $derived(
		roundCurrency(transactions.reduce((sum, t) => {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			return sum + userAmount;
		}, 0))
	);

	// Budget Status: count how many budgeted categories are within budget
	// Uses getBudgetStatus() to match the Budget page's tolerance logic
	let budgetStatus = $derived.by(() => {
		if (categoryBudgets.length === 0) return null;

		// Sum spending per category (user's portion) — raw float, matching getAllCategorySpending
		const spending = new Map<number, number>();
		for (const t of transactions) {
			const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
			spending.set(t.categoryId, (spending.get(t.categoryId) || 0) + userAmount);
		}

		let onTrack = 0;
		let total = 0;

		for (const cb of categoryBudgets) {
			if (cb.budgetAmount <= 0) continue;
			total++;
			const spent = spending.get(cb.categoryId) || 0;
			const status = getBudgetStatus(spent, cb.budgetAmount);
			if (status.status !== 'over') {
				onTrack++;
			}
		}

		return total > 0 ? { onTrack, total } : null;
	});

	// Savings Rate
	let savingsRate = $derived.by(() => {
		if (!budget || budget.income <= 0) return null;
		const affectingAvailable = contributions
			.filter((c) => c.source === 'bank_transfer' || c.source === 'other');
		const totalSaved = sumCurrency(affectingAvailable.map((c) => c.amount));
		return Math.round(calculatePercent(totalSaved, budget.income));
	});
</script>

<div class="grid grid-cols-3 gap-3">
	<!-- Total Spent -->
	<div class="bg-surface rounded-xl p-4 text-center shadow-sm shadow-[var(--color-shadow)]">
		<p class="font-mono text-xl font-medium text-charcoal">{formatCurrencyWhole(totalSpent)}</p>
		<p class="text-xs text-charcoal-muted mt-1">
			{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
		</p>
	</div>

	<!-- Budget Status -->
	<div class="bg-surface rounded-xl p-4 text-center shadow-sm shadow-[var(--color-shadow)]">
		{#if budgetStatus}
			<p class="font-mono text-xl font-medium text-charcoal">
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

	<!-- Savings Rate -->
	<div class="bg-surface rounded-xl p-4 text-center shadow-sm shadow-[var(--color-shadow)]">
		{#if savingsRate !== null}
			<p class="font-mono text-xl font-medium text-charcoal">{savingsRate}%</p>
			<p class="text-xs text-charcoal-muted mt-1">savings rate</p>
		{:else}
			<p class="font-mono text-xl font-medium text-charcoal-muted">—</p>
			<p class="text-xs text-charcoal-muted mt-1">savings rate</p>
		{/if}
	</div>
</div>
