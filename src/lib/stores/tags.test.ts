import { describe, it, expect, beforeEach } from 'vitest';
import { TagIndex } from './tags.js';
import type { Transaction } from '$lib/db/constants.js';

function createMockTransaction(id: number, notes?: string): Transaction {
	return {
		id,
		date: new Date(),
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
		notes,
		createdAt: new Date(),
		updatedAt: new Date()
	};
}

describe('TagIndex', () => {
	let tagIndex: TagIndex;

	beforeEach(() => {
		tagIndex = new TagIndex();
	});

	describe('rebuild', () => {
		it('builds index from transactions', () => {
			const transactions = [
				createMockTransaction(1, 'Trip to #italy'),
				createMockTransaction(2, 'Dinner #food #italy'),
				createMockTransaction(3, 'Work #business')
			];

			tagIndex.rebuild(transactions);

			expect(tagIndex.getAllTags()).toEqual(['business', 'food', 'italy']);
		});

		it('clears previous data', () => {
			const transactions1 = [createMockTransaction(1, '#oldtag')];
			tagIndex.rebuild(transactions1);
			expect(tagIndex.getAllTags()).toContain('oldtag');

			const transactions2 = [createMockTransaction(2, '#newtag')];
			tagIndex.rebuild(transactions2);
			expect(tagIndex.getAllTags()).not.toContain('oldtag');
			expect(tagIndex.getAllTags()).toContain('newtag');
		});

		it('handles transactions without notes', () => {
			const transactions = [
				createMockTransaction(1, undefined),
				createMockTransaction(2, ''),
				createMockTransaction(3, '#valid')
			];

			tagIndex.rebuild(transactions);

			expect(tagIndex.getAllTags()).toEqual(['valid']);
		});

		it('handles transactions without IDs', () => {
			const txWithoutId = createMockTransaction(1, '#test');
			delete txWithoutId.id;

			tagIndex.rebuild([txWithoutId]);

			// Should handle gracefully - no ID means no mapping
			expect(tagIndex.getAllTags()).toEqual(['test']);
			expect(tagIndex.getTransactionIdsForTag('test').size).toBe(0);
		});
	});

	describe('getAllTags', () => {
		it('returns empty array when no tags', () => {
			expect(tagIndex.getAllTags()).toEqual([]);
		});

		it('returns empty array after rebuild with no tagged transactions', () => {
			const transactions = [
				createMockTransaction(1, 'No tags here'),
				createMockTransaction(2, undefined)
			];

			tagIndex.rebuild(transactions);

			expect(tagIndex.getAllTags()).toEqual([]);
		});

		it('returns sorted tags', () => {
			const transactions = [
				createMockTransaction(1, '#zebra #alpha'),
				createMockTransaction(2, '#middle')
			];

			tagIndex.rebuild(transactions);

			expect(tagIndex.getAllTags()).toEqual(['alpha', 'middle', 'zebra']);
		});

		it('returns unique tags across all transactions', () => {
			const transactions = [
				createMockTransaction(1, '#italy #food'),
				createMockTransaction(2, '#italy #travel'),
				createMockTransaction(3, '#food')
			];

			tagIndex.rebuild(transactions);

			expect(tagIndex.getAllTags()).toEqual(['food', 'italy', 'travel']);
		});
	});

	describe('getTagSuggestions', () => {
		beforeEach(() => {
			const transactions = [
				createMockTransaction(1, '#italy #travel'),
				createMockTransaction(2, '#food #fun'),
				createMockTransaction(3, '#fitness')
			];
			tagIndex.rebuild(transactions);
		});

		it('filters by prefix', () => {
			expect(tagIndex.getTagSuggestions('f')).toEqual(['fitness', 'food', 'fun']);
		});

		it('is case insensitive', () => {
			expect(tagIndex.getTagSuggestions('F')).toEqual(['fitness', 'food', 'fun']);
			expect(tagIndex.getTagSuggestions('TRAVEL')).toEqual(['travel']);
		});

		it('returns all tags for empty prefix', () => {
			expect(tagIndex.getTagSuggestions('')).toEqual(['fitness', 'food', 'fun', 'italy', 'travel']);
		});

		it('returns empty array when no matches', () => {
			expect(tagIndex.getTagSuggestions('xyz')).toEqual([]);
		});

		it('matches exact prefix only', () => {
			expect(tagIndex.getTagSuggestions('it')).toEqual(['italy']);
			expect(tagIndex.getTagSuggestions('ita')).toEqual(['italy']);
			expect(tagIndex.getTagSuggestions('italy')).toEqual(['italy']);
			expect(tagIndex.getTagSuggestions('italyx')).toEqual([]);
		});
	});

	describe('getTransactionIdsForTag', () => {
		it('returns correct IDs', () => {
			const transactions = [
				createMockTransaction(1, '#italy'),
				createMockTransaction(2, '#italy #food'),
				createMockTransaction(3, '#food')
			];

			tagIndex.rebuild(transactions);

			const italyIds = tagIndex.getTransactionIdsForTag('italy');
			expect(italyIds).toEqual(new Set([1, 2]));

			const foodIds = tagIndex.getTransactionIdsForTag('food');
			expect(foodIds).toEqual(new Set([2, 3]));
		});

		it('returns empty set for unknown tag', () => {
			const transactions = [createMockTransaction(1, '#italy')];
			tagIndex.rebuild(transactions);

			expect(tagIndex.getTransactionIdsForTag('unknown')).toEqual(new Set());
		});

		it('is case insensitive', () => {
			const transactions = [createMockTransaction(1, '#Italy')];
			tagIndex.rebuild(transactions);

			expect(tagIndex.getTransactionIdsForTag('italy')).toEqual(new Set([1]));
			expect(tagIndex.getTransactionIdsForTag('ITALY')).toEqual(new Set([1]));
			expect(tagIndex.getTransactionIdsForTag('Italy')).toEqual(new Set([1]));
		});
	});

	describe('getTransactionCountForTag', () => {
		it('returns correct count', () => {
			const transactions = [
				createMockTransaction(1, '#italy'),
				createMockTransaction(2, '#italy'),
				createMockTransaction(3, '#italy'),
				createMockTransaction(4, '#food')
			];

			tagIndex.rebuild(transactions);

			expect(tagIndex.getTransactionCountForTag('italy')).toBe(3);
			expect(tagIndex.getTransactionCountForTag('food')).toBe(1);
		});

		it('returns 0 for unknown tag', () => {
			const transactions = [createMockTransaction(1, '#italy')];
			tagIndex.rebuild(transactions);

			expect(tagIndex.getTransactionCountForTag('unknown')).toBe(0);
		});

		it('is case insensitive', () => {
			const transactions = [
				createMockTransaction(1, '#Italy'),
				createMockTransaction(2, '#ITALY')
			];
			tagIndex.rebuild(transactions);

			expect(tagIndex.getTransactionCountForTag('italy')).toBe(2);
			expect(tagIndex.getTransactionCountForTag('ITALY')).toBe(2);
		});
	});
});
