<script lang="ts">
	import { Check, AlertTriangle } from 'lucide-svelte';
	import type { MonthlyBudget } from '$lib/db';

	interface Props {
		budget: MonthlyBudget | null;
		totalSpent: number;
		monthDisplay: string;
		onEditBudget?: () => void;
	}

	let { budget, totalSpent, monthDisplay, onEditBudget }: Props = $props();

	// Computed values
	let income = $derived(budget?.income ?? 0);
	let saved = $derived(budget?.savedAmount ?? 0);
	let available = $derived(income - saved);
	let surplus = $derived(available - totalSpent);
	let surplusPercent = $derived(available > 0 ? (surplus / available) * 100 : 0);

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(amount);
	}
</script>

<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
	<!-- Header -->
	<div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
		<h2 class="text-lg font-semibold text-gray-900">{monthDisplay}</h2>
		{#if onEditBudget}
			<button
				onclick={onEditBudget}
				class="text-sm text-blue-600 hover:text-blue-700 font-medium"
			>
				{budget ? 'Edit' : 'Set Budget'}
			</button>
		{/if}
	</div>

	<!-- Cash Flow Breakdown -->
	<div class="p-6 space-y-4">
		{#if !budget}
			<div class="text-center py-4 text-gray-500">
				<p>No budget set for this month</p>
				{#if onEditBudget}
					<button
						onclick={onEditBudget}
						class="mt-2 text-blue-600 hover:text-blue-700 font-medium"
					>
						Set income & savings
					</button>
				{/if}
			</div>
		{:else}
			<!-- Income -->
			<div class="flex justify-between items-center">
				<span class="text-gray-600">Income</span>
				<span class="font-semibold text-gray-900">{formatCurrency(income)}</span>
			</div>

			<!-- Saved -->
			<div class="flex justify-between items-center">
				<span class="text-gray-600">− Saved</span>
				<span class="font-medium text-gray-700">{formatCurrency(saved)}</span>
			</div>

			<!-- Divider -->
			<div class="border-t border-gray-200"></div>

			<!-- Available -->
			<div class="flex justify-between items-center">
				<span class="text-gray-600">Available</span>
				<span class="font-semibold text-gray-900">{formatCurrency(available)}</span>
			</div>

			<!-- Spent -->
			<div class="flex justify-between items-center">
				<span class="text-gray-600">− Spent</span>
				<span class="font-medium text-gray-700">{formatCurrency(totalSpent)}</span>
			</div>

			<!-- Divider -->
			<div class="border-t border-gray-200"></div>

			<!-- Surplus -->
			<div class="flex justify-between items-center">
				<span class="text-gray-600">Surplus</span>
				<span
					class="font-bold text-lg flex items-center gap-1.5 {surplus >= 0 ? 'text-green-600' : 'text-red-600'}"
				>
					{formatCurrency(surplus)}
					{#if surplus >= 0}
						<Check size={18} strokeWidth={3} />
					{:else}
						<AlertTriangle size={18} />
					{/if}
				</span>
			</div>

			<!-- Progress Bar -->
			{#if available > 0}
				<div class="mt-4">
					<div class="flex justify-between text-xs text-gray-500 mb-1">
						<span>Spending Progress</span>
						<span>{Math.min(100, Math.round((totalSpent / available) * 100))}% used</span>
					</div>
					<div class="h-2 bg-gray-200 rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all duration-300 {totalSpent > available
								? 'bg-red-500'
								: totalSpent > available * 0.8
									? 'bg-amber-500'
									: 'bg-green-500'}"
							style="width: {Math.min(100, (totalSpent / available) * 100)}%"
						></div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
