<script lang="ts">
	import { onMount } from 'svelte';
	import { X } from 'lucide-svelte';
	import type { Transaction, MonthlyBudget } from '$lib/db';
	import {
		calculateDashboardInsight,
		isDismissed,
		dismissInsight,
		type DashboardInsight
	} from '$lib/utils/dashboard-insight';

	interface Props {
		currentMonth: string;
		transactions: Transaction[];
		budget: MonthlyBudget | null;
		savedFromContributions: number;
		currentDay: number;
		daysInMonth: number;
	}

	let { currentMonth, transactions, budget, savedFromContributions, currentDay, daysInMonth }: Props = $props();

	let dismissed = $state(false);
	let insight = $state<DashboardInsight | null>(null);
	let isLoading = $state(true);
	let loadSequence = 0; // Track sequence to ignore stale async results

	// Check dismiss status on mount
	onMount(() => {
		dismissed = isDismissed();
	});

	// Calculate insight when dependencies change
	$effect(() => {
		loadInsight();
	});

	async function loadInsight() {
		if (dismissed) {
			isLoading = false;
			return;
		}

		const thisSequence = ++loadSequence;

		try {
			isLoading = true;
			const result = await calculateDashboardInsight({
				currentMonth,
				transactions,
				budget,
				savedFromContributions,
				currentDay,
				daysInMonth
			});

			// Ignore stale results from earlier calls
			if (thisSequence !== loadSequence) return;

			insight = result;
		} catch (error) {
			// Ignore stale errors
			if (thisSequence !== loadSequence) return;

			console.error('Failed to calculate dashboard insight:', error);
			insight = null;
		} finally {
			// Only update loading state for current sequence
			if (thisSequence === loadSequence) {
				isLoading = false;
			}
		}
	}

	function handleDismiss() {
		dismissInsight();
		dismissed = true;
	}

	let shouldShow = $derived(!dismissed && !isLoading && insight !== null);
</script>

{#if shouldShow && insight}
	<div
		class="{insight.bgColor} border {insight.borderColor} rounded-xl px-4 py-3 flex items-center justify-between gap-4"
		role="status"
		aria-live="polite"
	>
		<div class="flex items-center gap-3 flex-1 min-w-0">
			<div class="p-2 rounded-lg shrink-0 {insight.bgColor}">
				<insight.icon size={18} class={insight.iconColor} />
			</div>
			<p class="text-sm text-charcoal font-medium truncate">
				{insight.message}
			</p>
		</div>

		<div class="flex items-center gap-2 shrink-0">
			{#if insight.linkTo}
				<a
					href={insight.linkTo}
					class="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
				>
					View
				</a>
			{/if}
			<button
				type="button"
				onclick={handleDismiss}
				class="p-1.5 text-charcoal-muted hover:text-charcoal hover:bg-white/50 rounded-lg transition-colors"
				aria-label="Dismiss for 24 hours"
				title="Dismiss for 24 hours"
			>
				<X size={18} />
			</button>
		</div>
	</div>
{/if}
