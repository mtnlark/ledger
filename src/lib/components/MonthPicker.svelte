<script lang="ts">
	import { format } from 'date-fns';
	import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-svelte';
	import { parseMonthKey, navigateMonth } from '$lib/db';

	interface Props {
		currentMonth: string;
		availableMonths: string[];
		onMonthChange: (month: string) => void;
	}

	let { currentMonth, availableMonths, onMonthChange }: Props = $props();

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
		class="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
		aria-label="Previous month"
	>
		<ChevronLeft size={20} />
	</button>

	<!-- Month dropdown -->
	<div class="relative">
		<button
			onclick={() => (isOpen = !isOpen)}
			class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors min-w-[140px] justify-center"
			aria-expanded={isOpen}
			aria-haspopup="listbox"
		>
			<span>{formatMonth(currentMonth)}</span>
			<ChevronDown size={16} class="text-gray-400 transition-transform {isOpen ? 'rotate-180' : ''}" />
		</button>

		{#if isOpen}
			<!-- Backdrop -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="fixed inset-0 z-10" onclick={closeDropdown}></div>

			<!-- Dropdown -->
			<div
				class="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 max-h-64 overflow-auto"
				role="listbox"
			>
				{#each [...availableMonths].reverse() as month (month)}
					<button
						onclick={() => selectMonth(month)}
						role="option"
						aria-selected={month === currentMonth}
						class="w-full px-3 py-2 text-sm text-left transition-colors {month === currentMonth
							? 'bg-blue-50 text-blue-700 font-medium'
							: 'text-gray-700 hover:bg-gray-50'}"
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
		class="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
		aria-label="Next month"
	>
		<ChevronRight size={20} />
	</button>
</div>
