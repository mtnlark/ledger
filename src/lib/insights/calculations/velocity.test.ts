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
});
