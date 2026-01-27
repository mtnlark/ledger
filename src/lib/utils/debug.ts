/**
 * Debug and repair utilities for Ledger
 *
 * These functions are for diagnosing and fixing data issues.
 * They are NOT part of the normal application flow and should
 * only be used when troubleshooting problems.
 *
 * All functions check for DEV mode and warn if called in production.
 */

import { db } from '$lib/db';
import { persistData } from '$lib/storage';

/**
 * Warn if debug utilities are being used in production.
 * Returns true if in production (caller should consider returning early).
 */
function warnIfProduction(functionName: string): boolean {
	if (!import.meta.env.DEV) {
		console.warn(
			`[Debug] ${functionName}() should only be called in development. ` +
				'These utilities may have performance implications in production.'
		);
		return true;
	}
	return false;
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
	warnIfProduction('diagnoseDates');
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
export async function fixTransactionDates(): Promise<{
	fixed: number;
	checked: number;
	details: string[];
}> {
	warnIfProduction('fixTransactionDates');
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
			details.push(
				`Fixed: ${t.merchant} from ${date.toLocaleDateString()} ${hours}:${minutes} to ${fixedDate.toLocaleDateString()}`
			);
			fixed++;
		} else if (isNotMidnight && fixed === 0 && details.length < 5) {
			// Log some samples of non-midnight times for diagnosis (only if we haven't fixed anything yet)
			details.push(
				`Sample: ${t.merchant} at ${date.toLocaleDateString()} ${hours}:${String(minutes).padStart(2, '0')}`
			);
		}
	}

	if (fixed === 0 && details.length === 0) {
		details.push('All dates appear to be at midnight local time - no obvious timezone issues detected');
	}

	if (fixed > 0) {
		await persistData();
	}

	return { fixed, checked: transactions.length, details };
}

/**
 * Diagnose and repair category ID mismatches
 * Returns info about what was found and fixed
 */
export async function repairCategoryIds(): Promise<{
	checked: number;
	fixed: number;
	details: string[];
}> {
	warnIfProduction('repairCategoryIds');
	const transactions = await db.transactions.toArray();
	const categories = await db.categories.toArray();

	const details: string[] = [];
	let fixed = 0;

	// Build lookup maps
	const categoryById = new Map(categories.map((c) => [c.id, c]));

	details.push(`Found ${categories.length} categories and ${transactions.length} transactions`);

	// Get all unique categoryIds from transactions
	const transactionCategoryIds = [...new Set(transactions.map((t) => t.categoryId))].sort(
		(a, b) => a - b
	);
	const categoryIds = categories.map((c) => c.id!).sort((a, b) => a - b);

	details.push(`Category IDs in categories table: ${categoryIds.join(', ')}`);
	details.push(`Category IDs referenced in transactions: ${transactionCategoryIds.join(', ')}`);

	// Find transactions with invalid categoryIds
	const invalidTransactions = transactions.filter((t) => !categoryById.has(t.categoryId));
	details.push(`Found ${invalidTransactions.length} transactions with invalid category IDs`);

	if (invalidTransactions.length > 0 && categories.length > 0) {
		// Try to detect if there's a consistent offset
		// E.g., categories are 1-23 but transactions reference 24-46
		const minCatId = Math.min(...categoryIds);
		const minTxCatId = Math.min(...transactionCategoryIds);

		// Check if it's a simple offset (all transaction IDs are higher/lower by same amount)
		const possibleOffset = minTxCatId - minCatId;
		const couldBeOffset = transactionCategoryIds.every((txId) => {
			const mappedId = txId - possibleOffset;
			return categoryById.has(mappedId);
		});

		if (couldBeOffset && possibleOffset !== 0) {
			details.push(`Detected ID offset of ${possibleOffset}. Remapping...`);

			for (const t of transactions) {
				const newCategoryId = t.categoryId - possibleOffset;
				if (categoryById.has(newCategoryId) && newCategoryId !== t.categoryId) {
					await db.transactions.update(t.id!, {
						categoryId: newCategoryId,
						updatedAt: new Date()
					});
					fixed++;
				}
			}
		} else {
			// No pattern detected, assign to first category
			const defaultCategory = categories[0];
			details.push(
				`No ID pattern detected. Assigning ${invalidTransactions.length} transactions to: ${defaultCategory.name}`
			);

			for (const t of invalidTransactions) {
				await db.transactions.update(t.id!, {
					categoryId: defaultCategory.id!,
					updatedAt: new Date()
				});
				fixed++;
			}
		}
	}

	// Persist changes to file storage (Tauri only)
	if (fixed > 0) {
		await persistData();
	}

	return { checked: transactions.length, fixed, details };
}
