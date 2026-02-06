import { describe, it, expect } from 'vitest';
import { mode } from '$lib/insights/calculations/stats';

describe('mode', () => {
	it('returns the most common value', () => {
		expect(mode([1, 2, 2, 3])).toBe(2);
	});

	it('works with strings', () => {
		expect(mode(['a', 'b', 'a', 'c'])).toBe('a');
	});

	it('returns first element for all-unique array', () => {
		expect(mode([5, 10, 15])).toBe(5);
	});

	it('handles single-element array', () => {
		expect(mode([42])).toBe(42);
	});

	it('returns first value to reach highest count on tie', () => {
		// 1 appears twice, 2 appears twice — 1 reached count=2 first
		expect(mode([1, 1, 2, 2])).toBe(1);
	});

	it('works with typical day-of-month data', () => {
		expect(mode([15, 15, 14, 16, 15])).toBe(15);
	});
});
