import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage before importing module under test
vi.mock('$lib/storage', () => ({
	persistData: vi.fn().mockResolvedValue(undefined)
}));

import { db, DEFAULT_SETTINGS } from '$lib/db';
import type { Transaction, Category } from '$lib/db';
import { persistData } from '$lib/storage';
import {
	exportTransactionsToCSV,
	exportAllDataToJSON,
	importFromJSON
} from '$lib/utils/export';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 1,
		date: new Date(2026, 0, 15), // Jan 15, 2026
		merchant: 'Test Store',
		amount: 42.5,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 0.5,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(2026, 0, 15),
		updatedAt: new Date(2026, 0, 15),
		...overrides
	};
}

function makeCategory(overrides: Partial<Category> = {}): Category {
	return {
		id: 1,
		name: 'Groceries',
		icon: '🛒',
		color: '#5B8C5A',
		isActive: true,
		sortOrder: 1,
		isEssential: true,
		...overrides
	};
}

// ─── exportTransactionsToCSV ──────────────────────────────────────────────────

describe('exportTransactionsToCSV', () => {
	const categories: Category[] = [
		makeCategory({ id: 1, name: 'Groceries' }),
		makeCategory({ id: 2, name: 'Restaurants' })
	];

	it('produces correct CSV headers', async () => {
		const csv = await exportTransactionsToCSV([], categories);

		expect(csv).toBe('Date,Merchant,Amount,Category,Shared,Partner Share,Your Share,Settled,Notes');
	});

	it('empty transaction list produces header-only CSV', async () => {
		const csv = await exportTransactionsToCSV([], categories);
		const lines = csv.split('\n');

		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('Date');
	});

	it('formats dates as YYYY-MM-DD', async () => {
		const txn = makeTransaction({ date: new Date(2026, 5, 3) }); // June 3, 2026
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toMatch(/^2026-06-03,/);
	});

	it('wraps merchant names in quotes', async () => {
		const txn = makeTransaction({ merchant: 'Simple Store' });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toContain('"Simple Store"');
	});

	it('escapes double quotes in merchant names', async () => {
		const txn = makeTransaction({ merchant: 'Bob\'s "Special" Store' });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		// CSV escaping: internal double quotes become doubled
		expect(dataLine).toContain('"Bob\'s ""Special"" Store"');
	});

	it('formats amounts to two decimal places', async () => {
		const txn = makeTransaction({ amount: 10 });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toContain('10.00');
	});

	it('maps categoryId to category name', async () => {
		const txn = makeTransaction({ categoryId: 2 });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toContain('Restaurants');
	});

	it('shows Unknown for missing categoryId', async () => {
		const txn = makeTransaction({ categoryId: 999 });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toContain('Unknown');
	});

	it('marks shared transactions with Y', async () => {
		const txn = makeTransaction({ isShared: true, partnerShare: 10, amount: 20 });
		const csv = await exportTransactionsToCSV([txn], categories);
		const fields = csv.split('\n')[1].split(',');

		// Shared column is index 4 (0-based), after Date, "Merchant", Amount, Category
		expect(fields[4]).toBe('Y');
	});

	it('marks non-shared transactions with N', async () => {
		const txn = makeTransaction({ isShared: false });
		const csv = await exportTransactionsToCSV([txn], categories);
		const fields = csv.split('\n')[1].split(',');

		expect(fields[4]).toBe('N');
	});

	it('calculates Your Share correctly for shared transactions', async () => {
		const txn = makeTransaction({ isShared: true, amount: 100, partnerShare: 40 });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		// Your Share = amount - partnerShare = 100 - 40 = 60
		// Partner Share = 40.00, Your Share = 60.00
		expect(dataLine).toContain('40.00');
		expect(dataLine).toContain('60.00');
	});

	it('calculates Your Share as full amount for non-shared transactions', async () => {
		const txn = makeTransaction({ isShared: false, amount: 75.5, partnerShare: 0 });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		// Your Share = full amount for non-shared
		expect(dataLine).toContain('75.50');
	});

	it('marks settled transactions with Y', async () => {
		const txn = makeTransaction({ isSettled: true });
		const csv = await exportTransactionsToCSV([txn], categories);
		const fields = csv.split('\n')[1].split(',');

		// Settled column is index 7
		expect(fields[7]).toBe('Y');
	});

	it('marks unsettled transactions with N', async () => {
		const txn = makeTransaction({ isSettled: false });
		const csv = await exportTransactionsToCSV([txn], categories);
		const fields = csv.split('\n')[1].split(',');

		expect(fields[7]).toBe('N');
	});

	it('includes notes wrapped in quotes', async () => {
		const txn = makeTransaction({ notes: 'Weekly groceries' });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toContain('"Weekly groceries"');
	});

	it('escapes double quotes within notes', async () => {
		const txn = makeTransaction({ notes: 'Got a "deal" on snacks' });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toContain('"Got a ""deal"" on snacks"');
	});

	it('outputs empty string for undefined notes', async () => {
		const txn = makeTransaction({ notes: undefined });
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		// Notes field is last; when undefined, should be empty string (not quoted)
		const fields = dataLine.split(',');
		expect(fields[fields.length - 1]).toBe('');
	});

	it('handles multiple transactions', async () => {
		const txns = [
			makeTransaction({ id: 1, merchant: 'Store A', amount: 10 }),
			makeTransaction({ id: 2, merchant: 'Store B', amount: 20 }),
			makeTransaction({ id: 3, merchant: 'Store C', amount: 30 })
		];
		const csv = await exportTransactionsToCSV(txns, categories);
		const lines = csv.split('\n');

		// 1 header + 3 data rows
		expect(lines).toHaveLength(4);
	});

	it('produces a complete, well-formed CSV row', async () => {
		const txn = makeTransaction({
			date: new Date(2026, 0, 15),
			merchant: 'Test Store',
			amount: 42.5,
			categoryId: 1,
			isShared: false,
			partnerShare: 0,
			isSettled: false,
			notes: 'Test note'
		});
		const csv = await exportTransactionsToCSV([txn], categories);
		const dataLine = csv.split('\n')[1];

		expect(dataLine).toBe(
			'2026-01-15,"Test Store",42.50,Groceries,N,0.00,42.50,N,"Test note"'
		);
	});
});

