/**
 * Component Test Setup
 *
 * Configuration for component tests using @testing-library/svelte
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Dexie liveQuery for reactive stores
vi.mock('dexie', async () => {
	const actual = await vi.importActual('dexie');
	return {
		...actual,
		liveQuery: vi.fn((fn) => {
			// Return a simple readable that calls the function once
			return {
				subscribe: (callback: (value: unknown) => void) => {
					Promise.resolve(fn()).then(callback);
					return () => {};
				}
			};
		})
	};
});

// Mock Tauri APIs
vi.mock('@tauri-apps/api/path', () => ({
	appDataDir: vi.fn(() => Promise.resolve('/mock/app/data'))
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
	exists: vi.fn(() => Promise.resolve(false)),
	mkdir: vi.fn(() => Promise.resolve()),
	readTextFile: vi.fn(() => Promise.resolve('{}')),
	writeTextFile: vi.fn(() => Promise.resolve()),
	readDir: vi.fn(() => Promise.resolve([])),
	remove: vi.fn(() => Promise.resolve()),
	rename: vi.fn(() => Promise.resolve())
}));

// Mock storage persistence
vi.mock('$lib/storage', () => ({
	initializeStorage: vi.fn(() => Promise.resolve()),
	persistData: vi.fn(() => Promise.resolve()),
	createBackup: vi.fn(() => Promise.resolve())
}));

// Mock window.matchMedia for theme detection
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	}))
});

// Mock localStorage
const localStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	length: 0,
	key: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
	value: localStorageMock
});
