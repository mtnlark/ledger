import { describe, it, expect } from 'vitest';
import {
	computeHistoricalRank,
	computeVsAverage,
	computeBiggestPurchase,
	computeMostVisitedMerchant,
	computeCategoryStandout,
	computeNeedsPercent,
	computeMonthlyTotals,
	computeMonthReview,
	computeSavingsReview
} from './month-review';
import type { Transaction, Category } from '$lib/db';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		date: new Date('2025-06-15'),
		merchant: 'Test Store',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 50,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

function makeCategory(overrides: Partial<Category> = {}): Category {
	return {
		id: 1,
		name: 'Groceries',
		icon: '🛒',
		isActive: true,
		sortOrder: 1,
		isEssential: true,
		...overrides
	};
}

describe('computeHistoricalRank', () => {
	it('returns null with fewer than 2 months', () => {
		const totals = new Map([['2025-06', 500]]);
		expect(computeHistoricalRank(500, totals, '2025-06')).toBeNull();
	});

	it('returns null if selectedMonth not in totals', () => {
		const totals = new Map([['2025-05', 400], ['2025-06', 500]]);
		expect(computeHistoricalRank(300, totals, '2025-07')).toBeNull();
	});

	it('picks lowest direction when lowest rank is smaller', () => {
		// 200 is the lowest out of 5 months
		const totals = new Map([
			['2025-01', 500],
			['2025-02', 400],
			['2025-03', 300],
			['2025-04', 250],
			['2025-05', 200]
		]);
		const result = computeHistoricalRank(200, totals, '2025-05');
		expect(result).toEqual({ rank: 1, total: 5, direction: 'lowest' });
	});

	it('picks highest direction when highest rank is smaller', () => {
		// 500 is the highest out of 5 months (selected month is most recent)
		const totals = new Map([
			['2025-01', 200],
			['2025-02', 250],
			['2025-03', 300],
			['2025-04', 400],
			['2025-05', 500]
		]);
		const result = computeHistoricalRank(500, totals, '2025-05');
		expect(result).toEqual({ rank: 1, total: 5, direction: 'highest' });
	});

	it('picks highest when rank ties (middle of pack)', () => {
		// 300 is 3rd highest and 3rd lowest out of 5 — defaults to highest
		const totals2 = new Map([
			['2025-01', 100],
			['2025-02', 200],
			['2025-03', 400],
			['2025-04', 500],
			['2025-05', 300] // selected month is middle value
		]);
		const result = computeHistoricalRank(300, totals2, '2025-05');
		// 300 is 3rd highest (500, 400, 300) and 3rd lowest (100, 200, 300) — defaults to highest
		expect(result).toEqual({ rank: 3, total: 5, direction: 'highest' });
	});

	it('reports 2nd lowest correctly', () => {
		const totals = new Map([
			['2025-01', 800],
			['2025-02', 600],
			['2025-03', 400],
			['2025-04', 300],
			['2025-05', 200],
			['2025-06', 250],
			['2025-07', 700],
			['2025-08', 500]
		]);
		// 250 is 2nd lowest in the 8-month window ending at 2025-08
		const result = computeHistoricalRank(250, totals, '2025-08');
		expect(result).toEqual({ rank: 2, total: 8, direction: 'lowest' });
	});

	it('uses symmetric window — past months benefit from future data', () => {
		// User has Oct, Nov, Dec data. Selecting Nov should see all 3 months,
		// not just Oct+Nov (which was the old backward-only behavior).
		const totals = new Map([
			['2025-10', 3000],
			['2025-11', 4742],
			['2025-12', 5233]
		]);
		// Selecting Nov: window includes Oct, Nov, Dec (3 months total)
		const result = computeHistoricalRank(4742, totals, '2025-11');
		expect(result).not.toBeNull();
		expect(result!.total).toBe(3); // all 3 months, not just 2
		// Nov is 2nd highest (Dec=5233, Nov=4742, Oct=3000)
		expect(result!.rank).toBe(2);
		expect(result!.direction).toBe('highest');
	});

	it('symmetric window updates as more months are added', () => {
		// Initially Oct+Nov — Nov is highest of 2
		const initialTotals = new Map([
			['2025-10', 3000],
			['2025-11', 4742]
		]);
		const initialResult = computeHistoricalRank(4742, initialTotals, '2025-11');
		expect(initialResult).toEqual({ rank: 1, total: 2, direction: 'highest' });

		// After Dec+Jan are added, Nov is no longer highest
		const updatedTotals = new Map([
			['2025-10', 3000],
			['2025-11', 4742],
			['2025-12', 5233],
			['2026-01', 4900]
		]);
		const updatedResult = computeHistoricalRank(4742, updatedTotals, '2025-11');
		expect(updatedResult).not.toBeNull();
		expect(updatedResult!.total).toBe(4);
		// Nov (4742) is 2nd lowest (Oct=3000 < Nov < Jan=4900 < Dec=5233)
		// lowestRank=2 < highestRank=3, so picks lowest direction
		expect(updatedResult!.rank).toBe(2);
		expect(updatedResult!.direction).toBe('lowest');
	});
});

