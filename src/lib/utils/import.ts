import * as XLSX from 'xlsx';
import { db, type Transaction, type Category } from '$lib/db';
import { getAllCategories, getCategoryByName } from '$lib/stores/categories';

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
 * Convert Excel serial date number to JavaScript Date
 * Excel dates are number of days since Dec 30, 1899
 */
function excelDateToJS(excelDate: number): Date {
	// Excel's epoch is Dec 30, 1899
	// JavaScript's epoch is Jan 1, 1970
	// There's also a bug in Excel where it thinks 1900 was a leap year
	const msPerDay = 24 * 60 * 60 * 1000;
	const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
	return new Date(excelEpoch.getTime() + excelDate * msPerDay);
}

/**
 * Parse the Expenses sheet from an Excel file
 */
export function parseExpensesSheet(workbook: XLSX.WorkBook): ImportedTransaction[] {
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

		// Parse date (could be Excel serial number or string)
		let date: Date;
		if (typeof dateVal === 'number') {
			date = excelDateToJS(dateVal);
		} else {
			date = new Date(dateVal);
		}

		// Skip invalid dates
		if (isNaN(date.getTime())) continue;

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
			amount: Math.round(parsedAmount * 100) / 100, // Round to 2 decimals
			category,
			isShared,
			partnerShare: Math.round(partnerShare * 100) / 100,
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
				// If it's close to a round percentage, use percentage mode
				if (Math.abs(ratio - 0.5) < 0.01) {
					splitType = 'percentage';
					splitValue = 0.5;
				} else if (Math.abs(ratio - Math.round(ratio * 100) / 100) < 0.01) {
					splitType = 'percentage';
					splitValue = Math.round(ratio * 100) / 100;
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
				createdAt: now,
				updatedAt: now
			});

			imported++;
		} catch (error) {
			errors.push(`Failed to import "${t.merchant}": ${error}`);
		}
	}

	return {
		success: errors.length === 0,
		imported,
		skipped,
		errors
	};
}

/**
 * Read and parse an Excel file from a File object
 */
export async function readExcelFile(file: File): Promise<XLSX.WorkBook> {
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