// ─── exportAllDataToJSON ──────────────────────────────────────────────────────

describe('exportAllDataToJSON', () => {
	beforeEach(async () => {
		// Clear all tables before each test
		await db.transactions.clear();
		await db.categories.clear();
		await db.monthlyBudgets.clear();
		await db.settings.clear();
	});

	it('returns valid JSON', async () => {
		const result = await exportAllDataToJSON();

		expect(() => JSON.parse(result)).not.toThrow();
	});

	it('includes exportDate as ISO string', async () => {
		const before = new Date().toISOString();
		const result = await exportAllDataToJSON();
		const parsed = JSON.parse(result);
		const after = new Date().toISOString();

		expect(parsed.exportDate).toBeDefined();
		expect(parsed.exportDate >= before).toBe(true);
		expect(parsed.exportDate <= after).toBe(true);
	});

	it('includes version field', async () => {
		const result = await exportAllDataToJSON();
		const parsed = JSON.parse(result);

		expect(parsed.version).toBe('1.0');
	});

	it('includes data key with all tables', async () => {
		// Seed settings so it appears in the export (db.settings.get(1) returns undefined otherwise)
		await db.settings.put(DEFAULT_SETTINGS);

		const result = await exportAllDataToJSON();
		const parsed = JSON.parse(result);

		expect(parsed.data).toBeDefined();
		expect(parsed.data).toHaveProperty('transactions');
		expect(parsed.data).toHaveProperty('categories');
		expect(parsed.data).toHaveProperty('budgets');
		expect(parsed.data).toHaveProperty('settings');
	});

	it('exports seeded data correctly', async () => {
		// Seed some data
		await db.categories.add(makeCategory({ id: 1, name: 'Groceries' }));
		await db.transactions.add(makeTransaction({ id: 1, merchant: 'Trader Joes' }));
		await db.monthlyBudgets.add({ id: 1, month: '2026-01', income: 5000, savedAmount: 500 });
		await db.settings.put(DEFAULT_SETTINGS);

		const result = await exportAllDataToJSON();
		const parsed = JSON.parse(result);

		expect(parsed.data.transactions).toHaveLength(1);
		expect(parsed.data.categories).toHaveLength(1);
		expect(parsed.data.budgets).toHaveLength(1);
		expect(parsed.data.settings).toBeDefined();
		expect(parsed.data.settings.partnerName).toBe('Partner');
	});

	it('exports empty arrays when tables are empty', async () => {
		const result = await exportAllDataToJSON();
		const parsed = JSON.parse(result);

		expect(parsed.data.transactions).toEqual([]);
		expect(parsed.data.categories).toEqual([]);
		expect(parsed.data.budgets).toEqual([]);
	});
});

// ─── importFromJSON ───────────────────────────────────────────────────────────

