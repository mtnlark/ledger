import { describe, it, expect } from 'vitest';

import type { Transaction, Category } from '$lib/db';
import {
	exportTransactionsToCSV
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