describe('computeVsAverage', () => {
	it('returns null with fewer than 2 months', () => {
		const totals = new Map([['2025-06', 500]]);
		expect(computeVsAverage(500, totals)).toBeNull();
	});

	it('returns null when mean is 0', () => {
		const totals = new Map([['2025-05', 0], ['2025-06', 0]]);
		expect(computeVsAverage(0, totals)).toBeNull();
	});

	it('computes percent above average', () => {
		// With weighted calculation (recent months weighted higher), the weighted mean
		// will be higher than simple mean. Test for correct direction and reasonable range.
		const totals = new Map([
			['2025-01', 200],
			['2025-02', 300],
			['2025-03', 400]
		]);
		const result = computeVsAverage(450, totals);
		expect(result).not.toBeNull();
		expect(result!.isAbove).toBe(true);
		// With weighted mean skewed toward 400, diff from 450 will be less than 50%
		expect(result!.percentDiff).toBeGreaterThanOrEqual(40);
		expect(result!.percentDiff).toBeLessThanOrEqual(55);
	});

	it('computes percent below average', () => {
		// With weighted calculation, weighted mean skews toward recent (500).
		// 200 compared to weighted mean will show as significantly below.
		const totals = new Map([
			['2025-01', 300],
			['2025-02', 400],
			['2025-03', 500]
		]);
		const result = computeVsAverage(200, totals);
		expect(result).not.toBeNull();
		expect(result!.isAbove).toBe(false);
		// With weighted mean skewed toward 500, diff from 200 will be more than 50%
		expect(result!.percentDiff).toBeGreaterThanOrEqual(45);
		expect(result!.percentDiff).toBeLessThanOrEqual(60);
	});

	it('reports within one sigma correctly', () => {
		// Mean = 300, values [200, 300, 400], stdDev ≈ 81.6
		// 350 is 50 from mean, within 1σ
		const totals = new Map([
			['2025-01', 200],
			['2025-02', 300],
			['2025-03', 400]
		]);
		const result = computeVsAverage(350, totals);
		expect(result!.withinOneSigma).toBe(true);
	});

	it('reports outside one sigma', () => {
		// Mean = 300, values [200, 300, 400], stdDev ≈ 81.6
		// 500 is 200 from mean, well beyond 1σ
		const totals = new Map([
			['2025-01', 200],
			['2025-02', 300],
			['2025-03', 400]
		]);
		const result = computeVsAverage(500, totals);
		expect(result!.withinOneSigma).toBe(false);
	});

	it('returns weightedMean and sampleSize', () => {
		const totals = new Map([
			['2025-01', 200],
			['2025-02', 300],
			['2025-03', 400],
			['2025-04', 500]
		]);
		const result = computeVsAverage(600, totals);
		expect(result).not.toBeNull();
		expect(result!.sampleSize).toBe(4);
		// Weighted mean should be between min and max of the data
		expect(result!.weightedMean).toBeGreaterThanOrEqual(200);
		expect(result!.weightedMean).toBeLessThanOrEqual(500);
	});

	it('returns correct sampleSize with rolling window', () => {
		const totals = new Map([
			['2025-01', 100],
			['2025-02', 200],
			['2025-03', 300],
			['2025-04', 400],
			['2025-05', 500]
		]);
		const result = computeVsAverage(600, totals, '2025-03');
		expect(result).not.toBeNull();
		expect(result!.sampleSize).toBe(5);
		expect(result!.weightedMean).toBeGreaterThan(0);
	});
});

