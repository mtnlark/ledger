import { type Transaction, type Category } from '$lib/db';
import { getUserAmount } from '$lib/utils/currency';
import { getAllData, replaceAllData } from '$lib/storage';
import { encodeBackup, parseBackup } from '$lib/storage/backup';
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
		const yourShare = getUserAmount(t);

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
	return encodeBackup(await getAllData());
}

/** Restore only after the caller has presented parseBackup's preview. */
export async function importFromJSON(jsonString: string): Promise<{ success: boolean; message: string }> {
	try {
		const preview = await parseBackup(jsonString);
		await replaceAllData(preview.data);
		return { success: true, message: `Restored ${preview.counts.transactions} transactions and all backup tables` };
	} catch (error) {
		return { success: false, message: `Restore failed: ${error}` };
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
