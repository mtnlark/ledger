<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, ChevronUp, LayoutGrid } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import CategoryBudgetCard from './CategoryBudgetCard.svelte';
	import EmptyState from './EmptyState.svelte';
	import type { Category, CategoryBudget } from '$lib/db';
	import type { EffectiveBudget } from '$lib/utils/budget-rollover';

	interface Props {
		categories: Category[];
		budgets: Map<number, CategoryBudget>;
		spending: Map<number, number>;
		suggestions: Map<number, number>;
		/** Per-category effective budgets (carryover + rollsOver flag). */
		rollover?: Map<number, EffectiveBudget>;
		onSaveBudget: (categoryId: number, amount: number) => void | Promise<void>;
		onDeleteBudget: (categoryId: number) => void | Promise<void>;
		onToggleRollover?: (categoryId: number, rollsOver: boolean) => void | Promise<void>;
	}

	let { categories, budgets, spending, suggestions, rollover, onSaveBudget, onDeleteBudget, onToggleRollover }: Props =
		$props();

	// Track collapsed state for "No Activity" section
	let noActivityExpanded = $state(false);

	// Group categories into sections
	let groupedCategories = $derived.by(() => {
		const withBudgets: Array<{
			category: Category;
			budget: CategoryBudget;
			spent: number;
		}> = [];
		const unbudgetedWithSpending: Array<{
			category: Category;
			spent: number;
			suggestion: number;
		}> = [];
		const noActivity: Array<{
			category: Category;
			suggestion: number;
		}> = [];

		for (const category of categories) {
			if (!category.isActive) continue;

			const categoryId = category.id!;
			const budget = budgets.get(categoryId);
			const spent = spending.get(categoryId) || 0;
			const suggestion = suggestions.get(categoryId) || 0;

			if (budget) {
				// Note: percentSpent is calculated by BudgetProgressBar using rounded values
				// to ensure display/status consistency
				withBudgets.push({ category, budget, spent });
			} else if (spent > 0) {
				unbudgetedWithSpending.push({ category, spent, suggestion });
			} else {
				noActivity.push({ category, suggestion });
			}
		}

		// Sort all sections alphabetically for stable positioning
		withBudgets.sort((a, b) => a.category.name.localeCompare(b.category.name));
		unbudgetedWithSpending.sort((a, b) => a.category.name.localeCompare(b.category.name));
		noActivity.sort((a, b) => a.category.name.localeCompare(b.category.name));

		return { withBudgets, unbudgetedWithSpending, noActivity };
	});
</script>

<div class="space-y-6">
	<!-- Categories with Budgets -->
	{#if groupedCategories.withBudgets.length > 0}
		<section>
			<h3 class="text-sm font-medium text-charcoal-muted uppercase tracking-wider mb-3">
				Budgeted ({groupedCategories.withBudgets.length})
			</h3>
			<div class="space-y-2">
				{#each groupedCategories.withBudgets as { category, budget, spent } (category.id)}
					<CategoryBudgetCard
						{category}
						{spent}
						budgetAmount={budget.budgetAmount}
						suggestedAmount={suggestions.get(category.id!) || 0}
						carryover={rollover?.get(category.id!)?.carryover ?? 0}
						rollsOver={rollover?.get(category.id!)?.rollsOver ?? false}
						onSaveBudget={(amount) => onSaveBudget(category.id!, amount)}
						onDeleteBudget={() => onDeleteBudget(category.id!)}
						onToggleRollover={onToggleRollover
							? (r) => onToggleRollover(category.id!, r)
							: undefined}
					/>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Unbudgeted with Spending -->
	{#if groupedCategories.unbudgetedWithSpending.length > 0}
		<section>
			<h3 class="text-sm font-medium text-charcoal-muted uppercase tracking-wider mb-3">
				Unbudgeted with Spending ({groupedCategories.unbudgetedWithSpending.length})
			</h3>
			<div class="space-y-2">
				{#each groupedCategories.unbudgetedWithSpending as { category, spent, suggestion } (category.id)}
					<CategoryBudgetCard
						{category}
						{spent}
						budgetAmount={null}
						suggestedAmount={suggestion}
						onSaveBudget={(amount) => onSaveBudget(category.id!, amount)}
						onDeleteBudget={() => onDeleteBudget(category.id!)}
						onAcceptSuggestion={suggestion > 0
							? () => onSaveBudget(category.id!, suggestion)
							: undefined}
					/>
				{/each}
			</div>
		</section>
	{/if}

	<!-- No Activity (Collapsible) -->
	{#if groupedCategories.noActivity.length > 0}
		<section>
			<button
				onclick={() => (noActivityExpanded = !noActivityExpanded)}
				class="flex items-center gap-2 text-sm font-medium text-charcoal-muted uppercase tracking-wider mb-3 hover:text-charcoal transition-colors"
			>
				<span>No Activity ({groupedCategories.noActivity.length})</span>
				{#if noActivityExpanded}
					<ChevronUp size={16} />
				{:else}
					<ChevronDown size={16} />
				{/if}
			</button>

			{#if noActivityExpanded}
				<div class="space-y-2" transition:slide={{ duration: 200 }}>
					{#each groupedCategories.noActivity as { category, suggestion } (category.id)}
						<CategoryBudgetCard
							{category}
							spent={0}
							budgetAmount={null}
							suggestedAmount={suggestion}
							onSaveBudget={(amount) => onSaveBudget(category.id!, amount)}
							onDeleteBudget={() => onDeleteBudget(category.id!)}
							onAcceptSuggestion={suggestion > 0
								? () => onSaveBudget(category.id!, suggestion)
								: undefined}
						/>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Empty State -->
	{#if groupedCategories.withBudgets.length === 0 && groupedCategories.unbudgetedWithSpending.length === 0 && groupedCategories.noActivity.length === 0}
		<EmptyState
			icon={LayoutGrid as ComponentType}
			title="No categories available"
			description="Add categories in Settings to start budgeting"
			actionLabel="Go to Settings"
			onAction={() => goto('/settings')}
		/>
	{/if}
</div>
