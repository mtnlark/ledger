import { validateDate } from '$lib/utils/transaction-validation';
import type { PlanningData } from './types';

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const amount = (v: unknown, zero = false) => typeof v === 'number' && Number.isFinite(v) && (zero ? v >= 0 : v > 0);
const id = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const month = (v: unknown) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
function require(condition: boolean, message: string): asserts condition { if (!condition) throw new Error(message); }

export function validatePlanningData(value: unknown): asserts value is PlanningData {
	require(record(value), 'Invalid planning data');
	for (const key of ['schedules', 'savingsPlans', 'templates', 'settlements']) {
		const rows = value[key];
		require(Array.isArray(rows), `Invalid ${key}`);
		const ids = new Set<string>();
		for (const row of rows) {
			require(record(row) && text(row.id) && !ids.has(row.id as string), `Invalid or duplicate ${key} ID`);
			ids.add(row.id as string);
			if (key === 'schedules') {
				require(text(row.merchant) && validateDate(row.date).isValid && amount(row.amount) && id(row.categoryId), 'Invalid schedule');
				require(['once', 'monthly', 'semi-annual', 'annual'].includes(row.frequency as string) && ['fixed', 'variable'].includes(row.amountType as string) && typeof row.active === 'boolean', 'Invalid schedule options');
				validateSharing(row);
				if (row.autoMatch !== undefined) require(typeof row.autoMatch === 'boolean', 'Invalid schedule matching option');
				if (row.allocations !== undefined) validateSplits(row.allocations, row.amount as number);
			} else if (key === 'savingsPlans') {
				require(id(row.accountId) && amount(row.amount, true) && month(row.startMonth) && (row.endMonth === undefined || (month(row.endMonth) && (row.endMonth as string) >= (row.startMonth as string))), 'Invalid savings plan');
			} else if (key === 'templates') {
				require(text(row.name) && record(row.entry) && text(row.entry.merchant) && amount(row.entry.amount) && id(row.entry.categoryId), 'Invalid template');
				validateSharing(row.entry);
				require(typeof row.entry.isEssential === 'boolean' && typeof row.entry.isSubscription === 'boolean', 'Invalid template options');
				if (row.splits !== undefined) validateSplits(row.splits, row.entry.amount as number);
			} else {
				require(row.direction === undefined || ['received', 'sent'].includes(row.direction as string), 'Invalid settlement direction');
				require(validateDate(row.date).isValid && amount(row.amount) && Array.isArray(row.allocations) && row.allocations.length > 0, 'Invalid settlement');
				let total = 0;
				const allocatedIds = new Set<number>();
				for (const allocation of row.allocations) {
					require(record(allocation) && id(allocation.transactionId) && amount(allocation.amount) && !allocatedIds.has(allocation.transactionId as number), 'Invalid settlement allocation');
					total += Math.round((allocation.amount as number) * 100);
					allocatedIds.add(allocation.transactionId as number);
				}
				require(total === Math.round((row.amount as number) * 100), 'Settlement allocations must equal payment');
			}
			if (row.notes !== undefined) require(typeof row.notes === 'string', 'Invalid plan notes');
		}
	}
	if (value.completeThrough !== undefined) require(validateDate(value.completeThrough).isValid, 'Invalid completeness date');
}

function validateSharing(row: Record<string, unknown>) {
	require(typeof row.isShared === 'boolean' && ['fixed', 'percentage'].includes(row.splitType as string) && amount(row.splitValue, true), 'Invalid sharing settings');
	require(row.splitType === 'percentage' ? (row.splitValue as number) <= 1 : (row.splitValue as number) <= (row.amount as number), 'Invalid partner share');
}
function validateSplits(value: unknown, total: number) {
	require(Array.isArray(value) && value.length >= 2, 'At least two category allocations required');
	let cents = 0;
	for (const line of value) {
		require(record(line) && id(line.categoryId) && amount(line.amount) && (line.notes === undefined || typeof line.notes === 'string'), 'Invalid category allocation');
		cents += Math.round((line.amount as number) * 100);
	}
	require(cents === Math.round(total * 100), 'Category allocations must equal total');
}
