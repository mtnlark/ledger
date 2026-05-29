import { db } from '$lib/db';

export interface MerchantEntry {
	merchant: string;
	count: number;
	categoryCounts: Map<number, number>;
	lastUsed: Date;
}

export interface MerchantSuggestion {
	merchant: string;
	count: number;
	mostCommonCategoryId: number;
}

// Cache for merchant index - invalidated when transactions change
let cachedMerchantIndex: Map<string, MerchantEntry> | null = null;
// Secondary index for O(1) case-insensitive lookup
let normalizedIndex: Map<string, MerchantEntry> | null = null;
let cacheVersion = 0;

/**
 * Invalidate the merchant index cache
 * Call this when transactions are added, updated, or deleted
 */
export function invalidateMerchantCache(): void {
	cachedMerchantIndex = null;
	normalizedIndex = null;
	cacheVersion++;
}

/**
 * Build an index of all merchants with their usage statistics
 * Uses cached result if available
 */
export async function buildMerchantIndex(): Promise<Map<string, MerchantEntry>> {
	// Return cached index if available
	if (cachedMerchantIndex !== null) {
		return cachedMerchantIndex;
	}

	const transactions = await db.transactions
		.filter((t) => !t.isSplitParent && !t.isDeleted)
		.toArray();
	const index = new Map<string, MerchantEntry>();

	for (const tx of transactions) {
		const existing = index.get(tx.merchant);

		if (existing) {
			existing.count++;
			existing.categoryCounts.set(
				tx.categoryId,
				(existing.categoryCounts.get(tx.categoryId) || 0) + 1
			);
			if (new Date(tx.date) > existing.lastUsed) {
				existing.lastUsed = new Date(tx.date);
			}
		} else {
			const categoryCounts = new Map<number, number>();
			categoryCounts.set(tx.categoryId, 1);
			index.set(tx.merchant, {
				merchant: tx.merchant,
				count: 1,
				categoryCounts,
				lastUsed: new Date(tx.date)
			});
		}
	}

	// Cache the result
	cachedMerchantIndex = index;

	// Build normalized index for O(1) case-insensitive lookup
	normalizedIndex = new Map();
	for (const entry of index.values()) {
		normalizedIndex.set(entry.merchant.toLowerCase(), entry);
	}

	return index;
}

/**
 * Get merchant suggestions based on prefix matching
 * Returns merchants sorted by frequency (most used first)
 */
export async function getMerchantSuggestions(
	query: string,
	limit: number = 5
): Promise<MerchantSuggestion[]> {
	if (!query || query.trim() === '') {
		return [];
	}

	const normalizedQuery = query.toLowerCase().trim();
	const index = await buildMerchantIndex();
	const matches: MerchantSuggestion[] = [];

	for (const [merchant, entry] of index) {
		if (merchant.toLowerCase().startsWith(normalizedQuery)) {
			// Find most common category
			let maxCount = 0;
			let mostCommonCategoryId = 0;

			for (const [categoryId, count] of entry.categoryCounts) {
				if (count > maxCount) {
					maxCount = count;
					mostCommonCategoryId = categoryId;
				}
			}

			matches.push({
				merchant,
				count: entry.count,
				mostCommonCategoryId
			});
		}
	}

	// Sort by count (most frequent first)
	matches.sort((a, b) => b.count - a.count);

	return matches.slice(0, limit);
}

/**
 * Get the most commonly used category for a specific merchant
 * Returns null if merchant is not found
 */
export async function getMostCommonCategory(merchantName: string): Promise<number | null> {
	const normalizedName = merchantName.toLowerCase().trim();
	// Ensure index is built (populates normalizedIndex)
	await buildMerchantIndex();

	// O(1) lookup using normalized index
	const entry = normalizedIndex?.get(normalizedName);

	if (!entry) {
		return null;
	}

	// Find most common category
	let maxCount = 0;
	let mostCommonCategoryId: number | null = null;

	for (const [categoryId, count] of entry.categoryCounts) {
		if (count > maxCount) {
			maxCount = count;
			mostCommonCategoryId = categoryId;
		}
	}

	return mostCommonCategoryId;
}
