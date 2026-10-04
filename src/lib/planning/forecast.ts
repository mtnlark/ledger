import { getMonthKey, navigateMonth, parseMonthKey, type SavingsAccount, type SavingsContribution, type Transaction } from '$lib/db';
import { getUserAmount, roundCurrency, sumCurrency } from '$lib/utils/currency';
import { formatDateForInput, parseLocalDate } from '$lib/utils/date-helpers';
import { normalizeMerchant } from '$lib/utils/string-helpers';
import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';
import type { ExpenseSchedule, PlanningData } from './types';

export interface Commitment {
	schedule: ExpenseSchedule;
	date: string;
	amount: number; // Your share
	matchedIds: number[];
}

export interface BudgetForecast {
	recorded: number;
	upcoming: number;
	savings: number;
	remaining: number | null;
	variable: number;
	remainder: number | null;
	range: { low: number; high: number } | null;
	historyMonths: number;
	commitments: Commitment[];
	variableMethod: 'history' | 'pace' | 'none';
}

export function getScheduleOccurrences(schedules: ExpenseSchedule[], month: string): Commitment[] {
	const target = parseMonthKey(month);
	return schedules.filter(s => s.active).flatMap(schedule => {
		const anchor = parseLocalDate(schedule.date);
		const difference = (target.getFullYear() - anchor.getFullYear()) * 12 + target.getMonth() - anchor.getMonth();
		const interval = { once: 0, monthly: 1, 'semi-annual': 6, annual: 12 }[schedule.frequency];
		if (difference < 0 || (interval === 0 ? difference !== 0 : difference % interval !== 0)) return [];
		const day = Math.min(anchor.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
		const date = formatDateForInput(new Date(target.getFullYear(), target.getMonth(), day));
		const partner = schedule.isShared ? (schedule.splitType === 'percentage' ? roundCurrency(schedule.amount * schedule.splitValue) : schedule.splitValue) : 0;
		return [{ schedule, date, amount: roundCurrency(schedule.amount - partner), matchedIds: [] }];
	});
}

/** One-to-one matching at purchase level, including category splits. Explicit links win.
 * Conservative automatic matches use merchant, category, date proximity and fixed amount.
 */
export function matchCommitments(commitments: Commitment[], transactions: Transaction[]): Commitment[] {
	const purchases = groupTransactionsIntoPurchases(transactions.filter(t => !t.isDeleted && !t.isSplitParent && !t.refundOfTransactionId));
	const used = new Set<number>();
	return [...commitments].sort((a, b) => a.date.localeCompare(b.date)).map(commitment => {
		const schedule = commitment.schedule;
		const candidates = purchases.map((purchase, index) => {
			const lines = purchase.sourceTransactions;
			const explicit = lines.some(t => t.scheduleId === schedule.id && t.scheduleDate === commitment.date);
			const dateGap = Math.abs(parseLocalDate(commitment.date).getTime() - new Date(lines[0].date).getTime()) / 86400000;
			const amount = sumCurrency(lines.map(t => t.amount));
			const amountGap = Math.abs(amount - schedule.amount);
			const compatible = schedule.autoMatch !== false && getMonthKey(new Date(lines[0].date)) === commitment.date.slice(0, 7) && lines.every(t => !t.scheduleId || t.scheduleId === schedule.id) && normalizeMerchant(lines[0].merchant) === normalizeMerchant(schedule.merchant) && lines.some(t => t.categoryId === schedule.categoryId) && dateGap <= 7 && (schedule.amountType === 'variable' || amountGap <= Math.max(.01, schedule.amount * .05));
			return { index, lines, score: explicit ? -1 : dateGap + amountGap / Math.max(1, schedule.amount), eligible: !used.has(index) && (explicit || compatible) };
		}).filter(c => c.eligible).sort((a, b) => a.score - b.score);
		const matched = candidates[0];
		if (matched) used.add(matched.index);
		return { ...commitment, matchedIds: matched?.lines.flatMap(t => t.id === undefined ? [] : [t.id]) ?? [] };
	});
}

export function plannedSavingsByAccount(planning: PlanningData, month: string): Map<number, number> {
	const result = new Map<number, number>();
	for (const plan of [...planning.savingsPlans].sort((a, b) => a.startMonth.localeCompare(b.startMonth))) {
		if (plan.startMonth <= month && (!plan.endMonth || plan.endMonth >= month)) result.set(plan.accountId, plan.amount);
	}
	return result;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateForecast(input: {
	month: string;
	now?: Date;
	transactions: Transaction[];
	contributions: SavingsContribution[];
	planning: PlanningData;
	income: number | null;
	rolloverAdjustment?: number;
}): BudgetForecast {
	const { month, planning, income } = input;
	const now = input.now ?? new Date();
	const today = formatDateForInput(now);
	const currentMonth = getMonthKey(now);
	const end = new Date(parseMonthKey(month).getFullYear(), parseMonthKey(month).getMonth() + 1, 0);
	const elapsed = month < currentMonth ? end.getDate() : month > currentMonth ? 0 : now.getDate();
	const transactions = input.transactions.filter(t => !t.isDeleted && !t.isSplitParent);
	const monthly = transactions.filter(t => getMonthKey(new Date(t.date)) === month);
	const commitments = matchCommitments(getScheduleOccurrences(planning.schedules, month), transactions);
	const matched = new Set(commitments.flatMap(c => c.matchedIds));
	const recorded = sumCurrency(monthly.filter(t => formatDateForInput(new Date(t.date)) <= today).map(getUserAmount));
	const future = monthly.filter(t => formatDateForInput(new Date(t.date)) > today);
	// For past months, an unmatched schedule is an unrecorded bill, not historical spend.
	const reserved = month < currentMonth ? 0 : sumCurrency(commitments.filter(c => c.matchedIds.length === 0).map(c => c.amount));
	const upcoming = sumCurrency([reserved, ...future.map(getUserAmount)]);
	const contributions = input.contributions.filter(c => getMonthKey(new Date(c.date)) === month && ['bank_transfer', 'other'].includes(c.source));
	let savings = sumCurrency(contributions.map(c => c.amount));
	for (const [id, amount] of plannedSavingsByAccount(planning, month)) {
		const contributed = sumCurrency(contributions.filter(c => c.accountId === id && c.amount > 0).map(c => c.amount));
		savings = sumCurrency([savings, Math.max(0, amount - contributed)]);
	}
	const ordinary = (t: Transaction, matches: Set<number>) => !matches.has(t.id!) && !t.isSubscription && !t.isExpectedOneOff && !t.refundOfTransactionId;
	const historicalRemaining: number[] = [];
	const earliestMonth = transactions.length ? transactions.map(t => getMonthKey(new Date(t.date))).sort()[0] : null;
	for (let i = 1; i <= 6; i++) {
		const past = navigateMonth(month > currentMonth ? currentMonth : month, -i);
		if (past >= currentMonth || !earliestMonth || past < earliestMonth) continue;
		const rows = transactions.filter(t => getMonthKey(new Date(t.date)) === past);
		const pastMatches = new Set(matchCommitments(getScheduleOccurrences(planning.schedules, past), rows).flatMap(c => c.matchedIds));
		// Schedules added after a historical payment still identify the same ordinary bill.
		const recurring = new Set(planning.schedules.filter(s => s.active && s.frequency !== 'once').map(s => `${normalizeMerchant(s.merchant)}|${s.categoryId}`));
		const amounts = rows.filter(t => ordinary(t, pastMatches) && !recurring.has(`${normalizeMerchant(t.merchant)}|${t.categoryId}`) && new Date(t.date).getDate() > elapsed).map(getUserAmount);
		historicalRemaining.push(Math.max(0, sumCurrency(amounts)));
	}
	const futureVariable = sumCurrency(future.filter(t => ordinary(t, matched)).map(getUserAmount));
	let variable = 0;
	let variableMethod: BudgetForecast['variableMethod'] = 'none';
	if (elapsed < end.getDate()) {
		if (historicalRemaining.length) {
			variable = Math.max(0, median(historicalRemaining) - futureVariable);
			variableMethod = 'history';
		} else if (elapsed >= 8) {
			const spent = sumCurrency(monthly.filter(t => formatDateForInput(new Date(t.date)) <= today && ordinary(t, matched)).map(getUserAmount));
			variable = Math.max(0, spent / elapsed * (end.getDate() - elapsed) - futureVariable);
			variableMethod = 'pace';
		}
	}
	const remaining = income === null ? null : sumCurrency([income, input.rolloverAdjustment ?? 0, -recorded, -upcoming, -savings]);
	const remainder = remaining === null ? null : roundCurrency(remaining - variable);
	const range = remaining === null || !historicalRemaining.length ? null : {
		low: roundCurrency(remaining - Math.max(0, Math.max(...historicalRemaining) - futureVariable)),
		high: roundCurrency(remaining - Math.max(0, Math.min(...historicalRemaining) - futureVariable))
	};
	return { recorded, upcoming, savings, remaining, variable: roundCurrency(variable), remainder, range, historyMonths: historicalRemaining.length, commitments, variableMethod };
}

export function projectGoals(accounts: SavingsAccount[], fundingPool: number, requested: Map<number, number>, now = new Date()) {
	const total = sumCurrency([...requested.values()]);
	const factor = total > 0 ? Math.min(1, Math.max(0, fundingPool) / total) : 0;
	return accounts.filter(a => a.targetAmount !== undefined).map(account => {
		const fundedMonthly = roundCurrency((requested.get(account.id!) ?? 0) * factor);
		const remaining = Math.max(0, (account.targetAmount ?? 0) - (account.currentBalance ?? 0));
		const completion = remaining === 0 ? new Date(now) : fundedMonthly <= 0 ? null : new Date(now.getFullYear(), now.getMonth() + Math.ceil(remaining / fundedMonthly), 1);
		return { account, fundedMonthly, requestedMonthly: requested.get(account.id!) ?? 0, completion, onTrack: completion !== null && (!account.targetDate || completion <= account.targetDate) };
	});
}

/** Allocate one pool each month across every plan; temporary changes affect only
 * their specified months. Returns null when a goal cannot finish within 50 years.
 */
export function projectGoalTimeline(accounts: SavingsAccount[], poolForMonth: (month: string) => number, requestsForMonth: (month: string) => Map<number, number>, now = new Date(), eventsForMonth: (month: string) => Map<number, number> = () => new Map()) {
	const balances = new Map(accounts.map(a => [a.id!, a.currentBalance ?? 0]));
	const completion = new Map<number, Date>();
	const initialMonth = getMonthKey(now);
	for (const a of accounts) if (a.targetAmount !== undefined && (a.currentBalance ?? 0) >= a.targetAmount) completion.set(a.id!, new Date(now));
	for (let offset = 0; offset < 600; offset++) {
		const month = navigateMonth(initialMonth, offset);
		const requested = requestsForMonth(month);
		const events = eventsForMonth(month);
		const total = sumCurrency([...requested.values()]);
		const factor = total <= 0 ? 0 : Math.min(1, Math.max(0, poolForMonth(month)) / total);
		for (const account of accounts) {
			const balance = sumCurrency([balances.get(account.id!) ?? 0, (requested.get(account.id!) ?? 0) * factor, events.get(account.id!) ?? 0]);
			balances.set(account.id!, balance);
			if (!completion.has(account.id!) && account.targetAmount !== undefined && balance >= account.targetAmount) {
				const date = parseMonthKey(month);
				completion.set(account.id!, new Date(date.getFullYear(), date.getMonth() + 1, 0));
			}
		}
		if (accounts.filter(a => a.targetAmount !== undefined).every(a => completion.has(a.id!))) break;
	}
	return accounts.filter(a => a.targetAmount !== undefined).map(account => ({ account, completion: completion.get(account.id!) ?? null }));
}

/** Accounts carry as-of balances; future entered contributions are funded once.
 * Payroll/interest/matches are external funding, withdrawals reduce allocations.
 */
export function calculateGoalProjections(input: { accounts: SavingsAccount[]; transactions: Transaction[]; contributions: SavingsContribution[]; planning: PlanningData; income: number; now?: Date }) {
	const now = input.now ?? new Date();
	const today = formatDateForInput(now);
	const cache = new Map<string, BudgetForecast>();
	const getForecast = (month: string) => {
		if (!cache.has(month)) cache.set(month, calculateForecast({ ...input, month, now }));
		return cache.get(month)!;
	};
	const inMonth = (month: string) => input.contributions.filter(c => getMonthKey(new Date(c.date)) === month);
	return projectGoalTimeline(input.accounts, month => {
		const forecast = getForecast(month);
		const recorded = sumCurrency(inMonth(month).filter(c => formatDateForInput(new Date(c.date)) <= today && ['bank_transfer', 'other'].includes(c.source)).map(c => c.amount));
		const futureWithdrawals = sumCurrency(inMonth(month).filter(c => c.amount < 0 && formatDateForInput(new Date(c.date)) > today).map(c => c.amount));
		return sumCurrency([forecast.remainder ?? 0, forecast.savings, -recorded, -futureWithdrawals]);
	}, month => {
		const requested = plannedSavingsByAccount(input.planning, month);
		for (const account of input.accounts) {
			const rows = inMonth(month).filter(c => c.accountId === account.id && c.amount > 0 && ['bank_transfer', 'other'].includes(c.source));
			const recorded = sumCurrency(rows.filter(c => formatDateForInput(new Date(c.date)) <= today).map(c => c.amount));
			const future = sumCurrency(rows.filter(c => formatDateForInput(new Date(c.date)) > today).map(c => c.amount));
			requested.set(account.id!, Math.max(0, (requested.get(account.id!) ?? 0) - recorded, future));
		}
		return requested;
	}, now, month => {
		const events = new Map<number, number>();
		for (const contribution of inMonth(month).filter(c => formatDateForInput(new Date(c.date)) > today && (c.amount < 0 || !['bank_transfer', 'other'].includes(c.source)))) events.set(contribution.accountId, sumCurrency([events.get(contribution.accountId) ?? 0, contribution.amount]));
		return events;
	});
}
