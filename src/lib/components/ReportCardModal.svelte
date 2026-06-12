<script lang="ts">
	import ModalContainer from './ModalContainer.svelte';
	import { formatCurrency } from '$lib/utils/format-helpers';
	import type { MonthlySpend, CategorySpend } from '$lib/utils/report-cards';

	export interface ReportStat {
		label: string;
		value: string;
		sub?: string;
	}

	interface Props {
		isOpen: boolean;
		title: string;
		stats: ReportStat[];
		monthly: MonthlySpend[];
		topCategories: CategorySpend[];
		onClose: () => void;
	}

	let { isOpen, title, stats, monthly, topCategories, onClose }: Props = $props();

	let maxMonthly = $derived(Math.max(...monthly.map((m) => m.amount), 1));

	function monthInitial(monthKey: string): string {
		return 'JFMAMJJASOND'[Number(monthKey.slice(5)) - 1];
	}
</script>

<ModalContainer {isOpen} {title} maxWidth="md" {onClose}>
	<div class="px-6 py-5 space-y-5">
		<!-- Stats grid -->
		<div class="grid grid-cols-2 gap-3">
			{#each stats as stat (stat.label)}
				<div class="bg-surface-alt rounded-lg px-3 py-2.5">
					<p class="text-xs text-charcoal-muted mb-0.5">{stat.label}</p>
					<p class="font-mono text-lg font-medium text-charcoal">{stat.value}</p>
					{#if stat.sub}
						<p class="text-xs text-charcoal-muted">{stat.sub}</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Trailing 12-month bars -->
		{#if monthly.some((m) => m.amount > 0)}
			<div>
				<p class="text-xs font-medium uppercase tracking-wider text-charcoal-muted mb-2">Last 12 months</p>
				<div class="flex items-end gap-1 h-16">
					{#each monthly as m (m.month)}
						<div
							class="flex-1 rounded-t {m.amount > 0 ? 'bg-primary-400/70 hover:bg-primary-500' : 'bg-surface-alt'} transition-colors"
							style="height: {m.amount > 0 ? Math.max((m.amount / maxMonthly) * 100, 5) : 3}%"
							title="{m.month}: {formatCurrency(m.amount)}"
						></div>
					{/each}
				</div>
				<div class="flex gap-1 mt-1">
					{#each monthly as m (m.month)}
						<span class="flex-1 text-center text-[9px] text-charcoal-muted">{monthInitial(m.month)}</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Top categories -->
		{#if topCategories.length > 0}
			<div>
				<p class="text-xs font-medium uppercase tracking-wider text-charcoal-muted mb-2">Top categories</p>
				<div class="space-y-1.5">
					{#each topCategories as cat (cat.categoryId)}
						<div class="flex items-baseline text-sm">
							<span class="text-charcoal">{cat.name}</span>
							<span class="ledger-line"></span>
							<span class="font-mono text-charcoal">{formatCurrency(cat.amount)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</ModalContainer>
