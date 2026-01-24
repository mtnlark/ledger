import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	getCategoryBudgetsForMonth,
	getCategoryBudget,
	saveCategoryBudget,
	deleteCategoryBudget,
	calculateSuggestedBudget,
	generateAllSuggestions,
	copyBudgetsFromMonth,
	getAllCategorySpending
} from './categoryBudget';

describe('CategoryBudget Operations', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	describe('getCategoryBudgetsForMonth', () => {
		it('returns empty array when no budgets exist', async () => {
			const budgets = await getCategoryBudgetsForMonth('2024-06');
			expect(budgets).toEqual([]);
		});

		it('returns budgets for the specified month only', async () => {
			// Add budgets for different months
			await saveCategoryBudget(1, '2024-06', 500);
			await saveCategoryBudget(2, '2024-06', 300);
			await saveCategoryBudget(1, '2024-07', 550);

			const june = await getCategoryBudgetsForMonth('2024-06');
			const july = await getCategoryBudgetsForMonth('2024-07');

			expect(june.length).toBe(2);
			expect(july.length).toBe(1);
		});
	});

	describe('getCategoryBudget', () => {
		it('returns null when budget does not exist', async () => {
			const budget = await getCategoryBudget(1, '2024-06');
			expect(budget).toBeNull();
		});

		it('returns the correct budget', async () => {
			await saveCategoryBudget(1, '2024-06', 500);

			const budget = await getCategoryBudget(1, '2024-06');
			expect(budget).not.toBeNull();
			expect(budget?.budgetAmount).toBe(500);
			expect(budget?.categoryId).toBe(1);
			expect(budget?.month).toBe('2024-06');
		});
	});

	describe('saveCategoryBudget', () => {
		it('creates a new budget when none exists', async () => {
			await saveCategoryBudget(1, '2024-06', 500);

			const budget = await getCategoryBudget(1, '2024-06');
			expect(budget).not.toBeNull();
			expect(budget?.budgetAmount).toBe(500);
		});

		it('updates existing budget', async () => {
			await saveCategoryBudget(1, '2024-06', 500);
			await saveCategoryBudget(1, '2024-06', 600);

			const budgets = await getCategoryBudgetsForMonth('2024-06');
			expect(budgets.length).toBe(1);
			expect(budgets[0].budgetAmount).toBe(600);
		});

		it('sets createdAt and updatedAt timestamps', async () => {
			await saveCategoryBudget(1, '2024-06', 500);

			const budget = await getCategoryBudget(1, '2024-06');
			expect(budget?.createdAt).toBeInstanceOf(Date);
			expect(budget?.updatedAt).toBeInstanceOf(Date);
		});
	});

	describe('deleteCategoryBudget', () => {
		it('removes the budget', async () => {
			await saveCategoryBudget(1, '2024-06', 500);
			await deleteCategoryBudget(1, '2024-06');

			const budget = await getCategoryBudget(1, '2024-06');
			expect(budget).toBeNull();
		});

		it('does nothing if budget does not exist', async () => {
			// Should not throw
			await expect(deleteCategoryBudget(999, '2024-06')).resolves.toBeUndefined();
		});
	});

	describe('calculateSuggestedBudget', () => {
		it('returns 0 when no spending history', async () => {
			const suggested = await calculateSuggestedBudget(1, '2024-06');
			expect(suggested).toBe(0);
		});

		it('calculates average of previous months spending', async () => {
			// Add transactions for previous 3 months
			// March: $100, April: $200, May: $150 -> avg = $150
			const now = new Date();
			await db.transactions.bulkAdd([
				{
					date: new Date('2024-03-15'),
					merchant: 'Store A',
					amount: 100,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				},
				{
					date: new Date('2024-04-15'),
					merchant: 'Store B',
					amount: 200,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				},
				{
					date: new Date('2024-05-15'),
					merchant: 'Store C',
					amount: 150,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				}
			]);

			const suggested = await calculateSuggestedBudget(1, '2024-06');
			// Mean of [100,200,150] = 150, stdDev ≈ 40.82, suggestion = 150 + 0.5*40.82 ≈ 170
			expect(suggested).toBe(170);
		});

		it('rounds to nearest $5', async () => {
			const now = new Date();
			// Single month with $123 -> should round to $125
			await db.transactions.add({
				date: new Date('2024-05-15'),
				merchant: 'Store',
				amount: 123,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: now,
				updatedAt: now
			});

			const suggested = await calculateSuggestedBudget(1, '2024-06');
			expect(suggested).toBe(125);
		});

		it('only considers user portion for shared transactions', async () => {
			const now = new Date();
			// $200 transaction, split 50/50 -> user portion = $100
			await db.transactions.add({
				date: new Date('2024-05-15'),
				merchant: 'Shared Store',
				amount: 200,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				partnerShare: 100,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: now,
				updatedAt: now
			});

			const suggested = await calculateSuggestedBudget(1, '2024-06');
			expect(suggested).toBe(100);
		});

		it('ignores months with zero spending', async () => {
			const now = new Date();
			// Only May has spending ($200)
			await db.transactions.add({
				date: new Date('2024-05-15'),
				merchant: 'Store',
				amount: 200,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: now,
				updatedAt: now
			});

			const suggested = await calculateSuggestedBudget(1, '2024-06');
			expect(suggested).toBe(200); // Only uses May, ignores empty March/April
		});

		it('σ-aware suggestions exceed raw average for variable spending', async () => {
			const now = new Date();
			// Highly variable: $50, $300, $150 → mean=166.67, stdDev≈102.14
			// suggestion = 166.67 + 0.5*102.14 ≈ 217.74 → rounded to 220
			// Raw average would be 166.67 → 165
			await db.transactions.bulkAdd([
				{
					date: new Date('2024-03-15'),
					merchant: 'A',
					amount: 50,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				},
				{
					date: new Date('2024-04-15'),
					merchant: 'B',
					amount: 300,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				},
				{
					date: new Date('2024-05-15'),
					merchant: 'C',
					amount: 150,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				}
			]);

			const suggested = await calculateSuggestedBudget(1, '2024-06');
			// Should be higher than raw average (165) due to σ headroom
			expect(suggested).toBeGreaterThan(165);
			expect(suggested).toBe(220);
		});
	});

	describe('generateAllSuggestions', () => {
		it('returns suggestions for all active categories', async () => {
			const suggestions = await generateAllSuggestions('2024-06');

			// Should have entries for all 22 default categories
			expect(suggestions.size).toBe(22);
		});

		it('returns 0 for categories with no spending', async () => {
			const suggestions = await generateAllSuggestions('2024-06');

			// All should be 0 since no transactions
			for (const amount of suggestions.values()) {
				expect(amount).toBe(0);
			}
		});
	});

	describe('copyBudgetsFromMonth', () => {
		it('copies all budgets to target month', async () => {
			await saveCategoryBudget(1, '2024-05', 500);
			await saveCategoryBudget(2, '2024-05', 300);

			await copyBudgetsFromMonth('2024-05', '2024-06');

			const june = await getCategoryBudgetsForMonth('2024-06');
			expect(june.length).toBe(2);
			expect(june.find((b) => b.categoryId === 1)?.budgetAmount).toBe(500);
			expect(june.find((b) => b.categoryId === 2)?.budgetAmount).toBe(300);
		});

		it('does not overwrite existing budgets in target month', async () => {
			await saveCategoryBudget(1, '2024-05', 500);
			await saveCategoryBudget(1, '2024-06', 600); // Existing

			await copyBudgetsFromMonth('2024-05', '2024-06');

			const budget = await getCategoryBudget(1, '2024-06');
			expect(budget?.budgetAmount).toBe(600); // Not overwritten
		});
	});

	describe('getAllCategorySpending', () => {
		it('returns empty map when no transactions', async () => {
			const spending = await getAllCategorySpending('2024-06');
			expect(spending.size).toBe(0);
		});

		it('calculates spending by category', async () => {
			const now = new Date();
			await db.transactions.bulkAdd([
				{
					date: new Date('2024-06-15'),
					merchant: 'Store A',
					amount: 100,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				},
				{
					date: new Date('2024-06-20'),
					merchant: 'Store B',
					amount: 50,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				},
				{
					date: new Date('2024-06-25'),
					merchant: 'Store C',
					amount: 200,
					categoryId: 2,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: now,
					updatedAt: now
				}
			]);

			const spending = await getAllCategorySpending('2024-06');
			expect(spending.get(1)).toBe(150);
			expect(spending.get(2)).toBe(200);
		});

		it('only includes user portion for shared transactions', async () => {
			const now = new Date();
			await db.transactions.add({
				date: new Date('2024-06-15'),
				merchant: 'Shared Store',
				amount: 200,
				categoryId: 1,
				isShared: true,
				splitType: 'percentage',
				splitValue: 0.5,
				partnerShare: 100,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: now,
				updatedAt: now
			});

			const spending = await getAllCategorySpending('2024-06');
			expect(spending.get(1)).toBe(100); // User's portion only
		});

		it('excludes split parent transactions', async () => {
			const now = new Date();
			await db.transactions.bulkAdd([
				{
					date: new Date('2024-06-15'),
					merchant: 'Store',
					amount: 100,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					isSplitParent: true, // Should be excluded
					createdAt: now,
					updatedAt: now
				},
				{
					date: new Date('2024-06-15'),
					merchant: 'Store - Part 1',
					amount: 60,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					parentTransactionId: 1,
					createdAt: now,
					updatedAt: now
				}
			]);

			const spending = await getAllCategorySpending('2024-06');
			expect(spending.get(1)).toBe(60); // Only the child transaction
		});
	});
});
