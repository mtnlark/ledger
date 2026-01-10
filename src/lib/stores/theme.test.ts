import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock matchMedia with controllable behavior
let mockMediaQueryMatches = false;
let mockMediaQueryListeners: ((e: MediaQueryListEvent) => void)[] = [];

const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
	matches: mockMediaQueryMatches,
	media: query,
	onchange: null,
	addListener: vi.fn(),
	removeListener: vi.fn(),
	addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
		if (event === 'change') {
			mockMediaQueryListeners.push(handler);
		}
	}),
	removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
		if (event === 'change') {
			mockMediaQueryListeners = mockMediaQueryListeners.filter((h) => h !== handler);
		}
	}),
	dispatchEvent: vi.fn()
}));

// Helper to simulate system theme change
function simulateSystemThemeChange(prefersDark: boolean) {
	mockMediaQueryMatches = prefersDark;
	mockMediaQueryListeners.forEach((handler) => {
		handler({ matches: prefersDark } as MediaQueryListEvent);
	});
}

describe('Theme Store', () => {
	beforeEach(() => {
		// Reset DOM state
		document.documentElement.classList.remove('dark');
		mockMediaQueryMatches = false;
		mockMediaQueryListeners = [];
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: mockMatchMedia
		});
		vi.resetModules();
	});

	afterEach(() => {
		document.documentElement.classList.remove('dark');
		mockMediaQueryListeners = [];
	});

	describe('applyTheme', () => {
		it('adds dark class when theme is dark', async () => {
			const { applyTheme } = await import('./theme');

			applyTheme('dark');

			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('removes dark class when theme is light', async () => {
			const { applyTheme } = await import('./theme');

			// First set to dark
			document.documentElement.classList.add('dark');

			applyTheme('light');

			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});

		it('adds dark class when theme is system and system prefers dark', async () => {
			mockMediaQueryMatches = true;
			const { applyTheme } = await import('./theme');

			applyTheme('system');

			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('removes dark class when theme is system and system prefers light', async () => {
			mockMediaQueryMatches = false;
			const { applyTheme } = await import('./theme');

			// First set to dark
			document.documentElement.classList.add('dark');

			applyTheme('system');

			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});
	});

	describe('getEffectiveTheme', () => {
		it('returns light when theme is light', async () => {
			const { getEffectiveTheme } = await import('./theme');

			expect(getEffectiveTheme('light')).toBe('light');
		});

		it('returns dark when theme is dark', async () => {
			const { getEffectiveTheme } = await import('./theme');

			expect(getEffectiveTheme('dark')).toBe('dark');
		});

		it('returns dark when theme is system and system prefers dark', async () => {
			mockMediaQueryMatches = true;
			const { getEffectiveTheme } = await import('./theme');

			expect(getEffectiveTheme('system')).toBe('dark');
		});

		it('returns light when theme is system and system prefers light', async () => {
			mockMediaQueryMatches = false;
			const { getEffectiveTheme } = await import('./theme');

			expect(getEffectiveTheme('system')).toBe('light');
		});
	});

	describe('initThemeListener', () => {
		it('returns cleanup function', async () => {
			const { initThemeListener } = await import('./theme');

			const cleanup = initThemeListener('system');

			expect(typeof cleanup).toBe('function');
			cleanup();
		});

		it('updates theme when system preference changes in system mode', async () => {
			mockMediaQueryMatches = false;
			const { initThemeListener } = await import('./theme');

			initThemeListener('system');

			// Simulate system changing to dark
			simulateSystemThemeChange(true);

			expect(document.documentElement.classList.contains('dark')).toBe(true);

			// Simulate system changing back to light
			simulateSystemThemeChange(false);

			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});

		it('does not listen when theme is light', async () => {
			const { initThemeListener } = await import('./theme');

			initThemeListener('light');

			// Simulate system changing to dark
			simulateSystemThemeChange(true);

			// Should not have changed since we're not in system mode
			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});

		it('does not listen when theme is dark', async () => {
			document.documentElement.classList.add('dark');
			const { initThemeListener } = await import('./theme');

			initThemeListener('dark');

			// Simulate system changing to light
			simulateSystemThemeChange(false);

			// Should still be dark since we're not in system mode
			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('cleans up listener when cleanup function is called', async () => {
			mockMediaQueryMatches = false;
			const { initThemeListener } = await import('./theme');

			const cleanup = initThemeListener('system');
			cleanup();

			// Simulate system changing to dark after cleanup
			simulateSystemThemeChange(true);

			// Should not have changed since listener was removed
			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});
	});
});
