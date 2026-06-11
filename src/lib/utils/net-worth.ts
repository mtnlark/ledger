import type { LinkedAccount, BalanceSnapshot } from '$lib/db';
import { roundCurrency } from './currency';

export interface NetWorthSummary {
	total: number;
	assets: number;
	liabilities: number;
}

export interface NetWorthPoint {
	date: string; // 'YYYY-MM-DD' (local)
	total: number;
}

function sign(account: LinkedAccount): number {
	return account.accountClass === 'liability' ? -1 : 1;
}

function dayKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Net worth = Σ assets − Σ liabilities over active accounts. */
export function calculateNetWorth(accounts: LinkedAccount[]): NetWorthSummary {
	let assets = 0;
	let liabilities = 0;
	for (const a of accounts) {
		if (!a.isActive) continue;
		if (a.accountClass === 'liability') liabilities += a.currentBalance;
		else assets += a.currentBalance;
	}
	assets = roundCurrency(assets);
	liabilities = roundCurrency(liabilities);
	return { total: roundCurrency(assets - liabilities), assets, liabilities };
}

/**
 * Daily net-worth series from snapshots. Each account contributes its most
 * recent snapshot on or before a given day (forward fill); an account with no
 * snapshot yet contributes nothing. Points exist only on days that have at
 * least one snapshot — the chart connects them.
 */
export function buildNetWorthSeries(
	snapshots: BalanceSnapshot[],
	accounts: LinkedAccount[]
): NetWorthPoint[] {
	const signByAccount = new Map<number, number>();
	for (const a of accounts) {
		if (a.isActive && a.id != null) signByAccount.set(a.id, sign(a));
	}

	const relevant = snapshots
		.filter((s) => signByAccount.has(s.accountId))
		.map((s) => ({ ...s, day: dayKey(new Date(s.capturedAt)) }))
		.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

	if (relevant.length === 0) return [];

	const lastBalance = new Map<number, number>();
	const series: NetWorthPoint[] = [];
	let i = 0;
	while (i < relevant.length) {
		const day = relevant[i].day;
		while (i < relevant.length && relevant[i].day === day) {
			lastBalance.set(relevant[i].accountId, relevant[i].balance);
			i++;
		}
		let total = 0;
		for (const [accountId, balance] of lastBalance) {
			total += balance * signByAccount.get(accountId)!;
		}
		series.push({ date: day, total: roundCurrency(total) });
	}
	return series;
}

/**
 * Change in net worth over a trailing window: latest total minus the last
 * point at or before (latest date − days). Null when there isn't enough history.
 */
export function seriesDelta(series: NetWorthPoint[], days: number): number | null {
	if (series.length < 2) return null;
	const latest = series[series.length - 1];
	const cutoff = new Date(`${latest.date}T12:00:00`);
	cutoff.setDate(cutoff.getDate() - days);
	const cutoffKey = dayKey(cutoff);

	let baseline: NetWorthPoint | null = null;
	for (const point of series) {
		if (point.date <= cutoffKey) baseline = point;
		else break;
	}
	if (!baseline) return null;
	return roundCurrency(latest.total - baseline.total);
}
