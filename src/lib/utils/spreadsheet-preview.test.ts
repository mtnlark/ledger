import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { parseCurrencyCell, parseExpensesSheetWithDiagnostics, previewSpreadsheet, importTransactions } from './import';
const headers = ['Date', 'Merchant', 'Amount', 'Category', 'Shared', 'Partner Share'];
beforeEach(async () => { await db.delete(); await db.open(); await db.categories.add({ id: 1, name: 'Food', isActive: true, isEssential: true, sortOrder: 1 }); });
describe('spreadsheet preview', () => {
	it.each([[1234.56, 1234.56], ['$1,234.56', 1234.56], ['1,234', 1234], ['$12.30', 12.3]])('parses %s', (input, output) => expect(parseCurrencyCell(input)).toBe(output));
	it.each(['', '12abc', '1.234,56', '1,23', '12.345', 'Infinity', Infinity, NaN])('rejects ambiguous currency %s', (input) => expect(() => parseCurrencyCell(input)).toThrow());
	it('accounts for accepted, duplicate, invalid and blank rows without writes', async () => {
		const parsed = parseExpensesSheetWithDiagnostics([headers, ['2026-01-01', 'Store', '$12.30', 'Food'], ['2026-01-01', 'Store', 12.3, 'Food'], ['2026-02-30', 'Invalid date', 4, 'Food'], [null, null], ['2026-01-02', 'Unknown', 5, 'New category'], ['2026-01-03', 'Bad amount', '5junk', 'Food']]);
		const preview = await previewSpreadsheet(parsed);
		expect(preview.accepted.map((r) => r.sourceRow)).toEqual([2, 6]);
		expect(preview.duplicates.map((r) => r.row)).toEqual([3]);
		expect(preview.invalid.map((r) => r.row)).toEqual([4, 7]);
		expect(preview.blankRows).toEqual([5]);
		expect(preview.unknownCategories).toEqual(['New category']);
		expect(await db.transactions.count()).toBe(0); // Cancellation needs no rollback.
		await importTransactions(preview.accepted, { categoryMapping: { 'New category': 1 } });
		expect(await db.transactions.count()).toBe(2);
	});
	it('preserves precise fixed shares and rechecks duplicates at commit', async () => {
		const preview = await previewSpreadsheet(parseExpensesSheetWithDiagnostics([headers, ['2026-01-01', 'Shared', '$99.99', 'Food', 'Y', '$33.33']]));
		await importTransactions(preview.accepted); await importTransactions(preview.accepted);
		expect(await db.transactions.count()).toBe(1);
		expect((await db.transactions.toArray())[0]).toMatchObject({ splitType: 'fixed', splitValue: 33.33, partnerShare: 33.33 });
	});
});
