export interface ChartTheme {
	textColor: string;
	mutedTextColor: string;
	gridColor: string;
	tooltipBg: string;
	tooltipText: string;
	surfaceColor: string;
}

export function getChartTheme(): ChartTheme {
	const isDark =
		typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

	return {
		textColor: isDark ? '#BDB7AD' : '#5C5751',
		mutedTextColor: '#8A847C',
		gridColor: isDark ? 'rgba(250, 248, 245, 0.08)' : 'rgba(45, 42, 38, 0.08)',
		tooltipBg: isDark ? '#F5F2ED' : '#2D2A26',
		tooltipText: isDark ? '#2D2A26' : '#F5F2ED',
		surfaceColor: isDark ? '#262320' : '#FFFFFF'
	};
}

// Singleton observer shared across all chart components
let sharedObserver: MutationObserver | null = null;
const themeListeners = new Set<() => void>();

/**
 * Subscribe to theme changes. Returns a cleanup function.
 * Uses a shared MutationObserver for efficiency.
 */
export function onThemeChange(callback: () => void): () => void {
	themeListeners.add(callback);

	// Create shared observer on first subscription
	if (!sharedObserver && typeof document !== 'undefined') {
		sharedObserver = new MutationObserver(() => {
			for (const listener of themeListeners) {
				listener();
			}
		});
		sharedObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});
	}

	// Return cleanup function
	return () => {
		themeListeners.delete(callback);
		// Clean up observer when no more listeners
		if (themeListeners.size === 0 && sharedObserver) {
			sharedObserver.disconnect();
			sharedObserver = null;
		}
	};
}
