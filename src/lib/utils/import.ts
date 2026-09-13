import { runMutation } from '$lib/storage/mutation';
import { db, type Transaction } from '$lib/db';
import { getAllCategories } from '$lib/stores/categories';
import { excelDateToJS, parseDateString } from '$lib/utils/date-helpers';
import { assertCanMutate, refreshDataCaches } from '$lib/storage';
import { roundCurrency } from '$lib/utils/currency';

export interface ImportedTransaction {
	date: Date; merchant: string; amount: number; category: string;
	isShared: boolean; partnerShare: number; isSettled: boolean;
	sourceRow?: number;
}
export interface ImportResult { success: boolean; imported: number; skipped: number; errors: string[]; }
export type CellValue = string | number | boolean | Date | null;
export interface RowDiagnostic { row: number; reason: string; }
export interface SheetParseResult { rows: ImportedTransaction[]; invalid: RowDiagnostic[]; blankRows: number[]; }
export interface SheetPreview extends SheetParseResult {
	accepted: ImportedTransaction[]; duplicates: RowDiagnostic[]; unknownCategories: string[];
}
/** Numeric Excel values or unambiguous US currency, with at most two decimals. */
export function parseCurrencyCell(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return roundCurrency(value);
	if (typeof value !== 'string' || !/^-?\$?(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Invalid US currency amount');
	const result = Number(value.trim().replace(/[$,]/g, ''));
	if (!Number.isFinite(result)) throw new Error('Amount must be finite');
	return roundCurrency(result);
}
function parseSheetDate(value: CellValue | undefined): Date | null {
	if (value instanceof Date) return new Date(value);
	if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? excelDateToJS(value) : null;
	if (typeof value !== 'string') return null;
	const text = value.trim();
	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
	const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
	if (!iso && !us) return null;
	const date = parseDateString(text);
	const month = Number(iso ? iso[2] : us![1]), day = Number(iso ? iso[3] : us![2]);
	return date && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
}
export function parseExpensesSheetWithDiagnostics(rows: CellValue[][]): SheetParseResult {
	const headers = (rows[0] ?? []).map((h) => String(h ?? '').toLowerCase());
	const col = (name: string) => headers.findIndex((h) => h.includes(name));
	const dateCol = col('date'), merchantCol = col('merchant'), amountCol = col('amount'), categoryCol = col('category'), sharedCol = col('shared');
	const shareCol = headers.findIndex((h) => h.includes('share') && !h.includes('shared'));
	const settledCol = headers.findIndex((h) => h.includes('venmo') || h.includes('settled'));
	if ([dateCol, merchantCol, amountCol].includes(-1)) throw new Error('Required columns (Date, Merchant, Amount) not found');
	const result: SheetParseResult = { rows: [], invalid: [], blankRows: [] };
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i] ?? [];
		if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) { result.blankRows.push(i + 1); continue; }
		try {
			const dateValue = row[dateCol];
			const date = parseSheetDate(dateValue);
			if (!date || !Number.isFinite(date.getTime())) throw new Error('Invalid or missing date');
			const merchant = String(row[merchantCol] ?? '').trim();
			if (!merchant) throw new Error('Missing merchant');
			const amount = parseCurrencyCell(row[amountCol]);
			if (amount <= 0) throw new Error('Amount must be positive');
			const flag = (index: number) => {
				const v = String(row[index] ?? '').trim().toUpperCase();
				if (!['', 'Y', 'YES', 'TRUE', 'N', 'NO', 'FALSE', 'X'].includes(v)) throw new Error('Invalid shared or settled flag');
				return ['Y', 'YES', 'TRUE'].includes(v);
			};
			const isShared = flag(sharedCol);
			const shareValue = row[shareCol];
			const partnerShare = isShared && shareValue != null && shareValue !== '' && shareValue !== 'X' ? parseCurrencyCell(shareValue) : 0;
			if (partnerShare < 0 || partnerShare > amount) throw new Error('Partner share must be within purchase amount');
			result.rows.push({ date, merchant, amount, category: String(row[categoryCol] ?? 'Unknown').trim() || 'Unknown', isShared, partnerShare, isSettled: flag(settledCol), sourceRow: i + 1 });
		} catch (error) { result.invalid.push({ row: i + 1, reason: error instanceof Error ? error.message : String(error) }); }
	}
	return result;
}
/** Compatibility helper for callers that only need the parsed records. */
export async function parseExpensesSheet(rows: CellValue[][]): Promise<ImportedTransaction[]> { return parseExpensesSheetWithDiagnostics(rows).rows; }
const categoryKey = (name: string) => name.trim().toLowerCase();
function duplicateKey(t: { date: Date; merchant: string; amount: number }): string {
	const d = new Date(t.date);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}\0${t.merchant.trim().toLowerCase()}\0${Math.round(t.amount * 100)}`;
}
export async function previewSpreadsheet(parsed: SheetParseResult, mapping: Record<string, number> = {}): Promise<SheetPreview> {
	const categories = await getAllCategories();
	const known = new Map(categories.map((c) => [categoryKey(c.name), c.id!]));
	const seen = new Set((await db.transactions.toArray()).filter((t) => !t.isDeleted && !t.isSplitParent).map(duplicateKey));
	const accepted: ImportedTransaction[] = [], duplicates: RowDiagnostic[] = [], unknown = new Set<string>();
	for (const [index, row] of parsed.rows.entries()) {
		const key = duplicateKey(row);
		if (seen.has(key)) { duplicates.push({ row: row.sourceRow ?? index + 2, reason: 'Duplicate date, merchant and amount' }); continue; }
		seen.add(key);
		const id = mapping[row.category] ?? known.get(categoryKey(row.category));
		if (!categories.some((c) => c.id === id)) unknown.add(row.category);
		accepted.push(row);
	}
	return { ...parsed, accepted, duplicates, unknownCategories: [...unknown] };
}
export async function importTransactions(transactions: ImportedTransaction[], options: { skipDuplicates?: boolean; categoryMapping?: Record<string, number> } = {}): Promise<ImportResult> {
	assertCanMutate();
	const now = new Date();
	let skipped = 0;
	const imported = await runMutation(['transactions', 'categories'], async () => {
		const categories = await getAllCategories();
		const byName = new Map(categories.map((c) => [categoryKey(c.name), c.id!]));
		const seen = new Set((await db.transactions.toArray()).filter((t) => !t.isDeleted && !t.isSplitParent).map(duplicateKey));
		const records: Omit<Transaction, 'id'>[] = [];
		for (const t of transactions) {
			if (!Number.isFinite(t.amount) || t.amount <= 0 || !Number.isFinite(t.partnerShare) || t.partnerShare < 0 || t.partnerShare > t.amount || !Number.isFinite(t.date.getTime()) || !t.merchant.trim()) throw new Error(`Invalid row ${t.sourceRow ?? ''}`);
			const categoryId = options.categoryMapping?.[t.category] ?? byName.get(categoryKey(t.category));
			if (!categories.some((c) => c.id === categoryId)) throw new Error(`Map unknown category "${t.category}" before importing`);
			const key = duplicateKey(t);
			if (options.skipDuplicates !== false && seen.has(key)) { skipped++; continue; }
			seen.add(key);
			records.push({ date: t.date, merchant: t.merchant, amount: t.amount, categoryId: categoryId!, isShared: t.isShared, partnerShare: t.isShared ? t.partnerShare : 0, splitType: 'fixed', splitValue: t.isShared ? t.partnerShare : 0, isSettled: t.isSettled, settledDate: t.isSettled ? now : undefined, isEssential: false, isSubscription: false, createdAt: now, updatedAt: now });
		}
		if (records.length) await db.transactions.bulkAdd(records);
		return records.length;
	});
	if (imported) { await refreshDataCaches(); }
	return { success: true, imported, skipped, errors: [] };
}

export async function readExcelFile(file: File): Promise<CellValue[][]> {
	const { readSheet, SheetNotFoundError } = await import('read-excel-file/browser');
	try {
		const rows = await readSheet(file, 'Expenses');
		return rows.map((row) => row.map((value) =>
			value instanceof Date
				? new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
				: value
		)) as CellValue[][];
	} catch (error) {
		if (error instanceof SheetNotFoundError) {
			throw new Error('No "Expenses" sheet found in workbook', { cause: error });
		}
		throw error;
	}
}
