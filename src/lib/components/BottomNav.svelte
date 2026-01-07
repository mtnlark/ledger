<script lang="ts">
	import { page } from '$app/stores';

	interface NavItem {
		href: string;
		icon: string;
		label: string;
	}

	const navItems: NavItem[] = [
		{ href: '/', icon: '🏠', label: 'Home' },
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
</script>

<nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom md:hidden">
	<div class="flex justify-around items-center h-16">
		{#each navItems as item}
			{@const active = isActive(item.href, $page.url.pathname)}
			<a
				href={item.href}
				class="flex flex-col items-center justify-center w-full h-full transition-colors {active
					? 'text-blue-600'
					: 'text-gray-500 hover:text-gray-700'}"
			>
				<span class="text-xl mb-0.5">{item.icon}</span>
				<span class="text-xs font-medium">{item.label}</span>
			</a>
		{/each}
	</div>
</nav>

<style>
	/* Account for safe area on devices with home indicator (iPhone X+) */
	.safe-area-bottom {
		padding-bottom: env(safe-area-inset-bottom, 0);
	}
</style>
