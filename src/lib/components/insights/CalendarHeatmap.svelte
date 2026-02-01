<script lang="ts">
	import {
		format,
		startOfMonth,
		endOfMonth,
		eachDayOfInterval,
		getDay,
		getDate,
		isFuture,
		isToday,
		eachMonthOfInterval,
		startOfYear,
		endOfYear
	} from 'date-fns';
	import { ChevronLeft } from 'lucide-svelte';

	interface Props {
		dailySpending: Map<string, number>;
		year?: number;
		compact?: boolean;
	}

	let { dailySpending, year = new Date().getFullYear(), compact = false }: Props = $props();

	// Zoom state: null = overview, index = zoomed into that month
	let selectedMonth = $state<number | null>(null);

	function handleMonthClick(index: number) {
		selectedMonth = selectedMonth === index ? null : index;
	}

	function backToOverview() {
		selectedMonth = null;
	}

	// Get all months of the year
	let months = $derived.by(() => {
		const start = startOfYear(new Date(year, 0, 1));
		const end = endOfYear(new Date(year, 0, 1));
		return eachMonthOfInterval({ start, end });
	});

	// Max spending for log-scale normalization
	let maxSpending = $derived.by(() => {
		const amounts = Array.from(dailySpending.values()).filter((v) => v > 0);
		if (amounts.length === 0) return 100;
		return Math.max(...amounts);
	});

	// Get intensity level for a day (0-6) using logarithmic scale
	// Log scale prevents outliers from compressing the rest of the range
	function getIntensity(amount: number): number {
		if (amount === 0) return 0;
		const normalized = Math.log(amount + 1) / Math.log(maxSpending + 1);
		return Math.min(6, Math.max(1, Math.ceil(normalized * 6)));
	}

	// Color classes for each intensity level (7 levels for finer gradation)
	const intensityColors = [
		'bg-surface-alt', // 0 - no spending
		'bg-success-100', // 1 - minimal
		'bg-success-200', // 2 - low
		'bg-success-300', // 3 - medium-low
		'bg-success-400', // 4 - medium
		'bg-success-500', // 5 - medium-high
		'bg-success-700'  // 6 - high
	];

	// Build data for each month
	let monthsData = $derived.by(() => {
		return months.map((monthDate) => {
			const start = startOfMonth(monthDate);
			const end = endOfMonth(monthDate);
			const days = eachDayOfInterval({ start, end });
			const firstDayOfWeek = getDay(start); // 0 = Sunday

			// Build grid: 7 columns (Sun-Sat), variable rows
			const grid: { date: Date | null; amount: number; intensity: number; isFutureDay: boolean }[][] = [];
			let currentRow: { date: Date | null; amount: number; intensity: number; isFutureDay: boolean }[] = [];

			// Add empty cells for days before the 1st
			for (let i = 0; i < firstDayOfWeek; i++) {
				currentRow.push({ date: null, amount: 0, intensity: 0, isFutureDay: false });
			}

			for (const day of days) {
				const dateKey = format(day, 'yyyy-MM-dd');
				const amount = dailySpending.get(dateKey) || 0;
				const isFutureDay = isFuture(day) && !isToday(day);
				const intensity = isFutureDay ? -1 : getIntensity(amount);

				currentRow.push({ date: day, amount, intensity, isFutureDay });

				if (currentRow.length === 7) {
					grid.push(currentRow);
					currentRow = [];
				}
			}

			// Pad last row if needed
			if (currentRow.length > 0) {
				while (currentRow.length < 7) {
					currentRow.push({ date: null, amount: 0, intensity: 0, isFutureDay: false });
				}
				grid.push(currentRow);
			}

			return {
				month: monthDate,
				label: format(monthDate, 'MMM'),
				grid
			};
		});
	});

	const cellSize = $derived(compact ? 10 : 14);
	const gap = $derived(compact ? 2 : 3);
</script>

