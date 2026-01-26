import { describe, it, expect } from 'vitest';
import { calculateVelocityComparison } from './velocity';

describe('calculateVelocityComparison', () => {
	it('returns null when currentDays is 0', () => {
		const result = calculateVelocityComparison(1000, 900, 0, 30, 5);
		expect(result).toBeNull();
	});

	it('returns null when prevDailyAvg is 0', () => {
		const result = calculateVelocityComparison(1000, 0, 15, 30, 5);
		expect(result).toBeNull();
	});

	it('returns null when change below threshold', () => {
		// current: 1000/30 = 33.33, prev: 1000/30 = 33.33, change = 0%
		const result = calculateVelocityComparison(1000, 1000, 30, 30, 5);
		expect(result).toBeNull();
	});

	it('detects spending increase', () => {
		// current: 1500/15 = $100/day, prev: 2400/30 = $80/day
		// change = (100-80)/80 * 100 = 25%
		const result = calculateVelocityComparison(1500, 2400, 15, 30, 5);
		expect(result).not.toBeNull();
		expect(result!.percentChange).toBe(25);
		expect(result!.isUp).toBe(true);
		expect(result!.currentDailyAvg).toBe(100);
		expect(result!.prevDailyAvg).toBe(80);
	});

	it('detects spending decrease', () => {
		// current: 600/15 = $40/day, prev: 3000/30 = $100/day
		// change = (40-100)/100 * 100 = -60%
		const result = calculateVelocityComparison(600, 3000, 15, 30, 5);
		expect(result).not.toBeNull();
		expect(result!.percentChange).toBe(-60);
		expect(result!.isUp).toBe(false);
	});

	describe('adaptive threshold with historicalMonthlyTotals', () => {
		it('uses percentThreshold when no historical data provided', () => {
			// 25% change, threshold 5% → flagged
			const result = calculateVelocityComparison(1500, 2400, 15, 30, 5);
			expect(result).not.toBeNull();
		});

		it('uses percentThreshold when only 1 historical month', () => {
			// 25% change, threshold 5% → flagged (not enough data to adapt)
			const result = calculateVelocityComparison(1500, 2400, 15, 30, 5, [2000]);
			expect(result).not.toBeNull();
			expect(result!.percentChange).toBe(25);
		});

		it('raises threshold for high-variance spending', () => {
			// current: 1500/15 = $100/day, prev: 2400/30 = $80/day
			// percentChange = 25%
			// historical: [1000, 3000, 2000] → mean=2000, sd≈816.5, CV≈40.8%
			// effective threshold = max(40.8, 5) = 40.8%
			// 25% < 40.8% → not flagged
			const result = calculateVelocityComparison(
				1500, 2400, 15, 30, 5,
				[1000, 3000, 2000]
			);
			expect(result).toBeNull();
		});

		it('keeps percentThreshold as floor when CV is lower', () => {
			// historical: [2000, 2000, 2000] → mean=2000, sd=0, CV=0%
			// effective threshold = max(0, 5) = 5%
			// 25% > 5% → flagged
			const result = calculateVelocityComparison(
				1500, 2400, 15, 30, 5,
				[2000, 2000, 2000]
			);
			expect(result).not.toBeNull();
		});

		it('handles zero mean in historical data gracefully', () => {
			// All zeros → mean=0, skip CV calculation, use percentThreshold
			const result = calculateVelocityComparison(
				1500, 2400, 15, 30, 5,
				[0, 0, 0]
			);
			expect(result).not.toBeNull();
		});

		it('flags large changes even with moderate variance', () => {
			// current: 3000/15 = $200/day, prev: 2400/30 = $80/day
			// percentChange = 150%
			// historical: [2000, 2500, 3000] → mean≈2500, sd≈408, CV≈16.3%
			// effective threshold = max(16.3, 5) = 16.3%
			// 150% > 16.3% → flagged
			const result = calculateVelocityComparison(
				3000, 2400, 15, 30, 5,
				[2000, 2500, 3000]
			);
			expect(result).not.toBeNull();
			expect(result!.percentChange).toBe(150);
		});

		it('adapts to moderate variance appropriately', () => {
			// current: 1050/15 = $70/day, prev: 2400/30 = $80/day
			// percentChange = round((70-80)/80 * 100) = -13%
			// historical: [2000, 2400, 2800] → mean=2400, sd≈326.6, CV≈13.6%
			// effective threshold = max(13.6, 5) = 13.6%
			// |-13%| < 13.6% → not flagged
			const result = calculateVelocityComparison(
				1050, 2400, 15, 30, 5,
				[2000, 2400, 2800]
			);
			expect(result).toBeNull();
		});
	});

	describe('threshold boundary precision', () => {
		it('correctly handles raw value just below threshold that would round up', () => {
			// This test verifies we compare before rounding to avoid false positives
			// current: 546/15 = $36.4/day, prev: 1200/30 = $40/day
			// raw change = (36.4-40)/40 * 100 = -9% exactly
			// threshold = 10%
			// |-9%| < 10% → should NOT be flagged
			const result = calculateVelocityComparison(546, 1200, 15, 30, 10);
			expect(result).toBeNull();
		});

		it('correctly handles raw value just above threshold', () => {
			// current: 540/15 = $36/day, prev: 1200/30 = $40/day
			// raw change = (36-40)/40 * 100 = -10% exactly
			// threshold = 10%
			// |-10%| = 10%, NOT < 10% → should be flagged
			const result = calculateVelocityComparison(540, 1200, 15, 30, 10);
			expect(result).not.toBeNull();
			expect(result!.percentChange).toBe(-10);
		});

		it('handles fractional percentages that round to threshold', () => {
			// current: 543/15 = $36.2/day, prev: 1200/30 = $40/day
			// raw change = (36.2-40)/40 * 100 = -9.5%
			// threshold = 10%
			// |-9.5%| < 10% → should NOT be flagged
			// (Old buggy code would round -9.5 to -10, then 10 < 10 = false → flagged incorrectly)
			const result = calculateVelocityComparison(543, 1200, 15, 30, 10);
			expect(result).toBeNull();
		});

		it('returns rounded percentage in result for display', () => {
			// current: 528/15 = $35.2/day, prev: 1200/30 = $40/day
			// raw change = (35.2-40)/40 * 100 = -12%
			// threshold = 10%, so flagged
			// returned percentChange should be -12 (rounded)
			const result = calculateVelocityComparison(528, 1200, 15, 30, 10);
			expect(result).not.toBeNull();
			expect(result!.percentChange).toBe(-12);
		});
	});
});
