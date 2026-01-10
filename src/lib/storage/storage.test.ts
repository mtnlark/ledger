import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, type Category } from '$lib/db';
import {
	initializeStorage,
	persistData,
	createBackup,
	withPersistence,
	getAllData,
	replaceAllData,
	isStorageInitialized,
	resetStorageState,
	StorageInitError,
	type StoredData
} from './index';

describe('Storage Layer', () => {
	beforeEach(async () => {
		// Reset storage state before each test
		resetStorageState();
		await db.delete();
		await db.open();
	});

	afterEach(async () => {
		resetStorageState();
		await db.delete();
	});

	describe('initializeStorage', () => {
		it('initializes database with defaults in non-Tauri environment', async () => {
			// In test environment, initializeStorage should call initializeDatabase
			await initializeStorage();

			const categories = await db.categories.toArray();
			const settings = await db.settings.get(1);

			expect(categories.length).toBe(22); // Default categories
			expect(settings).toBeDefined();
			expect(settings?.partnerName).toBe('Partner');
		});

		it('does not throw when called multiple times', async () => {
			// First call
			await initializeStorage();
			// Second call should be a no-op (due to initialized flag)
			await expect(initializeStorage()).resolves.toBeUndefined();
		});
	});

	describe('persistData', () => {
		it('is a no-op in non-Tauri environment (does not throw)', async () => {
			await initializeDatabase();
			// Should not throw in test environment
			await expect(persistData()).resolves.toBeUndefined();
		});
	});

	describe('createBackup', () => {
		it('is a no-op in non-Tauri environment (does not throw)', async () => {
			await initializeDatabase();
			// Should not throw in test environment
			await expect(createBackup()).resolves.toBeUndefined();
		});
	});

	describe('withPersistence', () => {
		it('executes operation and returns result', async () => {
			await initializeDatabase();

			const result = await withPersistence(async () => {
				return 'test-result';
			});

			expect(result).toBe('test-result');
		});

		it('executes async operations correctly', async () => {
			await initializeDatabase();

			const result = await withPersistence(async () => {
				await db.transactions.add({
					date: new Date(),
					merchant: 'Test Merchant',
					amount: 50,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: new Date(),
					updatedAt: new Date()
				});
				return 'added';
			});

			expect(result).toBe('added');
			const count = await db.transactions.count();
			expect(count).toBe(1);
		});

		it('propagates errors from operation', async () => {
			await initializeDatabase();

			await expect(
				withPersistence(async () => {
					throw new Error('Test error');
				})
			).rejects.toThrow('Test error');
		});
	});

	describe('getAllData', () => {
		it('returns all data with correct structure', async () => {
			await initializeDatabase();

			const data = await getAllData();

			expect(data.version).toBe('1.0');
			expect(data.exportedAt).toBeDefined();
			expect(Array.isArray(data.transactions)).toBe(true);
			expect(Array.isArray(data.categories)).toBe(true);
			expect(Array.isArray(data.monthlyBudgets)).toBe(true);
			expect(Array.isArray(data.categoryBudgets)).toBe(true);
			expect(data.settings).toBeDefined();
		});

		it('includes all default categories', async () => {
			await initializeDatabase();

			const data = await getAllData();

			expect(data.categories.length).toBe(22);
			expect(data.categories.some((c) => c.name === 'Groceries')).toBe(true);
			expect(data.categories.some((c) => c.name === 'Restaurants')).toBe(true);
		});

		it('includes transactions when present', async () => {
			await initializeDatabase();

			// Add a transaction
			await db.transactions.add({
				date: new Date('2024-01-15'),
				merchant: 'Test Store',
				amount: 100,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage',
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const data = await getAllData();

			expect(data.transactions.length).toBe(1);
			expect(data.transactions[0].merchant).toBe('Test Store');
		});

		it('includes monthly budgets when present', async () => {
			await initializeDatabase();

			await db.monthlyBudgets.add({
				month: '2024-01',
				income: 5000,
				savedAmount: 1000
			});

			const data = await getAllData();

			expect(data.monthlyBudgets.length).toBe(1);
			expect(data.monthlyBudgets[0].month).toBe('2024-01');
			expect(data.monthlyBudgets[0].income).toBe(5000);
		});

		it('returns DEFAULT_SETTINGS when settings missing', async () => {
			// Don't initialize - just open empty db
			const data = await getAllData();

			expect(data.settings).toEqual(DEFAULT_SETTINGS);
		});
	});

	describe('replaceAllData', () => {
		it('replaces all categories', async () => {
			await initializeDatabase();

			const newData: StoredData = {
				version: '1.0',
				exportedAt: new Date().toISOString(),
				transactions: [],
				categories: [
					{ id: 1, name: 'Custom Category', icon: '🎯', color: '#FF0000', isActive: true, sortOrder: 1, isEssential: false }
				],
				monthlyBudgets: [],
				categoryBudgets: [],
				settings: DEFAULT_SETTINGS
			};

			await replaceAllData(newData);

			const categories = await db.categories.toArray();
			expect(categories.length).toBe(1);
			expect(categories[0].name).toBe('Custom Category');
		});

		it('replaces all transactions with date conversion', async () => {
			await initializeDatabase();

			const testDate = '2024-06-15T00:00:00.000Z';
			const newData: StoredData = {
				version: '1.0',
				exportedAt: new Date().toISOString(),
				transactions: [
					{
						id: 1,
						date: new Date(testDate),
						merchant: 'Imported Store',
						amount: 75.50,
						categoryId: 1,
						isShared: true,
						splitType: 'percentage',
						splitValue: 0.5,
						partnerShare: 37.75,
						isSettled: false,
						isEssential: true,
						isSubscription: false,
						createdAt: new Date(testDate),
						updatedAt: new Date(testDate)
					}
				],
				categories: DEFAULT_CATEGORIES as Category[],
				monthlyBudgets: [],
				categoryBudgets: [],
				settings: DEFAULT_SETTINGS
			};

			await replaceAllData(newData);

			const transactions = await db.transactions.toArray();
			expect(transactions.length).toBe(1);
			expect(transactions[0].merchant).toBe('Imported Store');
			expect(transactions[0].amount).toBe(75.50);
			expect(transactions[0].date instanceof Date).toBe(true);
		});

		it('replaces monthly budgets', async () => {
			await initializeDatabase();

			// Add initial budget
			await db.monthlyBudgets.add({ month: '2024-01', income: 1000, savedAmount: 100 });

			const newData: StoredData = {
				version: '1.0',
				exportedAt: new Date().toISOString(),
				transactions: [],
				categories: DEFAULT_CATEGORIES as Category[],
				monthlyBudgets: [
					{ id: 1, month: '2024-06', income: 6000, savedAmount: 1500 },
					{ id: 2, month: '2024-07', income: 6500, savedAmount: 2000 }
				],
				categoryBudgets: [],
				settings: DEFAULT_SETTINGS
			};

			await replaceAllData(newData);

			const budgets = await db.monthlyBudgets.toArray();
			expect(budgets.length).toBe(2);
			expect(budgets.some((b) => b.month === '2024-06')).toBe(true);
			expect(budgets.some((b) => b.month === '2024-01')).toBe(false); // Old data cleared
		});

		it('updates settings', async () => {
			await initializeDatabase();

			const newData: StoredData = {
				version: '1.0',
				exportedAt: new Date().toISOString(),
				transactions: [],
				categories: DEFAULT_CATEGORIES as Category[],
				monthlyBudgets: [],
				categoryBudgets: [],
				settings: {
					...DEFAULT_SETTINGS,
					partnerName: 'Alex',
					theme: 'dark'
				}
			};

			await replaceAllData(newData);

			const settings = await db.settings.get(1);
			expect(settings?.partnerName).toBe('Alex');
			expect(settings?.theme).toBe('dark');
		});

		it('handles empty data gracefully', async () => {
			await initializeDatabase();

			const emptyData: StoredData = {
				version: '1.0',
				exportedAt: new Date().toISOString(),
				transactions: [],
				categories: [],
				monthlyBudgets: [],
				categoryBudgets: [],
				settings: DEFAULT_SETTINGS
			};

			await replaceAllData(emptyData);

			expect(await db.transactions.count()).toBe(0);
			expect(await db.categories.count()).toBe(0);
			expect(await db.monthlyBudgets.count()).toBe(0);
			expect(await db.categoryBudgets.count()).toBe(0);
		});

		it('handles settledDate conversion', async () => {
			await initializeDatabase();

			const settledDate = '2024-06-20T00:00:00.000Z';
			const newData: StoredData = {
				version: '1.0',
				exportedAt: new Date().toISOString(),
				transactions: [
					{
						id: 1,
						date: new Date('2024-06-15'),
						merchant: 'Settled Store',
						amount: 100,
						categoryId: 1,
						isShared: true,
						splitType: 'percentage',
						splitValue: 0.5,
						partnerShare: 50,
						isSettled: true,
						settledDate: new Date(settledDate),
						isEssential: false,
						isSubscription: false,
						createdAt: new Date(),
						updatedAt: new Date()
					}
				],
				categories: DEFAULT_CATEGORIES as Category[],
				monthlyBudgets: [],
				categoryBudgets: [],
				settings: DEFAULT_SETTINGS
			};

			await replaceAllData(newData);

			const transactions = await db.transactions.toArray();
			expect(transactions[0].settledDate instanceof Date).toBe(true);
		});

		it('replaces category budgets with date conversion', async () => {
			await initializeDatabase();

			const testDate = '2024-06-15T00:00:00.000Z';
			const newData: StoredData = {
				version: '1.0',
				exportedAt: new Date().toISOString(),
				transactions: [],
				categories: DEFAULT_CATEGORIES as Category[],
				monthlyBudgets: [],
				categoryBudgets: [
					{
						id: 1,
						month: '2024-06',
						categoryId: 11, // Groceries
						budgetAmount: 500,
						createdAt: new Date(testDate),
						updatedAt: new Date(testDate)
					},
					{
						id: 2,
						month: '2024-06',
						categoryId: 20, // Restaurants
						budgetAmount: 300,
						createdAt: new Date(testDate),
						updatedAt: new Date(testDate)
					}
				],
				settings: DEFAULT_SETTINGS
			};

			await replaceAllData(newData);

			const categoryBudgets = await db.categoryBudgets.toArray();
			expect(categoryBudgets.length).toBe(2);
			expect(categoryBudgets[0].budgetAmount).toBe(500);
			expect(categoryBudgets[0].createdAt instanceof Date).toBe(true);
			expect(categoryBudgets[0].updatedAt instanceof Date).toBe(true);
		});
	});

	describe('isStorageInitialized', () => {
		it('returns false before initialization', () => {
			expect(isStorageInitialized()).toBe(false);
		});

		it('returns true after initialization', async () => {
			await initializeStorage();
			expect(isStorageInitialized()).toBe(true);
		});
	});

	describe('resetStorageState', () => {
		it('resets the initialized flag', async () => {
			await initializeStorage();
			expect(isStorageInitialized()).toBe(true);

			resetStorageState();
			expect(isStorageInitialized()).toBe(false);
		});

		it('allows re-initialization after reset', async () => {
			await initializeStorage();
			resetStorageState();

			// Should be able to initialize again
			await expect(initializeStorage()).resolves.toBeUndefined();
			expect(isStorageInitialized()).toBe(true);
		});
	});

	describe('StorageInitError', () => {
		it('has correct name and message', () => {
			const error = new StorageInitError('Test error');
			expect(error.name).toBe('StorageInitError');
			expect(error.message).toBe('Test error');
		});

		it('stores cause when provided', () => {
			const cause = new Error('Original error');
			const error = new StorageInitError('Wrapped error', cause);
			expect(error.cause).toBe(cause);
		});

		it('is instanceof Error', () => {
			const error = new StorageInitError('Test');
			expect(error instanceof Error).toBe(true);
			expect(error instanceof StorageInitError).toBe(true);
		});
	});
});
