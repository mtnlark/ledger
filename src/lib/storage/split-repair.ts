import { runExclusive } from './mutation';
import { db, type Transaction } from '$lib/db';
import { assertCanMutate, preserveOriginalSnapshot, persistData, refreshDataCaches } from './index';
import { dehydrateAll } from './serialization';
import { validateBackup } from './backup';
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
	const childrenByParent = new Map<number, Transaction[]>();
	for (const row of records) {
		if (row.parentTransactionId === undefined) continue;
		const children = childrenByParent.get(row.parentTransactionId) ?? [];
		children.push(row);
		childrenByParent.set(row.parentTransactionId, children);
	}
	return records.filter((p) => p.isSplitParent && p.isShared && p.splitType === 'fixed').flatMap((parent) => {
		const children = (childrenByParent.get(parent.id!) ?? []).sort((a, b) => a.id! - b.id!);
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
		const original = await dehydrateAll();
		const next = structuredClone(original);
		const nextById = new Map(next.transactions.map((row) => [row.id, row]));
		const current = new Map(reviewSplitRepairs(original.transactions).map((row) => [row.parent.id, row]));
		for (const selectedRow of selected) {
			const row = current.get(selectedRow.parent.id);
			if (!row || row.reason || row.fingerprint !== selectedRow.fingerprint) throw new Error('Purchase changed since preview; review again');
			for (const [index, child] of row.children.entries()) Object.assign(nextById.get(child.id)!, { partnerShare: row.allocations[index], splitValue: row.allocations[index], updatedAt: new Date() });
		}
		validateBackup(next);
		await preserveOriginalSnapshot(original, 'historical fixed-share repair');
		await db.transaction('rw', db.transactions, async () => {
			const live = new Map(reviewSplitRepairs(await db.transactions.toArray()).map((row) => [row.parent.id, row]));
			for (const row of selected) if (live.get(row.parent.id)?.fingerprint !== row.fingerprint) throw new Error('Purchase changed since preview; review again');
			const changedIds = new Set(selected.flatMap((row) => row.children.map((child) => child.id)));
			await db.transactions.bulkPut(next.transactions.filter((row) => changedIds.has(row.id)));
		});
		await persistData('transactions');
		await refreshDataCaches(true);
	});
}
