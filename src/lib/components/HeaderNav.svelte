<script lang="ts">
	import { page } from '$app/stores';
	import { Menu, X, ChevronLeft, Home, BarChart3, Users, Settings } from 'lucide-svelte';
	import type { Component } from 'svelte';

	interface Props {
		title?: string;
		showBack?: boolean;
	}

	let { title = 'Budget Tracker', showBack = false }: Props = $props();

	let isMenuOpen = $state(false);

	interface NavItem {
		href: string;
		label: string;
		icon: Component;
	}

	const navItems: NavItem[] = [
		{ href: '/', label: 'Dashboard', icon: Home },
		{ href: '/insights', label: 'Insights', icon: BarChart3 },
		{ href: '/shared', label: 'Shared', icon: Users },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];

	function isActive(href: string, pathname: string): boolean {
		if (href === '/') {
			return pathname === '/';
		}
		return pathname.startsWith(href);
	}

	function closeMenu() {
		isMenuOpen = false;
	}
</script>

<header class="bg-white border-b border-gray-200 sticky top-0 z-20">
	<div class="max-w-4xl mx-auto px-4 py-4">
		<div class="flex items-center gap-4">
			<!-- Hamburger menu (desktop) - LEFT SIDE -->
			<div class="relative hidden md:block">
				<button
					onclick={() => (isMenuOpen = !isMenuOpen)}
					class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
					aria-label="Open menu"
					aria-expanded={isMenuOpen}
				>
					{#if isMenuOpen}
						<X size={24} />
					{:else}
						<Menu size={24} />
					{/if}
				</button>

				<!-- Dropdown menu -->
				{#if isMenuOpen}
					<!-- Backdrop -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="fixed inset-0 z-10" onclick={closeMenu}></div>

					<!-- Menu -->
					<nav
						class="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20"
					>
						{#each navItems as item}
							{@const active = isActive(item.href, $page.url.pathname)}
							<a
								href={item.href}
								onclick={closeMenu}
								class="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors {active
									? 'bg-blue-50 text-blue-700 font-medium'
									: 'text-gray-700 hover:bg-gray-50'}"
							>
								<item.icon size={18} />
								<span>{item.label}</span>
							</a>
						{/each}
					</nav>
				{/if}
			</div>

			<!-- Back button (mobile only when showBack, desktop handled by hamburger) -->
			{#if showBack}
				<a
					href="/"
					class="p-2 hover:bg-gray-100 rounded-lg transition-colors md:hidden"
					aria-label="Back to dashboard"
				>
					<ChevronLeft size={20} />
				</a>
			{/if}

			<!-- Title -->
			<h1 class="text-xl font-bold text-gray-900">{title}</h1>

			<!-- Spacer to push slot content to the right -->
			<div class="flex-1"></div>

			<!-- Slot for additional header content (like month navigation) -->
			<slot />
		</div>
	</div>
</header>
