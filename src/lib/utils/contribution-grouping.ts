import type { SavingsContribution } from '$lib/db';
/** New arrays belong exclusively to this map; append without copying prior groups. */
export function groupContributionsByAccount(contributions: SavingsContribution[]): Map<number, SavingsContribution[]> {
	const map = new Map<number, SavingsContribution[]>();
	for (const contribution of contributions) {
		const group = map.get(contribution.accountId) ?? [];
		group.push(contribution); map.set(contribution.accountId, group);
	}
	return map;
}
