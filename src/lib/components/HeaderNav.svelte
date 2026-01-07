<script lang="ts">
	import { page } from '$app/stores';

	interface Props {
		title?: string;
		showBack?: boolean;
	}

	let { title = 'Budget Tracker', showBack = false }: Props = $props();

	let isMenuOpen = $state(false);

	interface NavItem {
		href: string;
		icon: string;
		label: string;
	}

	const navItems: NavItem[] = [
		{ href: '/', icon: '🏠', label: 'Dashboard' },
		{ href: '/insights', icon: '📊', label: 'Insights' },
		{ href: '/shared', icon: '🤝', label: 'Shared' },
		{ href: '/settings', icon: '⚙️', label: 'Settings' }
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						{#if isMenuOpen}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						{:else}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 6h16M4 12h16M4 18h16"
							/>
						{/if}
					</svg>
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
								<span class="text-lg">{item.icon}</span>
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
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
