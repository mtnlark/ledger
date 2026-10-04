import type { StoredData, PersistedTableName } from './types';
import { validatePlanningData } from '$lib/planning/validation';

export const TABLE_NAMES: PersistedTableName[] = ['transactions', 'categories', 'monthlyBudgets', 'categoryBudgets', 'settings', 'savingsAccounts', 'savingsContributions', 'linkedAccounts', 'balanceSnapshots'];
export interface BackupPreview {
	data: StoredData;
	counts: Record<string, number>;
	missingTables: string[];
	warnings: string[];
}
type Row = Record<string, unknown>;
function object(value: unknown): value is Row { return !!value && typeof value === 'object' && !Array.isArray(value); }
function fail(message: string): never { throw new Error(`Invalid backup: ${message}`); }
export function isStoredDateValid(value: unknown): boolean {
	if (value instanceof Date) return Number.isFinite(value.getTime());
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) return false;
	const d = new Date(value);
	return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value.slice(0, 10);
}
const required: Record<string, string[]> = {
	transactions: ['date', 'merchant', 'amount', 'categoryId', 'isShared', 'splitType', 'splitValue', 'partnerShare', 'isSettled', 'createdAt', 'updatedAt'],
	categories: ['name', 'isActive', 'sortOrder'], monthlyBudgets: ['month', 'income', 'savedAmount'],
	categoryBudgets: ['month', 'categoryId', 'budgetAmount', 'createdAt', 'updatedAt'],
	savingsAccounts: ['name', 'accountType', 'sortOrder', 'createdAt', 'updatedAt'],
	savingsContributions: ['date', 'accountId', 'amount', 'source', 'createdAt', 'updatedAt'],
	linkedAccounts: ['name', 'institution', 'accountClass', 'accountType', 'currentBalance', 'source', 'lastSyncStatus', 'sortOrder', 'isActive', 'createdAt', 'updatedAt'],
	balanceSnapshots: ['accountId', 'balance', 'source', 'capturedAt'], settings: ['partnerName', 'defaultSplitType', 'defaultSplitValue', 'currency', 'theme']
};
const numeric = new Set(['amount', 'partnerShare', 'splitValue', 'income', 'savedAmount', 'budgetAmount', 'currentBalance', 'targetAmount', 'balance', 'sortOrder', 'defaultSplitValue', 'migrationVersion', 'settledAmount']);
export const DATE_FIELDS = new Set(['date', 'createdAt', 'updatedAt', 'settledDate', 'deletedAt', 'targetDate', 'lastSyncedAt', 'upstreamBalanceAt', 'capturedAt', 'cancelledDate', 'completedDate']);
const enums: Record<string, string[]> = {
	splitType: ['percentage', 'fixed'], defaultSplitType: ['percentage', 'fixed'], theme: ['light', 'dark', 'system'],
	accountClass: ['asset', 'liability'], lastSyncStatus: ['ok', 'stale', 'error', 'never'],
	subscriptionFrequency: ['monthly', 'semi-annual', 'annual']
};
function validateSettingsLists(settings: Row, allowDateDefects = false): void {
	if (settings.planning !== undefined) validatePlanningData(settings.planning);
	for (const name of ['dismissedRecurring', 'confirmedActiveSubscriptions']) {
		const value = settings[name];
		if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) fail(`settings.${name} must be a text array`);
	}
	for (const [name, fields] of Object.entries({ cancelledSubscriptions: ['merchant', 'cancelledDate'], completedGoals: ['accountName', 'targetAmount', 'completedDate'], fixedRecurringAmounts: ['merchant', 'amount'] })) {
		const value = settings[name];
		if (value === undefined) continue;
		if (!Array.isArray(value)) fail(`settings.${name} must be an array`);
		for (const item of value) {
			if (!object(item) || fields.some((field) => (item[field] === undefined || item[field] === null) && !(allowDateDefects && DATE_FIELDS.has(field)))) fail(`settings.${name} contains an invalid record`);
			validateFields(item, `settings.${name}`, allowDateDefects);
		}
	}
	if (settings.dailyReminderTime !== undefined && (typeof settings.dailyReminderTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.dailyReminderTime))) fail('invalid reminder time');
}
function validateFields(row: Row, label: string, allowDateDefects = false): void {
	for (const [key, value] of Object.entries(row)) {
		if (value === undefined) continue;
		if (numeric.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) fail(`${label}.${key} must be finite`);
		if (!allowDateDefects && DATE_FIELDS.has(key) && !isStoredDateValid(value)) fail(`${label}.${key} is not a valid date`);
		if (enums[key] && !enums[key].includes(value as string)) fail(`${label}.${key} is unsupported`);
		if ((key.startsWith('is') || key.endsWith('Enabled') || key === 'rollsOver') && typeof value !== 'boolean') fail(`${label}.${key} must be boolean`);
		if (['name', 'accountName', 'merchant', 'institution', 'partnerName', 'currency', 'notes', 'simplefinId', 'icon', 'color'].includes(key) && typeof value !== 'string') fail(`${label}.${key} must be text`);
		if (key === 'month' && (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))) fail(`${label}.month is invalid`);
		if (Array.isArray(value)) for (const item of value) if (object(item)) validateFields(item, `${label}.${key}`, allowDateDefects);
	}
}
/** Pure structure validation shared by manual restore and startup recovery. */
export function validateBackup(input: unknown): BackupPreview { return validateData(input, false); }
/** Existing primary files may contain dangling references created by older Ledger versions.
 * Preserve those records, but never admit them as automatic recovery or restore candidates.
 */
