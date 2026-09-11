import { currentMutationTables } from './mutation-tracking';
import Dexie from 'dexie';
import { db } from '$lib/db';
import { persistData, refreshDataCaches } from './index';
import { assertCanMutate, PersistenceError } from './status';
import type { PersistedTableName } from './types';

let mutationChain: Promise<unknown> = Promise.resolve();
/** Keep restore, imports, mutations and retries in the same single-writer queue. */
export function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
	const run = mutationChain.catch(() => {}).then(operation);
	mutationChain = run;
	return run;
}
/** Nested work shares the outer transaction and disk acknowledgment. */
export function runMutation<T>(tables: PersistedTableName[], operation: () => Promise<T>): Promise<T> {
	if (Dexie.currentTransaction) return operation();
	return runExclusive(async () => {
		assertCanMutate();
		let result: T;
		let changed = new Set<string>();
		try {
			result = await db.transaction('rw', tables.map((name) => db.table(name)), async () => {
				changed = currentMutationTables();
				return operation();
			});
		} catch (error) {
			if (changed.size) await refreshDataCaches();
			throw new PersistenceError(error instanceof Error ? error.message : 'Database operation failed', false, error);
		}
		const scope = [...changed] as PersistedTableName[];
		if (scope.length) await persistData(scope.length === 1 ? scope[0] : scope);
		return result;
	});
}
