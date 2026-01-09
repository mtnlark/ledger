/**
 * Normalize merchant name for comparison and indexing
 * Converts to lowercase and trims whitespace
 */
export function normalizeMerchant(name: string): string {
	return name.toLowerCase().trim();
}