describe('computeBiggestPurchase', () => {
	const categories = [
		makeCategory({ id: 1, name: 'Groceries', icon: '🛒' }),
		makeCategory({ id: 2, name: 'Electronics', icon: '📱', isEssential: false }),
		makeCategory({ id: 3, name: 'Rent', icon: '🏠', isEssential: true })
	];

	it('returns null for empty transactions', () => {
		expect(computeBiggestPurchase([], categories)).toBeNull();
	});

	it('returns the largest transaction by user amount', () => {
		const txs = [
			makeTx({ merchant: 'Small', amount: 50, categoryId: 1 }),
			makeTx({ merchant: 'Big Store', amount: 420, categoryId: 2 }),
			makeTx({ merchant: 'Medium', amount: 200, categoryId: 1 })
		];
		const result = computeBiggestPurchase(txs, categories);
		expect(result).toEqual({ merchant: 'Big Store', amount: 420 });
	});

	it('accounts for shared transactions (user portion only)', () => {
		const txs = [
			makeTx({ merchant: 'Shared Place', amount: 400, isShared: true, partnerShare: 200, categoryId: 1 }),
			makeTx({ merchant: 'Solo', amount: 150, categoryId: 2 })
		];
		// Shared: 400 - 200 = 200 user portion; Solo: 150
		const result = computeBiggestPurchase(txs, categories);
		expect(result).toEqual({ merchant: 'Shared Place', amount: 200 });
	});

	it('uses the combined user share of a split purchase', () => {
		const txs = [
			makeTx({ merchant: 'Split Store', amount: 180, categoryId: 1, parentTransactionId: 100 }),
			makeTx({ merchant: 'Split Store', amount: 170, categoryId: 2, parentTransactionId: 100 }),
			makeTx({ merchant: 'Large Single', amount: 300, categoryId: 2 })
		];

		expect(computeBiggestPurchase(txs, categories)).toEqual({
			merchant: 'Split Store',
			amount: 350
		});
	});

	it('excludes rent transactions by default', () => {
		const txs = [
			makeTx({ merchant: 'Landlord', amount: 2000, categoryId: 3 }), // Rent
			makeTx({ merchant: 'Best Buy', amount: 500, categoryId: 2 })
		];
		const result = computeBiggestPurchase(txs, categories);
		expect(result).toEqual({ merchant: 'Best Buy', amount: 500 });
	});

	it('returns null if only rent transactions remain', () => {
		const txs = [
			makeTx({ merchant: 'Landlord', amount: 2000, categoryId: 3 })
		];
		expect(computeBiggestPurchase(txs, categories)).toBeNull();
	});

	it('keeps a split purchase when only some allocations are excluded', () => {
		const txs = [
			makeTx({ merchant: 'Move-in', amount: 1000, categoryId: 3, parentTransactionId: 100 }),
			makeTx({ merchant: 'Move-in', amount: 200, categoryId: 2, parentTransactionId: 100 }),
			makeTx({ merchant: 'Best Buy', amount: 500, categoryId: 2 })
		];

		expect(computeBiggestPurchase(txs, categories)).toEqual({
			merchant: 'Move-in',
			amount: 1200
		});
	});

	it('respects custom exclude list', () => {
		const txs = [
			makeTx({ merchant: 'Grocery Store', amount: 300, categoryId: 1 }),
			makeTx({ merchant: 'Best Buy', amount: 200, categoryId: 2 })
		];
		// Exclude groceries instead of rent
		const result = computeBiggestPurchase(txs, categories, new Set(['groceries']));
		expect(result).toEqual({ merchant: 'Best Buy', amount: 200 });
	});

	it('returns null if all amounts are 0', () => {
		const txs = [makeTx({ amount: 0, categoryId: 1 }), makeTx({ amount: 0, categoryId: 2 })];
		expect(computeBiggestPurchase(txs, categories)).toBeNull();
	});
});

