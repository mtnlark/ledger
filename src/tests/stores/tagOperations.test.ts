/**
 * Tests for tag batch operations: renameTag() and deleteTag()
 * from src/lib/stores/transactions.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase } from '$lib/db';
import {
	addTransaction,
	renameTag,
	deleteTag,
	getAllTransactions
} from '$lib/stores/transactions';

// Helper to create a transaction with optional notes
async function createTx(merchant: string, notes?: string): Promise<number> {
	return addTransaction({
		date: new Date(2026, 0, 15),
		merchant,
		amount: 50,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 0.5,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		notes
	});
}

describe('renameTag', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	it('renames a tag across all matching transactions', async () => {
		await createTx('Store A', 'bought items #vacation');
		await createTx('Store B', 'more stuff #vacation #food');
		await createTx('Store C', 'no tags');

		const count = await renameTag('vacation', 'holiday');
		expect(count).toBe(2);

		const all = await getAllTransactions();
		const storeA = all.find((t) => t.merchant === 'Store A');
		const storeB = all.find((t) => t.merchant === 'Store B');
		const storeC = all.find((t) => t.merchant === 'Store C');

		expect(storeA?.notes).toContain('#holiday');
		expect(storeA?.notes).not.toContain('#vacation');
		expect(storeB?.notes).toContain('#holiday');
		expect(storeB?.notes).toContain('#food');
		expect(storeC?.notes).toBe('no tags');
	});

	it('preserves other tags in the same notes field', async () => {
		await createTx('Store', '#travel #vacation #europe');

		await renameTag('vacation', 'holiday');

		const all = await getAllTransactions();
		const notes = all[0]?.notes;
		expect(notes).toContain('#travel');
		expect(notes).toContain('#holiday');
		expect(notes).toContain('#europe');
		expect(notes).not.toContain('#vacation');
	});

	it('handles tag at start of notes', async () => {
		await createTx('Store', '#vacation some text');

		await renameTag('vacation', 'holiday');

		const all = await getAllTransactions();
		expect(all[0]?.notes).toContain('#holiday');
	});

	it('handles tag at end of notes', async () => {
		await createTx('Store', 'some text #vacation');

		await renameTag('vacation', 'holiday');

		const all = await getAllTransactions();
		expect(all[0]?.notes).toContain('#holiday');
	});

	it('handles tag in middle of notes', async () => {
		await createTx('Store', 'before #vacation after');

		await renameTag('vacation', 'holiday');

		const all = await getAllTransactions();
		expect(all[0]?.notes).toContain('#holiday');
	});

	it('returns 0 when no transactions have the tag', async () => {
		await createTx('Store', 'no matching tags here');

		const count = await renameTag('nonexistent', 'newname');
		expect(count).toBe(0);
	});

	it('returns 0 when old and new tags are identical after normalization', async () => {
		await createTx('Store', '#Vacation');

		const count = await renameTag('#Vacation', 'vacation');
		expect(count).toBe(0);
	});

	it('handles # prefix in arguments', async () => {
		await createTx('Store', 'trip #vacation');

		const count = await renameTag('#vacation', '#holiday');
		expect(count).toBe(1);

		const all = await getAllTransactions();
		expect(all[0]?.notes).toContain('#holiday');
	});

	it('is case-insensitive when matching', async () => {
		await createTx('Store', '#Vacation trip');

		const count = await renameTag('vacation', 'holiday');
		expect(count).toBe(1);
	});

	it('throws for invalid new tag name', async () => {
		await expect(renameTag('old', '-invalid')).rejects.toThrow('Invalid tag name');
		await expect(renameTag('old', 'has spaces')).rejects.toThrow('Invalid tag name');
	});

	it('does not match partial tag names', async () => {
		await createTx('Store', '#italy-trip is great');

		// Renaming "italy" should NOT match "#italy-trip"
		const count = await renameTag('italy', 'france');
		expect(count).toBe(0);
	});
});

describe('deleteTag', () => {
	beforeEach(async () => {
		await db.delete();
		await db.open();
		await initializeDatabase();
	});

	afterEach(async () => {
		await db.delete();
	});

	it('strips a tag from all matching transactions', async () => {
		await createTx('Store A', 'bought items #vacation');
		await createTx('Store B', 'more stuff #vacation #food');

		const count = await deleteTag('vacation');
		expect(count).toBe(2);

		const all = await getAllTransactions();
		const storeA = all.find((t) => t.merchant === 'Store A');
		const storeB = all.find((t) => t.merchant === 'Store B');

		expect(storeA?.notes).not.toContain('#vacation');
		expect(storeB?.notes).not.toContain('#vacation');
		expect(storeB?.notes).toContain('#food');
	});

	it('clears notes to undefined when tag was the only content', async () => {
		await createTx('Store', '#vacation');

		await deleteTag('vacation');

		const all = await getAllTransactions();
		// stripTag returns empty string → stored as undefined
		expect(all[0]?.notes).toBeFalsy();
	});

	it('returns 0 when no transactions have the tag', async () => {
		await createTx('Store', 'no matching tags');

		const count = await deleteTag('nonexistent');
		expect(count).toBe(0);
	});

	it('handles # prefix in argument', async () => {
		await createTx('Store', '#vacation');

		const count = await deleteTag('#vacation');
		expect(count).toBe(1);
	});

	it('is case-insensitive when matching', async () => {
		await createTx('Store', '#Vacation');

		const count = await deleteTag('vacation');
		expect(count).toBe(1);
	});

	it('does not match partial tag names', async () => {
		await createTx('Store', '#italy-trip is great');

		// Deleting "italy" should NOT match "#italy-trip"
		const count = await deleteTag('italy');
		expect(count).toBe(0);

		const all = await getAllTransactions();
		expect(all[0]?.notes).toContain('#italy-trip');
	});

	it('preserves surrounding text after tag removal', async () => {
		await createTx('Store', 'before #vacation after');

		await deleteTag('vacation');

		const all = await getAllTransactions();
		const notes = all[0]?.notes;
		expect(notes).toContain('before');
		expect(notes).toContain('after');
	});
});