describe('importFromJSON', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await db.transactions.clear();
		await db.categories.clear();
		await db.monthlyBudgets.clear();
		await db.settings.clear();
	});

	function makeExportJSON(data: Record<string, unknown> = {}): string {
		return JSON.stringify({
			exportDate: new Date().toISOString(),
			version: '1.0',
			data: {
				transactions: [],
				categories: [],
				budgets: [],
				settings: null,
				...data
			}
		});
	}

	it('successfully imports transactions, categories, budgets, and settings', async () => {
		const json = makeExportJSON({
			transactions: [
				{
					id: 1,
					date: '2026-01-15',
					merchant: 'Test Store',
					amount: 42.5,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: '2026-01-15T00:00:00.000Z',
					updatedAt: '2026-01-15T00:00:00.000Z'
				}
			],
			categories: [
				{ id: 1, name: 'Groceries', icon: '🛒', color: '#5B8C5A', isActive: true, sortOrder: 1, isEssential: true }
			],
			budgets: [
				{ id: 1, month: '2026-01', income: 5000, savedAmount: 500 }
			],
			settings: { ...DEFAULT_SETTINGS }
		});

		const result = await importFromJSON(json);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Imported 1 transactions, 1 categories, 1 budgets');

		// Verify data was persisted to Dexie
		const txns = await db.transactions.toArray();
		expect(txns).toHaveLength(1);
		expect(txns[0].merchant).toBe('Test Store');
		expect(txns[0].date).toBeInstanceOf(Date);

		const cats = await db.categories.toArray();
		expect(cats).toHaveLength(1);
		expect(cats[0].name).toBe('Groceries');

		const budgets = await db.monthlyBudgets.toArray();
		expect(budgets).toHaveLength(1);
		expect(budgets[0].month).toBe('2026-01');

		const settings = await db.settings.get(1);
		expect(settings).toBeDefined();
		expect(settings!.partnerName).toBe('Partner');
	});

	it('calls persistData after import', async () => {
		const json = makeExportJSON();

		await importFromJSON(json);

		expect(persistData).toHaveBeenCalled();
	});

	it('rejects invalid format (missing data key)', async () => {
		const json = JSON.stringify({ version: '1.0', something: 'else' });

		const result = await importFromJSON(json);

		expect(result.success).toBe(false);
		expect(result.message).toBe('Invalid backup format');
	});

	it('rejects invalid JSON', async () => {
		const result = await importFromJSON('not json at all {{{');

		expect(result.success).toBe(false);
		expect(result.message).toMatch(/Import failed:/);
	});

	it('handles empty data gracefully (no transactions, categories, or budgets)', async () => {
		const json = makeExportJSON({
			transactions: [],
			categories: [],
			budgets: [],
			settings: null
		});

		const result = await importFromJSON(json);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Imported 0 transactions, 0 categories, 0 budgets');
	});

	it('handles null/undefined data arrays', async () => {
		const json = makeExportJSON({
			transactions: null,
			categories: null,
			budgets: null,
			settings: null
		});

		const result = await importFromJSON(json);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Imported 0 transactions, 0 categories, 0 budgets');
	});

	it('clears existing data before importing', async () => {
		// Seed existing data
		await db.categories.add(makeCategory({ id: 1, name: 'OldCategory' }));
		await db.transactions.add(makeTransaction({ id: 1, merchant: 'OldStore' }));

		const json = makeExportJSON({
			transactions: [
				{
					id: 2,
					date: '2026-02-01',
					merchant: 'NewStore',
					amount: 20,
					categoryId: 2,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: '2026-02-01T00:00:00.000Z',
					updatedAt: '2026-02-01T00:00:00.000Z'
				}
			],
			categories: [
				{ id: 2, name: 'NewCategory', isActive: true, sortOrder: 1, isEssential: false }
			],
			budgets: []
		});

		await importFromJSON(json);

		const txns = await db.transactions.toArray();
		expect(txns).toHaveLength(1);
		expect(txns[0].merchant).toBe('NewStore');

		const cats = await db.categories.toArray();
		expect(cats).toHaveLength(1);
		expect(cats[0].name).toBe('NewCategory');
	});

	it('converts date strings to Date objects in transactions', async () => {
		const json = makeExportJSON({
			transactions: [
				{
					id: 1,
					date: '2026-03-20T00:00:00.000Z',
					merchant: 'DateTest',
					amount: 10,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: '2026-03-20T12:00:00.000Z',
					updatedAt: '2026-03-20T12:00:00.000Z'
				}
			]
		});

		await importFromJSON(json);

		const txns = await db.transactions.toArray();
		expect(txns[0].date).toBeInstanceOf(Date);
		expect(txns[0].createdAt).toBeInstanceOf(Date);
		expect(txns[0].updatedAt).toBeInstanceOf(Date);
	});

	it('converts settledDate string to Date when present', async () => {
		const json = makeExportJSON({
			transactions: [
				{
					id: 1,
					date: '2026-01-15',
					merchant: 'Settled Store',
					amount: 50,
					categoryId: 1,
					isShared: true,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 25,
					isSettled: true,
					settledDate: '2026-01-20T00:00:00.000Z',
					isEssential: false,
					isSubscription: false,
					createdAt: '2026-01-15T00:00:00.000Z',
					updatedAt: '2026-01-20T00:00:00.000Z'
				}
			]
		});

		await importFromJSON(json);

		const txns = await db.transactions.toArray();
		expect(txns[0].settledDate).toBeInstanceOf(Date);
	});

	it('leaves settledDate undefined when not present', async () => {
		const json = makeExportJSON({
			transactions: [
				{
					id: 1,
					date: '2026-01-15',
					merchant: 'No Settle',
					amount: 10,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: '2026-01-15T00:00:00.000Z',
					updatedAt: '2026-01-15T00:00:00.000Z'
				}
			]
		});

		await importFromJSON(json);

		const txns = await db.transactions.toArray();
		expect(txns[0].settledDate).toBeUndefined();
	});

	it('imports settings with id forced to 1', async () => {
		const json = makeExportJSON({
			settings: { ...DEFAULT_SETTINGS, id: 999, partnerName: 'CustomPartner' }
		});

		await importFromJSON(json);

		const settings = await db.settings.get(1);
		expect(settings).toBeDefined();
		expect(settings!.partnerName).toBe('CustomPartner');
	});

	it('handles import with only categories (no transactions or budgets)', async () => {
		const json = makeExportJSON({
			categories: [
				{ id: 1, name: 'Solo Category', isActive: true, sortOrder: 1, isEssential: false }
			],
			transactions: [],
			budgets: []
		});

		const result = await importFromJSON(json);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Imported 0 transactions, 1 categories, 0 budgets');
	});

	it('imports multiple transactions correctly', async () => {
		const json = makeExportJSON({
			transactions: [
				{
					id: 1,
					date: '2026-01-10',
					merchant: 'Store A',
					amount: 10,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: '2026-01-10T00:00:00.000Z',
					updatedAt: '2026-01-10T00:00:00.000Z'
				},
				{
					id: 2,
					date: '2026-01-11',
					merchant: 'Store B',
					amount: 20,
					categoryId: 2,
					isShared: true,
					splitType: 'fixed',
					splitValue: 10,
					partnerShare: 10,
					isSettled: false,
					isEssential: true,
					isSubscription: false,
					createdAt: '2026-01-11T00:00:00.000Z',
					updatedAt: '2026-01-11T00:00:00.000Z'
				},
				{
					id: 3,
					date: '2026-01-12',
					merchant: 'Store C',
					amount: 30,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: true,
					subscriptionFrequency: 'monthly',
					createdAt: '2026-01-12T00:00:00.000Z',
					updatedAt: '2026-01-12T00:00:00.000Z'
				}
			]
		});

		const result = await importFromJSON(json);

		expect(result.success).toBe(true);
		expect(result.message).toBe('Imported 3 transactions, 0 categories, 0 budgets');

		const txns = await db.transactions.toArray();
		expect(txns).toHaveLength(3);
	});

	it('uses parseStoredDate for transaction dates to avoid timezone shift', async () => {
		// When importing "2026-01-15" as a date, parseStoredDate extracts YYYY-MM-DD
		// and creates a local Date, avoiding UTC midnight → previous day in western TZ
		const json = makeExportJSON({
			transactions: [
				{
					id: 1,
					date: '2026-01-15T00:00:00.000Z',
					merchant: 'TZ Test',
					amount: 10,
					categoryId: 1,
					isShared: false,
					splitType: 'percentage',
					splitValue: 0.5,
					partnerShare: 0,
					isSettled: false,
					isEssential: false,
					isSubscription: false,
					createdAt: '2026-01-15T00:00:00.000Z',
					updatedAt: '2026-01-15T00:00:00.000Z'
				}
			]
		});

		await importFromJSON(json);

		const txns = await db.transactions.toArray();
		// parseStoredDate extracts 2026-01-15 from the ISO string and creates local Date
		expect(txns[0].date.getFullYear()).toBe(2026);
		expect(txns[0].date.getMonth()).toBe(0); // January = 0
		expect(txns[0].date.getDate()).toBe(15);
	});
});