describe('computeMostVisitedMerchant', () => {
	it('returns null for empty transactions', () => {
		expect(computeMostVisitedMerchant([])).toBeNull();
	});

	it('returns null when no merchant meets minimum visits', () => {
		const txs = [makeTx({ merchant: 'A' }), makeTx({ merchant: 'B' })];
		expect(computeMostVisitedMerchant(txs, 2)).toBeNull();
	});

	it('returns the most frequent merchant', () => {
		const txs = [
			makeTx({ merchant: 'Trader Joes' }),
			makeTx({ merchant: 'Trader Joes' }),
			makeTx({ merchant: 'Trader Joes' }),
			makeTx({ merchant: 'Target' }),
			makeTx({ merchant: 'Target' })
		];
		const result = computeMostVisitedMerchant(txs, 2);
		expect(result).toEqual({ merchant: 'Trader Joes', count: 3, totalSpent: 300 });
	});

	it('is case-insensitive but preserves original casing', () => {
		const txs = [
			makeTx({ merchant: 'trader joes' }),
			makeTx({ merchant: 'Trader Joes' }),
			makeTx({ merchant: 'TRADER JOES' })
		];
		const result = computeMostVisitedMerchant(txs, 2);
		expect(result!.count).toBe(3);
		// Should use the first occurrence's casing
		expect(result!.merchant).toBe('trader joes');
	});

	it('uses default minVisits of 2', () => {
		const txs = [makeTx({ merchant: 'Once' })];
		expect(computeMostVisitedMerchant(txs)).toBeNull();
	});

	it('sums totalSpent with varied amounts', () => {
		const txs = [
			makeTx({ merchant: 'Coffee Shop', amount: 5 }),
			makeTx({ merchant: 'Coffee Shop', amount: 8 }),
			makeTx({ merchant: 'Coffee Shop', amount: 12 })
		];
		const result = computeMostVisitedMerchant(txs, 2);
		expect(result).not.toBeNull();
		expect(result!.totalSpent).toBe(25);
	});

	it('computes totalSpent using user portion for shared transactions', () => {
		const txs = [
			makeTx({ merchant: 'Restaurant', amount: 100, isShared: true, partnerShare: 40 }),
			makeTx({ merchant: 'Restaurant', amount: 80, isShared: true, partnerShare: 30 })
		];
		const result = computeMostVisitedMerchant(txs, 2);
		expect(result).not.toBeNull();
		// User portions: (100-40) + (80-30) = 60 + 50 = 110
		expect(result!.totalSpent).toBe(110);
	});
});

describe('computeCategoryStandout', () => {
	const categories = [
		makeCategory({ id: 1, name: 'Groceries', icon: '🛒' }),
		makeCategory({ id: 2, name: 'Travel', icon: '✈️', isEssential: false }),
		makeCategory({ id: 3, name: 'Coffee', icon: '☕', isEssential: false })
	];

	it('returns null when no previous month transactions', () => {
		const current = [makeTx({ categoryId: 1, amount: 300 })];
		expect(computeCategoryStandout(current, [], categories)).toBeNull();
	});

	it('finds category with largest absolute dollar change', () => {
		const current = [
			makeTx({ categoryId: 1, amount: 300 }),
			makeTx({ categoryId: 2, amount: 500 })
		];
		const previous = [
			makeTx({ categoryId: 1, amount: 280 }),
			makeTx({ categoryId: 2, amount: 120 })
		];
		// Groceries diff: |300 - 280| = 20
		// Travel diff: |500 - 120| = 380
		const result = computeCategoryStandout(current, previous, categories);
		expect(result).toEqual({
			name: 'Travel',
			icon: '✈️',
			diff: 380,
			isIncrease: true
		});
	});

	it('detects decrease correctly', () => {
		const current = [makeTx({ categoryId: 1, amount: 100 })];
		const previous = [makeTx({ categoryId: 1, amount: 400 })];
		const result = computeCategoryStandout(current, previous, categories);
		expect(result!.isIncrease).toBe(false);
		expect(result!.diff).toBe(300);
	});

	it('handles category only in previous month (dropped to 0)', () => {
		const current = [makeTx({ categoryId: 1, amount: 200 })];
		const previous = [
			makeTx({ categoryId: 1, amount: 200 }),
			makeTx({ categoryId: 2, amount: 500 })
		];
		// Travel went from 500 to 0, diff = 500
		const result = computeCategoryStandout(current, previous, categories);
		expect(result!.name).toBe('Travel');
		expect(result!.diff).toBe(500);
		expect(result!.isIncrease).toBe(false);
	});

	it('returns null when all diffs are zero', () => {
		const current = [makeTx({ categoryId: 1, amount: 200 })];
		const previous = [makeTx({ categoryId: 1, amount: 200 })];
		expect(computeCategoryStandout(current, previous, categories)).toBeNull();
	});

	it('returns null when category not found in lookup', () => {
		const current = [makeTx({ categoryId: 99, amount: 200 })];
		const previous = [makeTx({ categoryId: 99, amount: 50 })];
		expect(computeCategoryStandout(current, previous, categories)).toBeNull();
	});
});

