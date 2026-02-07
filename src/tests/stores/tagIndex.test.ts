import { describe, it, expect, beforeEach } from 'vitest';
import { TagIndex } from '$lib/stores/tags';

/**
 * Tests for TagIndex incremental operations (addTransaction, removeTransaction, updateTransaction).
 * These methods allow O(k) updates instead of O(n) rebuild for single-transaction CRUD.
 */
describe('TagIndex incremental operations', () => {
	let index: TagIndex;

	beforeEach(() => {
		index = new TagIndex();
	});

	describe('addTransaction', () => {
		it('adds tags from a transaction to the index', () => {
			index.addTransaction({ id: 1, notes: '#food #lunch' });
			expect(index.getAllTags()).toEqual(['food', 'lunch']);
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set([1]));
			expect(index.getTransactionIdsForTag('lunch')).toEqual(new Set([1]));
		});

		it('accumulates tags across multiple transactions', () => {
			index.addTransaction({ id: 1, notes: '#food' });
			index.addTransaction({ id: 2, notes: '#food #travel' });
			expect(index.getAllTags()).toEqual(['food', 'travel']);
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set([1, 2]));
			expect(index.getTransactionIdsForTag('travel')).toEqual(new Set([2]));
		});

		it('is a no-op for notes without tags', () => {
			index.addTransaction({ id: 1, notes: 'no tags here' });
			expect(index.getAllTags()).toEqual([]);
		});

		it('is a no-op for undefined notes', () => {
			index.addTransaction({ id: 1, notes: undefined });
			expect(index.getAllTags()).toEqual([]);
		});

		it('handles transaction without id', () => {
			index.addTransaction({ notes: '#food' });
			// Tag should appear in list but with no transaction IDs
			expect(index.getAllTags()).toEqual(['food']);
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set());
		});

		it('maintains sorted order when adding new tags', () => {
			index.addTransaction({ id: 1, notes: '#zebra' });
			index.addTransaction({ id: 2, notes: '#apple' });
			index.addTransaction({ id: 3, notes: '#mango' });
			expect(index.getAllTags()).toEqual(['apple', 'mango', 'zebra']);
		});
	});

	describe('removeTransaction', () => {
		it('removes a transaction ID from tag sets', () => {
			index.addTransaction({ id: 1, notes: '#food #lunch' });
			index.addTransaction({ id: 2, notes: '#food' });

			index.removeTransaction({ id: 1, notes: '#food #lunch' });

			// 'food' still has tx 2, but 'lunch' was only on tx 1
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set([2]));
			expect(index.getAllTags()).toEqual(['food']); // 'lunch' cleaned up
		});

		it('cleans up empty tag entries', () => {
			index.addTransaction({ id: 1, notes: '#solo-tag' });
			index.removeTransaction({ id: 1, notes: '#solo-tag' });

			expect(index.getAllTags()).toEqual([]);
			expect(index.getTransactionIdsForTag('solo-tag')).toEqual(new Set());
		});

		it('is a no-op for undefined id', () => {
			index.addTransaction({ id: 1, notes: '#food' });
			index.removeTransaction({ notes: '#food' }); // no id
			// Nothing removed
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set([1]));
		});

		it('is a no-op for notes without tags', () => {
			index.addTransaction({ id: 1, notes: '#food' });
			index.removeTransaction({ id: 1, notes: 'no tags' });
			// 'food' still indexed
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set([1]));
		});

		it('handles removing non-existent transaction gracefully', () => {
			index.addTransaction({ id: 1, notes: '#food' });
			// Remove tx 99 which was never added
			index.removeTransaction({ id: 99, notes: '#food' });
			// Original still intact
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set([1]));
		});
	});

	describe('updateTransaction', () => {
		it('replaces old tags with new tags', () => {
			index.addTransaction({ id: 1, notes: '#food #lunch' });

			index.updateTransaction(
				{ id: 1, notes: '#food #lunch' },
				{ id: 1, notes: '#food #dinner' }
			);

			expect(index.getAllTags()).toEqual(['dinner', 'food']);
			expect(index.getTransactionIdsForTag('food')).toEqual(new Set([1]));
			expect(index.getTransactionIdsForTag('dinner')).toEqual(new Set([1]));
			expect(index.getTransactionIdsForTag('lunch')).toEqual(new Set());
		});

		it('handles adding tags where none existed', () => {
			index.addTransaction({ id: 1, notes: 'no tags' });

			index.updateTransaction(
				{ id: 1, notes: 'no tags' },
				{ id: 1, notes: 'now has #tag' }
			);

			expect(index.getAllTags()).toEqual(['tag']);
			expect(index.getTransactionIdsForTag('tag')).toEqual(new Set([1]));
		});

		it('handles removing all tags', () => {
			index.addTransaction({ id: 1, notes: '#food #lunch' });

			index.updateTransaction(
				{ id: 1, notes: '#food #lunch' },
				{ id: 1, notes: 'no more tags' }
			);

			expect(index.getAllTags()).toEqual([]);
		});

		it('preserves other transactions when updating one', () => {
			index.addTransaction({ id: 1, notes: '#shared-tag #only-on-1' });
			index.addTransaction({ id: 2, notes: '#shared-tag #only-on-2' });

			index.updateTransaction(
				{ id: 1, notes: '#shared-tag #only-on-1' },
				{ id: 1, notes: '#new-tag' }
			);

			// shared-tag still has tx 2
			expect(index.getTransactionIdsForTag('shared-tag')).toEqual(new Set([2]));
			// only-on-1 cleaned up (was only on tx 1)
			expect(index.getTransactionIdsForTag('only-on-1')).toEqual(new Set());
			// new-tag added for tx 1
			expect(index.getTransactionIdsForTag('new-tag')).toEqual(new Set([1]));
		});
	});

	describe('incremental vs rebuild consistency', () => {
		it('produces same state whether built incrementally or via rebuild', () => {
			// Build incrementally
			const incremental = new TagIndex();
			incremental.addTransaction({ id: 1, notes: '#food #lunch' });
			incremental.addTransaction({ id: 2, notes: '#travel' });
			incremental.addTransaction({ id: 3, notes: '#food #dinner' });

			// Build via rebuild
			const rebuilt = new TagIndex();
			rebuilt.rebuild([
				{ id: 1, notes: '#food #lunch' },
				{ id: 2, notes: '#travel' },
				{ id: 3, notes: '#food #dinner' }
			] as any[]);

			expect(incremental.getAllTags()).toEqual(rebuilt.getAllTags());
			expect(incremental.getTransactionIdsForTag('food')).toEqual(
				rebuilt.getTransactionIdsForTag('food')
			);
			expect(incremental.getTransactionIdsForTag('travel')).toEqual(
				rebuilt.getTransactionIdsForTag('travel')
			);
			expect(incremental.getTransactionCountForTag('food')).toBe(
				rebuilt.getTransactionCountForTag('food')
			);
		});

		it('matches rebuild after add + remove sequence', () => {
			// Incremental: add 3, remove 1
			const incremental = new TagIndex();
			incremental.addTransaction({ id: 1, notes: '#food' });
			incremental.addTransaction({ id: 2, notes: '#food #travel' });
			incremental.addTransaction({ id: 3, notes: '#travel' });
			incremental.removeTransaction({ id: 2, notes: '#food #travel' });

			// Rebuild with just the remaining
			const rebuilt = new TagIndex();
			rebuilt.rebuild([
				{ id: 1, notes: '#food' },
				{ id: 3, notes: '#travel' }
			] as any[]);

			expect(incremental.getAllTags()).toEqual(rebuilt.getAllTags());
			expect(incremental.getTransactionIdsForTag('food')).toEqual(
				rebuilt.getTransactionIdsForTag('food')
			);
			expect(incremental.getTransactionIdsForTag('travel')).toEqual(
				rebuilt.getTransactionIdsForTag('travel')
			);
		});
	});
});
