import { describe, it, expect } from 'vitest';
import {
	computeStdDev,
	computeZScore,
	generateDecayWeights,
	computeWeightedMean,
	computeWeightedStdDev
} from './stats';

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

describe('generateDecayWeights', () => {
	it('returns empty array for length 0', () => {
		expect(generateDecayWeights(0)).toEqual([]);
	});

	it('returns [1] for single element', () => {
		expect(generateDecayWeights(1)).toEqual([1]);
	});

	it('generates decaying weights with oldest first', () => {
		// decay=0.85: most recent (last) = 1.0
		// 3 elements: [0.85^2, 0.85^1, 0.85^0] = [0.7225, 0.85, 1.0]
		const weights = generateDecayWeights(3, 0.85);
		expect(weights).toHaveLength(3);
		expect(weights[0]).toBeCloseTo(0.7225, 4); // oldest
		expect(weights[1]).toBeCloseTo(0.85, 4);
		expect(weights[2]).toBeCloseTo(1.0, 4); // most recent
	});

	it('uses custom decay factor', () => {
		// decay=0.5: [0.25, 0.5, 1.0]
		const weights = generateDecayWeights(3, 0.5);
		expect(weights[0]).toBe(0.25);
		expect(weights[1]).toBe(0.5);
		expect(weights[2]).toBe(1.0);
	});
});

describe('computeWeightedMean', () => {
	it('returns 0 for empty arrays', () => {
		expect(computeWeightedMean([], [])).toBe(0);
	});

	it('returns 0 for mismatched lengths', () => {
		expect(computeWeightedMean([1, 2, 3], [1, 2])).toBe(0);
	});

	it('computes simple weighted mean', () => {
		// values: [100, 200], weights: [1, 1] → mean = 150
		expect(computeWeightedMean([100, 200], [1, 1])).toBe(150);
	});

	it('weights more recent values higher', () => {
		// values: [100, 200], weights: [0.5, 1] (more recent weighted higher)
		// weighted sum = 100*0.5 + 200*1 = 250
		// weight sum = 1.5
		// mean = 250/1.5 ≈ 166.67
		expect(computeWeightedMean([100, 200], [0.5, 1])).toBeCloseTo(166.67, 1);
	});

	it('with decay weights, recent values dominate', () => {
		// Old: 50, Recent: 150, weights: [0.25, 1]
		// weighted sum = 50*0.25 + 150*1 = 162.5
		// weight sum = 1.25
		// mean = 162.5/1.25 = 130
		expect(computeWeightedMean([50, 150], [0.25, 1])).toBe(130);
	});
});

describe('computeWeightedStdDev', () => {
	it('returns 0 for fewer than 2 values', () => {
		expect(computeWeightedStdDev([], [])).toBe(0);
		expect(computeWeightedStdDev([100], [1])).toBe(0);
	});

	it('returns 0 for mismatched lengths', () => {
		expect(computeWeightedStdDev([1, 2, 3], [1, 2])).toBe(0);
	});

	it('returns 0 for uniform values', () => {
		expect(computeWeightedStdDev([100, 100, 100], [1, 1, 1])).toBe(0);
	});

	it('computes weighted std dev with equal weights', () => {
		// With equal weights, should match unweighted stdDev
		const values = [100, 200, 300];
		const weights = [1, 1, 1];
		const result = computeWeightedStdDev(values, weights);
		// Same as unweighted: ≈ 81.65
		expect(result).toBeCloseTo(81.65, 1);
	});

	it('reduces variance when stable recent values have higher weight', () => {
		// Old volatile, recent stable: [50, 150, 100, 100]
		// With uniform weights: high variance
		// With decay weights [0.125, 0.25, 0.5, 1]: recent stable values dominate
		const values = [50, 150, 100, 100];
		const uniformWeights = [1, 1, 1, 1];
		const decayWeights = [0.125, 0.25, 0.5, 1];

		const uniformStdDev = computeWeightedStdDev(values, uniformWeights);
		const decayStdDev = computeWeightedStdDev(values, decayWeights);

		// Decay-weighted should show lower variance (recent values are stable)
		expect(decayStdDev).toBeLessThan(uniformStdDev);
	});
});
