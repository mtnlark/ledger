export type Theme = 'light' | 'dark' | 'system';

const isBrowser = typeof window !== 'undefined';

/**
 * Apply theme class to document element
 */
export function applyTheme(theme: Theme): void {
	if (!isBrowser) return;

	const root = document.documentElement;

	if (theme === 'system') {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		root.classList.toggle('dark', prefersDark);
	} else {
		root.classList.toggle('dark', theme === 'dark');
	}
}

/**
 * Get the effective theme (resolves 'system' to actual value)
 */
export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
	if (theme === 'system') {
		if (!isBrowser) return 'light';
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	return theme;
}

/**
 * Initialize listener for system theme changes
 * Returns cleanup function to remove listener
 */
export function initThemeListener(theme: Theme): () => void {
	if (!isBrowser || theme !== 'system') {
		return () => {};
	}

	const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	const handler = (e: MediaQueryListEvent) => {
		document.documentElement.classList.toggle('dark', e.matches);
	};

	mediaQuery.addEventListener('change', handler);
	return () => mediaQuery.removeEventListener('change', handler);
}
