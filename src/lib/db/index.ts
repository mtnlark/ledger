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
}

export interface MonthlyBudget {
	id?: number;
	month: string; // "2025-12" format
	income: number;
	savedAmount: number;
	notes?: string;
}

export interface Settings {
	id: number; // Always 1 (singleton)
	partnerName: string;
	defaultSplitType: 'percentage' | 'fixed';
	defaultSplitValue: number;
	currency: string;
	theme: 'light' | 'dark' | 'system';
}

// Database class
class BudgetTrackerDB extends Dexie {
	transactions!: EntityTable<Transaction, 'id'>;
	categories!: EntityTable<Category, 'id'>;
	monthlyBudgets!: EntityTable<MonthlyBudget, 'id'>;
	settings!: EntityTable<Settings, 'id'>;

	constructor() {
		super('BudgetTrackerDB');

		this.version(1).stores({
			transactions: '++id, date, merchant, categoryId, isShared, isSettled, [date+merchant+amount]',
			categories: '++id, name, isActive, sortOrder',
			monthlyBudgets: '++id, &month',
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
	{ name: 'Car', icon: '🚗', color: '#7C8B99', isActive: true, sortOrder: 1 },        // Slate blue-gray
	{ name: 'Cash withdrawals', icon: '💵', color: '#6B8E6B', isActive: true, sortOrder: 2 }, // Sage green
	{ name: 'Clothes & accessories', icon: '👕', color: '#C49BA0', isActive: true, sortOrder: 3 }, // Dusty rose
	{ name: 'Coffee & snacks', icon: '☕', color: '#A67B5B', isActive: true, sortOrder: 4 }, // Coffee brown
	{ name: 'Donations', icon: '💝', color: '#D4A59A', isActive: true, sortOrder: 5 },  // Muted coral
	{ name: 'Electronics', icon: '📱', color: '#6B7B8C', isActive: true, sortOrder: 6 }, // Steel gray
	{ name: 'Fitness & wellness', icon: '🏋️', color: '#5B8A8A', isActive: true, sortOrder: 7 }, // Dusty teal
	{ name: 'Fun & hobbies', icon: '🎮', color: '#9B8AA6', isActive: true, sortOrder: 8 }, // Dusty lavender
	{ name: 'Gas', icon: '⛽', color: '#D4915D', isActive: true, sortOrder: 9 },        // Amber (warning-500)
	{ name: 'Gifts', icon: '🎁', color: '#C9A9A9', isActive: true, sortOrder: 10 },     // Dusty pink
	{ name: 'Groceries', icon: '🛒', color: '#5B8C5A', isActive: true, sortOrder: 11 }, // Sage (success-500)
	{ name: 'Grooming', icon: '💇', color: '#7BA3A3', isActive: true, sortOrder: 12 },  // Muted teal
	{ name: 'Health', icon: '🏥', color: '#B87070', isActive: true, sortOrder: 13 },    // Muted rust
	{ name: 'Home', icon: '🏠', color: '#8B7B99', isActive: true, sortOrder: 14 },      // Warm violet
	{ name: 'Household supplies', icon: '🧹', color: '#8A847C', isActive: true, sortOrder: 15 }, // Warm gray
	{ name: 'Insurance', icon: '🛡️', color: '#6B8299', isActive: true, sortOrder: 16 }, // Slate blue
	{ name: 'Parking & tolls', icon: '🅿️', color: '#9C9588', isActive: true, sortOrder: 17 }, // Stone
	{ name: 'Pet', icon: '🐈‍⬛', color: '#C4956A', isActive: true, sortOrder: 18 },      // Warm tan
	{ name: 'Rent', icon: '🏢', color: '#7B6B8C', isActive: true, sortOrder: 19 },      // Muted indigo
	{ name: 'Restaurants', icon: '🍽️', color: '#C45D3A', isActive: true, sortOrder: 20 }, // Terracotta (primary-500)
	{ name: 'Subscriptions', icon: '📺', color: '#6B8399', isActive: true, sortOrder: 21 }, // Steel blue
	{ name: 'Travel', icon: '✈️', color: '#5B8B8B', isActive: true, sortOrder: 22 },   // Dusty teal
	{ name: 'Utilities', icon: '💡', color: '#C9A855', isActive: true, sortOrder: 23 }  // Golden amber
];

// Default settings
export const DEFAULT_SETTINGS: Settings = {
	id: 1,
	partnerName: 'Allee',
	defaultSplitType: 'percentage',
	defaultSplitValue: 0.5,
	currency: 'USD',
	theme: 'system'
};

// Initialize database with defaults
export async function initializeDatabase(): Promise<void> {
	const categoryCount = await db.categories.count();
	if (categoryCount === 0) {
		await db.categories.bulkAdd(DEFAULT_CATEGORIES as Category[]);
		console.log('Seeded default categories');
	}

	const settings = await db.settings.get(1);
	if (!settings) {
		await db.settings.add(DEFAULT_SETTINGS);
		console.log('Initialized default settings');
	}

	// Migrate: Update Pet category icon to black cat if it's still the dog emoji
	const petCategory = await db.categories.where('name').equals('Pet').first();
	if (petCategory && petCategory.icon === '🐕') {
		await db.categories.update(petCategory.id!, { icon: '🐈‍⬛' });
		console.log('Updated Pet category icon to black cat');
	}

	// Migrate: Update category colors to Warm Ledger palette
	const warmLedgerColors: Record<string, string> = {
		'Car': '#7C8B99',
		'Cash withdrawals': '#6B8E6B',
		'Clothes & accessories': '#C49BA0',
		'Coffee & snacks': '#A67B5B',
		'Donations': '#D4A59A',
		'Electronics': '#6B7B8C',
		'Fitness & wellness': '#5B8A8A',
		'Fun & hobbies': '#9B8AA6',
		'Gas': '#D4915D',
		'Gifts': '#C9A9A9',
		'Groceries': '#5B8C5A',
		'Grooming': '#7BA3A3',
		'Health': '#B87070',
		'Home': '#8B7B99',
		'Household supplies': '#8A847C',
		'Insurance': '#6B8299',
		'Parking & tolls': '#9C9588',
		'Pet': '#C4956A',
		'Rent': '#7B6B8C',
		'Restaurants': '#C45D3A',
		'Subscriptions': '#6B8399',
		'Travel': '#5B8B8B',
		'Utilities': '#C9A855'
	};

	// Check if migration is needed by looking at a known category color
	const groceriesCategory = await db.categories.where('name').equals('Groceries').first();
	if (groceriesCategory && groceriesCategory.color !== '#5B8C5A') {
		// Update all category colors to warm palette
		const allCategories = await db.categories.toArray();
		for (const category of allCategories) {
			const newColor = warmLedgerColors[category.name];
			if (newColor && category.color !== newColor) {
				await db.categories.update(category.id!, { color: newColor });
			}
		}
		console.log('Migrated category colors to Warm Ledger palette');
	}
}
