<script lang="ts">
	import { parseMonthKey } from '$lib/db';
	import type { MonthlyBudget } from '$lib/db';
	import InsightGroup from './InsightGroup.svelte';
	import SpendingVelocity from './SpendingVelocity.svelte';
	import SavingsRateChart from './SavingsRateChart.svelte';

	interface DailySpending {
		day: number;
		amount: number;
		cumulative: number;
	}

	interface Props {
		currentMonth: string;
		dailySpending: DailySpending[];
		budget: MonthlyBudget | null;
		allBudgets: MonthlyBudget[];
	}

	let { currentMonth, dailySpending, budget, allBudgets }: Props = $props();

	// Current day of the month
	let today = new Date();
	let currentDay = $derived.by(() => {
		const monthDate = parseMonthKey(currentMonth);
		// Only show current day marker if viewing current month
		if (
			today.getFullYear() === monthDate.getFullYear() &&
			today.getMonth() === monthDate.getMonth()
		) {
			return today.getDate();
		}
		// For past months, show the full month
		return dailySpending.length;
	});

	// Calculate projected spending
	let availableBudget = $derived(budget ? budget.income - budget.savedAmount : 0);
	let daysInMonth = $derived(dailySpending.length);
	let totalSpentSoFar = $derived(
		currentDay > 0 && currentDay <= dailySpending.length
			? dailySpending[currentDay - 1].cumulative
			: 0
	);
	let dailyAvg = $derived(currentDay > 0 ? totalSpentSoFar / currentDay : 0);
	let daysRemaining = $derived(daysInMonth - currentDay);
	let projectedTotal = $derived(totalSpentSoFar + dailyAvg * daysRemaining);
	let projectedSurplus = $derived(availableBudget - projectedTotal);

	// Current savings rate
	let currentSavingsRate = $derived(budget && budget.income > 0 ? budget.savedAmount / budget.income : 0);

	// Velocity calculation for preview
	let expectedByNow = $derived(currentDay > 0 ? (availableBudget / daysInMonth) * currentDay : 0);
	let velocityRatio = $derived(expectedByNow > 0 ? totalSpentSoFar / expectedByNow : 0);
	let velocityPercent = $derived(Math.round((velocityRatio - 1) * 100));
</script>

<InsightGroup title="Predictive Insights" description="Spending pace and savings tracking">
	{#snippet preview()}
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<!-- Velocity indicator -->
				<div>
					<p class="text-sm text-gray-500">Pace</p>
					<p
						class="text-lg font-semibold {velocityRatio > 1.1
							? 'text-red-600'
							: velocityRatio < 0.9
								? 'text-green-600'
								: 'text-gray-900'}"
					>
						{#if budget}
							{velocityRatio > 1 ? '+' : ''}{velocityPercent}%
						{:else}
							--
						{/if}
					</p>
				</div>

				<!-- Savings rate -->
				<div>
					<p class="text-sm text-gray-500">Savings Rate</p>
					<p class="text-lg font-semibold text-green-600">
						{#if budget}
							{(currentSavingsRate * 100).toFixed(0)}%
						{:else}
							--
						{/if}
					</p>
				</div>
			</div>

			<!-- Projected total -->
			{#if budget && currentDay > 0}
				<div class="text-right">
					<p class="text-sm text-gray-500">Projected</p>
					<p class="text-lg font-semibold {projectedSurplus < 0 ? 'text-red-600' : 'text-gray-900'}">
						${Math.round(projectedTotal).toLocaleString()}
					</p>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-8">
			<!-- Spending Velocity -->
			<div>
				<h3 class="text-sm font-medium text-gray-700 mb-3">Spending Velocity</h3>
				<SpendingVelocity {dailySpending} {budget} {currentDay} />

				<!-- Projection details -->
				{#if budget && currentDay > 0 && currentDay < daysInMonth}
					<div class="mt-4 p-4 bg-gray-50 rounded-lg">
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p class="text-gray-500">Daily average</p>
								<p class="font-medium">${dailyAvg.toFixed(2)}</p>
							</div>
							<div>
								<p class="text-gray-500">Days remaining</p>
								<p class="font-medium">{daysRemaining}</p>
							</div>
							<div>
								<p class="text-gray-500">Projected total</p>
								<p class="font-medium">${Math.round(projectedTotal).toLocaleString()}</p>
							</div>
							<div>
								<p class="text-gray-500">Projected surplus</p>
								<p class="font-medium {projectedSurplus < 0 ? 'text-red-600' : 'text-green-600'}">
									{projectedSurplus < 0 ? '-' : '+'}${Math.abs(Math.round(projectedSurplus)).toLocaleString()}
								</p>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Savings Rate -->
			<div>
				<h3 class="text-sm font-medium text-gray-700 mb-3">Savings Rate Over Time</h3>
				<SavingsRateChart budgets={allBudgets} />
			</div>
		</div>
	{/snippet}
</InsightGroup>
