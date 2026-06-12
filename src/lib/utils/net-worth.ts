import type { LinkedAccount, BalanceSnapshot, LinkedAccountType, AccountClass } from '$lib/db';
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

const LIABILITY_TYPES: ReadonlySet<LinkedAccountType> = new Set(['credit', 'loan']);

/** Class is derived from type so users never pick asset/liability directly. */
export function accountClassForType(type: LinkedAccountType): AccountClass {
	return LIABILITY_TYPES.has(type) ? 'liability' : 'asset';
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

/**
 * Liquid types for runway purposes. Investment (brokerage) counts by Lev's
 * choice — cash-equivalents like SGOV live there. Retirement is locked up;
 * 'other' is excluded (it holds illiquid assets like vehicles).
 */
const LIQUID_TYPES: ReadonlySet<LinkedAccountType> = new Set(['checking', 'savings', 'investment']);

export function liquidBalance(accounts: LinkedAccount[]): number {
	return roundCurrency(
		accounts
			.filter((a) => a.isActive && a.accountClass !== 'liability' && LIQUID_TYPES.has(a.accountType))
			.reduce((sum, a) => sum + a.currentBalance, 0)
	);
}

function lastPointAtOrBefore(series: NetWorthPoint[], cutoff: string): NetWorthPoint | null {
	let found: NetWorthPoint | null = null;
	for (const point of series) {
		if (point.date <= cutoff) found = point;
		else break;
	}
	return found;
}

/**
 * Net worth change across a calendar month: last point in (or carried into)
 * the month minus the last point at or before the previous month's end.
 * Null when there's no baseline or no movement recorded in the month.
 */
export function monthlyNetWorthDelta(series: NetWorthPoint[], monthKey: string): number | null {
	const [y, m] = monthKey.split('-').map(Number);
	const prevKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
	const endOfPrev = `${prevKey}-31`;
	const endOfMonth = `${monthKey}-31`;

	const baseline = lastPointAtOrBefore(series, endOfPrev);
	const end = lastPointAtOrBefore(series, endOfMonth);
	if (!baseline || !end || end.date <= endOfPrev) return null;
	return roundCurrency(end.total - baseline.total);
}

export interface NetWorthMilestone {
	date: string;
	amount: number; // the threshold crossed, e.g. 50000
}

/** Upward crossings of round thresholds (default $10k steps). */
export function netWorthMilestones(series: NetWorthPoint[], step = 10_000): NetWorthMilestone[] {
	const milestones: NetWorthMilestone[] = [];
	for (let i = 1; i < series.length; i++) {
		const prev = series[i - 1].total;
		const curr = series[i].total;
		if (curr <= prev) continue;
		const crossed = Math.floor(curr / step) * step;
		if (crossed > prev && crossed > 0) {
			milestones.push({ date: series[i].date, amount: crossed });
		}
	}
	return milestones;
}
