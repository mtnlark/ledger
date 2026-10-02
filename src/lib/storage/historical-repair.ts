import { db, type SavingsAccountType } from '$lib/db';
import { runExclusive } from './mutation';
import { assertCanMutate, persistData, preserveOriginalSnapshot, refreshDataCaches } from './index';
import { dehydrateAll, hydrateAll } from './serialization';
import { TABLE_NAMES, DATE_FIELDS, REQUIRED_FIELDS, checksum, checksumText, isStoredDateValid, validateBackup, validateReviewableData } from './backup';
import { reviewSplitRepairs, type SplitRepair } from './split-repair';
import { sumCurrency, roundCurrency } from '$lib/utils/currency';
import type { PersistedTableName, StoredData } from './types';

type Row = Record<string, unknown>;
export interface RecordReference { table: PersistedTableName; recordId: number; field: string; context?: Row }
export interface DataDiagnostic extends RecordReference {
	id: string;
	kind: 'date' | 'missing_category' | 'missing_savings_account' | 'reference';
	value: unknown;
	message: string;
	references?: RecordReference[];
	target?: PersistedTableName;
}
export interface HistoricalPreview {
	source: string;
	diagnostics: DataDiagnostic[];
	accounts: { id: number; name: string; type: SavingsAccountType; balance?: number; contributionTotal: number; contributions: StoredData['savingsContributions'] }[];
	purchases: SplitRepair[];
}
export type RepairChoice =
	| { kind: 'category'; id: number; name: string }
	| { kind: 'account'; id: number; action: 'recreate'; name: string; accountType: SavingsAccountType; confirmedBalance: number }
	| { kind: 'account'; id: number; action: 'delete_contributions' }
	| { kind: 'field'; diagnosticId: string; value: string | number }
	| { kind: 'balance'; id: number; confirmedBalance: number }
	| { kind: 'purchase'; parentId: number; confirmedPartnerShare: number };
