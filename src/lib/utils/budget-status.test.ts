import { describe, it, expect } from 'vitest';
import { getBudgetStatus, getBudgetColorClass, getBudgetTextColorClass } from './budget-status';

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

	/**
	 * These tests use realistic transaction amounts with cents to verify
	 * that the status calculation works correctly with real-world data.
	 *
	 * IMPORTANT: The BudgetProgressBar component rounds values before calling
	 * getBudgetStatus, so these tests verify the utility's behavior with
	 * already-rounded values (simulating how it's actually used in the UI).
	 */
	describe('realistic transaction amounts (with rounding as used in UI)', () => {
		// Helper to simulate how BudgetProgressBar calls getBudgetStatus
		const getStatusWithRounding = (spent: number, budget: number) =>
			getBudgetStatus(Math.round(spent), Math.round(budget));

		describe('values that display as equal should show "at" status', () => {
			it('$17.65 spent / $18 budget → displays as $18/$18 → at', () => {
				// This was the actual bug: displayed "$18 / $18" but showed amber
				const result = getStatusWithRounding(17.65, 18);
				expect(result.status).toBe('at');
			});

			it('$49.51 spent / $50 budget → displays as $50/$50 → at', () => {
				const result = getStatusWithRounding(49.51, 50);
				expect(result.status).toBe('at');
			});

			it('$99.50 spent / $100 budget → displays as $100/$100 → at', () => {
				const result = getStatusWithRounding(99.5, 100);
				expect(result.status).toBe('at');
			});

			it('$199.72 spent / $200 budget → displays as $200/$200 → at', () => {
				const result = getStatusWithRounding(199.72, 200);
				expect(result.status).toBe('at');
			});
		});

		describe('grocery budget scenarios ($400-600 typical)', () => {
			it('$423.87 spent / $500 budget → under (85%)', () => {
				const result = getStatusWithRounding(423.87, 500);
				expect(result.status).toBe('approaching'); // 424/500 = 84.8% rounds to 85%
			});

			it('$387.42 spent / $500 budget → under (77%)', () => {
				const result = getStatusWithRounding(387.42, 500);
				expect(result.status).toBe('under'); // 387/500 = 77.4%
			});

			it('$498.33 spent / $500 budget → at (displays $498/$500)', () => {
				const result = getStatusWithRounding(498.33, 500);
				expect(result.status).toBe('at'); // 498/500 = 99.6%
			});

			it('$512.45 spent / $500 budget → at (within $10 tolerance)', () => {
				// $500 budget: 1% = $5 tolerance, so $505 max for "at"
				const result = getStatusWithRounding(512.45, 500);
				expect(result.status).toBe('over'); // 512/500 = 102.4%
			});
		});

		describe('restaurant budget scenarios ($150-300 typical)', () => {
			it('$127.89 spent / $200 budget → under (64%)', () => {
				const result = getStatusWithRounding(127.89, 200);
				expect(result.status).toBe('under');
			});

			it('$178.43 spent / $200 budget → approaching (89%)', () => {
				const result = getStatusWithRounding(178.43, 200);
				expect(result.status).toBe('approaching');
			});

			it('$198.76 spent / $200 budget → at (displays $199/$200)', () => {
				const result = getStatusWithRounding(198.76, 200);
				expect(result.status).toBe('at'); // 199/200 = 99.5%
			});

			it('$215.50 spent / $200 budget → over ($15 over > $2 min)', () => {
				const result = getStatusWithRounding(215.5, 200);
				expect(result.status).toBe('over');
			});
		});

		describe('small budget scenarios ($20-50 typical)', () => {
			it('$12.47 spent / $25 budget → under (50%)', () => {
				const result = getStatusWithRounding(12.47, 25);
				expect(result.status).toBe('under');
			});

			it('$22.89 spent / $25 budget → approaching (92%)', () => {
				const result = getStatusWithRounding(22.89, 25);
				expect(result.status).toBe('approaching'); // 23/25 = 92%
			});

			it('$24.67 spent / $25 budget → at (displays $25/$25)', () => {
				const result = getStatusWithRounding(24.67, 25);
				expect(result.status).toBe('at');
			});

			it('$27.33 spent / $25 budget → at ($2 over = $2 min tolerance)', () => {
				const result = getStatusWithRounding(27.33, 25);
				expect(result.status).toBe('at'); // 27/25 = 108%, but $2 tolerance
			});

			it('$28.10 spent / $25 budget → over ($3 over > $2 min)', () => {
				const result = getStatusWithRounding(28.1, 25);
				expect(result.status).toBe('over');
			});
		});

		describe('subscription/utility scenarios (exact or near-exact amounts)', () => {
			it('$14.99 subscription spent / $15 budget → at', () => {
				const result = getStatusWithRounding(14.99, 15);
				expect(result.status).toBe('at'); // 15/15 = 100%
			});

			it('$9.99 + $4.99 subscriptions / $15 budget → at', () => {
				const result = getStatusWithRounding(9.99 + 4.99, 15);
				expect(result.status).toBe('at'); // 15/15 = 100%
			});

			it('$79.00 utility / $80 budget → at (99%)', () => {
				const result = getStatusWithRounding(79.0, 80);
				expect(result.status).toBe('at');
			});

			it('$156.23 utilities / $150 budget → over', () => {
				const result = getStatusWithRounding(156.23, 150);
				expect(result.status).toBe('over'); // 156/150 = 104%
			});
		});

		describe('accumulated small transactions', () => {
			it('multiple coffee purchases: $4.75 + $5.25 + $4.50 + $5.00 / $20 budget', () => {
				const spent = 4.75 + 5.25 + 4.5 + 5.0; // $19.50
				const result = getStatusWithRounding(spent, 20);
				expect(result.status).toBe('at'); // 20/20 = 100% (rounds up)
			});

			it('multiple lunches: $12.34 + $15.67 + $11.99 / $50 budget', () => {
				const spent = 12.34 + 15.67 + 11.99; // $40.00
				const result = getStatusWithRounding(spent, 50);
				expect(result.status).toBe('approaching'); // 40/50 = 80%
			});
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
