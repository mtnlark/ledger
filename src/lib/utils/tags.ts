import type { Transaction } from '$lib/db/constants.js';

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
