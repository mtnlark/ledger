import type {
	Transaction,
	Category,
	MonthlyBudget,
	CategoryBudget,
	Settings,
	SavingsAccount,
	SavingsContribution
} from '$lib/db';

// Data structure for file storage
export interface StoredData {
	version: string;
	exportedAt: string;
	transactions: Transaction[];
	categories: Category[];
	monthlyBudgets: MonthlyBudget[];
	categoryBudgets: CategoryBudget[];
	settings: Settings;
	savingsAccounts?: SavingsAccount[];
	savingsContributions?: SavingsContribution[];
}
