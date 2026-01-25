import { describe, it, expect } from 'vitest';
import { detectAnomalies } from './anomalies';
import type { Category } from '$lib/db';
import type { CategoryStats } from './category-averages';

const categories: Category[] = [
	{ id: 1, name: 'Groceries', isActive: true, sortOrder: 0, isEssential: true },
	{ id: 2, name: 'Fun', isActive: true, sortOrder: 1, isEssential: false },
	{ id: 3, name: 'Travel', isActive: true, sortOrder: 2, isEssential: false }
];

const defaultConfig = { minAverage: 20, zScoreThreshold: 2.0, maxToShow: 2 };

describe('detectAnomalies', () => {
	it('returns empty array when spending is within normal range', () => {
		const current = new Map([[1, 25]]);
		// mean=20, stdDev=5 → z-score = (25-20)/5 = 1.0 < 2.0
		const stats = new Map<number, CategoryStats>([[1, { mean: 20, stdDev: 5, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toEqual([]);
	});

	it('detects category above z-score threshold', () => {
		const current = new Map([[1, 60]]);
		// mean=30, stdDev=10 → z-score = (60-30)/10 = 3.0 > 2.0
		const stats = new Map<number, CategoryStats>([[1, { mean: 30, stdDev: 10, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toHaveLength(1);
		expect(result[0].catId).toBe(1);
		expect(result[0].name).toBe('Groceries');
		expect(result[0].current).toBe(60);
		expect(result[0].avg).toBe(30);
		expect(result[0].zScore).toBe(3.0);
	});

	it('ignores categories with mean below minAverage', () => {
		const current = new Map([[1, 50]]);
		// mean=10, below minAverage of 20
		const stats = new Map<number, CategoryStats>([[1, { mean: 10, stdDev: 2, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toEqual([]);
	});

	it('uses ratio fallback when stdDev is 0', () => {
		const current = new Map([[1, 60]]);
		// stdDev=0 → fallback to ratio, 60/30 = 2.0 > 1.5
		const stats = new Map<number, CategoryStats>([[1, { mean: 30, stdDev: 0, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toHaveLength(1);
		expect(result[0].ratio).toBe(2);
		expect(result[0].zScore).toBeUndefined();
	});

	it('does not flag below fallback ratio when stdDev is 0', () => {
		const current = new Map([[1, 40]]);
		// stdDev=0 → fallback to ratio, 40/30 = 1.33 < 1.5
		const stats = new Map<number, CategoryStats>([[1, { mean: 30, stdDev: 0, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toEqual([]);
	});

	it('sorts by z-score (highest first)', () => {
		const current = new Map([
			[1, 60],
			[2, 80]
		]);
		const stats = new Map<number, CategoryStats>([
			[1, { mean: 30, stdDev: 10, sampleCount: 6 }],  // z-score = 3.0
			[2, { mean: 25, stdDev: 10, sampleCount: 6 }]   // z-score = 5.5
		]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result[0].name).toBe('Fun');       // z=5.5
		expect(result[1].name).toBe('Groceries'); // z=3.0
	});

	it('limits results to maxToShow', () => {
		const current = new Map([
			[1, 80],
			[2, 90],
			[3, 100]
		]);
		const stats = new Map<number, CategoryStats>([
			[1, { mean: 30, stdDev: 10, sampleCount: 6 }],
			[2, { mean: 25, stdDev: 10, sampleCount: 6 }],
			[3, { mean: 40, stdDev: 10, sampleCount: 6 }]
		]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toHaveLength(2); // maxToShow = 2
	});

	it('handles unknown categories gracefully', () => {
		const current = new Map([[99, 60]]);
		const stats = new Map<number, CategoryStats>([[99, { mean: 30, stdDev: 10, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result[0].name).toBe('Unknown');
	});

	it('skips categories with no stats entry', () => {
		const current = new Map([[1, 100]]);
		const stats = new Map<number, CategoryStats>(); // empty

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toEqual([]);
	});

	it('adapts to high-variance categories', () => {
		const current = new Map([[1, 250]]);
		// High variance: mean=200, stdDev=100 → z-score = (250-200)/100 = 0.5 < 2.0
		const stats = new Map<number, CategoryStats>([[1, { mean: 200, stdDev: 100, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toEqual([]); // Not flagged despite 25% above mean
	});

	it('flags low-variance categories with smaller absolute increase', () => {
		const current = new Map([[1, 55]]);
		// Low variance: mean=50, stdDev=2 → z-score = (55-50)/2 = 2.5 > 2.0
		const stats = new Map<number, CategoryStats>([[1, { mean: 50, stdDev: 2, sampleCount: 6 }]]);

		const result = detectAnomalies(current, stats, categories, defaultConfig);
		expect(result).toHaveLength(1);
		expect(result[0].zScore).toBe(2.5);
	});

	it('supports custom fallbackRatioThreshold', () => {
		const current = new Map([[1, 50]]);
		// stdDev=0, ratio = 50/30 = 1.67
		const stats = new Map<number, CategoryStats>([[1, { mean: 30, stdDev: 0, sampleCount: 6 }]]);
		const config = { ...defaultConfig, fallbackRatioThreshold: 2.0 };

		const result = detectAnomalies(current, stats, categories, config);
		expect(result).toEqual([]); // 1.67 < 2.0
	});
});