export function validatePrimaryData(input: unknown): BackupPreview { return validateData(input, true); }
/** Only dates and missing references may be deferred for an explicit repair review. */
export function validateReviewableData(input: unknown): BackupPreview { return validateData(input, true, true); }
function validateData(input: unknown, preserveMissingReferences: boolean, allowDateDefects = false): BackupPreview {
	const referenceWarnings: string[] = [];
	if (!object(input) || input.version !== '1.0') fail('unsupported or missing version');
	const legacy = Object.hasOwn(input, 'data');
	const source = legacy ? input.data : input;
	if (!object(source)) fail('missing data structure');
	const raw = { ...source };
	if (legacy && Object.hasOwn(raw, 'budgets')) raw.monthlyBudgets = raw.budgets;
	for (const key of ['transactions', 'categories', 'monthlyBudgets']) if (!Array.isArray(raw[key])) fail(`missing ${key} array`);
	const exportedAt = legacy ? input.exportDate : input.exportedAt;
	if (!isStoredDateValid(exportedAt)) fail('invalid export date');
	const missingTables = TABLE_NAMES.filter((key) => !Object.hasOwn(raw, key));
	const normalized: Row = { version: '1.0', exportedAt };
	const counts: Record<string, number> = {};
	const ids = new Map<string, Set<number>>();
	for (const table of TABLE_NAMES) {
		const value = Object.hasOwn(raw, table) ? raw[table] : (table === 'settings' ? null : []);
		if (table !== 'settings' && !Array.isArray(value)) fail(`${table} must be an array`);
		if (table === 'settings' && value !== null && !object(value)) fail('settings must be an object or null');
		const rows: unknown[] = table === 'settings' ? (value ? [value] : []) : value as unknown[];
		const seen = new Set<number>();
		for (const entry of rows) {
			if (!object(entry)) fail(`${table} contains an invalid record`);
			const id = entry.id;
			if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || seen.has(id)) fail(`${table} contains an invalid or duplicate ID`);
			if (table === 'settings' && id !== 1) fail('settings ID must be 1');
			seen.add(id);
			for (const field of required[table]) if ((entry[field] === undefined || entry[field] === null) && !(allowDateDefects && DATE_FIELDS.has(field))) fail(`${table} ${id} missing ${field}`);
			validateFields(entry, `${table} ${id}`, allowDateDefects);
			if (table === 'settings') validateSettingsLists(entry, allowDateDefects);
			if (table === 'savingsAccounts' && !['savings', 'retirement', 'investment'].includes(entry.accountType as string)) fail('invalid savings account type');
			if (table === 'linkedAccounts' && !['checking', 'savings', 'credit', 'investment', 'retirement', 'loan', 'other'].includes(entry.accountType as string)) fail('invalid linked account type');
			if (table === 'savingsContributions' && !['payroll_deduction', 'bank_transfer', 'interest', 'employer_match', 'other'].includes(entry.source as string)) fail('invalid contribution source');
			if (table === 'savingsContributions' && entry.kind !== undefined && (!['contribution', 'withdrawal'].includes(entry.kind as string) || (entry.kind === 'withdrawal' ? !((entry.amount as number) < 0) : !((entry.amount as number) > 0)))) fail('invalid savings event');
			if (['linkedAccounts', 'balanceSnapshots'].includes(table) && !['manual', 'simplefin'].includes(entry.source as string)) fail('invalid balance source');
		}
		ids.set(table, seen);
		counts[table] = rows.length;
		normalized[table] = value;
	}
	const transactionsById = new Map((normalized.transactions as Row[]).map((row) => [row.id, row]));
	for (const table of TABLE_NAMES.filter((name) => name !== 'settings')) {
		for (const row of normalized[table] as Row[]) {
			for (const [key, target] of [['categoryId', 'categories'], ['parentTransactionId', 'transactions'], ['refundOfTransactionId', 'transactions'], ['linkedAccountId', 'linkedAccounts'], ['accountId', table === 'savingsContributions' ? 'savingsAccounts' : 'linkedAccounts']]) {
				if (row[key] === undefined) continue;
				if (typeof row[key] !== 'number' || !Number.isSafeInteger(row[key]) || (row[key] as number) <= 0) fail(`${table} ${row.id} has an invalid ${key}`);
				if (!ids.get(target)?.has(row[key] as number)) {
					const message = `${table} ${row.id} has a missing ${key} reference`;
					if (!preserveMissingReferences) fail(message);
					referenceWarnings.push(message);
				}
			}
			if (row.parentTransactionId !== undefined) {
				const parent = transactionsById.get(row.parentTransactionId);
				if (!parent && preserveMissingReferences) continue;
				if (parent?.id === row.id || !parent?.isSplitParent || parent.parentTransactionId !== undefined) fail('invalid split parent reference');
			}
			if (row.refundOfTransactionId !== undefined) {
				const original = transactionsById.get(row.refundOfTransactionId);
				if ((row.amount as number) >= 0 || original?.id === row.id || original?.refundOfTransactionId !== undefined || original?.isSplitParent) fail('invalid refund reference');
			}
		}
	}
	const planning = (normalized.settings as Row | null)?.planning;
	if (planning) {
		validatePlanningData(planning);
		const reference = (id: number, target: string) => {
			if (!ids.get(target)?.has(id)) {
				const message = `planning has a missing ${target} reference (${id})`;
				if (!preserveMissingReferences) fail(message);
				referenceWarnings.push(message);
			}
		};
		for (const schedule of planning.schedules) for (const id of [schedule.categoryId, ...(schedule.allocations ?? []).map(a => a.categoryId)]) reference(id, 'categories');
		for (const plan of planning.savingsPlans) reference(plan.accountId, 'savingsAccounts');
		for (const template of planning.templates) for (const id of [template.entry.categoryId, ...(template.splits ?? []).map(s => s.categoryId)]) reference(id, 'categories');
		for (const payment of planning.settlements) for (const allocation of payment.allocations) reference(allocation.transactionId, 'transactions');
	}
	return { data: normalized as unknown as StoredData, counts, missingTables, warnings: [...referenceWarnings, ...(preserveMissingReferences ? [] : missingTables.map((name) => `Legacy backup omits ${name}; this table will be emptied.`))] };
}
export async function checksumText(text: string): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function checksum(data: unknown): Promise<string> {
	const { checksum: _checksum, ...rest } = data as Row;
	return checksumText(JSON.stringify(rest));
}

export async function encodeBackup(data: StoredData): Promise<string> {
	validatePrimaryData(data);
	return JSON.stringify({ ...data, checksum: await checksum(data) }, null, 2);
}
export async function parseBackup(text: string): Promise<BackupPreview> {
	const input: unknown = JSON.parse(text);
	if (object(input) && input.checksum !== undefined && input.checksum !== await checksum(input)) fail('checksum mismatch');
	return validateBackup(input);
}

export { required as REQUIRED_FIELDS };
