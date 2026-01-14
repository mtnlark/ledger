import Dexie, { type EntityTable } from 'dexie';

// Type definitions
export interface Transaction {
	id?: number;
	date: Date;
	merchant: string;
	amount: number;
	categoryId: number;
	isShared: boolean;
	splitType: 'percentage' | 'fixed';
	splitValue: number;
	partnerShare: number;
	isSettled: boolean;
	settledDate?: Date;
	notes?: string;
	isEssential: boolean; // Needs vs wants - defaults from category but can be overridden
	isSubscription: boolean; // Recurring subscription payment
	subscriptionFrequency?: 'monthly' | 'annual'; // Billing frequency for subscriptions
	parentTransactionId?: number; // Links split children to their parent transaction
	isSplitParent?: boolean; // True if this transaction has been split into children
	createdAt: Date;
	updatedAt: Date;
}

export interface Category {
	id?: number;
	name: string;
	icon?: string;
	color?: string;
	isActive: boolean;
	sortOrder: number;
	isEssential: boolean; // Needs vs wants - essential spending
}

export interface MonthlyBudget {
	id?: number;
	month: string; // "2025-12" format
	income: number;
	savedAmount: number;
	notes?: string;
}

export interface CategoryBudget {
	id?: number;
	month: string; // "YYYY-MM" format
	categoryId: number; // References Category.id
	budgetAmount: number; // Target spending limit
	createdAt: Date;
	updatedAt: Date;
}

export interface CancelledSubscription {
	merchant: string; // Normalized merchant name
	cancelledDate: string; // ISO date string
}

export interface Settings {
	id: number; // Always 1 (singleton)
	partnerName: string;
	defaultSplitType: 'percentage' | 'fixed';
	defaultSplitValue: number;
	currency: string;
	theme: 'light' | 'dark' | 'system';
	dismissedRecurring: string[]; // Normalized merchant names to hide from recurring detection
	cancelledSubscriptions: CancelledSubscription[]; // Subscriptions user has marked as cancelled
	confirmedActiveSubscriptions: string[]; // Normalized merchant names user confirmed are still active (override staleness)
	iCloudBackupEnabled: boolean; // Whether to copy backups to iCloud Drive
}

// Database class
class BudgetTrackerDB extends Dexie {
	transactions!: EntityTable<Transaction, 'id'>;
	categories!: EntityTable<Category, 'id'>;
	monthlyBudgets!: EntityTable<MonthlyBudget, 'id'>;
	categoryBudgets!: EntityTable<CategoryBudget, 'id'>;
	settings!: EntityTable<Settings, 'id'>;

	constructor() {
		super('BudgetTrackerDB');

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
	}
}

// Database instance
export const db = new BudgetTrackerDB();

// Helper functions
export function calculatePartnerShare(
	amount: number,
	splitType: 'percentage' | 'fixed',
	splitValue: number
): number {
	if (splitType === 'percentage') {
		return Math.round(amount * splitValue * 100) / 100;
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

// Default categories from your spreadsheets
// Warm Ledger color palette - muted, earthy tones
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
	{ name: 'Car', icon: '🚗', color: '#7C8B99', isActive: true, sortOrder: 1, isEssential: true },
	{ name: 'Cash withdrawals', icon: '💵', color: '#6B8E6B', isActive: true, sortOrder: 2, isEssential: false },
	{ name: 'Clothes & accessories', icon: '👕', color: '#C49BA0', isActive: true, sortOrder: 3, isEssential: false },
	{ name: 'Coffee & snacks', icon: '☕', color: '#A67B5B', isActive: true, sortOrder: 4, isEssential: false },
	{ name: 'Donations', icon: '💝', color: '#D4A59A', isActive: true, sortOrder: 5, isEssential: false },
	{ name: 'Electronics', icon: '📱', color: '#6B7B8C', isActive: true, sortOrder: 6, isEssential: false },
	{ name: 'Fitness & wellness', icon: '🏋️', color: '#5B8A8A', isActive: true, sortOrder: 7, isEssential: false },
	{ name: 'Fun & hobbies', icon: '🎮', color: '#9B8AA6', isActive: true, sortOrder: 8, isEssential: false },
	{ name: 'Gas', icon: '⛽', color: '#D4915D', isActive: true, sortOrder: 9, isEssential: true },
	{ name: 'Gifts', icon: '🎁', color: '#C9A9A9', isActive: true, sortOrder: 10, isEssential: false },
	{ name: 'Groceries', icon: '🛒', color: '#5B8C5A', isActive: true, sortOrder: 11, isEssential: true },
	{ name: 'Grooming', icon: '💇', color: '#7BA3A3', isActive: true, sortOrder: 12, isEssential: false },
	{ name: 'Health', icon: '🏥', color: '#B87070', isActive: true, sortOrder: 13, isEssential: true },
	{ name: 'Home', icon: '🏠', color: '#8B7B99', isActive: true, sortOrder: 14, isEssential: false },
	{ name: 'Household supplies', icon: '🧹', color: '#8A847C', isActive: true, sortOrder: 15, isEssential: true },
	{ name: 'Insurance', icon: '🛡️', color: '#6B8299', isActive: true, sortOrder: 16, isEssential: true },
	{ name: 'Parking & tolls', icon: '🅿️', color: '#9C9588', isActive: true, sortOrder: 17, isEssential: true },
	{ name: 'Pet', icon: '🐈‍⬛', color: '#C4956A', isActive: true, sortOrder: 18, isEssential: true },
	{ name: 'Rent', icon: '🏢', color: '#7B6B8C', isActive: true, sortOrder: 19, isEssential: true },
	{ name: 'Restaurants', icon: '🍽️', color: '#C45D3A', isActive: true, sortOrder: 20, isEssential: false },
	{ name: 'Travel', icon: '✈️', color: '#5B8B8B', isActive: true, sortOrder: 21, isEssential: false },
	{ name: 'Utilities', icon: '💡', color: '#C9A855', isActive: true, sortOrder: 22, isEssential: true }
];

// Derived lookup maps for migrations (single source of truth)
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
	DEFAULT_CATEGORIES.map((c) => [c.name, c.color!])
);

export const CATEGORY_ESSENTIAL: Record<string, boolean> = Object.fromEntries(
	DEFAULT_CATEGORIES.map((c) => [c.name, c.isEssential])
);

// Default settings
export const DEFAULT_SETTINGS: Settings = {
	id: 1,
	partnerName: 'Partner',
	defaultSplitType: 'percentage',
	defaultSplitValue: 0.5,
	currency: 'USD',
	theme: 'system',
	dismissedRecurring: [],
	cancelledSubscriptions: [],
	confirmedActiveSubscriptions: [],
	iCloudBackupEnabled: false
};

// Initialize database with defaults and run migrations
export async function initializeDatabase(): Promise<void> {
	// Seed default categories if empty
	const categoryCount = await db.categories.count();
	if (categoryCount === 0) {
		await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
		console.log('Seeded default categories');
	}

	// Seed default settings if empty
	const settings = await db.settings.get(1);
	if (!settings) {
		await db.settings.add(DEFAULT_SETTINGS);
		console.log('Initialized default settings');
	}

	// Run all migrations (each is idempotent)
	const { runMigrations } = await import('./migrations');
	await runMigrations();
}
