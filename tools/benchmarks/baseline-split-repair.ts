// Frozen pre-fix reviewer for benchmark equivalence only.
import type { Transaction } from '$lib/db';
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
