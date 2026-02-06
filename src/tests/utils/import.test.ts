import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock xlsx dynamic import - must be before importing module under test
vi.mock('xlsx', () => ({
	utils: {
		sheet_to_json: vi.fn()
	}
}));

vi.mock('$lib/storage', () => ({
	persistData: vi.fn().mockResolvedValue(undefined)
}));

import { db, DEFAULT_CATEGORIES, type Category } from '$lib/db';
import { parseExpensesSheet, importTransactions, type ImportedTransaction } from '$lib/utils/import';
import { persistData } from '$lib/storage';
import { utils as xlsxUtils } from 'xlsx';

const sheet_to_json = xlsxUtils.sheet_to_json as ReturnType<typeof vi.fn>;

// Helper: create a workbook object with an Expenses sheet
function makeWorkbook(sheetData?: unknown) {
	return {
		Sheets: sheetData !== undefined ? { Expenses: sheetData } : {},
		SheetNames: sheetData !== undefined ? ['Expenses'] : []
	};
}

// Helper: create rows with standard headers + data rows
function makeRows(dataRows: (string | number | null | undefined | Date)[][], headers?: string[]) {
	const defaultHeaders = ['Date', 'Merchant', 'Amount', 'Category', 'Shared', 'Partner Share', 'Settled'];
	return [headers ?? defaultHeaders, ...dataRows];
}

// Helper: seed categories into the database
async function seedCategories(): Promise<void> {
	const count = await db.categories.count();
	if (count === 0) {
		await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
	}
}

// Helper: create an ImportedTransaction for importTransactions tests
function makeImportedTransaction(overrides: Partial<ImportedTransaction> = {}): ImportedTransaction {
	return {
		date: new Date(2026, 0, 15), // Jan 15, 2026
		merchant: 'Test Store',
		amount: 42.50,
		category: 'Groceries',
		isShared: false,
		partnerShare: 0,
		isSettled: false,
		...overrides
	};
}

beforeEach(async () => {
	// Clear all tables before each test
	await db.transactions.clear();
	await db.categories.clear();
	await db.settings.clear();
	vi.clearAllMocks();
});

// =============================================================================
// parseExpensesSheet
// =============================================================================