<div class="space-y-4">
	{#if selectedMonth !== null}
		{@const monthData = monthsData[selectedMonth]}
		<!-- Zoomed single-month view -->
		<div>
			<!-- Back button + month title -->
			<div class="flex items-center gap-2 mb-4">
				<button
					type="button"
					onclick={backToOverview}
					class="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
				>
					<ChevronLeft size={16} />
					<span>All months</span>
				</button>
				<span class="text-charcoal-muted">·</span>
				<span class="text-sm font-medium text-charcoal">{format(monthData.month, 'MMMM yyyy')}</span>
			</div>

			<!-- Day-of-week headers -->
			<div class="grid grid-cols-7 gap-1 mb-1">
				{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as dayLabel}
					<div class="text-xs text-charcoal-muted text-center font-medium">{dayLabel}</div>
				{/each}
			</div>

			<!-- Zoomed days grid -->
			<div class="grid grid-cols-7 gap-1">
				{#each monthData.grid as row}
					{#each row as day}
						{#if day.date === null}
							<div class="w-full aspect-square"></div>
						{:else if day.isFutureDay}
							<div
								class="w-full aspect-square bg-surface-alt rounded-md flex flex-col items-center justify-center"
								title={format(day.date, 'MMM d, yyyy')}
							>
								<span class="text-xs text-charcoal-muted/50">{getDate(day.date)}</span>
							</div>
						{:else}
							<div
								class="{intensityColors[day.intensity]} rounded-md flex flex-col items-center justify-center cursor-pointer hover:ring-1 hover:ring-charcoal-muted {isToday(day.date) ? 'ring-2 ring-primary-400' : ''} w-full aspect-square"
								title="{format(day.date, 'MMM d, yyyy')}: ${day.amount.toLocaleString()}"
							>
								<span class="text-xs font-medium {day.intensity >= 5 ? 'text-white' : 'text-charcoal-soft'}">{getDate(day.date)}</span>
								{#if day.amount > 0}
									<span class="text-[10px] font-mono {day.intensity >= 5 ? 'text-white/80' : 'text-charcoal-muted'}">${Math.round(day.amount)}</span>
								{/if}
							</div>
						{/if}
					{/each}
				{/each}
			</div>
		</div>
	{:else}
		<!-- Overview: 12-month grid -->
		<div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
			{#each monthsData as monthData, index}
				<button
					type="button"
					onclick={() => handleMonthClick(index)}
					class="bg-surface-hover rounded-lg p-2 hover:ring-2 hover:ring-primary-300 transition-all cursor-pointer text-left"
				>
					<!-- Month label -->
					<div class="text-xs font-medium text-charcoal-soft mb-2 text-center">
						{monthData.label}
					</div>

					<!-- Days grid (7 columns for Sun-Sat) -->
					<div class="flex flex-col items-center" style="gap: {gap}px;">
						{#each monthData.grid as row}
							<div class="flex" style="gap: {gap}px;">
								{#each row as day}
									{#if day.date === null}
										<!-- Empty placeholder -->
										<div style="width: {cellSize}px; height: {cellSize}px;"></div>
									{:else if day.isFutureDay}
										<!-- Future day - grey -->
										<div
											class="bg-surface-alt rounded-sm"
											style="width: {cellSize}px; height: {cellSize}px;"
											title={format(day.date, 'MMM d, yyyy')}
										></div>
									{:else}
										<!-- Past/today with spending data -->
										<div
											class="{intensityColors[day.intensity]} rounded-sm {isToday(day.date) ? 'ring-2 ring-primary-400' : ''}"
											style="width: {cellSize}px; height: {cellSize}px;"
											title="{format(day.date, 'MMM d, yyyy')}: ${day.amount.toLocaleString()}"
										></div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Legend -->
	{#if !compact}
		<div class="flex items-center justify-end gap-1 text-xs text-charcoal-muted">
			<span>Less</span>
			{#each intensityColors as color}
				<div class="{color} rounded-sm" style="width: {cellSize}px; height: {cellSize}px;"></div>
			{/each}
			<span>More</span>
		</div>
	{/if}
</div>
