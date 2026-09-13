import { runExclusive } from './mutation';
import { db, type Transaction } from '$lib/db';
import { assertCanMutate, createBackup, persistData, refreshDataCaches } from './index';
import { allocatePartnerShares } from '$lib/utils/split-allocation';

export interface SplitRepair {
	parent: Transaction;
	children: Transaction[];
	existingTotal: number;
	proposedTotal: number;
	allocations: number[];
	reason: string | null;
	fingerprint: string;
}
const cents = (n: number) => Math.round(n * 100);
export function reviewSplitRepairs(records: Transaction[]): SplitRepair[] {
	return records.filter((p) => p.isSplitParent && p.isShared && p.splitType === 'fixed').flatMap((parent) => {
		const children = records.filter((c) => c.parentTransactionId === parent.id).sort((a, b) => a.id! - b.id!);
		const existingTotal = children.reduce((sum, c) => sum + cents(c.partnerShare), 0) / 100;
		if (children.length >= 2 && children.reduce((sum, c) => sum + cents(c.amount), 0) === cents(parent.amount) && cents(existingTotal) === cents(parent.partnerShare)) return [];
		let allocations: number[] = [];
		let reason: string | null = null;
		try { allocations = allocatePartnerShares(children.map((c) => c.amount), true, 'fixed', parent.splitValue); }
		catch { reason = 'Invalid or incomplete category amounts'; }
		if ([parent, ...children].some((t) => t.isDeleted || t.isSettled || t.settledDate)) reason = 'Deleted or settled purchase';
		if (children.length < 2 || children.reduce((sum, c) => sum + cents(c.amount), 0) !== cents(parent.amount)) reason = 'Incomplete category group';
		if (cents(parent.partnerShare) !== cents(parent.splitValue) || children.some((c) => !c.isShared || c.splitType !== 'fixed' || cents(c.splitValue) !== cents(parent.splitValue) || cents(c.partnerShare) !== cents(parent.partnerShare) || c.merchant !== parent.merchant || new Date(c.date).getTime() !== new Date(parent.date).getTime() || c.isSplitParent)) reason = 'Original intended share is ambiguous';
		return [{ parent, children, existingTotal, proposedTotal: parent.splitValue, allocations, reason, fingerprint: JSON.stringify([parent, children]) }];
	});
}
export async function previewSplitRepairs(): Promise<SplitRepair[]> { return reviewSplitRepairs(await db.transactions.toArray()); }
/** Only explicitly selected preview records may be corrected. */
export async function applySplitRepairs(selected: SplitRepair[]): Promise<void> {
	return runExclusive(async () => {
		assertCanMutate();
		if (!selected.length) throw new Error('Select purchases to correct');
		if (selected.some((r) => r.reason)) throw new Error('Manual review required');
		await createBackup(true);
		await db.transaction('rw', db.transactions, async () => {
			const current = reviewSplitRepairs(await db.transactions.toArray());
			for (const selectedRow of selected) {
				const row = current.find((r) => r.parent.id === selectedRow.parent.id);
				if (!row || row.reason || row.fingerprint !== selectedRow.fingerprint) throw new Error('Purchase changed since preview; review again');
				for (const [index, child] of row.children.entries()) await db.transactions.update(child.id!, { partnerShare: row.allocations[index], splitValue: row.allocations[index], updatedAt: new Date() });
			}
		});
		await refreshDataCaches();
		await persistData('transactions');
	});
}
