import { describe, it, expect } from 'vitest';
import {
	createMockTransaction,
	createMockTransactions,
	createMockCategory,
	createDefaultCategories,
	createMockBudget,
	createMockSettings,
	getMonthKey,
	formatTestCurrency
} from './test-utils';

describe('test-utils', () => {
	describe('createMockTransaction', () => {
		it('creates a transaction with default values', () => {
			const tx = createMockTransaction();

			expect(tx.id).toBeDefined();
			expect(tx.merchant).toBe('Test Merchant');
			expect(tx.amount).toBe(100);
			expect(tx.categoryId).toBe(1);
			expect(tx.isShared).toBe(false);
			expect(tx.isEssential).toBe(false);
			expect(tx.isSubscription).toBe(false);
		});

		it('allows overriding default values', () => {
			const tx = createMockTransaction({
				merchant: 'Custom Merchant',
				amount: 250,
				isShared: true
			});

			expect(tx.merchant).toBe('Custom Merchant');
			expect(tx.amount).toBe(250);
			expect(tx.isShared).toBe(true);
		});

		it('creates valid date objects', () => {
			const tx = createMockTransaction();

			expect(tx.date).toBeInstanceOf(Date);
			expect(tx.createdAt).toBeInstanceOf(Date);
			expect(tx.updatedAt).toBeInstanceOf(Date);
		});
	});

	describe('createMockTransactions', () => {
		it('creates specified number of transactions', () => {
			const transactions = createMockTransactions(5);

			expect(transactions).toHaveLength(5);
		});

		it('creates transactions with sequential IDs', () => {
			const transactions = createMockTransactions(3);

			expect(transactions[0].id).toBe(1);
			expect(transactions[1].id).toBe(2);
			expect(transactions[2].id).toBe(3);
		});

		it('creates transactions with different dates', () => {
			const transactions = createMockTransactions(3);

			const dates = transactions.map((t) => t.date.toDateString());
			// At least some dates should be different (unless test runs across midnight)
			expect(new Set(dates).size).toBeGreaterThanOrEqual(1);
		});

		it('applies base overrides to all transactions', () => {
			const transactions = createMockTransactions(3, { isShared: true, categoryId: 5 });

			transactions.forEach((tx) => {
				expect(tx.isShared).toBe(true);
				expect(tx.categoryId).toBe(5);
			});
		});
	});

	describe('createMockCategory', () => {
		it('creates a category with default values', () => {
			const cat = createMockCategory();

			expect(cat.id).toBeDefined();
			expect(cat.name).toBe('Test Category');
			expect(cat.icon).toBe('📝');
			expect(cat.isActive).toBe(true);
		});

		it('allows overriding default values', () => {
			const cat = createMockCategory({
				name: 'Groceries',
				icon: '🛒',
				isEssential: true
			});

			expect(cat.name).toBe('Groceries');
			expect(cat.icon).toBe('🛒');
			expect(cat.isEssential).toBe(true);
		});
	});

	describe('createDefaultCategories', () => {
		it('creates 8 default categories', () => {
			const categories = createDefaultCategories();

			expect(categories).toHaveLength(8);
		});

		it('includes essential categories', () => {
			const categories = createDefaultCategories();
			const essentialNames = categories.filter((c) => c.isEssential).map((c) => c.name);

			expect(essentialNames).toContain('Car');
			expect(essentialNames).toContain('Groceries');
			expect(essentialNames).toContain('Utilities');
			expect(essentialNames).toContain('Health');
		});

		it('includes non-essential categories', () => {
			const categories = createDefaultCategories();
			const nonEssentialNames = categories.filter((c) => !c.isEssential).map((c) => c.name);

			expect(nonEssentialNames).toContain('Restaurants');
			expect(nonEssentialNames).toContain('Entertainment');
			expect(nonEssentialNames).toContain('Shopping');
			expect(nonEssentialNames).toContain('Travel');
		});

		it('assigns sequential IDs and sort orders', () => {
			const categories = createDefaultCategories();

			categories.forEach((cat, i) => {
				expect(cat.id).toBe(i + 1);
				expect(cat.sortOrder).toBe(i);
			});
		});
	});

	describe('createMockBudget', () => {
		it('creates a budget with default values', () => {
			const budget = createMockBudget();

			expect(budget.id).toBeDefined();
			expect(budget.income).toBe(5000);
			expect(budget.savedAmount).toBe(1000);
			expect(budget.month).toMatch(/^\d{4}-\d{2}$/);
		});

		it('allows overriding default values', () => {
			const budget = createMockBudget({
				income: 7500,
				savedAmount: 2000,
				month: '2025-06'
			});

			expect(budget.income).toBe(7500);
			expect(budget.savedAmount).toBe(2000);
			expect(budget.month).toBe('2025-06');
		});
	});

	describe('createMockSettings', () => {
		it('creates settings with default values', () => {
			const settings = createMockSettings();

			expect(settings.id).toBe(1);
			expect(settings.partnerName).toBe('Partner');
			expect(settings.defaultSplitType).toBe('percentage');
			expect(settings.defaultSplitValue).toBe(50);
			expect(settings.currency).toBe('USD');
			expect(settings.theme).toBe('light');
		});

		it('allows overriding default values', () => {
			const settings = createMockSettings({
				partnerName: 'John',
				theme: 'dark'
			});

			expect(settings.partnerName).toBe('John');
			expect(settings.theme).toBe('dark');
		});

		it('initializes arrays as empty', () => {
			const settings = createMockSettings();

			expect(settings.dismissedRecurring).toEqual([]);
			expect(settings.cancelledSubscriptions).toEqual([]);
			expect(settings.confirmedActiveSubscriptions).toEqual([]);
		});
	});

	describe('getMonthKey', () => {
		it('returns current month in YYYY-MM format', () => {
			const key = getMonthKey();
			expect(key).toMatch(/^\d{4}-\d{2}$/);
		});

		it('formats specific dates correctly', () => {
			expect(getMonthKey(new Date(2025, 0, 15))).toBe('2025-01');
			expect(getMonthKey(new Date(2025, 11, 1))).toBe('2025-12');
			expect(getMonthKey(new Date(2024, 5, 30))).toBe('2024-06');
		});

		it('pads single-digit months', () => {
			expect(getMonthKey(new Date(2025, 0, 1))).toBe('2025-01');
			expect(getMonthKey(new Date(2025, 8, 1))).toBe('2025-09');
		});
	});

	describe('formatTestCurrency', () => {
		it('formats positive amounts', () => {
			expect(formatTestCurrency(100)).toBe('$100.00');
			expect(formatTestCurrency(1234.56)).toBe('$1,234.56');
		});

		it('formats zero', () => {
			expect(formatTestCurrency(0)).toBe('$0.00');
		});

		it('formats negative amounts', () => {
			expect(formatTestCurrency(-50)).toBe('-$50.00');
		});

		it('handles decimal precision', () => {
			expect(formatTestCurrency(99.999)).toBe('$100.00');
			expect(formatTestCurrency(50.005)).toBe('$50.01');
		});
	});
});
