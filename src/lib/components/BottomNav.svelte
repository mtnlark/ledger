<script lang="ts">
	import { page } from '$app/stores';
	import { Home, BarChart3, Users, Settings } from 'lucide-svelte';

	interface NavItem {
		href: string;
		label: string;
		icon: typeof Home;
	}

	const navItems: NavItem[] = [
		{ href: '/', label: 'Home', icon: Home },
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
</script>

<nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-dashed border-gray-200 z-50 safe-area-bottom md:hidden">
	<div class="flex justify-around items-center h-16">
		{#each navItems as item}
			{@const active = isActive(item.href, $page.url.pathname)}
			<a
				href={item.href}
				class="flex flex-col items-center justify-center w-full h-full transition-colors {active
					? 'text-primary-600'
					: 'text-charcoal-muted hover:text-charcoal-soft'}"
			>
				<item.icon size={24} strokeWidth={active ? 2.5 : 2} />
				<span class="text-xs font-medium mt-1">{item.label}</span>
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
