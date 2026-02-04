/**
 * Component Test Utilities
 *
 * Helper functions for testing Svelte components
 */

import type { Transaction, Category, MonthlyBudget, Settings } from '$lib/db';

/**
 * Create a mock transaction for testing
 */
export function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: Math.floor(Math.random() * 10000),
		date: new Date(),
		merchant: 'Test Merchant',
		amount: 100,
		categoryId: 1,
		isShared: false,
		splitType: 'percentage',
		splitValue: 50,
		partnerShare: 0,
		isSettled: false,
		isEssential: false,
		isSubscription: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

/**
 * Create mock transactions for a date range
 */
export function createMockTransactions(
	count: number,
	baseOverrides: Partial<Transaction> = {}
): Transaction[] {
	return Array.from({ length: count }, (_, i) => {
		const date = new Date();
		date.setDate(date.getDate() - i);
		return createMockTransaction({
			id: i + 1,
			date,
			merchant: `Merchant ${i + 1}`,
			amount: 10 + i * 10,
			...baseOverrides
		});
	});
}

/**
 * Create a mock category for testing
 */
export function createMockCategory(overrides: Partial<Category> = {}): Category {
	return {
		id: Math.floor(Math.random() * 10000),
		name: 'Test Category',
		icon: '📝',
		color: '#6B7280',
		isActive: true,
		sortOrder: 0,
		isEssential: false,
		...overrides
	};
}

/**
 * Create default mock categories matching app defaults
 */
export function createDefaultCategories(): Category[] {
	const categories = [
		{ name: 'Car', icon: '🚗', isEssential: true },
		{ name: 'Groceries', icon: '🛒', isEssential: true },
		{ name: 'Restaurants', icon: '🍽️', isEssential: false },
		{ name: 'Entertainment', icon: '🎬', isEssential: false },
		{ name: 'Utilities', icon: '💡', isEssential: true },
		{ name: 'Shopping', icon: '🛍️', isEssential: false },
		{ name: 'Health', icon: '🏥', isEssential: true },
		{ name: 'Travel', icon: '✈️', isEssential: false }
	];

	return categories.map((cat, i) =>
		createMockCategory({
			id: i + 1,
			name: cat.name,
			icon: cat.icon,
			isEssential: cat.isEssential,
			sortOrder: i,
			color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
		})
	);
}

/**
 * Create a mock monthly budget for testing
 */
export function createMockBudget(overrides: Partial<MonthlyBudget> = {}): MonthlyBudget {
	const now = new Date();
	return {
		id: Math.floor(Math.random() * 10000),
		month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
		income: 5000,
		savedAmount: 1000,
		...overrides
	};
}

/**
 * Create mock settings for testing
 */
export function createMockSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		partnerName: 'Partner',
		defaultSplitType: 'percentage',
		defaultSplitValue: 50,
		currency: 'USD',
		theme: 'light',
		dismissedRecurring: [],
		cancelledSubscriptions: [],
		confirmedActiveSubscriptions: [],
		iCloudBackupEnabled: false,
		completedGoals: [],
		notificationsEnabled: false,
		dailyReminderEnabled: true,
		dailyReminderTime: '20:00',
		weeklyReviewEnabled: true,
		monthlyBudgetSetupEnabled: true,
		...overrides
	};
}

/**
 * Get month key in YYYY-MM format
 */
export function getMonthKey(date: Date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Wait for component updates
 */
export async function tick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Format currency for test assertions
 */
export function formatTestCurrency(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	}).format(amount);
}
