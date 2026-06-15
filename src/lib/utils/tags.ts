import type { Transaction } from '$lib/db/constants.js';
import { getUserAmount } from '$lib/utils/currency';
import { sumCurrency } from '$lib/utils/currency.js';

/**
 * Regex pattern for matching hashtags in text.
 * - Must start with # followed by a letter or number
 * - Can contain letters, numbers, and hyphens
 * - Case insensitive matching
 */
const TAG_PATTERN = /#([a-zA-Z0-9][a-zA-Z0-9-]*)/g;

/**
 * Extract hashtags from notes field.
 * Returns lowercase deduplicated array preserving first occurrence order.
 */
export function extractTags(notes: string | undefined): string[] {
  if (!notes) {
    return [];
  }

  const matches = notes.matchAll(TAG_PATTERN);
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const match of matches) {
    const tag = match[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Remove hashtag syntax from notes for clean display.
 * Normalizes whitespace and trims result.
 */
export function removeTags(notes: string | undefined): string {
  if (!notes) {
    return '';
  }

  return notes
    .replace(TAG_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a transaction has a specific tag.
 * Matching is case insensitive.
 * Search term can optionally include the # prefix.
 */
export function matchesTag(transaction: Transaction, tag: string): boolean {
  const normalizedTag = tag.replace(/^#/, '').toLowerCase();
  const tags = extractTags(transaction.notes);
  return tags.includes(normalizedTag);
}

/**
 * Calculate total spending for a tag across transactions.
 * Uses user's share (amount - partnerShare) for shared transactions.
 */
export function calculateTagTotal(transactions: Transaction[], tag: string): number {
  const normalizedTag = tag.replace(/^#/, '').toLowerCase();
  const amounts = transactions
    .filter(tx => extractTags(tx.notes).includes(normalizedTag))
    .map(tx => getUserAmount(tx));
  return sumCurrency(amounts);
}

/**
 * Replace a specific tag in notes text with a new tag name.
 * Matches case-insensitively. Only replaces the exact tag, not tags with same prefix.
 */
export function replaceTag(notes: string, oldTag: string, newTag: string): string {
  const normalizedOld = oldTag.replace(/^#/, '').toLowerCase();
  const normalizedNew = newTag.replace(/^#/, '').toLowerCase();
  const pattern = new RegExp(`#${escapeRegex(normalizedOld)}(?![a-zA-Z0-9-])`, 'gi');
  return notes.replace(pattern, `#${normalizedNew}`);
}

/**
 * Strip a specific tag from notes text.
 * Cleans up whitespace after removal. Returns empty string if nothing remains.
 */
export function stripTag(notes: string, tag: string): string {
  const normalizedTag = tag.replace(/^#/, '').toLowerCase();
  const pattern = new RegExp(`#${escapeRegex(normalizedTag)}(?![a-zA-Z0-9-])`, 'gi');
  return notes.replace(pattern, '').replace(/\s+/g, ' ').trim();
}

/**
 * Append a tag to notes text if not already present.
 * Returns the notes with the tag appended, or unchanged if tag already exists.
 * Handles undefined/empty notes gracefully.
 */
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
