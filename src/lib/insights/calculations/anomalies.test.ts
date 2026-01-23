import { describe, it, expect } from 'vitest';
import { detectAnomalies } from './anomalies';
import type { Category } from '$lib/db';

const categories: Category[] = [
	{ id: 1, name: 'Groceries', isActive: true, sortOrder: 0, isEssential: true },
	{ id: 2, name: 'Fun', isActive: true, sortOrder: 1, isEssential: false },
	{ id: 3, name: 'Travel', isActive: true, sortOrder: 2, isEssential: false }
];

const defaultConfig = { minAverage: 20, ratioThreshold: 1.5, maxToShow: 2 };

describe('detectAnomalies', () => {
	it('returns empty array when no spending above threshold', () => {
		const current = new Map([[1, 25]]);
		const averages = new Map([[1, 20]]); // ratio = 1.25 < 1.5

		const result = detectAnomalies(current, averages, categories, defaultConfig);
		expect(result).toEqual([]);
	});

	it('detects category above ratio threshold', () => {
		const current = new Map([[1, 60]]);
		const averages = new Map([[1, 30]]); // ratio = 2.0 > 1.5

		const result = detectAnomalies(current, averages, categories, defaultConfig);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			catId: 1,
			name: 'Groceries',
			current: 60,
			avg: 30,
			ratio: 2
		});
	});

	it('ignores categories with average below minAverage', () => {
		const current = new Map([[1, 50]]);
		const averages = new Map([[1, 10]]); // ratio = 5, but avg < minAverage

		const result = detectAnomalies(current, averages, categories, defaultConfig);
		expect(result).toEqual([]);
	});

	it('sorts by ratio (highest first)', () => {
		const current = new Map([
			[1, 60],
			[2, 100]
		]);
		const averages = new Map([
			[1, 30], // ratio 2.0
			[2, 25] // ratio 4.0
		]);

		const result = detectAnomalies(current, averages, categories, defaultConfig);
		expect(result[0].name).toBe('Fun'); // ratio 4.0
		expect(result[1].name).toBe('Groceries'); // ratio 2.0
	});

	it('limits results to maxToShow', () => {
		const current = new Map([
			[1, 60],
			[2, 80],
			[3, 100]
		]);
		const averages = new Map([
			[1, 30],
			[2, 25],
			[3, 40]
		]);

		const result = detectAnomalies(current, averages, categories, defaultConfig);
		expect(result).toHaveLength(2); // maxToShow = 2
	});

	it('handles unknown categories gracefully', () => {
		const current = new Map([[99, 60]]);
		const averages = new Map([[99, 30]]);

		const result = detectAnomalies(current, averages, categories, defaultConfig);
		expect(result[0].name).toBe('Unknown');
	});
});
