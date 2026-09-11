import type { StoredData, PersistedTableName } from './types';

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
function date(value: unknown): boolean {
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
const numeric = new Set(['amount', 'partnerShare', 'splitValue', 'income', 'savedAmount', 'budgetAmount', 'currentBalance', 'targetAmount', 'balance', 'sortOrder', 'defaultSplitValue', 'migrationVersion']);
const dates = new Set(['date', 'createdAt', 'updatedAt', 'settledDate', 'deletedAt', 'targetDate', 'lastSyncedAt', 'upstreamBalanceAt', 'capturedAt', 'cancelledDate', 'completedDate']);
const enums: Record<string, string[]> = {
	splitType: ['percentage', 'fixed'], defaultSplitType: ['percentage', 'fixed'], theme: ['light', 'dark', 'system'],
	accountClass: ['asset', 'liability'], lastSyncStatus: ['ok', 'stale', 'error', 'never'],
	subscriptionFrequency: ['weekly', 'monthly', 'quarterly', 'yearly', 'annual', 'biweekly']
};
function validateFields(row: Row, label: string): void {
	for (const [key, value] of Object.entries(row)) {
		if (value === undefined) continue;
		if (numeric.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) fail(`${label}.${key} must be finite`);
		if (dates.has(key) && !date(value)) fail(`${label}.${key} is not a valid date`);
		if (enums[key] && !enums[key].includes(value as string)) fail(`${label}.${key} is unsupported`);
		if ((key.startsWith('is') || key.endsWith('Enabled') || key === 'rollsOver') && typeof value !== 'boolean') fail(`${label}.${key} must be boolean`);
		if (['name', 'merchant', 'institution', 'partnerName', 'currency', 'notes'].includes(key) && typeof value !== 'string') fail(`${label}.${key} must be text`);
		if (key === 'month' && (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))) fail(`${label}.month is invalid`);
		if (Array.isArray(value)) for (const item of value) if (object(item)) validateFields(item, `${label}.${key}`);
	}
}
/** Pure structure validation shared by manual restore and startup recovery. */
export function validateBackup(input: unknown): BackupPreview {
	if (!object(input) || input.version !== '1.0') fail('unsupported or missing version');
	const legacy = Object.hasOwn(input, 'data');
	const source = legacy ? input.data : input;
	if (!object(source)) fail('missing data structure');
	const raw = { ...source };
	if (legacy && Object.hasOwn(raw, 'budgets')) raw.monthlyBudgets = raw.budgets;
	for (const key of ['transactions', 'categories', 'monthlyBudgets']) if (!Array.isArray(raw[key])) fail(`missing ${key} array`);
	const exportedAt = legacy ? input.exportDate : input.exportedAt;
	if (!date(exportedAt)) fail('invalid export date');
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
			for (const field of required[table]) if (entry[field] === undefined || entry[field] === null) fail(`${table} ${id} missing ${field}`);
			validateFields(entry, `${table} ${id}`);
			if (table === 'savingsAccounts' && !['savings', 'retirement', 'investment'].includes(entry.accountType as string)) fail('invalid savings account type');
			if (table === 'linkedAccounts' && !['checking', 'savings', 'credit', 'investment', 'retirement', 'loan', 'other'].includes(entry.accountType as string)) fail('invalid linked account type');
			if (table === 'savingsContributions' && !['payroll_deduction', 'bank_transfer', 'interest', 'employer_match', 'other'].includes(entry.source as string)) fail('invalid contribution source');
			if (['linkedAccounts', 'balanceSnapshots'].includes(table) && !['manual', 'simplefin'].includes(entry.source as string)) fail('invalid balance source');
		}
		ids.set(table, seen);
		counts[table] = rows.length;
		normalized[table] = value;
	}
	for (const table of TABLE_NAMES.filter((name) => name !== 'settings')) {
		for (const row of normalized[table] as Row[]) {
			for (const [key, target] of [['categoryId', 'categories'], ['parentTransactionId', 'transactions'], ['accountId', table === 'savingsContributions' ? 'savingsAccounts' : 'linkedAccounts']]) {
				if (row[key] !== undefined && !ids.get(target)?.has(row[key] as number)) fail(`${table} ${row.id} has a missing ${key} reference`);
			}
			if (row.parentTransactionId !== undefined) {
				const parent = (normalized.transactions as Row[]).find((t) => t.id === row.parentTransactionId);
				if (parent?.id === row.id || !parent?.isSplitParent || parent.parentTransactionId !== undefined) fail('invalid split parent reference');
			}
		}
	}
	return { data: normalized as unknown as StoredData, counts, missingTables, warnings: missingTables.map((name) => `Legacy backup omits ${name}; this table will be emptied.`) };
}
export async function checksum(data: unknown): Promise<string> {
	const { checksum: _checksum, ...rest } = data as Row;
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rest)));
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function encodeBackup(data: StoredData): Promise<string> {
	return JSON.stringify({ ...data, checksum: await checksum(data) }, null, 2);
}
export async function parseBackup(text: string): Promise<BackupPreview> {
	const input: unknown = JSON.parse(text);
	if (object(input) && input.checksum !== undefined && input.checksum !== await checksum(input)) fail('checksum mismatch');
	return validateBackup(input);
}
