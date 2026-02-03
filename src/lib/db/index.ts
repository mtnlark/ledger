import Dexie, { type EntityTable } from 'dexie';
import { roundCurrency } from '$lib/utils/currency';
import type {
	Transaction,
	Category,
	MonthlyBudget,
	CategoryBudget,
	Settings,
	SavingsAccount,
	SavingsContribution
} from './constants';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './constants';

// Re-export all types and constants so existing imports from '$lib/db' keep working
export type {
	Transaction,
	Category,
	MonthlyBudget,
	CategoryBudget,
	CancelledSubscription,
	CompletedGoal,
	SavingsAccountType,
	ContributionSource,
	SavingsAccount,
	SavingsContribution,
	Settings
} from './constants';

export {
	CONTRIBUTION_SOURCES,
	DEFAULT_CATEGORIES,
	CATEGORY_COLORS,
	CATEGORY_ESSENTIAL,
	DEFAULT_SETTINGS,
	DEFAULT_SAVINGS_ACCOUNTS
} from './constants';

// Database class
class LedgerDB extends Dexie {
	transactions!: EntityTable<Transaction, 'id'>;
	categories!: EntityTable<Category, 'id'>;
	monthlyBudgets!: EntityTable<MonthlyBudget, 'id'>;
	categoryBudgets!: EntityTable<CategoryBudget, 'id'>;
	settings!: EntityTable<Settings, 'id'>;
	savingsAccounts!: EntityTable<SavingsAccount, 'id'>;
	savingsContributions!: EntityTable<SavingsContribution, 'id'>;

	constructor() {
		super('LedgerDB');

		this.version(1).stores({
			transactions: '++id, date, merchant, categoryId, isShared, isSettled, [date+merchant+amount]',
			categories: '++id, name, isActive, sortOrder',
			monthlyBudgets: '++id, &month',
			settings: 'id'
		});

		// Version 2: Add parentTransactionId index for split transactions
		this.version(2).stores({
			transactions: '++id, date, merchant, categoryId, isShared, isSettled, parentTransactionId, [date+merchant+amount]',
			categories: '++id, name, isActive, sortOrder',
			monthlyBudgets: '++id, &month',
			settings: 'id'
		});

		// Version 3: Add categoryBudgets table for per-category budget tracking
		this.version(3).stores({
			transactions: '++id, date, merchant, categoryId, isShared, isSettled, parentTransactionId, [date+merchant+amount]',
			categories: '++id, name, isActive, sortOrder',
			monthlyBudgets: '++id, &month',
			categoryBudgets: '++id, month, categoryId, [month+categoryId]',
			settings: 'id'
		});

		// Version 4: Add savings accounts and contributions tables
		this.version(4).stores({
			transactions: '++id, date, merchant, categoryId, isShared, isSettled, parentTransactionId, [date+merchant+amount]',
			categories: '++id, name, isActive, sortOrder',
			monthlyBudgets: '++id, &month',
			categoryBudgets: '++id, month, categoryId, [month+categoryId]',
			settings: 'id',
			savingsAccounts: '++id, name, accountType, sortOrder',
			savingsContributions: '++id, date, accountId, source, [accountId+date]'
		});
	}
}

// Database instance
export const db = new LedgerDB();

// Helper functions
export function calculatePartnerShare(
	amount: number,
	splitType: 'percentage' | 'fixed',
	splitValue: number
): number {
	if (splitType === 'percentage') {
		return roundCurrency(amount * splitValue);
	}
	return splitValue;
}

export function getMonthKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Parse a month key string (e.g., "2025-12") into a local Date
// This avoids timezone issues that occur with new Date('2025-12-01')
export function parseMonthKey(monthKey: string): Date {
	const [year, month] = monthKey.split('-').map(Number);
	return new Date(year, month - 1, 1); // month is 0-indexed in Date constructor
}

// Navigate from a month key by a number of months (+1 = next, -1 = previous)
export function navigateMonth(monthKey: string, delta: number): string {
	const date = parseMonthKey(monthKey);
	date.setMonth(date.getMonth() + delta);
	return getMonthKey(date);
}

// Initialize database with defaults and run migrations
export async function initializeDatabase(): Promise<void> {
	// Seed default categories if empty
	const categoryCount = await db.categories.count();
	if (categoryCount === 0) {
		await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
		if (import.meta.env.DEV) console.log('Seeded default categories');
	}

	// Seed default settings if empty
	const settings = await db.settings.get(1);
	if (!settings) {
		await db.settings.add(DEFAULT_SETTINGS);
		if (import.meta.env.DEV) console.log('Initialized default settings');
	}

	// Run all migrations (each is idempotent)
	const { runMigrations } = await import('./migrations');
	await runMigrations();
}
