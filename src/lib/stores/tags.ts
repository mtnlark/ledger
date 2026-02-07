import type { Transaction } from '$lib/db/constants.js';
import { extractTags } from '$lib/utils/tags.js';

/**
 * In-memory index for fast tag lookups.
 * Maps tags to transaction IDs and provides autocomplete suggestions.
 *
 * Supports both full rebuild (for bulk operations) and incremental
 * add/remove/update (for single-transaction CRUD).
 */
export class TagIndex {
	private tagToIds: Map<string, Set<number>> = new Map();
	private sortedTags: string[] = [];

	/**
	 * Build index from transactions, clearing previous data.
	 * Use for initial load, import, and bulk operations.
	 */
	rebuild(transactions: Transaction[]): void {
		this.tagToIds.clear();
		this.sortedTags = [];

		for (const transaction of transactions) {
			const tags = extractTags(transaction.notes);
			const transactionId = transaction.id;

			for (const tag of tags) {
				if (!this.tagToIds.has(tag)) {
					this.tagToIds.set(tag, new Set());
				}
				if (transactionId !== undefined) {
					this.tagToIds.get(tag)!.add(transactionId);
				}
			}
		}

		this.sortedTags = Array.from(this.tagToIds.keys()).sort();
	}

	/**
	 * Add a single transaction's tags to the index.
	 * O(k) where k = number of tags in the transaction.
	 */
	addTransaction(transaction: { id?: number; notes?: string }): void {
		const tags = extractTags(transaction.notes);
		if (tags.length === 0) return;

		let sortChanged = false;
		for (const tag of tags) {
			if (!this.tagToIds.has(tag)) {
				this.tagToIds.set(tag, new Set());
				sortChanged = true;
			}
			if (transaction.id !== undefined) {
				this.tagToIds.get(tag)!.add(transaction.id);
			}
		}

		if (sortChanged) {
			this.sortedTags = Array.from(this.tagToIds.keys()).sort();
		}
	}

	/**
	 * Remove a single transaction's tags from the index.
	 * Cleans up empty tag entries.
	 * O(k) where k = number of tags in the transaction.
	 */
	removeTransaction(transaction: { id?: number; notes?: string }): void {
		const tags = extractTags(transaction.notes);
		if (tags.length === 0 || transaction.id === undefined) return;

		let sortChanged = false;
		for (const tag of tags) {
			const ids = this.tagToIds.get(tag);
			if (ids) {
				ids.delete(transaction.id);
				if (ids.size === 0) {
					this.tagToIds.delete(tag);
					sortChanged = true;
				}
			}
		}

		if (sortChanged) {
			this.sortedTags = Array.from(this.tagToIds.keys()).sort();
		}
	}

	/**
	 * Update a transaction's tags in the index (remove old, add new).
	 * Use when notes field changes on an existing transaction.
	 */
	updateTransaction(
		oldTransaction: { id?: number; notes?: string },
		newTransaction: { id?: number; notes?: string }
	): void {
		this.removeTransaction(oldTransaction);
		this.addTransaction(newTransaction);
	}

	/**
	 * Return all unique tags sorted alphabetically.
	 */
	getAllTags(): string[] {
		return this.sortedTags;
	}

	/**
	 * Return tags matching prefix (case insensitive).
	 */
	getTagSuggestions(prefix: string): string[] {
		if (!prefix) {
			return this.sortedTags;
		}

		const normalizedPrefix = prefix.toLowerCase();
		return this.sortedTags.filter((tag) => tag.startsWith(normalizedPrefix));
	}

	/**
	 * Return transaction IDs with the given tag.
	 */
	getTransactionIdsForTag(tag: string): Set<number> {
		const normalizedTag = tag.toLowerCase();
		return this.tagToIds.get(normalizedTag) ?? new Set();
	}

	/**
	 * Return count of transactions with the given tag.
	 */
	getTransactionCountForTag(tag: string): number {
		return this.getTransactionIdsForTag(tag).size;
	}
}

/**
 * Singleton instance for app-wide tag indexing.
 */
export const tagIndex = new TagIndex();
