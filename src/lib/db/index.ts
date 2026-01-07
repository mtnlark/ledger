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
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
	{ name: 'Car', icon: '🚗', color: '#6366f1', isActive: true, sortOrder: 1 },
	{ name: 'Cash withdrawals', icon: '💵', color: '#22c55e', isActive: true, sortOrder: 2 },
	{ name: 'Clothes & accessories', icon: '👕', color: '#ec4899', isActive: true, sortOrder: 3 },
	{ name: 'Coffee & snacks', icon: '☕', color: '#f97316', isActive: true, sortOrder: 4 },
	{ name: 'Donations', icon: '💝', color: '#ef4444', isActive: true, sortOrder: 5 },
	{ name: 'Electronics', icon: '📱', color: '#3b82f6', isActive: true, sortOrder: 6 },
	{ name: 'Fitness & wellness', icon: '🏋️', color: '#14b8a6', isActive: true, sortOrder: 7 },
	{ name: 'Fun & hobbies', icon: '🎮', color: '#a855f7', isActive: true, sortOrder: 8 },
	{ name: 'Gas', icon: '⛽', color: '#f59e0b', isActive: true, sortOrder: 9 },
	{ name: 'Gifts', icon: '🎁', color: '#f43f5e', isActive: true, sortOrder: 10 },
	{ name: 'Groceries', icon: '🛒', color: '#22c55e', isActive: true, sortOrder: 11 },
	{ name: 'Grooming', icon: '💇', color: '#06b6d4', isActive: true, sortOrder: 12 },
	{ name: 'Health', icon: '🏥', color: '#ef4444', isActive: true, sortOrder: 13 },
	{ name: 'Home', icon: '🏠', color: '#8b5cf6', isActive: true, sortOrder: 14 },
	{ name: 'Household supplies', icon: '🧹', color: '#64748b', isActive: true, sortOrder: 15 },
	{ name: 'Insurance', icon: '🛡️', color: '#0ea5e9', isActive: true, sortOrder: 16 },
	{ name: 'Parking & tolls', icon: '🅿️', color: '#78716c', isActive: true, sortOrder: 17 },
	{ name: 'Pet', icon: '🐕', color: '#d97706', isActive: true, sortOrder: 18 },
	{ name: 'Rent', icon: '🏢', color: '#7c3aed', isActive: true, sortOrder: 19 },
	{ name: 'Restaurants', icon: '🍽️', color: '#dc2626', isActive: true, sortOrder: 20 },
	{ name: 'Subscriptions', icon: '📺', color: '#2563eb', isActive: true, sortOrder: 21 },
	{ name: 'Travel', icon: '✈️', color: '#0891b2', isActive: true, sortOrder: 22 },
	{ name: 'Utilities', icon: '💡', color: '#eab308', isActive: true, sortOrder: 23 }
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
}
