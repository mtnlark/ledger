<script lang="ts">
	interface Props {
		activeTab: string;
		onTabChange: (tab: string) => void;
	}

	let { activeTab, onTabChange }: Props = $props();

	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'spending', label: 'Spending' },
		{ id: 'savings', label: 'Savings' },
		{ id: 'recurring', label: 'Recurring' },
		{ id: 'year-in-review', label: 'Year in Review' }
	];

	// Roving tabindex: arrow keys move + select, Home/End jump to first/last
	let tabEls: HTMLButtonElement[] = [];

	function handleKeydown(event: KeyboardEvent) {
		const current = tabs.findIndex((t) => t.id === activeTab);
		let next = current;
		if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
		else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = tabs.length - 1;
		else return;
		event.preventDefault();
		onTabChange(tabs[next].id);
		tabEls[next]?.focus();
	}
</script>

<div aria-label="Insights tabs" role="tablist" class="flex gap-6 overflow-x-auto border-b border-theme">
	{#each tabs as tab, i}
		<button
			type="button"
			role="tab"
			bind:this={tabEls[i]}
			tabindex={activeTab === tab.id ? 0 : -1}
			aria-selected={activeTab === tab.id}
			aria-controls="insights-tabpanel"
			class="relative pb-2.5 pt-1 text-sm font-medium whitespace-nowrap transition-colors
				{activeTab === tab.id
					? 'text-charcoal'
					: 'text-charcoal-muted hover:text-charcoal'}"
			onclick={() => onTabChange(tab.id)}
			onkeydown={handleKeydown}
		>
			{tab.label}
			{#if activeTab === tab.id}
				<span class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary-500" aria-hidden="true"></span>
			{/if}
		</button>
	{/each}
</div>
