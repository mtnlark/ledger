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
 * Convert Excel serial date number to JavaScript Date (local time)
 * Excel dates are number of days since Dec 30, 1899
 * We use date arithmetic instead of milliseconds to avoid timezone issues
 */
function excelDateToJS(excelDate: number): Date {
	// Excel's epoch is Dec 30, 1899
	// Use integer days to avoid floating point issues
	const days = Math.floor(excelDate);
	// Create date using component arithmetic to ensure local time
	// Start from a known date and add days
	const result = new Date(1899, 11, 30 + days);
	return result;
}

/**
 * Parse a date string into a local Date, avoiding UTC interpretation
 * Handles formats like: "2026-01-01", "1/1/2026", "01/01/2026"
 */
function parseDateString(dateStr: string): Date | null {
	// Try ISO format first (YYYY-MM-DD)
	const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (isoMatch) {
		const [, year, month, day] = isoMatch;
		return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
	}

	// Try US format (M/D/YYYY or MM/DD/YYYY)
	const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
	if (usMatch) {
		let [, month, day, year] = usMatch;
		// Handle 2-digit years
		let yearNum = parseInt(year);
		if (yearNum < 100) {
			yearNum += yearNum < 50 ? 2000 : 1900;
		}
		return new Date(yearNum, parseInt(month) - 1, parseInt(day));
	}

	return null;
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

		// Parse date (could be Excel serial number, Date object, or string)
		let date: Date | null = null;
		if (typeof dateVal === 'number') {
			date = excelDateToJS(dateVal);
		} else if (dateVal instanceof Date) {
			// If XLSX returns a Date object, extract components to avoid timezone issues
			date = new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
		} else if (typeof dateVal === 'string') {
			date = parseDateString(dateVal);
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

/**
 * Diagnostic function to understand how dates are stored
 * Returns info about transactions, with special attention to month boundaries
 */
export async function diagnoseDates(): Promise<{
	total: number;
	samples: Array<{
		id: number;
		merchant: string;
		rawDate: unknown;
		dateType: string;
		parsedDate: string;
		hours: number;
		isoString: string;
	}>;
	monthBoundaryIssues: Array<{
		id: number;
		merchant: string;
		storedDate: string;
		dayOfMonth: number;
	}>;
}> {
	const transactions = await db.transactions.toArray();
	const samples = transactions.slice(0, 10).map((t) => {
		const date = new Date(t.date);
		return {
			id: t.id!,
			merchant: t.merchant,
			rawDate: t.date,
			dateType: typeof t.date,
			parsedDate: date.toString(),
			hours: date.getHours(),
			isoString: date.toISOString()
		};
	});

	// Find transactions on last day of month (potential off-by-one errors)
	const monthBoundaryIssues = transactions
		.filter((t) => {
			const date = new Date(t.date);
			const day = date.getDate();
			// Last days of months that could be off-by-one from 1st of next month
			return day === 31 || day === 30 || day === 28 || day === 29;
		})
		.slice(0, 20)
		.map((t) => {
			const date = new Date(t.date);
			return {
				id: t.id!,
				merchant: t.merchant,
				storedDate: date.toLocaleDateString(),
				dayOfMonth: date.getDate()
			};
		});

	return { total: transactions.length, samples, monthBoundaryIssues };
}

/**
 * Fix transaction dates that were incorrectly stored with timezone issues
 * This shifts dates forward by one day if they appear to be off
 * Returns the number of transactions fixed
 */
export async function fixTransactionDates(): Promise<{ fixed: number; checked: number; details: string[] }> {
	const transactions = await db.transactions.toArray();
	let fixed = 0;
	const details: string[] = [];

	for (const t of transactions) {
		const date = new Date(t.date);
		const hours = date.getHours();
		const minutes = date.getMinutes();

		// Check multiple indicators of timezone issues:
		// 1. Evening hours (17-23) indicate UTC midnight shifted to local time
		// 2. Early morning hours (0-7) with non-zero minutes might also indicate issues
		const isEvening = hours >= 17 && hours <= 23;
		const isNotMidnight = hours !== 0 || minutes !== 0;

		if (isEvening) {
			// Create a new date at midnight local time for the NEXT day
			const fixedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
			await db.transactions.update(t.id!, {
				date: fixedDate,
				updatedAt: new Date()
			});
			details.push(`Fixed: ${t.merchant} from ${date.toLocaleDateString()} ${hours}:${minutes} to ${fixedDate.toLocaleDateString()}`);
			fixed++;
		} else if (isNotMidnight && fixed === 0 && details.length < 5) {
			// Log some samples of non-midnight times for diagnosis (only if we haven't fixed anything yet)
			details.push(`Sample: ${t.merchant} at ${date.toLocaleDateString()} ${hours}:${String(minutes).padStart(2, '0')}`);
		}
	}

	if (fixed === 0 && details.length === 0) {
		details.push('All dates appear to be at midnight local time - no obvious timezone issues detected');
	}

	return { fixed, checked: transactions.length, details };
}
