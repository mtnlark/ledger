import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInsightsEngine, resetInsightsEngine } from './insights-engine';
import type { Transaction } from '$lib/db';

// Mock the TransactionCache
let mockVersion = 1;
vi.mock('$lib/stores/transactionCache', () => ({
	getTransactionCache: () => ({
		get version() {
			return mockVersion;
		}
	})
}));

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		date: new Date('2025-01-15'),
		merchant: 'Test Store',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 50,
		partnerShare: 0,
		isSettled: false,
		isEssential: true,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('InsightsEngine', () => {
	beforeEach(() => {
		resetInsightsEngine();
		mockVersion = 1;
	});

	it('returns a singleton instance', () => {
		const engine1 = getInsightsEngine();
		const engine2 = getInsightsEngine();
		expect(engine1).toBe(engine2);
	});

	it('resetInsightsEngine creates a new instance', () => {
		const engine1 = getInsightsEngine();
		resetInsightsEngine();
		const engine2 = getInsightsEngine();
		expect(engine1).not.toBe(engine2);
	});

	describe('caching behavior', () => {
		it('caches getSpendingByCategory for same version and key', () => {
			const engine = getInsightsEngine();
			const txs = [makeTx({ categoryId: 1, amount: 50 })];

			const r1 = engine.getSpendingByCategory(txs, '2025-01');
			const r2 = engine.getSpendingByCategory(txs, '2025-01');

			// Same reference = cache hit
			expect(r1).toBe(r2);
		});

		it('recomputes when version changes', () => {
			const engine = getInsightsEngine();
			const txs = [makeTx({ categoryId: 1, amount: 50 })];

			const r1 = engine.getSpendingByCategory(txs, '2025-01');

			// Simulate transaction mutation
			mockVersion = 2;

			const r2 = engine.getSpendingByCategory(txs, '2025-01');

			// Different reference = cache miss (recomputed)
			expect(r1).not.toBe(r2);
			// But same values
			expect(r1.get(1)).toBe(r2.get(1));
		});

		it('caches different months independently', () => {
			const engine = getInsightsEngine();
			const janTxs = [makeTx({ amount: 100 })];
			const febTxs = [makeTx({ amount: 200 })];

			const jan = engine.getTotalSpent(janTxs, '2025-01');
			const feb = engine.getTotalSpent(febTxs, '2025-02');

			expect(jan).toBe(100);
			expect(feb).toBe(200);

			// Both should be cached
			const janAgain = engine.getTotalSpent(janTxs, '2025-01');
			expect(janAgain).toBe(100);
		});
	});

	describe('calculation correctness', () => {
		it('getSpendingByCategory works', () => {
			const engine = getInsightsEngine();
			const txs = [
				makeTx({ categoryId: 1, amount: 50 }),
				makeTx({ categoryId: 1, amount: 30 }),
				makeTx({ categoryId: 2, amount: 20 })
			];

			const result = engine.getSpendingByCategory(txs, '2025-01');
			expect(result.get(1)).toBe(80);
			expect(result.get(2)).toBe(20);
		});

		it('getTotalSpent works', () => {
			const engine = getInsightsEngine();
			const txs = [makeTx({ amount: 50 }), makeTx({ amount: 30 })];

			expect(engine.getTotalSpent(txs, '2025-01')).toBe(80);
		});

		it('getNeedsVsWants works', () => {
			const engine = getInsightsEngine();
			const txs = [
				makeTx({ amount: 75, isEssential: true }),
				makeTx({ amount: 25, isEssential: false })
			];

			const result = engine.getNeedsVsWants(txs, '2025-01');
			expect(result?.needsPercent).toBe(75);
		});

		it('getNeedsVsWantsFull works', () => {
			const engine = getInsightsEngine();
			const txs = [
				makeTx({ amount: 60, isEssential: true }),
				makeTx({ amount: 40, isEssential: false })
			];

			const result = engine.getNeedsVsWantsFull(txs, '2025-01');
			expect(result.needsPercent).toBe(60);
			expect(result.wantsPercent).toBe(40);
		});

		it('getTopMerchant works', () => {
			const engine = getInsightsEngine();
			const txs = [
				makeTx({ merchant: 'A' }),
				makeTx({ merchant: 'A' }),
				makeTx({ merchant: 'B' })
			];

			const result = engine.getTopMerchant(txs, '2025-01');
			expect(result?.merchant).toBe('A');
			expect(result?.count).toBe(2);
		});

		it('getPaceProjection works', () => {
			const engine = getInsightsEngine();
			const budget = { month: '2025-01', income: 5000, savedAmount: 1000 };

			const result = engine.getPaceProjection(1000, budget, 15, 31, '2025-01');
			expect(result).not.toBeNull();
			expect(result!.available).toBe(4000);
		});

		it('getVelocityComparison works', () => {
			const engine = getInsightsEngine();

			const result = engine.getVelocityComparison(1500, 2400, 15, 30, 5, '2025-01');
			expect(result?.isUp).toBe(true);
			expect(result?.percentChange).toBe(25);
		});

		it('getAnomalies works with CategoryStats', () => {
			const engine = getInsightsEngine();
			const current = new Map([[1, 60]]);
			const categoryStats = new Map([[1, { mean: 30, stdDev: 10 }]]);
			const categories = [
				{ id: 1, name: 'Test', isActive: true, sortOrder: 0, isEssential: false }
			];

			const result = engine.getAnomalies(
				current,
				categoryStats,
				categories,
				{ minAverage: 20, zScoreThreshold: 2.0, maxToShow: 5 },
				'2025-01'
			);
			expect(result).toHaveLength(1);
			expect(result[0].zScore).toBe(3); // (60-30)/10
		});
	});
});