export interface RepairChange extends RecordReference { before: unknown; after: unknown }
export interface HistoricalRepairPlan { source: string; changes: RepairChange[]; counts: Record<string, number> }
interface ReviewState { data: StoredData; liveFingerprint: string; originalContent?: string }
interface PlanState extends ReviewState { repaired: StoredData }
const previews = new WeakMap<HistoricalPreview, ReviewState>();
const plans = new WeakMap<HistoricalRepairPlan, PlanState>();
function fingerprint(data: StoredData): string { return JSON.stringify(TABLE_NAMES.map((table) => data[table] ?? (table === 'settings' ? null : []))); }
function rows(data: StoredData, table: PersistedTableName): Row[] {
	return (table === 'settings' ? (data.settings ? [data.settings] : []) : data[table] ?? []) as unknown as Row[];
}
function groupReferences(data: StoredData, table: PersistedTableName, field: string, target: PersistedTableName): Map<number, RecordReference[]> {
	const ids = new Set(rows(data, target).map((r) => r.id));
	const missing = new Map<number, RecordReference[]>();
	for (const row of rows(data, table)) {
		const id = row[field] as number;
		if (id === undefined || ids.has(id)) continue;
		const references = missing.get(id) ?? [];
		references.push({ table, recordId: row.id as number, field, context: row }); missing.set(id, references);
	}
	return missing;
}
function diagnostics(data: StoredData): DataDiagnostic[] {
	const result: DataDiagnostic[] = [];
	for (const table of TABLE_NAMES) for (const row of rows(data, table)) {
		const scan = (record: Row, prefix = '') => {
			const nestedRequired = prefix.startsWith('cancelledSubscriptions.') ? ['cancelledDate'] : prefix.startsWith('completedGoals.') ? ['completedDate'] : [];
			const required = prefix ? nestedRequired : REQUIRED_FIELDS[table];
			const keys = new Set([...Object.keys(record), ...required]);
			for (const key of keys) {
				const value = record[key], field = `${prefix}${key}`;
				if (DATE_FIELDS.has(key) && (value !== undefined || required.includes(key)) && !isStoredDateValid(value)) result.push({ id: `${table}:${row.id}:${field}`, table, recordId: row.id as number, field, value, kind: 'date', message: 'Supply a valid date' });
				if (Array.isArray(value)) value.forEach((item, index) => { if (item && typeof item === 'object') scan(item as Row, `${field}.${index}.`); });
			}
		}; scan(row);
	}
	const categories = new Map<number, RecordReference[]>();
	for (const table of ['transactions', 'categoryBudgets'] as const) for (const [id, refs] of groupReferences(data, table, 'categoryId', 'categories')) categories.set(id, [...(categories.get(id) ?? []), ...refs]);
	for (const [id, references] of categories) result.push({ ...references[0], id: `category:${id}`, kind: 'missing_category', value: id, references, message: `Approve an inactive placeholder category at ID ${id}` });
	for (const [id, references] of groupReferences(data, 'savingsContributions', 'accountId', 'savingsAccounts')) result.push({ ...references[0], id: `account:${id}`, kind: 'missing_savings_account', value: id, references, message: `Recreate account ${id} with a confirmed balance, or delete its listed contributions` });
	for (const [table, field, target] of [['transactions', 'parentTransactionId', 'transactions'], ['balanceSnapshots', 'accountId', 'linkedAccounts']] as const) for (const [, refs] of groupReferences(data, table, field, target)) for (const ref of refs) result.push({ ...ref, id: `${table}:${ref.recordId}:${field}`, kind: 'reference', target, value: rows(data, table).find((r) => r.id === ref.recordId)![field], message: `Supply an existing ${target} ID` });
	return result;
}
/** A preview reads records and never changes them. Damaged files must have a valid checksum. */
export async function previewHistoricalData(file?: { name: string; text: string }): Promise<HistoricalPreview> {
	const live = await dehydrateAll();
	let input: unknown = live;
	if (file) {
		input = JSON.parse(file.text);
		if (input && typeof input === 'object' && 'version' in input && input.version === 'ledger-original-1') {
			const envelope = input as { content?: unknown; checksum?: unknown };
			if (typeof envelope.content !== 'string' || envelope.checksum !== await checksumText(envelope.content)) throw new Error('Original snapshot checksum mismatch');
			input = JSON.parse(envelope.content);
		}
		if (!input || typeof input !== 'object' || !('checksum' in input) || typeof input.checksum !== 'string' || input.checksum !== await checksum(input)) throw new Error('Damaged file checksum missing or mismatched');
	}
	const data = structuredClone(validateReviewableData(input).data);
	const contributions = new Map<number, NonNullable<StoredData['savingsContributions']>>();
	for (const contribution of data.savingsContributions ?? []) {
		const group = contributions.get(contribution.accountId) ?? [];
		group.push(contribution); contributions.set(contribution.accountId, group);
	}
	const preview: HistoricalPreview = {
		source: file?.name ?? 'Current ledger', diagnostics: diagnostics(data),
		accounts: (data.savingsAccounts ?? []).map((a) => ({ id: a.id!, name: a.name, type: a.accountType, balance: a.currentBalance, contributionTotal: sumCurrency((contributions.get(a.id!) ?? []).map((c) => c.amount)), contributions: contributions.get(a.id!) ?? [] })),
		purchases: reviewSplitRepairs(data.transactions)
	};
	previews.set(preview, { data: structuredClone(data), liveFingerprint: fingerprint(live), originalContent: file?.text });
	return preview;
}
function confirmedBalance(value: number): number {
	if (!Number.isFinite(value)) throw new Error('Supply a finite confirmed balance');
	return roundCurrency(value);
}
/** Apply only supplied choices to a copy; all remaining defects must be resolved before approval. */
export function prepareHistoricalRepair(preview: HistoricalPreview, choices: RepairChoice[]): HistoricalRepairPlan {
	const state = previews.get(preview);
	if (!state) throw new Error('Review again before preparing corrections');
	const repaired = structuredClone(state.data);
	const problems = new Map(diagnostics(state.data).map((problem) => [problem.id, problem]));
	const changes: RepairChange[] = [];
	const selected = new Set<string>();
	const repairedById = new Map(TABLE_NAMES.map((table) => [table, new Map(rows(repaired, table).map((row) => [row.id, row]))]));
	const purchases = new Map(reviewSplitRepairs(state.data.transactions).map((purchase) => [purchase.parent.id, purchase]));
	const change = (table: PersistedTableName, row: Row, field: string, after: unknown) => {
		const path = field.split('.'); let container = row;
		for (const part of path.slice(0, -1)) container = container[part] as Row;
		const key = path.at(-1)!;
		changes.push({ table, recordId: row.id as number, field, before: container[key], after }); container[key] = after;
	};
	for (const choice of choices) {
		const key = choice.kind === 'field' ? choice.diagnosticId : choice.kind === 'purchase' ? `purchase:${choice.parentId}` : `${choice.kind}:${choice.id}`;
		if (selected.has(key)) throw new Error('Duplicate repair choice'); selected.add(key);
		if (choice.kind === 'category') {
			if (!problems.has(`category:${choice.id}`) || !choice.name.trim()) throw new Error('Supply a name for the missing category');
			const row = { id: choice.id, name: choice.name.trim(), isActive: false, isEssential: false, sortOrder: Math.max(0, ...repaired.categories.map((c) => c.sortOrder)) + 1 };
			repaired.categories.push(row); changes.push({ table: 'categories', recordId: choice.id, field: '*', before: null, after: row });
		} else if (choice.kind === 'account') {
			if (!problems.has(`account:${choice.id}`)) throw new Error('Account is not missing');
			if (choice.action === 'delete_contributions') {
				for (const row of repaired.savingsContributions ?? []) if (row.accountId === choice.id) changes.push({ table: 'savingsContributions', recordId: row.id!, field: '*', before: row, after: null });
				repaired.savingsContributions = (repaired.savingsContributions ?? []).filter((row) => row.accountId !== choice.id);
			} else {
				if (!choice.name.trim() || !['savings', 'retirement', 'investment'].includes(choice.accountType)) throw new Error('Supply an account name and type');
				const row = { id: choice.id, name: choice.name.trim(), accountType: choice.accountType, currentBalance: confirmedBalance(choice.confirmedBalance), sortOrder: Math.max(0, ...(repaired.savingsAccounts ?? []).map((a) => a.sortOrder)) + 1, createdAt: new Date(), updatedAt: new Date() };
				(repaired.savingsAccounts ??= []).push(row); changes.push({ table: 'savingsAccounts', recordId: choice.id, field: '*', before: null, after: row });
			}
		} else if (choice.kind === 'field') {
			const problem = problems.get(choice.diagnosticId);
			if (!problem || !['date', 'reference'].includes(problem.kind)) throw new Error('Unsupported field correction');
			if (problem.kind === 'date' && !isStoredDateValid(choice.value)) throw new Error('Supply a valid date');
			change(problem.table, repairedById.get(problem.table)!.get(problem.recordId)!, problem.field, choice.value);
		} else if (choice.kind === 'balance') {
			const account = repairedById.get('savingsAccounts')!.get(choice.id);
			if (!account) throw new Error('Account no longer exists');
			change('savingsAccounts', account, 'currentBalance', confirmedBalance(choice.confirmedBalance));
			account.updatedAt = new Date();
		} else {
			const purchase = purchases.get(choice.parentId);
			if (!purchase || purchase.reason) throw new Error('Purchase requires manual review');
			if (roundCurrency(choice.confirmedPartnerShare) !== purchase.proposedTotal) throw new Error('Confirmed share must match the original intended fixed share');
			for (const [index, child] of purchase.children.entries()) {
				const row = repairedById.get('transactions')!.get(child.id)!;
				change('transactions', row, 'partnerShare', purchase.allocations[index]);
				change('transactions', row, 'splitValue', purchase.allocations[index]); row.updatedAt = new Date();
			}
		}
	}
	if (!changes.length) throw new Error('Select or supply corrections to preview');
	const validated = validateBackup(repaired);
	const plan = { source: preview.source, changes, counts: validated.counts };
	plans.set(plan, { ...state, repaired: structuredClone(validated.data) });
	return plan;
}
/** Recheck under the exclusive queue and again within the atomic replacement transaction. */
export async function applyHistoricalRepairs(plan: HistoricalRepairPlan): Promise<void> {
	const state = plans.get(plan);
	if (!state) throw new Error('Review corrections again before applying');
	return runExclusive(async () => {
		assertCanMutate();
		const live = await dehydrateAll();
		if (fingerprint(live) !== state.liveFingerprint) throw new Error('Ledger changed since preview; review again');
		validateBackup(state.repaired);
		await preserveOriginalSnapshot(live, `before repairing ${plan.source}`);
		if (state.originalContent) await preserveOriginalSnapshot(state.originalContent, `selected damaged file ${plan.source}`);
		await db.transaction('rw', TABLE_NAMES.map((name) => db.table(name)), async () => {
			if (fingerprint(await dehydrateAll()) !== state.liveFingerprint) throw new Error('Ledger changed since preview; review again');
			await hydrateAll(state.repaired);
		});
		plans.delete(plan);
		await persistData();
		await refreshDataCaches(true);
	});
}
