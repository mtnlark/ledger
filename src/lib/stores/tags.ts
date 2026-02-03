import type { Transaction } from '$lib/db/constants.js';
import { extractTags } from '$lib/utils/tags.js';

/**
 * In-memory index for fast tag lookups.
 * Maps tags to transaction IDs and provides autocomplete suggestions.
 */
export class TagIndex {
	private tagToIds: Map<string, Set<number>> = new Map();
	private sortedTags: string[] = [];

	/**
	 * Build index from transactions, clearing previous data.
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
