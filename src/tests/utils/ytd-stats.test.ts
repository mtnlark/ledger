import { describe, it, expect } from 'vitest';
import { computeYTDStats } from '$lib/insights/calculations/ytd-stats';
import type { Transaction } from '$lib/db';

/** Minimal transaction factory */
function makeTx(
	overrides: Partial<Transaction> & Pick<Transaction, 'merchant' | 'date'>
): Transaction {
	return {
		amount: 10,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 100,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

describe('computeYTDStats - split transaction dedup', () => {
	it('does not inflate topMerchant count for split children', () => {
		const year = 2025;
		const txs = [
			// Split children from one Target visit (should count as 1)
			makeTx({
				merchant: 'Target',
				date: new Date('2025-03-10'),
				parentTransactionId: 100,
				categoryId: 1,
				amount: 60
			}),
			makeTx({
				merchant: 'Target',
				date: new Date('2025-03-10'),
				parentTransactionId: 100,
				categoryId: 2,
				amount: 40
			}),
			// Two real Costco visits
			makeTx({
				merchant: 'Costco',
				date: new Date('2025-01-05'),
				amount: 80
			}),
			makeTx({
				merchant: 'Costco',
				date: new Date('2025-02-15'),
				amount: 90
			})
		];

		const result = computeYTDStats(txs, year);
		// Costco: 2 visits, Target: 1 visit (split deduped)
		expect(result.topMerchant).toEqual({ merchant: 'Costco', count: 2 });
	});

	it('counts split children from different parents as separate visits', () => {
		const year = 2025;
		const txs = [
			// First Target split visit
			makeTx({
				merchant: 'Target',
				date: new Date('2025-01-10'),
				parentTransactionId: 100,
				categoryId: 1
			}),
			makeTx({
				merchant: 'Target',
				date: new Date('2025-01-10'),
				parentTransactionId: 100,
				categoryId: 2
			}),
			// Second Target split visit
			makeTx({
				merchant: 'Target',
				date: new Date('2025-02-20'),
				parentTransactionId: 200,
				categoryId: 1
			}),
			makeTx({
				merchant: 'Target',
				date: new Date('2025-02-20'),
				parentTransactionId: 200,
				categoryId: 3
			}),
			// One Costco visit
			makeTx({
				merchant: 'Costco',
				date: new Date('2025-03-01')
			})
		];

		const result = computeYTDStats(txs, year);
		// Target: 2 visits (two different parents), Costco: 1
		expect(result.topMerchant).toEqual({ merchant: 'Target', count: 2 });
	});
});
