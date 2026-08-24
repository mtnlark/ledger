import type { Transaction } from '$lib/db/constants.js';
import { getUserAmount, sumCurrency } from '$lib/utils/currency';
import { groupTransactionsIntoPurchases } from '$lib/utils/transaction-grouping';

const TAG_PATTERN = /#([a-zA-Z0-9][a-zA-Z0-9-]*)/g;

/** Returns lowercase, deduplicated tags in their original order. */
export function extractTags(notes: string | undefined): string[] {
	if (!notes) return [];

	const seen = new Set<string>();
	const tags: string[] = [];

	for (const match of notes.matchAll(TAG_PATTERN)) {
		const tag = match[1].toLowerCase();
		if (seen.has(tag)) continue;
		seen.add(tag);
		tags.push(tag);
	}

	return tags;
}

export function removeTags(notes: string | undefined): string {
	if (!notes) return '';

	return notes.replace(TAG_PATTERN, '').replace(/\s+/g, ' ').trim();
}

export function matchesTag(transaction: Transaction, tag: string): boolean {
	const normalizedTag = tag.replace(/^#/, '').toLowerCase();
	return extractTags(transaction.notes).includes(normalizedTag);
}

export function calculateTagTotal(transactions: Transaction[], tag: string): number {
	const normalizedTag = tag.replace(/^#/, '').toLowerCase();
	const amounts: number[] = [];
	for (const transaction of transactions) {
		if (extractTags(transaction.notes).includes(normalizedTag)) {
			amounts.push(getUserAmount(transaction));
		}
	}
	return sumCurrency(amounts);
}

/** Count complete purchases carrying a tag on one or more category allocations. */
export function countPurchasesWithTag(transactions: Transaction[], tag: string): number {
	return groupTransactionsIntoPurchases(
		transactions.filter((transaction) => matchesTag(transaction, tag))
	).length;
}

export function replaceTag(notes: string, oldTag: string, newTag: string): string {
	const normalizedOld = oldTag.replace(/^#/, '').toLowerCase();
	const normalizedNew = newTag.replace(/^#/, '').toLowerCase();
	const pattern = new RegExp(`#${escapeRegex(normalizedOld)}(?![a-zA-Z0-9-])`, 'gi');
	return notes.replace(pattern, `#${normalizedNew}`);
}

export function stripTag(notes: string, tag: string): string {
	const normalizedTag = tag.replace(/^#/, '').toLowerCase();
	const pattern = new RegExp(`#${escapeRegex(normalizedTag)}(?![a-zA-Z0-9-])`, 'gi');
	return notes.replace(pattern, '').replace(/\s+/g, ' ').trim();
}

export function appendTag(notes: string | undefined, tag: string): string {
	const normalizedTag = tag.replace(/^#/, '').toLowerCase();
	const existing = extractTags(notes);
	if (existing.includes(normalizedTag)) {
		return notes || '';
	}
	const tagStr = `#${normalizedTag}`;
	if (!notes || notes.trim() === '') {
		return tagStr;
	}
	return `${notes} ${tagStr}`;
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