describe('parseExpensesSheet', () => {
	describe('valid data parsing', () => {
		it('parses standard rows with all columns', async () => {
			const rows = makeRows([
				['2026-01-15', 'Trader Joes', 52.30, 'Groceries', 'N', 0, 'N'],
				['2026-01-16', 'Netflix', 15.99, 'Fun & hobbies', 'Y', 7.99, 'Y']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(2);

			expect(result[0].merchant).toBe('Trader Joes');
			expect(result[0].amount).toBe(52.30);
			expect(result[0].category).toBe('Groceries');
			expect(result[0].isShared).toBe(false);
			expect(result[0].partnerShare).toBe(0);
			expect(result[0].isSettled).toBe(false);
			expect(result[0].date.getFullYear()).toBe(2026);
			expect(result[0].date.getMonth()).toBe(0); // January
			expect(result[0].date.getDate()).toBe(15);

			expect(result[1].merchant).toBe('Netflix');
			expect(result[1].amount).toBe(15.99);
			expect(result[1].isShared).toBe(true);
			expect(result[1].partnerShare).toBe(7.99);
			expect(result[1].isSettled).toBe(true);
		});

		it('trims whitespace from merchant names', async () => {
			const rows = makeRows([
				['2026-01-15', '  Whole Foods  ', 75.00, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].merchant).toBe('Whole Foods');
		});

		it('rounds amounts to 2 decimal places', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', 33.333, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].amount).toBe(33.33);
		});

		it('rounds partner share to 2 decimal places', async () => {
			const rows = makeRows([
				['2026-01-15', 'Restaurant', 100, 'Restaurants', 'Y', 33.333, 'N']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].partnerShare).toBe(33.33);
		});

		it('parses string amounts correctly', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', '25.50', 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].amount).toBe(25.50);
		});
	});

	describe('missing Expenses sheet', () => {
		it('throws when no Expenses sheet exists', async () => {
			const workbook = { Sheets: {}, SheetNames: [] };

			await expect(parseExpensesSheet(workbook)).rejects.toThrow(
				'No "Expenses" sheet found in workbook'
			);
		});

		it('throws when sheet has a different name', async () => {
			const workbook = {
				Sheets: { Sheet1: {} },
				SheetNames: ['Sheet1']
			};

			await expect(parseExpensesSheet(workbook)).rejects.toThrow(
				'No "Expenses" sheet found in workbook'
			);
		});
	});

	describe('missing required columns', () => {
		it('throws when Date column is missing', async () => {
			const rows = [['Merchant', 'Amount'], ['Store', 10]];
			sheet_to_json.mockReturnValue(rows);

			await expect(parseExpensesSheet(makeWorkbook('sheet'))).rejects.toThrow(
				'Required columns (Date, Merchant, Amount) not found'
			);
		});

		it('throws when Merchant column is missing', async () => {
			const rows = [['Date', 'Amount'], ['2026-01-15', 10]];
			sheet_to_json.mockReturnValue(rows);

			await expect(parseExpensesSheet(makeWorkbook('sheet'))).rejects.toThrow(
				'Required columns (Date, Merchant, Amount) not found'
			);
		});

		it('throws when Amount column is missing', async () => {
			const rows = [['Date', 'Merchant'], ['2026-01-15', 'Store']];
			sheet_to_json.mockReturnValue(rows);

			await expect(parseExpensesSheet(makeWorkbook('sheet'))).rejects.toThrow(
				'Required columns (Date, Merchant, Amount) not found'
			);
		});

		it('does not throw when only optional columns are missing', async () => {
			const rows = [
				['Date', 'Merchant', 'Amount'],
				['2026-01-15', 'Store', 10]
			];
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('Unknown');
			expect(result[0].isShared).toBe(false);
			expect(result[0].partnerShare).toBe(0);
			expect(result[0].isSettled).toBe(false);
		});
	});

	describe('header matching', () => {
		it('matches headers case-insensitively', async () => {
			const rows = [
				['DATE', 'MERCHANT', 'AMOUNT', 'CATEGORY'],
				['2026-01-15', 'Store', 10, 'Groceries']
			];
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].category).toBe('Groceries');
		});

		it('matches headers containing keyword (e.g. "Transaction Date")', async () => {
			const rows = [
				['Transaction Date', 'Merchant Name', 'Total Amount'],
				['2026-01-15', 'Store', 10]
			];
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
		});

		it('matches "Venmo" as settled column', async () => {
			const rows = [
				['Date', 'Merchant', 'Amount', 'Venmo'],
				['2026-01-15', 'Store', 10, 'Y']
			];
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isSettled).toBe(true);
		});

		it('distinguishes "Shared" from "Partner Share" column', async () => {
			const rows = [
				['Date', 'Merchant', 'Amount', 'Shared', 'Partner Share'],
				['2026-01-15', 'Restaurant', 100, 'Y', 50]
			];
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isShared).toBe(true);
			expect(result[0].partnerShare).toBe(50);
		});
	});

	describe('date parsing', () => {
		it('handles Excel serial number dates', async () => {
			// Excel serial 46037 = Jan 15, 2026 (days since Dec 30, 1899)
			// Calculate: new Date(1899, 11, 30 + 46037) = Jan 15, 2026
			const excelSerial = 46037;
			const rows = makeRows([[excelSerial, 'Store', 10, 'Groceries', '', 0, '']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			// Verify the date is valid
			expect(result[0].date).toBeInstanceOf(Date);
			expect(isNaN(result[0].date.getTime())).toBe(false);
		});

		it('handles ISO format string dates (YYYY-MM-DD)', async () => {
			const rows = makeRows([['2026-03-20', 'Store', 10, 'Groceries', '', 0, '']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].date.getFullYear()).toBe(2026);
			expect(result[0].date.getMonth()).toBe(2); // March
			expect(result[0].date.getDate()).toBe(20);
		});

		it('handles US format string dates (M/D/YYYY)', async () => {
			const rows = makeRows([['1/5/2026', 'Store', 10, 'Groceries', '', 0, '']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].date.getFullYear()).toBe(2026);
			expect(result[0].date.getMonth()).toBe(0); // January
			expect(result[0].date.getDate()).toBe(5);
		});

		it('handles US format string dates (MM/DD/YYYY)', async () => {
			const rows = makeRows([['12/25/2026', 'Store', 10, 'Groceries', '', 0, '']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].date.getFullYear()).toBe(2026);
			expect(result[0].date.getMonth()).toBe(11); // December
			expect(result[0].date.getDate()).toBe(25);
		});

		it('handles Date objects from XLSX', async () => {
			const dateObj = new Date(2026, 5, 10); // June 10, 2026
			const rows = makeRows([[dateObj, 'Store', 10, 'Groceries', '', 0, '']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].date.getFullYear()).toBe(2026);
			expect(result[0].date.getMonth()).toBe(5); // June
			expect(result[0].date.getDate()).toBe(10);
		});

		it('skips rows with invalid dates', async () => {
			const rows = makeRows([
				['not-a-date', 'Store', 10, 'Groceries', '', 0, ''],
				['2026-01-15', 'Valid Store', 20, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].merchant).toBe('Valid Store');
		});

		it('skips rows with empty date values', async () => {
			const rows = makeRows([
				[null, 'Store', 10, 'Groceries', '', 0, ''],
				['2026-01-15', 'Valid Store', 20, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].merchant).toBe('Valid Store');
		});
	});

	describe('amount parsing', () => {
		it('skips rows with negative amounts', async () => {
			const rows = makeRows([
				['2026-01-15', 'Refund Store', -25.00, 'Groceries', '', 0, ''],
				['2026-01-15', 'Valid Store', 10, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].merchant).toBe('Valid Store');
		});

		it('skips rows with zero amount', async () => {
			const rows = makeRows([
				['2026-01-15', 'Free Item', 0, 'Groceries', '', 0, ''],
				['2026-01-15', 'Valid Store', 10, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].merchant).toBe('Valid Store');
		});

		it('skips rows with non-numeric amount strings', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', 'abc', 'Groceries', '', 0, ''],
				['2026-01-15', 'Valid Store', 10, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].merchant).toBe('Valid Store');
		});

		it('skips rows with empty amount', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', null, 'Groceries', '', 0, ''],
				['2026-01-15', 'Valid Store', 10, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
		});
	});

	describe('category parsing', () => {
		it('uses category from the row when present', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', 10, 'Restaurants', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].category).toBe('Restaurants');
		});

		it('defaults to Unknown when category column is missing', async () => {
			const rows = [
				['Date', 'Merchant', 'Amount'],
				['2026-01-15', 'Store', 10]
			];
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].category).toBe('Unknown');
		});

		it('defaults to Unknown when category cell is empty', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', 10, '', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].category).toBe('Unknown');
		});

		it('defaults to Unknown when category cell is null/undefined', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', 10, null, '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].category).toBe('Unknown');
		});
	});

	describe('shared expense parsing', () => {
		it('recognizes "Y" as shared', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'Y', 50, 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isShared).toBe(true);
			expect(result[0].partnerShare).toBe(50);
		});

		it('recognizes "YES" as shared (case-insensitive)', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'yes', 50, 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isShared).toBe(true);
		});

		it('recognizes "TRUE" as shared', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'TRUE', 50, 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isShared).toBe(true);
		});

		it('treats other values as not shared', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'N', 50, 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isShared).toBe(false);
		});

		it('partner share is 0 when not shared', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'N', 50, 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			// partnerShare is only set when isShared is true
			expect(result[0].partnerShare).toBe(0);
		});

		it('handles string partner share values', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'Y', '25.50', 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].partnerShare).toBe(25.50);
		});

		it('ignores partner share value "X"', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'Y', 'X', 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].partnerShare).toBe(0);
		});

		it('handles empty partner share as 0', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'Y', '', 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].partnerShare).toBe(0);
		});

		it('handles non-numeric partner share string as 0', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 100, 'Groceries', 'Y', 'abc', 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].partnerShare).toBe(0);
		});
	});

	describe('settled flag parsing', () => {
		it('recognizes "Y" as settled', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 10, 'Groceries', '', 0, 'Y']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isSettled).toBe(true);
		});

		it('recognizes "YES" as settled (case-insensitive)', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 10, 'Groceries', '', 0, 'yes']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isSettled).toBe(true);
		});

		it('recognizes "TRUE" as settled', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 10, 'Groceries', '', 0, 'TRUE']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isSettled).toBe(true);
		});

		it('treats empty or other values as not settled', async () => {
			const rows = makeRows([['2026-01-15', 'Store', 10, 'Groceries', '', 0, 'N']]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result[0].isSettled).toBe(false);
		});
	});

	describe('empty/sparse rows', () => {
		it('skips completely empty rows', async () => {
			const rows = makeRows([
				['2026-01-15', 'Store', 10, 'Groceries', '', 0, ''],
				[],
				['2026-01-16', 'Other Store', 20, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(2);
		});

		it('skips rows with missing merchant', async () => {
			const rows = makeRows([
				['2026-01-15', null, 10, 'Groceries', '', 0, ''],
				['2026-01-16', 'Valid Store', 20, 'Groceries', '', 0, '']
			]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
			expect(result[0].merchant).toBe('Valid Store');
		});

		it('returns empty array when all data rows are empty', async () => {
			const rows = makeRows([]);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(0);
		});

		it('handles undefined rows in the array', async () => {
			const rows = [
				['Date', 'Merchant', 'Amount'],
				undefined,
				['2026-01-15', 'Store', 10]
			];
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(1);
		});
	});

	describe('multiple rows', () => {
		it('parses many rows correctly', async () => {
			const dataRows = Array.from({ length: 50 }, (_, i) => [
				`2026-01-${String(Math.min(i + 1, 28)).padStart(2, '0')}`,
				`Store ${i + 1}`,
				(i + 1) * 10,
				'Groceries',
				'',
				0,
				''
			]);
			const rows = makeRows(dataRows);
			sheet_to_json.mockReturnValue(rows);

			const result = await parseExpensesSheet(makeWorkbook('sheet'));

			expect(result).toHaveLength(50);
		});
	});
});

// =============================================================================
// importTransactions
// =============================================================================

describe('importTransactions', () => {
	beforeEach(async () => {
		await seedCategories();
	});

	describe('basic import', () => {
		it('imports valid transactions into the database', async () => {
			const transactions = [
				makeImportedTransaction({ merchant: 'Trader Joes', amount: 52.30 }),
				makeImportedTransaction({ merchant: 'Whole Foods', amount: 75.00 })
			];

			const result = await importTransactions(transactions);

			expect(result.success).toBe(true);
			expect(result.imported).toBe(2);
			expect(result.skipped).toBe(0);
			expect(result.errors).toHaveLength(0);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions).toHaveLength(2);
		});

		it('sets correct transaction fields', async () => {
			const transactions = [
				makeImportedTransaction({
					date: new Date(2026, 0, 15),
					merchant: 'Trader Joes',
					amount: 52.30,
					category: 'Groceries',
					isShared: false,
					isSettled: false
				})
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			const t = dbTransactions[0];

			expect(t.merchant).toBe('Trader Joes');
			expect(t.amount).toBe(52.30);
			expect(t.isShared).toBe(false);
			expect(t.isSettled).toBe(false);
			expect(t.isEssential).toBe(false);
			expect(t.isSubscription).toBe(false);
			expect(t.createdAt).toBeInstanceOf(Date);
			expect(t.updatedAt).toBeInstanceOf(Date);
		});

		it('calls persistData after successful import', async () => {
			const transactions = [makeImportedTransaction()];

			await importTransactions(transactions);

			expect(persistData).toHaveBeenCalledOnce();
		});

		it('does not call persistData when nothing was imported', async () => {
			const result = await importTransactions([]);

			expect(result.imported).toBe(0);
			expect(persistData).not.toHaveBeenCalled();
		});

		it('returns success:true when all transactions import without errors', async () => {
			const result = await importTransactions([makeImportedTransaction()]);

			expect(result.success).toBe(true);
			expect(result.errors).toHaveLength(0);
		});
	});

	describe('duplicate detection', () => {
		it('skips duplicate transactions by default (same date, merchant, amount)', async () => {
			// Pre-populate database with an existing transaction
			const existingDate = new Date(2026, 0, 15);
			await db.transactions.add({
				date: existingDate,
				merchant: 'Trader Joes',
				amount: 52.30,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage' as const,
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const transactions = [
				makeImportedTransaction({ merchant: 'Trader Joes', amount: 52.30, date: existingDate })
			];

			const result = await importTransactions(transactions);

			expect(result.imported).toBe(0);
			expect(result.skipped).toBe(1);

			// Should still just have the 1 original transaction
			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions).toHaveLength(1);
		});

		it('allows duplicates when skipDuplicates is false', async () => {
			// Pre-populate database
			const existingDate = new Date(2026, 0, 15);
			await db.transactions.add({
				date: existingDate,
				merchant: 'Trader Joes',
				amount: 52.30,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage' as const,
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const transactions = [
				makeImportedTransaction({ merchant: 'Trader Joes', amount: 52.30, date: existingDate })
			];

			const result = await importTransactions(transactions, { skipDuplicates: false });

			expect(result.imported).toBe(1);
			expect(result.skipped).toBe(0);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions).toHaveLength(2);
		});

		it('does not consider different amounts as duplicates', async () => {
			const existingDate = new Date(2026, 0, 15);
			await db.transactions.add({
				date: existingDate,
				merchant: 'Trader Joes',
				amount: 52.30,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage' as const,
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const transactions = [
				makeImportedTransaction({ merchant: 'Trader Joes', amount: 99.99, date: existingDate })
			];

			const result = await importTransactions(transactions);

			expect(result.imported).toBe(1);
			expect(result.skipped).toBe(0);
		});

		it('does not consider different merchants as duplicates', async () => {
			const existingDate = new Date(2026, 0, 15);
			await db.transactions.add({
				date: existingDate,
				merchant: 'Trader Joes',
				amount: 52.30,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage' as const,
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const transactions = [
				makeImportedTransaction({ merchant: 'Whole Foods', amount: 52.30, date: existingDate })
			];

			const result = await importTransactions(transactions);

			expect(result.imported).toBe(1);
		});

		it('does not consider different dates as duplicates', async () => {
			await db.transactions.add({
				date: new Date(2026, 0, 15),
				merchant: 'Trader Joes',
				amount: 52.30,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage' as const,
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const transactions = [
				makeImportedTransaction({
					merchant: 'Trader Joes',
					amount: 52.30,
					date: new Date(2026, 0, 16) // Different date
				})
			];

			const result = await importTransactions(transactions);

			expect(result.imported).toBe(1);
		});

		it('uses tolerance of 0.01 for amount comparison', async () => {
			const existingDate = new Date(2026, 0, 15);
			await db.transactions.add({
				date: existingDate,
				merchant: 'Store',
				amount: 10.00,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage' as const,
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			// Amount within tolerance (0.005 < 0.01) - should be considered duplicate
			const transactions = [
				makeImportedTransaction({ merchant: 'Store', amount: 10.005, date: existingDate })
			];

			const result = await importTransactions(transactions);

			expect(result.skipped).toBe(1);
		});
	});

	describe('category lookup', () => {
		it('matches categories by name (case-insensitive)', async () => {
			const transactions = [
				makeImportedTransaction({ category: 'groceries' }) // lowercase
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			const groceries = await db.categories.where('name').equalsIgnoreCase('groceries').first();
			expect(dbTransactions[0].categoryId).toBe(groceries!.id);
		});

		it('falls back to first category when category not found', async () => {
			const transactions = [
				makeImportedTransaction({ category: 'Nonexistent Category' })
			];

			const result = await importTransactions(transactions);

			expect(result.imported).toBe(1);

			const dbTransactions = await db.transactions.toArray();
			const firstCategory = await db.categories.orderBy('sortOrder').first();
			expect(dbTransactions[0].categoryId).toBe(firstCategory!.id);
		});

		it('skips and records error when no categories exist at all', async () => {
			await db.categories.clear();

			const transactions = [makeImportedTransaction()];

			const result = await importTransactions(transactions);

			expect(result.imported).toBe(0);
			expect(result.skipped).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('No category found');
		});
	});

	describe('split type calculation', () => {
		it('uses percentage mode with value 0.5 for 50/50 splits', async () => {
			const transactions = [
				makeImportedTransaction({
					isShared: true,
					amount: 100,
					partnerShare: 50 // Exactly 50%
				})
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions[0].splitType).toBe('percentage');
			expect(dbTransactions[0].splitValue).toBe(0.5);
		});

		it('uses percentage mode for round percentage splits', async () => {
			const transactions = [
				makeImportedTransaction({
					isShared: true,
					amount: 100,
					partnerShare: 30 // 30%
				})
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions[0].splitType).toBe('percentage');
			expect(dbTransactions[0].splitValue).toBe(0.3);
		});

		it('uses fixed mode for non-shared transactions', async () => {
			const transactions = [
				makeImportedTransaction({
					isShared: false,
					amount: 100,
					partnerShare: 0
				})
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions[0].splitType).toBe('fixed');
			expect(dbTransactions[0].splitValue).toBe(0);
		});

		it('uses fixed mode when partnerShare is 0', async () => {
			const transactions = [
				makeImportedTransaction({
					isShared: true,
					amount: 100,
					partnerShare: 0
				})
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions[0].splitType).toBe('fixed');
		});
	});

	describe('settled transactions', () => {
		it('sets settledDate when isSettled is true', async () => {
			const transactions = [
				makeImportedTransaction({ isSettled: true })
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions[0].isSettled).toBe(true);
			expect(dbTransactions[0].settledDate).toBeInstanceOf(Date);
		});

		it('does not set settledDate when isSettled is false', async () => {
			const transactions = [
				makeImportedTransaction({ isSettled: false })
			];

			await importTransactions(transactions);

			const dbTransactions = await db.transactions.toArray();
			expect(dbTransactions[0].isSettled).toBe(false);
			expect(dbTransactions[0].settledDate).toBeUndefined();
		});
	});

	describe('mixed results', () => {
		it('handles a mix of imported, skipped, and errored transactions', async () => {
			// Pre-populate with a duplicate
			const existingDate = new Date(2026, 0, 10);
			await db.transactions.add({
				date: existingDate,
				merchant: 'Existing Store',
				amount: 20.00,
				categoryId: 1,
				isShared: false,
				splitType: 'percentage' as const,
				splitValue: 0.5,
				partnerShare: 0,
				isSettled: false,
				isEssential: false,
				isSubscription: false,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const transactions = [
				makeImportedTransaction({ merchant: 'New Store', amount: 30 }), // should import
				makeImportedTransaction({ merchant: 'Existing Store', amount: 20, date: existingDate }) // should skip (duplicate)
			];

			const result = await importTransactions(transactions);

			expect(result.imported).toBe(1);
			expect(result.skipped).toBe(1);
		});

		it('returns success:false when there are errors', async () => {
			await db.categories.clear();

			const transactions = [makeImportedTransaction()];
			const result = await importTransactions(transactions);

			expect(result.success).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('empty input', () => {
		it('handles empty transaction array', async () => {
			const result = await importTransactions([]);

			expect(result.success).toBe(true);
			expect(result.imported).toBe(0);
			expect(result.skipped).toBe(0);
			expect(result.errors).toHaveLength(0);
		});
	});
});
