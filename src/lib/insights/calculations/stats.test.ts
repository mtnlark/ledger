import { describe, it, expect } from 'vitest';
import { computeStdDev, computeZScore } from './stats';

describe('computeStdDev', () => {
	it('returns 0 for empty array', () => {
		expect(computeStdDev([])).toBe(0);
	});

	it('returns 0 for single value', () => {
		expect(computeStdDev([42])).toBe(0);
	});

	it('computes population std dev for uniform values', () => {
		// All same value → stdDev = 0
		expect(computeStdDev([5, 5, 5, 5])).toBe(0);
	});

	it('computes population std dev correctly', () => {
		// values: [100, 200, 300], mean = 200
		// squared diffs: (100-200)²=10000, (200-200)²=0, (300-200)²=10000
		// variance = 20000/3 ≈ 6666.67, stdDev ≈ 81.65
		const result = computeStdDev([100, 200, 300]);
		expect(result).toBeCloseTo(81.65, 1);
	});

	it('handles two values', () => {
		// [0, 100], mean=50, squaredDiffs=2500+2500=5000, variance=2500, sd=50
		expect(computeStdDev([0, 100])).toBe(50);
	});

	it('handles negative values', () => {
		// [-10, 10], mean=0, squaredDiffs=100+100=200, variance=100, sd=10
		expect(computeStdDev([-10, 10])).toBe(10);
	});
});

describe('computeZScore', () => {
	it('returns 0 when stdDev is 0', () => {
		expect(computeZScore(100, 50, 0)).toBe(0);
	});

	it('computes positive z-score for value above mean', () => {
		// (150 - 100) / 25 = 2.0
		expect(computeZScore(150, 100, 25)).toBe(2);
	});

	it('computes negative z-score for value below mean', () => {
		// (50 - 100) / 25 = -2.0
		expect(computeZScore(50, 100, 25)).toBe(-2);
	});

	it('returns 0 for value at the mean', () => {
		expect(computeZScore(100, 100, 25)).toBe(0);
	});

	it('handles fractional z-scores', () => {
		// (110 - 100) / 30 = 0.333...
		expect(computeZScore(110, 100, 30)).toBeCloseTo(0.333, 2);
	});
});