describe('computeNeedsPercent', () => {
	it('returns null for empty transactions', () => {
		expect(computeNeedsPercent([])).toBeNull();
	});

	it('returns null when total is 0', () => {
		const txs = [makeTx({ amount: 0 })];
		expect(computeNeedsPercent(txs)).toBeNull();
	});

	it('computes correct needs percentage', () => {
		const txs = [
			makeTx({ amount: 300, isEssential: true }),
			makeTx({ amount: 100, isEssential: true }),
			makeTx({ amount: 100, isEssential: false })
		];
		// Needs: 400, Total: 500, percent: 80
		expect(computeNeedsPercent(txs)).toBe(80);
	});

	it('returns 0 when no essential transactions', () => {
		const txs = [
			makeTx({ amount: 200, isEssential: false }),
			makeTx({ amount: 300, isEssential: false })
		];
		expect(computeNeedsPercent(txs)).toBe(0);
	});

	it('returns 100 when all essential', () => {
		const txs = [
			makeTx({ amount: 200, isEssential: true }),
			makeTx({ amount: 300, isEssential: true })
		];
		expect(computeNeedsPercent(txs)).toBe(100);
	});
});

describe('computeMonthlyTotals', () => {
	it('groups transactions by month key', () => {
		const txs = [
			makeTx({ date: new Date('2025-01-10'), amount: 100 }),
			makeTx({ date: new Date('2025-01-20'), amount: 200 }),
			makeTx({ date: new Date('2025-02-05'), amount: 150 })
		];
		const result = computeMonthlyTotals(txs);
		expect(result.get('2025-01')).toBe(300);
		expect(result.get('2025-02')).toBe(150);
	});

	it('accounts for shared transactions', () => {
		const txs = [
			makeTx({ date: new Date(2025, 2, 15), amount: 400, isShared: true, partnerShare: 200 })
		];
		const result = computeMonthlyTotals(txs);
		expect(result.get('2025-03')).toBe(200); // user portion only
	});
});

describe('computeMonthReview (orchestrator)', () => {
	const categories = [
		makeCategory({ id: 1, name: 'Groceries', icon: '🛒' }),
		makeCategory({ id: 2, name: 'Fun', icon: '🎮', isEssential: false })
	];

	it('returns full result structure for a normal month', () => {
		const allTxs = [
			makeTx({ date: new Date('2025-01-15'), amount: 300, categoryId: 1, isEssential: true }),
			makeTx({ date: new Date('2025-02-10'), amount: 400, categoryId: 1, isEssential: true }),
			makeTx({ date: new Date('2025-03-05'), amount: 250, categoryId: 1, isEssential: true }),
			makeTx({ date: new Date('2025-03-20'), amount: 150, categoryId: 2, isEssential: false })
		];
		const selectedMonthTxs = allTxs.filter(
			(t) => new Date(t.date).getMonth() === 2 // March
		);
		const previousMonthTxs = allTxs.filter(
			(t) => new Date(t.date).getMonth() === 1 // February
		);

		const result = computeMonthReview('2025-03', selectedMonthTxs, previousMonthTxs, allTxs, categories);

		expect(result.historicalRank).not.toBeNull();
		expect(result.vsAverage).not.toBeNull();
		expect(result.biggestPurchase).not.toBeNull();
		expect(result.needsPercent).not.toBeNull();
	});

	it('handles single month of history gracefully', () => {
		const txs = [makeTx({ date: new Date('2025-06-10'), amount: 500 })];

		const result = computeMonthReview('2025-06', txs, [], txs, categories);

		expect(result.historicalRank).toBeNull(); // only 1 month
		expect(result.vsAverage).toBeNull();
		expect(result.biggestPurchase).toEqual({ merchant: 'Test Store', amount: 500 });
		expect(result.categoryStandout).toBeNull(); // no previous month
	});

	it('handles empty month', () => {
		const allTxs = [
			makeTx({ date: new Date('2025-01-15'), amount: 300 }),
			makeTx({ date: new Date('2025-02-10'), amount: 400 })
		];

		const result = computeMonthReview('2025-03', [], allTxs.slice(1), allTxs, categories);

		expect(result.biggestPurchase).toBeNull();
		expect(result.mostVisitedMerchant).toBeNull();
		expect(result.needsPercent).toBeNull();
	});
});

