import { db, type Transaction, type Category, type MonthlyBudget, type Settings } from '$lib/db';
import { format } from 'date-fns';

/**
 * Export transactions to CSV format
 */
export async function exportTransactionsToCSV(
	transactions: Transaction[],
	categories: Category[]
): Promise<string> {
	const categoryMap = new Map(categories.map((c) => [c.id, c]));

	const headers = [
		'Date',
		'Merchant',
		'Amount',
		'Category',
		'Shared',
		'Partner Share',
		'Your Share',
		'Settled',
		'Notes'
	];

	const rows = transactions.map((t) => {
		const category = categoryMap.get(t.categoryId);
		const yourShare = t.isShared ? t.amount - t.partnerShare : t.amount;

		return [
			format(new Date(t.date), 'yyyy-MM-dd'),
			`"${t.merchant.replace(/"/g, '""')}"`, // Escape quotes in CSV
			t.amount.toFixed(2),
			category?.name ?? 'Unknown',
			t.isShared ? 'Y' : 'N',
			t.partnerShare.toFixed(2),
			yourShare.toFixed(2),
			t.isSettled ? 'Y' : 'N',
			t.notes ? `"${t.notes.replace(/"/g, '""')}"` : ''
		];
	});

	return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Export all data to JSON for backup
 */
export async function exportAllDataToJSON(): Promise<string> {
	const [transactions, categories, budgets, settings] = await Promise.all([
		db.transactions.toArray(),
		db.categories.toArray(),
		db.monthlyBudgets.toArray(),
		db.settings.get(1)
	]);

	const exportData = {
		exportDate: new Date().toISOString(),
		version: '1.0',
		data: {
			transactions,
			categories,
			budgets,
			settings
		}
	};

	return JSON.stringify(exportData, null, 2);
}

/**
 * Import data from JSON backup
 */
export async function importFromJSON(
	jsonString: string
): Promise<{ success: boolean; message: string }> {
	try {
		const importData = JSON.parse(jsonString);

		if (!importData.data) {
			return { success: false, message: 'Invalid backup format' };
		}

		const { transactions, categories, budgets, settings } = importData.data;

		// Clear existing data and import
		await db.transaction('rw', [db.transactions, db.categories, db.monthlyBudgets, db.settings], async () => {
			// Clear existing
			await db.transactions.clear();
			await db.categories.clear();
			await db.monthlyBudgets.clear();

			// Import categories first (needed for transaction references)
			if (categories && categories.length > 0) {
				// Remove IDs to let Dexie auto-generate
				const cleanCategories = categories.map(({ id, ...rest }: Category) => rest);
				await db.categories.bulkAdd(cleanCategories);
			}

			// Import budgets
			if (budgets && budgets.length > 0) {
				const cleanBudgets = budgets.map(({ id, ...rest }: MonthlyBudget) => rest);
				await db.monthlyBudgets.bulkAdd(cleanBudgets);
			}

			// Import transactions
			if (transactions && transactions.length > 0) {
				// Convert date strings back to Date objects
				const cleanTransactions = transactions.map(({ id, ...rest }: Transaction) => ({
					...rest,
					date: new Date(rest.date),
					createdAt: new Date(rest.createdAt),
					updatedAt: new Date(rest.updatedAt),
					settledDate: rest.settledDate ? new Date(rest.settledDate) : undefined
				}));
				await db.transactions.bulkAdd(cleanTransactions);
			}

			// Update settings if present
			if (settings) {
				await db.settings.put({ ...settings, id: 1 });
			}
		});

		return {
			success: true,
			message: `Imported ${transactions?.length ?? 0} transactions, ${categories?.length ?? 0} categories, ${budgets?.length ?? 0} budgets`
		};
	} catch (error) {
		return { success: false, message: `Import failed: ${error}` };
	}
}

/**
 * Trigger a file download in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
