import { db, type Transaction } from '$lib/db';
import { getAllCategories } from '$lib/stores/categories';
import { excelDateToJS, parseDateString } from '$lib/utils/date-helpers';
import { persistData } from '$lib/storage';
import { roundCurrency } from '$lib/utils/currency';
import { getTransactionCache } from '$lib/stores/transactionCache';
import { tagIndex } from '$lib/stores/tags.svelte';

export interface ImportedTransaction {
	date: Date;
	merchant: string;
	amount: number;
	category: string;
	isShared: boolean;
	partnerShare: number;
	isSettled: boolean;
}

export interface ImportResult {
	success: boolean;
	imported: number;
	skipped: number;
	errors: string[];
}

export type CellValue = string | number | boolean | Date | null;

/**
 * Parse the Expenses sheet rows (array-of-arrays, header row first) into
 * transactions. Rows come from readExcelFile.
 */
export async function parseExpensesSheet(rows: CellValue[][]): Promise<ImportedTransaction[]> {
	// First row should be headers
	const headers = (rows[0] ?? []) as string[];
	const dateCol = headers.findIndex((h) => h?.toLowerCase().includes('date'));
	const merchantCol = headers.findIndex((h) => h?.toLowerCase().includes('merchant'));
	const amountCol = headers.findIndex((h) => h?.toLowerCase().includes('amount'));
	const categoryCol = headers.findIndex((h) => h?.toLowerCase().includes('category'));
	const sharedCol = headers.findIndex((h) => h?.toLowerCase().includes('shared'));
	const partnerShareCol = headers.findIndex(
		(h) => h?.toLowerCase().includes('share') && !h?.toLowerCase().includes('shared')
	);
	const settledCol = headers.findIndex(
		(h) => h?.toLowerCase().includes('venmo') || h?.toLowerCase().includes('settled')
	);

	if (dateCol === -1 || merchantCol === -1 || amountCol === -1) {
		throw new Error('Required columns (Date, Merchant, Amount) not found');
	}

	const transactions: ImportedTransaction[] = [];

	// Parse data rows (skip header)
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (!row || row.length === 0) continue;

		const dateVal = row[dateCol];
		const merchant = row[merchantCol];
		const amount = row[amountCol];

		// Skip empty rows
		if (!dateVal || !merchant || !amount) continue;

		// Parse date (could be Excel serial number, Date object, or string)
		let date: Date | null = null;
		if (typeof dateVal === 'number') {
			date = excelDateToJS(dateVal);
		} else if (typeof dateVal === 'string') {
			date = parseDateString(dateVal);
		} else if (dateVal && typeof (dateVal as Date).getFullYear === 'function') {
			// If XLSX returns a Date object, extract components to avoid timezone issues
			const d = dateVal as Date;
			date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		}

		// Skip invalid dates
		if (!date || isNaN(date.getTime())) continue;

		// Parse amount
		const parsedAmount = typeof amount === 'number' ? amount : parseFloat(String(amount));
		if (isNaN(parsedAmount) || parsedAmount <= 0) continue;

		// Parse category
		const category = categoryCol !== -1 ? String(row[categoryCol] || 'Unknown') : 'Unknown';

		// Parse shared flag
		const sharedVal = sharedCol !== -1 ? String(row[sharedCol] || '').toUpperCase() : '';
		const isShared = sharedVal === 'Y' || sharedVal === 'YES' || sharedVal === 'TRUE';

		// Parse partner share
		let partnerShare = 0;
		if (isShared && partnerShareCol !== -1) {
			const shareVal = row[partnerShareCol];
			if (typeof shareVal === 'number') {
				partnerShare = shareVal;
			} else if (typeof shareVal === 'string' && shareVal !== 'X' && shareVal !== '') {
				partnerShare = parseFloat(shareVal) || 0;
			}
		}

		// Parse settled flag
		const settledVal = settledCol !== -1 ? String(row[settledCol] || '').toUpperCase() : '';
		const isSettled = settledVal === 'Y' || settledVal === 'YES' || settledVal === 'TRUE';

		transactions.push({
			date,
			merchant: String(merchant).trim(),
			amount: roundCurrency(parsedAmount),
			category,
			isShared,
			partnerShare: roundCurrency(partnerShare),
			isSettled
		});
	}

	return transactions;
}

/**
 * Import transactions from parsed data into the database
 */
export async function importTransactions(
	transactions: ImportedTransaction[],
	options: { skipDuplicates?: boolean } = {}
): Promise<ImportResult> {
	const { skipDuplicates = true } = options;
	const errors: string[] = [];
	let imported = 0;
	let skipped = 0;

	const categories = await getAllCategories();
	const existingTransactions = skipDuplicates ? await db.transactions.toArray() : [];
	const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
	const amountsByDayAndMerchant = new Map<string, number[]>();

	if (skipDuplicates) {
		for (const transaction of existingTransactions) {
			const key = duplicateGroupKey(new Date(transaction.date), transaction.merchant);
			const amounts = amountsByDayAndMerchant.get(key);
			if (amounts) amounts.push(transaction.amount);
			else amountsByDayAndMerchant.set(key, [transaction.amount]);
		}
	}

	const now = new Date();
	const records: Omit<Transaction, 'id'>[] = [];

	for (const t of transactions) {
		const category = categoryByName.get(t.category.toLowerCase()) ?? categories[0];
		if (!category) {
			errors.push(`No category found for "${t.merchant}" - skipped`);
			skipped++;
			continue;
		}

		const duplicateKey = duplicateGroupKey(t.date, t.merchant);
		const matchingAmounts = amountsByDayAndMerchant.get(duplicateKey);
		if (skipDuplicates && matchingAmounts?.some((amount) => Math.abs(amount - t.amount) < 0.01)) {
			skipped++;
			continue;
		}

		let splitType: 'percentage' | 'fixed' = 'fixed';
		let splitValue = t.partnerShare;

		if (t.isShared && t.partnerShare > 0 && t.amount > 0) {
			const ratio = t.partnerShare / t.amount;
			const roundedRatio = roundCurrency(ratio);
			if (Math.abs(ratio - 0.5) < 0.01) {
				splitType = 'percentage';
				splitValue = 0.5;
			} else if (Math.abs(ratio - roundedRatio) < 0.01) {
				splitType = 'percentage';
				splitValue = roundedRatio;
			}
		}

		records.push({
			date: t.date,
			merchant: t.merchant,
			amount: t.amount,
			categoryId: category.id!,
			isShared: t.isShared,
			splitType,
			splitValue,
			partnerShare: t.partnerShare,
			isSettled: t.isSettled,
			settledDate: t.isSettled ? now : undefined,
			isEssential: false,
			isSubscription: false,
			createdAt: now,
			updatedAt: now
		});

		if (matchingAmounts) matchingAmounts.push(t.amount);
		else amountsByDayAndMerchant.set(duplicateKey, [t.amount]);
	}

	if (records.length > 0) {
		try {
			await db.transaction('rw', db.transactions, () => db.transactions.bulkAdd(records));
			imported = records.length;
		} catch (error) {
			errors.push(`Failed to import transactions: ${error}`);
		}
	}

	if (imported > 0) {
		await persistData('transactions');

		const allTransactions = await db.transactions.toArray();
		const cache = getTransactionCache();
		cache.initialize(allTransactions);
		tagIndex.rebuild(cache.getAll());
	}

	return {
		success: errors.length === 0,
		imported,
		skipped,
		errors
	};
}

function duplicateGroupKey(date: Date, merchant: string): string {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}\0${merchant}`;
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