// Helper to create contribution objects
function makeContribution(date: Date, amount: number, source: string = 'bank_transfer') {
	return { date, amount, source };
}

describe('computeSavingsReview', () => {
	describe('basic behavior', () => {
		it('returns null when no contributions', () => {
			const result = computeSavingsReview('2025-06', [], [], 5000, []);
			expect(result).toBeNull();
		});

		it('includes payroll deductions in totalSaved (for consistency with Savings tab)', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 500, 'payroll_deduction')
			];
			const result = computeSavingsReview('2025-06', contributions, contributions, 5000, []);
			expect(result).not.toBeNull();
			expect(result!.totalSaved).toBe(500);
			// But savings rate should be null since payroll doesn't affect available
			expect(result!.savingsRate).toBe(0); // 0/5000 = 0
		});

		it('includes ALL contribution sources in totalSaved', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 500, 'bank_transfer'),
				makeContribution(new Date('2025-06-20'), 200, 'other'),
				makeContribution(new Date('2025-06-22'), 100, 'interest'),
				makeContribution(new Date('2025-06-25'), 150, 'employer_match'),
				makeContribution(new Date('2025-06-28'), 300, 'payroll_deduction')
			];
			const result = computeSavingsReview('2025-06', contributions, contributions, 5000, []);
			expect(result).not.toBeNull();
			// Total should include ALL contributions
			expect(result!.totalSaved).toBe(1250); // 500+200+100+150+300
		});

		it('only counts bank_transfer and other toward savings rate', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 500, 'bank_transfer'),
				makeContribution(new Date('2025-06-20'), 100, 'interest'),
				makeContribution(new Date('2025-06-25'), 200, 'employer_match')
			];
			const result = computeSavingsReview('2025-06', contributions, contributions, 5000, []);
			expect(result!.totalSaved).toBe(800); // All contributions
			expect(result!.savingsRate).toBe(0.1); // Only 500/5000 = 10%
		});
	});

	describe('savings rate calculation', () => {
		it('calculates savings rate correctly', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 1000, 'bank_transfer')
			];
			const result = computeSavingsReview('2025-06', contributions, contributions, 5000, []);
			expect(result!.savingsRate).toBe(0.2); // 1000/5000 = 20%
		});

		it('returns null savings rate when no income', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 500, 'bank_transfer')
			];
			const result = computeSavingsReview('2025-06', contributions, contributions, null, []);
			expect(result!.savingsRate).toBeNull();
		});

		it('returns null savings rate when income is 0', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 500, 'bank_transfer')
			];
			const result = computeSavingsReview('2025-06', contributions, contributions, 0, []);
			expect(result!.savingsRate).toBeNull();
		});
	});

	describe('highest month detection', () => {
		it('detects when current month is highest savings month (all sources)', () => {
			const allContributions = [
				makeContribution(new Date('2025-04-15'), 500, 'bank_transfer'),
				makeContribution(new Date('2025-05-15'), 600, 'payroll_deduction'), // includes all sources
				makeContribution(new Date('2025-06-15'), 800, 'employer_match')
			];
			const currentContributions = [
				makeContribution(new Date('2025-06-15'), 800, 'employer_match')
			];
			const result = computeSavingsReview('2025-06', currentContributions, allContributions, 5000, []);
			expect(result!.isHighestMonth).toBe(true);
		});

		it('returns false when not highest month', () => {
			const allContributions = [
				makeContribution(new Date('2025-04-15'), 1000, 'payroll_deduction'),
				makeContribution(new Date('2025-05-15'), 600, 'bank_transfer'),
				makeContribution(new Date('2025-06-15'), 500, 'bank_transfer')
			];
			const currentContributions = [
				makeContribution(new Date('2025-06-15'), 500, 'bank_transfer')
			];
			const result = computeSavingsReview('2025-06', currentContributions, allContributions, 5000, []);
			expect(result!.isHighestMonth).toBe(false);
		});

		it('requires at least 2 months for highest month comparison', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 500, 'bank_transfer')
			];
			const result = computeSavingsReview('2025-06', contributions, contributions, 5000, []);
			expect(result!.isHighestMonth).toBe(false);
		});

		it('compares total saved across all sources for highest month', () => {
			// April: 1000 (500 bank + 500 payroll)
			// June: 800 bank_transfer only
			const allContributions = [
				makeContribution(new Date('2025-04-15'), 500, 'bank_transfer'),
				makeContribution(new Date('2025-04-20'), 500, 'payroll_deduction'),
				makeContribution(new Date('2025-06-15'), 800, 'bank_transfer')
			];
			const currentContributions = [
				makeContribution(new Date('2025-06-15'), 800, 'bank_transfer')
			];
			const result = computeSavingsReview('2025-06', currentContributions, allContributions, 5000, []);
			// April total (1000) > June total (800), so not highest
			expect(result!.isHighestMonth).toBe(false);
		});
	});

	describe('vs average comparison (positive only)', () => {
		it('reports when savings rate is above average', () => {
			const allContributions = [
				makeContribution(new Date('2025-04-15'), 400, 'bank_transfer'), // 8%
				makeContribution(new Date('2025-05-15'), 500, 'bank_transfer'), // 10%
				makeContribution(new Date('2025-06-15'), 1000, 'bank_transfer') // 20%
			];
			const currentContributions = [
				makeContribution(new Date('2025-06-15'), 1000, 'bank_transfer')
			];
			const allBudgets = [
				{ month: '2025-04', income: 5000 },
				{ month: '2025-05', income: 5000 },
				{ month: '2025-06', income: 5000 }
			];
			const result = computeSavingsReview('2025-06', currentContributions, allContributions, 5000, allBudgets);
			expect(result!.vsAverage).not.toBeNull();
			expect(result!.vsAverage!.percentDiff).toBeGreaterThan(0);
		});

		it('NEVER reports when savings rate is below average (key constraint)', () => {
			const allContributions = [
				makeContribution(new Date('2025-04-15'), 1000, 'bank_transfer'), // 20%
				makeContribution(new Date('2025-05-15'), 1000, 'bank_transfer'), // 20%
				makeContribution(new Date('2025-06-15'), 400, 'bank_transfer') // 8% - below average
			];
			const currentContributions = [
				makeContribution(new Date('2025-06-15'), 400, 'bank_transfer')
			];
			const allBudgets = [
				{ month: '2025-04', income: 5000 },
				{ month: '2025-05', income: 5000 },
				{ month: '2025-06', income: 5000 }
			];
			const result = computeSavingsReview('2025-06', currentContributions, allContributions, 5000, allBudgets);
			// Should NOT have vsAverage even though we're below average
			expect(result!.vsAverage).toBeNull();
		});

		it('requires at least 10% above average to report', () => {
			const allContributions = [
				makeContribution(new Date('2025-04-15'), 500, 'bank_transfer'), // 10%
				makeContribution(new Date('2025-05-15'), 500, 'bank_transfer'), // 10%
				makeContribution(new Date('2025-06-15'), 525, 'bank_transfer') // 10.5% - only 5% above
			];
			const currentContributions = [
				makeContribution(new Date('2025-06-15'), 525, 'bank_transfer')
			];
			const allBudgets = [
				{ month: '2025-04', income: 5000 },
				{ month: '2025-05', income: 5000 },
				{ month: '2025-06', income: 5000 }
			];
			const result = computeSavingsReview('2025-06', currentContributions, allContributions, 5000, allBudgets);
			// Should NOT report because less than 10% above average
			expect(result!.vsAverage).toBeNull();
		});

		it('requires at least 2 budgets for comparison', () => {
			const contributions = [
				makeContribution(new Date('2025-06-15'), 1000, 'bank_transfer')
			];
			const allBudgets = [{ month: '2025-06', income: 5000 }];
			const result = computeSavingsReview('2025-06', contributions, contributions, 5000, allBudgets);
			expect(result!.vsAverage).toBeNull();
		});
	});
});
