import Dexie, { type Transaction } from 'dexie';
const changes = new WeakMap<Transaction, Set<string>>();
export function currentMutationTables(): Set<string> {
	let transaction = Dexie.currentTransaction;
	if (!transaction) return new Set();
	while (transaction.parent) transaction = transaction.parent;
	let tables = changes.get(transaction);
	if (!tables) { tables = new Set(); changes.set(transaction, tables); }
	return tables;
}
