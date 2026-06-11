<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { Home, Wallet, PiggyBank, BarChart3, Users, Settings, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';

	const STORAGE_KEY = 'ledger-sidebar-expanded';

	interface NavItem {
		href: string;
		label: string;
		icon: ComponentType;
	}

	const navItems: NavItem[] = [
		{ href: '/', label: 'Dashboard', icon: Home as ComponentType },
		{ href: '/budget', label: 'Budget', icon: Wallet as ComponentType },
		{ href: '/savings', label: 'Savings', icon: PiggyBank as ComponentType },
		{ href: '/insights', label: 'Insights', icon: BarChart3 as ComponentType },
		{ href: '/shared', label: 'Shared', icon: Users as ComponentType },
		{ href: '/settings', label: 'Settings', icon: Settings as ComponentType }
	];

	let isExpanded = $state(false);
	let bouncingHref = $state<string | null>(null);

	function handleNavClick(href: string) {
		bouncingHref = href;
		setTimeout(() => { bouncingHref = null; }, 300);
	}

	onMount(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored !== null) {
			isExpanded = stored === 'true';
		}
	});

	function isActive(href: string, pathname: string): boolean {
		if (href === '/') {
			return pathname === '/';
		}
		return pathname.startsWith(href);
	}

	function toggleSidebar() {
		isExpanded = !isExpanded;
		localStorage.setItem(STORAGE_KEY, String(isExpanded));
	}
</script>

<aside
	class="flex fixed left-0 top-0 h-full bg-surface border-r border-dashed border-theme-dashed z-30 flex-col transition-all duration-300 ease-in-out {isExpanded ? 'w-52' : 'w-16'}"
>
	<!-- Logo/Brand area -->
	<div class="h-16 flex items-center border-b border-dashed border-theme-dashed {isExpanded ? 'mx-2 px-3 gap-2.5' : 'justify-center'}">
		<span class="w-8 h-8 rounded-lg bg-primary-500 text-white font-display text-base font-semibold flex items-center justify-center flex-shrink-0" aria-hidden="true">L</span>
		{#if isExpanded}
			<span class="font-display text-lg font-medium text-charcoal whitespace-nowrap">Ledger</span>
		{/if}
	</div>

	<!-- Navigation items -->
	<nav class="flex-1 py-4" aria-label="Main navigation">
		{#each navItems as item}
			{@const active = isActive(item.href, $page.url.pathname)}
			<a
				href={item.href}
				onclick={() => handleNavClick(item.href)}
				class="relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg transition-colors {active
					? 'bg-primary-50 text-primary-700'
					: 'text-charcoal-soft hover:bg-surface-hover'}"
				title={isExpanded ? undefined : item.label}
			>
				{#if active}
					<span class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary-500" aria-hidden="true"></span>
				{/if}
				<span class={bouncingHref === item.href ? 'icon-bounce' : ''}>
					<item.icon size={20} strokeWidth={active ? 2.5 : 2} />
				</span>
				{#if isExpanded}
					<span class="text-sm font-medium whitespace-nowrap">{item.label}</span>
				{/if}
			</a>
		{/each}
	</nav>

	<!-- Collapse/Expand toggle -->
	<div class="border-t border-dashed border-theme-dashed p-2">
		<button
			onclick={toggleSidebar}
			class="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-charcoal-soft hover:bg-surface-hover transition-colors"
			aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
		>
			{#if isExpanded}
				<ChevronLeft size={20} />
				<span class="text-sm font-medium">Collapse</span>
			{:else}
				<ChevronRight size={20} />
			{/if}
		</button>
	</div>
</aside>

<!-- Spacer div to push main content -->
<div class="block transition-all duration-300 ease-in-out {isExpanded ? 'w-52' : 'w-16'} flex-shrink-0"></div>
