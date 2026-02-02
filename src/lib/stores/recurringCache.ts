import type { DetectedRecurring } from './recurring';

// Cache for recurring detection results — invalidated when transactions change
let cachedRecurringExpenses: DetectedRecurring[] | null = null;
let cacheVersion = 0;

/**
 * Invalidate the recurring detection cache.
 * Call this when transactions are added, updated, or deleted.
 */
export function invalidateRecurringCache(): void {
	cachedRecurringExpenses = null;
	cacheVersion++;
}

/**
 * Get the current cache version (for testing/debugging).
 */
export function getRecurringCacheVersion(): number {
	return cacheVersion;
}

/**
 * Get cached recurring expenses (null if cache is invalid).
 */
export function getCachedRecurring(): DetectedRecurring[] | null {
	return cachedRecurringExpenses;
}

/**
 * Store recurring expenses in cache.
 */
export function setCachedRecurring(data: DetectedRecurring[]): void {
	cachedRecurringExpenses = data;
}
