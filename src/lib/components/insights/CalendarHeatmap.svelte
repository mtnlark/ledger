<script lang="ts">
	import {
		format,
		startOfMonth,
		endOfMonth,
		eachDayOfInterval,
		getDay,
		isFuture,
		isToday,
		eachMonthOfInterval,
		startOfYear,
		endOfYear
	} from 'date-fns';

	interface Props {
		dailySpending: Map<string, number>;
		year?: number;
		compact?: boolean;
	}

	let { dailySpending, year = new Date().getFullYear(), compact = false }: Props = $props();

	// Get all months of the year
	let months = $derived.by(() => {
		const start = startOfYear(new Date(year, 0, 1));
		const end = endOfYear(new Date(year, 0, 1));
		return eachMonthOfInterval({ start, end });
	});

	// Calculate intensity levels based on spending amounts
	let intensityLevels = $derived.by(() => {
		const amounts = Array.from(dailySpending.values()).filter((v) => v > 0);
		if (amounts.length === 0) return { p25: 50, p50: 100, p75: 200 };

		amounts.sort((a, b) => a - b);
		const p25 = amounts[Math.floor(amounts.length * 0.25)] || 50;
		const p50 = amounts[Math.floor(amounts.length * 0.5)] || 100;
		const p75 = amounts[Math.floor(amounts.length * 0.75)] || 200;

		return { p25, p50, p75 };
	});

	// Get intensity level for a day (0-4)
	function getIntensity(amount: number): number {
		if (amount === 0) return 0;
		if (amount <= intensityLevels.p25) return 1;
		if (amount <= intensityLevels.p50) return 2;
		if (amount <= intensityLevels.p75) return 3;
		return 4;
	}

	// Color classes for each intensity level
	const intensityColors = [
		'bg-surface-alt', // 0 - no spending
		'bg-success-200', // 1 - low
		'bg-success-300', // 2 - medium-low
		'bg-success-400', // 3 - medium-high
		'bg-success-600' // 4 - high
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
	<!-- Month grid -->
	<div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
		{#each monthsData as monthData}
			<div class="bg-surface-hover rounded-lg p-2">
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
										class="{intensityColors[day.intensity]} rounded-sm cursor-pointer hover:ring-1 hover:ring-charcoal-muted {isToday(day.date) ? 'ring-2 ring-primary-400' : ''}"
										style="width: {cellSize}px; height: {cellSize}px;"
										title="{format(day.date, 'MMM d, yyyy')}: ${day.amount.toLocaleString()}"
									></div>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

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
