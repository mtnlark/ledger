import { describe, it, expect } from 'vitest';
import { calculateNeedsVsWants, calculateNeedsVsWantsFull } from './needs-wants';
import type { Transaction } from '$lib/db';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		date: new Date('2025-01-15'),
		merchant: 'Test',
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

describe('calculateNeedsVsWants', () => {
	it('returns null for empty transactions', () => {
		expect(calculateNeedsVsWants([])).toBeNull();
	});

	it('returns null when total spending is zero', () => {
		const txs = [makeTx({ amount: 0 })];
		expect(calculateNeedsVsWants(txs)).toBeNull();
	});

	it('calculates correct breakdown for all needs', () => {
		const txs = [
			makeTx({ amount: 100, isEssential: true }),
			makeTx({ amount: 50, isEssential: true })
		];
		const result = calculateNeedsVsWants(txs);
		expect(result).toEqual({
			needsTotal: 150,
			wantsTotal: 0,
			needsPercent: 100
		});
	});

	it('calculates correct breakdown for mixed spending', () => {
		const txs = [
			makeTx({ amount: 75, isEssential: true }),
			makeTx({ amount: 25, isEssential: false })
		];
		const result = calculateNeedsVsWants(txs);
		expect(result).toEqual({
			needsTotal: 75,
			wantsTotal: 25,
			needsPercent: 75
		});
	});

	it('accounts for shared transactions', () => {
		const txs = [
			makeTx({ amount: 100, isEssential: true, isShared: true, partnerShare: 50 }),
			makeTx({ amount: 50, isEssential: false })
		];
		const result = calculateNeedsVsWants(txs);
		expect(result).toEqual({
			needsTotal: 50,
			wantsTotal: 50,
			needsPercent: 50
		});
	});
});

describe('calculateNeedsVsWantsFull', () => {
	it('returns zero stats for empty transactions', () => {
		const result = calculateNeedsVsWantsFull([]);
		expect(result).toEqual({
			needs: 0,
			wants: 0,
			total: 0,
			needsPercent: 0,
			wantsPercent: 0
		});
	});

	it('includes wantsPercent', () => {
		const txs = [
			makeTx({ amount: 60, isEssential: true }),
			makeTx({ amount: 40, isEssential: false })
		];
		const result = calculateNeedsVsWantsFull(txs);
		expect(result.needsPercent).toBe(60);
		expect(result.wantsPercent).toBe(40);
		expect(result.total).toBe(100);
	});
});
