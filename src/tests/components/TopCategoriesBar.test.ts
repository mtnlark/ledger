// src/tests/components/TopCategoriesBar.test.ts
import { describe, it, expect } from 'vitest';
import { computeTopCategories } from '$lib/components/insights/TopCategoriesBar.svelte';

describe('computeTopCategories', () => {
	const mockCategories = [
		{ id: 1, name: 'Groceries', icon: '🛒', isActive: true, sortOrder: 0, isEssential: true },
		{ id: 2, name: 'Restaurants', icon: '🍽️', isActive: true, sortOrder: 1, isEssential: false },
		{ id: 3, name: 'Rent', icon: '🏠', isActive: true, sortOrder: 2, isEssential: true },
		{ id: 4, name: 'Fun', icon: '🎉', isActive: true, sortOrder: 3, isEssential: false },
		{ id: 5, name: 'Gas', icon: '⛽', isActive: true, sortOrder: 4, isEssential: true },
		{ id: 6, name: 'Utilities', icon: '💡', isActive: true, sortOrder: 5, isEssential: true },
	];

	const mockTransactions = [
		{ categoryId: 1, amount: 620, isShared: false, partnerShare: 0 },
		{ categoryId: 2, amount: 412, isShared: false, partnerShare: 0 },
		{ categoryId: 3, amount: 350, isShared: false, partnerShare: 0 },
		{ categoryId: 4, amount: 245, isShared: false, partnerShare: 0 },
		{ categoryId: 5, amount: 180, isShared: false, partnerShare: 0 },
		{ categoryId: 6, amount: 143, isShared: false, partnerShare: 0 },
	];

	it('returns top 5 categories plus Other', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		expect(result.length).toBe(6); // 5 + Other
		expect(result[5].name).toBe('Other');
	});

	it('sorts by spending descending', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		expect(result[0].name).toBe('Groceries');
		expect(result[0].amount).toBe(620);
	});

	it('groups remaining categories into Other with count', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		const other = result.find(r => r.name === 'Other');
		expect(other?.amount).toBe(143); // Just Utilities
		expect(other?.count).toBe(1);
	});

	it('calculates percentages correctly', () => {
		const result = computeTopCategories(mockTransactions as any, mockCategories, 5);
		const total = 620 + 412 + 350 + 245 + 180 + 143;
		expect(result[0].percent).toBe(Math.round((620 / total) * 100));
	});

	it('handles shared transactions (user portion only)', () => {
		const sharedTxns = [
			{ categoryId: 1, amount: 100, isShared: true, partnerShare: 50 },
		];
		const result = computeTopCategories(sharedTxns as any, mockCategories, 5);
		expect(result[0].amount).toBe(50);
	});
});
