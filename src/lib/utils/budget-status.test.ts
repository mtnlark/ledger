import { describe, it, expect } from 'vitest';
import { getBudgetStatus, getBudgetColorClass, getBudgetTextColorClass, type BudgetStatus } from './budget-status';

describe('getBudgetStatus', () => {
	describe('status classification at boundaries', () => {
		it('should return "under" for spending below 80%', () => {
			expect(getBudgetStatus(79, 100).status).toBe('under');
			expect(getBudgetStatus(0, 100).status).toBe('under');
			expect(getBudgetStatus(50, 100).status).toBe('under');
		});

		it('should return "approaching" for spending at exactly 80%', () => {
			expect(getBudgetStatus(80, 100).status).toBe('approaching');
		});

		it('should return "approaching" for spending between 80% and 98.4%', () => {
			expect(getBudgetStatus(90, 100).status).toBe('approaching');
			expect(getBudgetStatus(95, 100).status).toBe('approaching');
			// 98.4% rounds to 98, which is < 99 threshold
			expect(getBudgetStatus(98.4, 100).status).toBe('approaching');
		});

		it('should return "at" for spending at 98.5% (rounds to 99%)', () => {
			// 98.5% rounds to 99, which >= 99 threshold
			expect(getBudgetStatus(98.5, 100).status).toBe('at');
		});

		it('should return "at" for spending at exactly 99%', () => {
			expect(getBudgetStatus(99, 100).status).toBe('at');
		});

		it('should return "at" for spending at 99.5%', () => {
			expect(getBudgetStatus(99.5, 100).status).toBe('at');
		});

		it('should return "at" for spending at exactly 100%', () => {
			expect(getBudgetStatus(100, 100).status).toBe('at');
		});

		it('should return "at" for spending slightly over 100% within tolerance', () => {
			// $100 budget: $2 minimum tolerance, so $102 should still be "at"
			expect(getBudgetStatus(101, 100).status).toBe('at');
			expect(getBudgetStatus(102, 100).status).toBe('at');
		});

		it('should return "over" for spending beyond tolerance', () => {
			// $100 budget: $2 minimum tolerance, so $103 should be "over"
			expect(getBudgetStatus(103, 100).status).toBe('over');
			expect(getBudgetStatus(150, 100).status).toBe('over');
		});
	});

	describe('asymmetric over-tolerance scaling with budget size', () => {
		it('should use $2 minimum for small budgets', () => {
			// $50 budget: 1% = $0.50, but minimum is $2
			// So $52 should be "at", $53 should be "over"
			expect(getBudgetStatus(52, 50).status).toBe('at');
			expect(getBudgetStatus(53, 50).status).toBe('over');
		});

		it('should use $2 minimum for $100 budget', () => {
			// $100 budget: 1% = $1, but minimum is $2
			expect(getBudgetStatus(102, 100).status).toBe('at');
			expect(getBudgetStatus(103, 100).status).toBe('over');
		});

		it('should use 1% for larger budgets where 1% > $2', () => {
			// $500 budget: 1% = $5 > $2 minimum, so upper bound = 101%
			// With whole-number rounding: 101.4% rounds to 101, still "at"
			// 101.5% rounds to 102, which is "over"
			expect(getBudgetStatus(505, 500).status).toBe('at'); // 101%
			expect(getBudgetStatus(507, 500).status).toBe('at'); // 101.4% rounds to 101
			expect(getBudgetStatus(508, 500).status).toBe('over'); // 101.6% rounds to 102
		});

		it('should scale tolerance for $1000 budget', () => {
			// $1000 budget: 1% = $10, so upper bound = 101%
			// With whole-number rounding: 101.4% rounds to 101, still "at"
			// Note: $1015/$1000 = 101.49999... (floating-point) rounds to 101
			expect(getBudgetStatus(1010, 1000).status).toBe('at'); // 101%
			expect(getBudgetStatus(1015, 1000).status).toBe('at'); // 101.5% but floats to 101.499...
			expect(getBudgetStatus(1016, 1000).status).toBe('over'); // 101.6% rounds to 102
		});
	});

	describe('floating-point edge cases', () => {
		it('should handle 99.999999% as "at" (rounds to 100%)', () => {
			// 59.999999 / 60 * 100 = 99.999998...
			const spent = 59.999999;
			const budget = 60;
			expect(getBudgetStatus(spent, budget).status).toBe('at');
		});

		it('should handle 100.000001% as "at" (rounds to 100%)', () => {
			// 60.000001 / 60 * 100 = 100.000001...
			const spent = 60.000001;
			const budget = 60;
			expect(getBudgetStatus(spent, budget).status).toBe('at');
		});

		it('should handle 0.1 + 0.2 edge case', () => {
			// Classic floating-point issue: 0.1 + 0.2 = 0.30000000000000004
			const spent = 0.1 + 0.2; // 0.30000000000000004
			const budget = 0.3;
			const result = getBudgetStatus(spent, budget);
			// Should be treated as exactly 100%, not over
			expect(result.status).toBe('at');
		});

		it('should consistently return same status for equivalent fractions', () => {
			// 60/60 should equal 100/100
			const result1 = getBudgetStatus(60, 60);
			const result2 = getBudgetStatus(100, 100);
			expect(result1.status).toBe(result2.status);
		});
	});

	describe('edge cases', () => {
		it('should handle zero budget with zero spending', () => {
			const result = getBudgetStatus(0, 0);
			expect(result.status).toBe('under');
			expect(result.percentSpent).toBe(0);
			expect(result.displayPercent).toBe(0);
		});

		it('should handle zero budget with positive spending', () => {
			const result = getBudgetStatus(50, 0);
			expect(result.status).toBe('over');
			expect(result.percentSpent).toBe(Infinity);
			expect(result.displayPercent).toBe(100);
		});

		it('should handle negative budget as zero budget', () => {
			const result = getBudgetStatus(50, -10);
			expect(result.status).toBe('over');
		});

		it('should handle zero spending', () => {
			const result = getBudgetStatus(0, 100);
			expect(result.status).toBe('under');
			expect(result.percentSpent).toBe(0);
			expect(result.displayPercent).toBe(0);
		});

		it('should cap displayPercent at 100 for over budget', () => {
			const result = getBudgetStatus(150, 100);
			expect(result.percentSpent).toBe(150);
			expect(result.displayPercent).toBe(100);
		});
	});

	describe('color class output', () => {
		it('should return success colors for "under"', () => {
			const result = getBudgetStatus(50, 100);
			expect(result.colorClass).toContain('success');
			expect(result.textColorClass).toContain('success');
		});

		it('should return warning colors for "approaching"', () => {
			const result = getBudgetStatus(90, 100);
			expect(result.colorClass).toContain('warning');
			expect(result.textColorClass).toContain('warning');
		});

		it('should return neutral/slate-blue colors for "at"', () => {
			const result = getBudgetStatus(100, 100);
			expect(result.colorClass).toContain('neutral');
			expect(result.textColorClass).toContain('neutral');
		});

		it('should return danger colors for "over"', () => {
			const result = getBudgetStatus(150, 100);
			expect(result.colorClass).toContain('danger');
			expect(result.textColorClass).toContain('danger');
		});
	});

	describe('labels', () => {
		it('should return empty label for "under"', () => {
			expect(getBudgetStatus(50, 100).label).toBe('');
		});

		it('should return "Approaching limit" for "approaching"', () => {
			expect(getBudgetStatus(90, 100).label).toBe('Approaching limit');
		});

		it('should return "At budget" for "at"', () => {
			expect(getBudgetStatus(100, 100).label).toBe('At budget');
		});

		it('should return "Over budget" for "over"', () => {
			expect(getBudgetStatus(150, 100).label).toBe('Over budget');
		});
	});

	describe('custom options', () => {
		it('should respect custom approaching threshold', () => {
			// With 70% threshold, 75% should be "approaching"
			const result = getBudgetStatus(75, 100, { approachingThreshold: 70 });
			expect(result.status).toBe('approaching');

			// With default 80%, 75% should be "under"
			expect(getBudgetStatus(75, 100).status).toBe('under');
		});

		it('should respect custom under tolerance', () => {
			// With 1% under tolerance (99% threshold):
			// 98.4% rounds to 98 < 99 → approaching
			const result = getBudgetStatus(98.4, 100, { atBudgetUnderTolerance: 1 });
			expect(result.status).toBe('approaching');

			// 98.5% rounds to 99 >= 99 → at
			expect(getBudgetStatus(98.5, 100, { atBudgetUnderTolerance: 1 }).status).toBe('at');

			// 99.5% is clearly above 99%, so "at"
			expect(getBudgetStatus(99.5, 100, { atBudgetUnderTolerance: 1 }).status).toBe('at');
		});

		it('should respect custom over tolerance min', () => {
			// With $5 minimum over tolerance, $104 should be "at"
			const result = getBudgetStatus(104, 100, { atBudgetOverToleranceMin: 5 });
			expect(result.status).toBe('at');
		});

		it('should respect custom over tolerance percent', () => {
			// With 5% over tolerance on $100 budget, $105 should be "at"
			const result = getBudgetStatus(105, 100, { atBudgetOverTolerancePercent: 5 });
			expect(result.status).toBe('at');
		});
	});

	describe('real-world scenarios from the plan', () => {
		it('$60/$60 budget → at', () => {
			expect(getBudgetStatus(60, 60).status).toBe('at');
		});

		it('$59.10/$60 → at (98.5% rounds to 99%)', () => {
			// 59.10 / 60 = 98.5%, which rounds to 99 >= 99 threshold
			expect(getBudgetStatus(59.1, 60).status).toBe('at');
		});

		it('$59/$60 → approaching (98.3% rounds to 98%)', () => {
			// 59 / 60 = 98.33%, which rounds to 98 < 99 threshold
			expect(getBudgetStatus(59, 60).status).toBe('approaching');
		});

		it('$61/$60 → at ($1 over < $2 minimum)', () => {
			expect(getBudgetStatus(61, 60).status).toBe('at');
		});

		it('$62/$60 → at ($2 over = $2 minimum)', () => {
			expect(getBudgetStatus(62, 60).status).toBe('at');
		});

		it('$63/$60 → over ($3 over > $2 minimum)', () => {
			expect(getBudgetStatus(63, 60).status).toBe('over');
		});

		it('$505/$500 → at ($5 over = 1% of budget)', () => {
			expect(getBudgetStatus(505, 500).status).toBe('at');
		});

		it('$510/$500 → over ($10 > 1%)', () => {
			expect(getBudgetStatus(510, 500).status).toBe('over');
		});
	});
});

describe('getBudgetColorClass', () => {
	it('should return the color class directly', () => {
		const colorClass = getBudgetColorClass(50, 100);
		expect(colorClass).toContain('success');
	});
});

describe('getBudgetTextColorClass', () => {
	it('should return the text color class directly', () => {
		const textClass = getBudgetTextColorClass(150, 100);
		expect(textClass).toContain('danger');
	});
});
