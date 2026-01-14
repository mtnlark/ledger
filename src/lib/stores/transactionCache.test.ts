import { describe, it, expect, beforeEach } from 'vitest';
import {
	TransactionCache,
	type CachedTransaction
} from './transactionCache';

// Mock transaction data
function createMockTransaction(overrides: Partial<CachedTransaction> = {}): CachedTransaction {
	const now = new Date();
	return {
		id: 1,
		date: now,
		merchant: 'Test Merchant',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage' as const,
		splitValue: 50,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

describe('TransactionCache', () => {
	let cache: TransactionCache;

	beforeEach(() => {
		cache = new TransactionCache();
	});

	describe('initialization', () => {
		it('starts empty', () => {
			expect(cache.size).toBe(0);
			expect(cache.isLoaded).toBe(false);
		});

		it('can be initialized with transactions', () => {
			const transactions = [
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 }),
				createMockTransaction({ id: 3 })
			];

			cache.initialize(transactions);

			expect(cache.size).toBe(3);
			expect(cache.isLoaded).toBe(true);
		});

		it('initialize clears existing data', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);
			expect(cache.size).toBe(1);

			cache.initialize([createMockTransaction({ id: 2 }), createMockTransaction({ id: 3 })]);
			expect(cache.size).toBe(2);
			expect(cache.get(1)).toBeUndefined();
		});
	});

	describe('get', () => {
		it('returns transaction by id', () => {
			const tx = createMockTransaction({ id: 42, merchant: 'Target' });
			cache.initialize([tx]);

			const result = cache.get(42);
			expect(result?.merchant).toBe('Target');
		});

		it('returns undefined for non-existent id', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);
			expect(cache.get(999)).toBeUndefined();
		});
	});

	describe('add', () => {
		it('adds a new transaction', () => {
			cache.initialize([]);
			const tx = createMockTransaction({ id: 5, merchant: 'New Store' });

			cache.add(tx);

			expect(cache.size).toBe(1);
			expect(cache.get(5)?.merchant).toBe('New Store');
		});

		it('overwrites existing transaction with same id', () => {
			cache.initialize([createMockTransaction({ id: 1, merchant: 'Old' })]);

			cache.add(createMockTransaction({ id: 1, merchant: 'New' }));

			expect(cache.size).toBe(1);
			expect(cache.get(1)?.merchant).toBe('New');
		});

		it('increments version on add', () => {
			cache.initialize([]);
			const initialVersion = cache.version;

			cache.add(createMockTransaction({ id: 1 }));

			expect(cache.version).toBe(initialVersion + 1);
		});
	});

	describe('update', () => {
		it('updates an existing transaction', () => {
			cache.initialize([createMockTransaction({ id: 1, amount: 50 })]);

			cache.update(1, { amount: 100 });

			expect(cache.get(1)?.amount).toBe(100);
		});

		it('preserves other fields when updating', () => {
			cache.initialize([createMockTransaction({ id: 1, merchant: 'Store', amount: 50 })]);

			cache.update(1, { amount: 100 });

			expect(cache.get(1)?.merchant).toBe('Store');
		});

		it('does nothing for non-existent id', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);

			cache.update(999, { amount: 100 });

			expect(cache.size).toBe(1);
		});

		it('increments version on update', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);
			const initialVersion = cache.version;

			cache.update(1, { amount: 200 });

			expect(cache.version).toBe(initialVersion + 1);
		});
	});

	describe('remove', () => {
		it('removes a transaction by id', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 })
			]);

			cache.remove(1);

			expect(cache.size).toBe(1);
			expect(cache.get(1)).toBeUndefined();
			expect(cache.get(2)).toBeDefined();
		});

		it('does nothing for non-existent id', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);

			cache.remove(999);

			expect(cache.size).toBe(1);
		});

		it('increments version on remove', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);
			const initialVersion = cache.version;

			cache.remove(1);

			expect(cache.version).toBe(initialVersion + 1);
		});
	});

	describe('bulkRemove', () => {
		it('removes multiple transactions', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 }),
				createMockTransaction({ id: 3 }),
				createMockTransaction({ id: 4 })
			]);

			cache.bulkRemove([1, 3]);

			expect(cache.size).toBe(2);
			expect(cache.get(1)).toBeUndefined();
			expect(cache.get(2)).toBeDefined();
			expect(cache.get(3)).toBeUndefined();
			expect(cache.get(4)).toBeDefined();
		});

		it('increments version once for bulk operation', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 })
			]);
			const initialVersion = cache.version;

			cache.bulkRemove([1, 2]);

			expect(cache.version).toBe(initialVersion + 1);
		});
	});

	describe('bulkUpdate', () => {
		it('updates multiple transactions', () => {
			cache.initialize([
				createMockTransaction({ id: 1, categoryId: 1 }),
				createMockTransaction({ id: 2, categoryId: 1 }),
				createMockTransaction({ id: 3, categoryId: 2 })
			]);

			cache.bulkUpdate([1, 2], { categoryId: 5 });

			expect(cache.get(1)?.categoryId).toBe(5);
			expect(cache.get(2)?.categoryId).toBe(5);
			expect(cache.get(3)?.categoryId).toBe(2);
		});

		it('increments version once for bulk operation', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 })
			]);
			const initialVersion = cache.version;

			cache.bulkUpdate([1, 2], { categoryId: 5 });

			expect(cache.version).toBe(initialVersion + 1);
		});
	});

	describe('getAll', () => {
		it('returns all transactions', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 }),
				createMockTransaction({ id: 3 })
			]);

			const all = cache.getAll();

			expect(all.length).toBe(3);
		});

		it('excludes split parent transactions', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2, isSplitParent: true }),
				createMockTransaction({ id: 3 })
			]);

			const all = cache.getAll();

			expect(all.length).toBe(2);
			expect(all.find(t => t.id === 2)).toBeUndefined();
		});

		it('returns empty array when not loaded', () => {
			expect(cache.getAll()).toEqual([]);
		});
	});

	describe('getForMonth', () => {
		it('returns transactions for a specific month', () => {
			cache.initialize([
				createMockTransaction({ id: 1, date: new Date('2024-01-15') }),
				createMockTransaction({ id: 2, date: new Date('2024-02-15') }),
				createMockTransaction({ id: 3, date: new Date('2024-01-20') })
			]);

			const jan = cache.getForMonth('2024-01');

			expect(jan.length).toBe(2);
			expect(jan.map(t => t.id).sort()).toEqual([1, 3]);
		});

		it('excludes split parent transactions', () => {
			cache.initialize([
				createMockTransaction({ id: 1, date: new Date('2024-01-15') }),
				createMockTransaction({ id: 2, date: new Date('2024-01-15'), isSplitParent: true }),
				createMockTransaction({ id: 3, date: new Date('2024-01-20') })
			]);

			const jan = cache.getForMonth('2024-01');

			expect(jan.length).toBe(2);
		});

		it('returns empty array for month with no transactions', () => {
			cache.initialize([
				createMockTransaction({ id: 1, date: new Date('2024-01-15') })
			]);

			const feb = cache.getForMonth('2024-02');

			expect(feb.length).toBe(0);
		});
	});

	describe('getForDateRange', () => {
		it('returns transactions within date range', () => {
			cache.initialize([
				createMockTransaction({ id: 1, date: new Date('2024-01-01') }),
				createMockTransaction({ id: 2, date: new Date('2024-01-15') }),
				createMockTransaction({ id: 3, date: new Date('2024-02-01') }),
				createMockTransaction({ id: 4, date: new Date('2024-03-01') })
			]);

			const result = cache.getForDateRange(
				new Date('2024-01-10'),
				new Date('2024-02-15')
			);

			expect(result.length).toBe(2);
			expect(result.map(t => t.id).sort()).toEqual([2, 3]);
		});

		it('includes boundary dates', () => {
			cache.initialize([
				createMockTransaction({ id: 1, date: new Date('2024-01-15') }),
				createMockTransaction({ id: 2, date: new Date('2024-01-20') })
			]);

			const result = cache.getForDateRange(
				new Date('2024-01-15'),
				new Date('2024-01-20')
			);

			expect(result.length).toBe(2);
		});

		it('excludes split parent transactions', () => {
			cache.initialize([
				createMockTransaction({ id: 1, date: new Date('2024-01-15') }),
				createMockTransaction({ id: 2, date: new Date('2024-01-15'), isSplitParent: true })
			]);

			const result = cache.getForDateRange(
				new Date('2024-01-01'),
				new Date('2024-01-31')
			);

			expect(result.length).toBe(1);
		});
	});

	describe('invalidate', () => {
		it('clears all data', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 })
			]);

			cache.invalidate();

			expect(cache.size).toBe(0);
			expect(cache.isLoaded).toBe(false);
		});

		it('increments version on invalidate', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);
			const initialVersion = cache.version;

			cache.invalidate();

			expect(cache.version).toBe(initialVersion + 1);
		});
	});

	describe('version tracking', () => {
		it('version starts at 0', () => {
			expect(cache.version).toBe(0);
		});

		it('version increments with each operation', () => {
			cache.initialize([createMockTransaction({ id: 1 })]);
			expect(cache.version).toBe(1);

			cache.add(createMockTransaction({ id: 2 }));
			expect(cache.version).toBe(2);

			cache.update(1, { amount: 200 });
			expect(cache.version).toBe(3);

			cache.remove(2);
			expect(cache.version).toBe(4);
		});
	});

	describe('markSplitParent', () => {
		it('marks a transaction as split parent', () => {
			cache.initialize([createMockTransaction({ id: 1, isSplitParent: false })]);

			cache.markSplitParent(1);

			expect(cache.get(1)?.isSplitParent).toBe(true);
		});

		it('transaction is excluded from getAll after marking', () => {
			cache.initialize([
				createMockTransaction({ id: 1 }),
				createMockTransaction({ id: 2 })
			]);

			cache.markSplitParent(1);

			const all = cache.getAll();
			expect(all.length).toBe(1);
			expect(all[0].id).toBe(2);
		});
	});
});
