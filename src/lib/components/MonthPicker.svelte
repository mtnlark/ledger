<script lang="ts">
	import { format } from 'date-fns';
	import { ChevronLeft, ChevronRight, ChevronDown, RotateCcw } from 'lucide-svelte';
	import { parseMonthKey, navigateMonth, getMonthKey } from '$lib/db';

	interface Props {
		currentMonth: string;
		availableMonths: string[];
		onMonthChange: (month: string) => void;
	}

	let { currentMonth, availableMonths, onMonthChange }: Props = $props();

	// Check if we're viewing the actual current month
	let actualCurrentMonth = getMonthKey(new Date());
	let isViewingCurrentMonth = $derived(currentMonth === actualCurrentMonth);

	function jumpToCurrentMonth() {
		onMonthChange(actualCurrentMonth);
	}

	let isOpen = $state(false);

	// Format month for display
	function formatMonth(monthKey: string): string {
		return format(parseMonthKey(monthKey), 'MMMM yyyy');
	}

	// Format month for dropdown (shorter)
	function formatMonthShort(monthKey: string): string {
		return format(parseMonthKey(monthKey), 'MMM yyyy');
	}

	// Check if we can navigate
	let canGoPrev = $derived(availableMonths.indexOf(currentMonth) > 0);
	let canGoNext = $derived(
		availableMonths.indexOf(currentMonth) < availableMonths.length - 1
	);

	function goPrev() {
		if (canGoPrev) {
			const idx = availableMonths.indexOf(currentMonth);
			onMonthChange(availableMonths[idx - 1]);
		}
	}

	function goNext() {
		if (canGoNext) {
			const idx = availableMonths.indexOf(currentMonth);
			onMonthChange(availableMonths[idx + 1]);
		}
	}

	function selectMonth(month: string) {
		onMonthChange(month);
		isOpen = false;
	}

	function closeDropdown() {
		isOpen = false;
	}
</script>

<div class="flex items-center gap-1">
	<!-- Previous button -->
	<button
		onclick={goPrev}
		disabled={!canGoPrev}
		class="p-2 hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-charcoal-soft"
		aria-label="Previous month"
	>
		<ChevronLeft size={20} />
	</button>

	<!-- Month dropdown -->
	<div class="relative">
		<button
			onclick={() => (isOpen = !isOpen)}
			class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-charcoal hover:bg-surface-hover rounded-lg transition-colors min-w-[140px] justify-center"
			aria-expanded={isOpen}
			aria-haspopup="listbox"
		>
			<span>{formatMonth(currentMonth)}</span>
			<ChevronDown size={16} class="text-charcoal-muted transition-transform {isOpen ? 'rotate-180' : ''}" />
		</button>

		{#if isOpen}
			<!-- Backdrop -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-10" onclick={closeDropdown}></div>

			<!-- Dropdown -->
			<div
				class="absolute right-0 mt-1 w-40 bg-surface rounded-lg shadow-lg border border-theme py-1 z-20 max-h-64 overflow-auto"
				role="listbox"
			>
				{#each [...availableMonths].reverse() as month (month)}
					<button
						onclick={() => selectMonth(month)}
						role="option"
						aria-selected={month === currentMonth}
						class="w-full px-3 py-2 text-sm text-left transition-colors {month === currentMonth
							? 'bg-primary-50 text-primary-700 font-medium'
							: 'text-charcoal hover:bg-surface-hover'}"
					>
						{formatMonthShort(month)}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Next button -->
	<button
		onclick={goNext}
		disabled={!canGoNext}
		class="p-2 hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-charcoal-soft"
		aria-label="Next month"
	>
		<ChevronRight size={20} />
	</button>

	<!-- Jump to current month button -->
	{#if !isViewingCurrentMonth}
		<button
			onclick={jumpToCurrentMonth}
			class="ml-1 p-2 text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
			aria-label="Jump to current month"
			title="Jump to current month"
		>
			<RotateCcw size={18} />
		</button>
	{/if}
</div>
