import type { Transaction, Category } from '$lib/db';
import { getMonthKey } from '$lib/db';
import { roundCurrency } from './currency';
import { matchesTag } from './tags';

export interface MonthlySpend {
	month: string; // "YYYY-MM"
	amount: number;
}

export interface CategorySpend {
	categoryId: number;
	name: string;
	amount: number;
}

export interface MerchantReport {
	merchant: string;
	total: number; // user share, all time
	visits: number; // split groups count once
	average: number; // total / visits
	firstDate: Date;
	lastDate: Date;
	monthly: MonthlySpend[]; // trailing 12 months including current
	topCategories: CategorySpend[];
}

export interface TagReport {
	tag: string;
	total: number; // user share, all time
	count: number;
	firstDate: Date;
	lastDate: Date;
	monthly: MonthlySpend[];
	topCategories: CategorySpend[];
}

function userShare(t: Transaction): number {
	return t.isShared ? t.amount - t.partnerShare : t.amount;
}

function trailingMonthKeys(count: number, today: Date): string[] {
	const keys: string[] = [];
	let year = today.getFullYear();
	let month = today.getMonth() + 1;
	for (let i = 0; i < count; i++) {
		keys.unshift(`${year}-${String(month).padStart(2, '0')}`);
		month -= 1;
		if (month === 0) {
			month = 12;
			year -= 1;
		}
	}
	return keys;
}

function buildReport(
	matches: Transaction[],
	categories: Category[],
	today: Date
): {
	total: number;
	visits: number;
	firstDate: Date;
	lastDate: Date;
	monthly: MonthlySpend[];
	topCategories: CategorySpend[];
} | null {
	const live = matches.filter((t) => !t.isDeleted && !t.isSplitParent);
	if (live.length === 0) return null;

	let total = 0;
	let firstDate = new Date(live[0].date);
	let lastDate = new Date(live[0].date);
	const monthKeys = trailingMonthKeys(12, today);
	const monthTotals = new Map<string, number>(monthKeys.map((k) => [k, 0]));
	const byCategory = new Map<number, number>();
	// A split's children share one parent — count the group as a single visit
	const seenParents = new Set<number>();
	let visits = 0;

	for (const t of live) {
		const share = userShare(t);
		total += share;

		const date = new Date(t.date);
		if (date < firstDate) firstDate = date;
		if (date > lastDate) lastDate = date;

		const key = getMonthKey(date);
		if (monthTotals.has(key)) monthTotals.set(key, monthTotals.get(key)! + share);

		byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + share);

		if (t.parentTransactionId != null) {
			if (!seenParents.has(t.parentTransactionId)) {
				seenParents.add(t.parentTransactionId);
				visits++;
			}
		} else {
			visits++;
		}
	}

	const topCategories: CategorySpend[] = [...byCategory.entries()]
		.map(([categoryId, amount]) => {
			const cat = categories.find((c) => c.id === categoryId);
			return {
				categoryId,
				name: cat?.name ?? 'Unknown',
				amount: roundCurrency(amount)
			};
		})
		.sort((a, b) => b.amount - a.amount)
		.slice(0, 3);

	return {
		total: roundCurrency(total),
		visits,
		firstDate,
		lastDate,
		monthly: monthKeys.map((month) => ({ month, amount: roundCurrency(monthTotals.get(month)!) })),
		topCategories
	};
}

export function computeMerchantReport(
	transactions: Transaction[],
	categories: Category[],
	merchant: string,
	today: Date = new Date()
): MerchantReport | null {
	const needle = merchant.trim().toLowerCase();
	const matches = transactions.filter((t) => t.merchant.trim().toLowerCase() === needle);
	const base = buildReport(matches, categories, today);
	if (!base) return null;
	return {
		merchant,
		total: base.total,
		visits: base.visits,
		average: base.visits > 0 ? roundCurrency(base.total / base.visits) : 0,
		firstDate: base.firstDate,
		lastDate: base.lastDate,
		monthly: base.monthly,
		topCategories: base.topCategories
	};
}

export function computeTagReport(
	transactions: Transaction[],
	categories: Category[],
	tag: string,
	today: Date = new Date()
): TagReport | null {
	const matches = transactions.filter((t) => matchesTag(t, tag));
	const base = buildReport(matches, categories, today);
	if (!base) return null;
	return {
		tag,
		total: base.total,
		count: base.visits,
		firstDate: base.firstDate,
		lastDate: base.lastDate,
		monthly: base.monthly,
		topCategories: base.topCategories
	};
}
