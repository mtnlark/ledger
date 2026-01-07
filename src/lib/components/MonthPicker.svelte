<script lang="ts">
	import { format } from 'date-fns';
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
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path
				fill-rule="evenodd"
				d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
				clip-rule="evenodd"
			/>
		</svg>
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
			<svg
				class="w-4 h-4 text-gray-400 transition-transform {isOpen ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
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
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path
				fill-rule="evenodd"
				d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>
</div>
