import { describe, it, expect, beforeEach } from 'vitest';
import {
	invalidateRecurringCache,
	getRecurringCacheVersion,
	getCachedRecurring,
	setCachedRecurring
} from '$lib/stores/recurringCache';

describe('recurringCache', () => {
	beforeEach(() => {
		// Reset cache state between tests
		invalidateRecurringCache();
	});

	it('starts with null cache', () => {
		expect(getCachedRecurring()).toBeNull();
	});

	it('increments version on invalidation', () => {
		const v1 = getRecurringCacheVersion();
		invalidateRecurringCache();
		expect(getRecurringCacheVersion()).toBe(v1 + 1);
	});

	it('stores and retrieves cached data', () => {
		const data = [{ merchant: 'Netflix', averageAmount: 15.99 }];
		setCachedRecurring(data as any);
		expect(getCachedRecurring()).toBe(data);
	});

	it('clears cached data on invalidation', () => {
		setCachedRecurring([{ merchant: 'Netflix' }] as any);
		invalidateRecurringCache();
		expect(getCachedRecurring()).toBeNull();
	});
});
