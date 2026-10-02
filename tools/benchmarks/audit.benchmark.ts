import { expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { validateBackup } from '$lib/storage/backup';
import { reviewSplitRepairs } from '$lib/storage/split-repair';
import { groupContributionsByAccount } from '$lib/utils/contribution-grouping';
import { validateBackup as baselineValidate } from './baseline-backup';
import { reviewSplitRepairs as baselineRepair } from './baseline-split-repair';
import type { StoredData } from '$lib/storage/types';
import type { SavingsContribution, Transaction } from '$lib/db';
const now = new Date(2026, 8, 1);
const tx = (id: number): Transaction => ({ id, date: now, merchant: 'Store', amount: 100, categoryId: 1, isShared: true, splitType: 'fixed', splitValue: 20, partnerShare: 20, isSettled: false, isEssential: false, isSubscription: false, createdAt: now, updatedAt: now });
function measure(fn: () => unknown) { fn(); const samples = Array.from({ length: 5 }, () => { const start = performance.now(); fn(); return performance.now() - start; }); return samples.sort((a, b) => a - b)[2]; }
function baselineGrouping(contributions: SavingsContribution[]) { const map = new Map<number, SavingsContribution[]>(); for (const c of contributions) map.set(c.accountId, [...(map.get(c.accountId) ?? []), c]); return map; }
it('reports median timings with output equivalence at audit sizes', () => {
	const results: Record<string, number | string>[] = [];
	for (const size of [3000, 9000, 27000]) {
		const records = Array.from({ length: size / 3 }, (_, index) => {
			const id = index * 3 + 1;
			return [{ ...tx(id), isSplitParent: true }, { ...tx(id + 1), parentTransactionId: id, amount: 60 }, { ...tx(id + 2), parentTransactionId: id, amount: 40 }];
		}).flat();
		const data: StoredData = { version: '1.0', exportedAt: now.toISOString(), transactions: records, categories: [{ id: 1, name: 'Food', sortOrder: 1, isActive: true, isEssential: true }], monthlyBudgets: [], categoryBudgets: [], settings: null };
		const contributions = Array.from({ length: size }, (_, id) => ({ id: id + 1, accountId: 1, amount: 10, source: 'other' as const, date: now, createdAt: now, updatedAt: now }));
		expect(validateBackup(data)).toEqual(baselineValidate(data));
		expect(reviewSplitRepairs(records)).toEqual(baselineRepair(records));
		expect(groupContributionsByAccount(contributions)).toEqual(baselineGrouping(contributions));
		for (const [name, before, after] of [
			['validation', () => baselineValidate(data), () => validateBackup(data)],
			['split repair', () => baselineRepair(records), () => reviewSplitRepairs(records)],
			['contribution grouping', () => baselineGrouping(contributions), () => groupContributionsByAccount(contributions)]
		] as const) results.push({ name, size, beforeMs: Number(measure(before).toFixed(2)), afterMs: Number(measure(after).toFixed(2)) });
	}
	console.table(results);
}, 120000);
