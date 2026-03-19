import { db } from '$lib/db';
import { getAllCategories, getCategoryByName } from '$lib/stores/categories';
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

/**
 * Parse the Expenses sheet from an Excel file.
 * Dynamically imports XLSX to avoid loading ~500KB at app startup.
 */
export async function parseExpensesSheet(workbook: { Sheets: Record<string, unknown>; SheetNames: string[] }): Promise<ImportedTransaction[]> {
	const XLSX = await import('xlsx');

	const sheet = workbook.Sheets['Expenses'];
	if (!sheet) {
		throw new Error('No "Expenses" sheet found in workbook');
	}

	// Get all rows as array of arrays
	const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });

	// First row should be headers
	const headers = rows[0] as string[];
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

	// Get all categories for matching
	const categories = await getAllCategories();

	// Get existing transactions for duplicate detection
	const existingTransactions = skipDuplicates ? await db.transactions.toArray() : [];

	for (const t of transactions) {
		try {
			// Find matching category
			let category = await getCategoryByName(t.category);
			if (!category) {
				// Use first category as fallback, or skip
				category = categories[0];
				if (!category) {
					errors.push(`No category found for "${t.merchant}" - skipped`);
					skipped++;
					continue;
				}
			}

			// Check for duplicates (same date, merchant, amount)
			if (skipDuplicates) {
				const isDuplicate = existingTransactions.some((existing) => {
					const existingDate = new Date(existing.date);
					return (
						existingDate.toDateString() === t.date.toDateString() &&
						existing.merchant === t.merchant &&
						Math.abs(existing.amount - t.amount) < 0.01
					);
				});

				if (isDuplicate) {
					skipped++;
					continue;
				}
			}

			// Calculate split type and value from partner share
			let splitType: 'percentage' | 'fixed' = 'fixed';
			let splitValue = t.partnerShare;

			if (t.isShared && t.partnerShare > 0 && t.amount > 0) {
				const ratio = t.partnerShare / t.amount;
				const roundedRatio = roundCurrency(ratio);
				// If it's close to a round percentage, use percentage mode
				if (Math.abs(ratio - 0.5) < 0.01) {
					splitType = 'percentage';
					splitValue = 0.5;
				} else if (Math.abs(ratio - roundedRatio) < 0.01) {
					splitType = 'percentage';
					splitValue = roundedRatio;
				}
			}

			const now = new Date();

			await db.transactions.add({
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

			imported++;
		} catch (error) {
			errors.push(`Failed to import "${t.merchant}": ${error}`);
		}
	}

	// Persist imported data to file storage (Tauri only)
	if (imported > 0) {
		await persistData();

		// Rebuild in-memory caches with imported transactions
		// This ensures tag index and transaction cache are up-to-date immediately
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

/**
 * Read and parse an Excel file from a File object.
 * Dynamically imports XLSX to avoid loading ~500KB at app startup.
 */
export async function readExcelFile(file: File): Promise<{ Sheets: Record<string, unknown>; SheetNames: string[] }> {
	const XLSX = await import('xlsx');

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const data = new Uint8Array(e.target?.result as ArrayBuffer);
				const workbook = XLSX.read(data, { type: 'array' });
				resolve(workbook);
			} catch (error) {
				reject(error);
			}
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsArrayBuffer(file);
	});
}
