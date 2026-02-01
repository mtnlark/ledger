/**
 * Dashboard Insight Widget - priority-based insight selection for the dashboard.
 *
 * Shows the most important insight based on priority:
 * 1. Budget alert (any category >90% spent)
 * 2. Anomaly detected (z-score > threshold)
 * 3. Pace warning (mid-month, on track to exceed income)
 * 4. Positive reinforcement (all budgeted categories on track)
 * 5. Neutral fallback (transaction count)
 */

import type { Transaction, MonthlyBudget } from '$lib/db';
import { getCategoryBudgetsForMonth, getAllCategorySpending } from '$lib/stores/categoryBudget';
import { getAllCategories } from '$lib/stores/categories';
import { getBudgetStatus } from '$lib/utils/budget-status';
import { config } from '$lib/config';
import { formatCurrency } from '$lib/utils/format-helpers';
import { filterUpToDate } from '$lib/utils/date-helpers';
import type { ComponentType } from 'svelte';
import { AlertTriangle, TrendingUp, Gauge, CheckCircle, BarChart3 } from 'lucide-svelte';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardInsightType =
	| 'budget-alert'
	| 'anomaly'
	| 'pace-warning'
	| 'on-track'
	| 'fallback';

export interface DashboardInsight {
	type: DashboardInsightType;
	message: string;
	icon: ComponentType;
	/** Tailwind color classes for the icon */
	iconColor: string;
	/** Tailwind background color class */
	bgColor: string;
	/** Tailwind border color class */
	borderColor: string;
	/** Navigation target when clicked, or null for no navigation */
	linkTo: '/budget' | '/insights' | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage utilities
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ledger-dashboard-insight-dismissed';

/**
 * Check if the dashboard insight has been dismissed within the configured duration.
 */
export function isDismissed(): boolean {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return false;

		const dismissedAt = parseInt(stored, 10);
		const now = Date.now();
		const durationMs = config.dashboardInsight.dismissDurationHours * 60 * 60 * 1000;

		if (now - dismissedAt < durationMs) {
			return true;
		}

		// Expired, clear it
		localStorage.removeItem(STORAGE_KEY);
		return false;
	} catch {
		return false;
	}
}

/**
 * Dismiss the dashboard insight for the configured duration.
 */
export function dismissInsight(): void {
	try {
		localStorage.setItem(STORAGE_KEY, String(Date.now()));
	} catch {
		// Ignore localStorage errors
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight calculation
// ─────────────────────────────────────────────────────────────────────────────

interface CalculateParams {
	currentMonth: string;
	transactions: Transaction[];
	budget: MonthlyBudget | null;
	/** Amount saved from contributions (affects available to spend) */
	savedFromContributions: number;
	currentDay: number;
	daysInMonth: number;
}

/**
 * Calculate the highest-priority insight to display on the dashboard.
 * Returns null if no meaningful insight can be shown.
 */
export async function calculateDashboardInsight(
	params: CalculateParams
): Promise<DashboardInsight | null> {
	const { currentMonth, transactions, budget, savedFromContributions, currentDay, daysInMonth } = params;
	const threshold = config.dashboardInsight.budgetAlertThreshold;

	// Priority 1: Budget alert (any category > threshold% spent)
	const budgetAlert = await checkBudgetAlerts(currentMonth, threshold);
	if (budgetAlert) return budgetAlert;

	// Priority 2: Pace warning (mid-month, on track to exceed income)
	// Note: Anomaly detection skipped as it requires loading all historical transactions
	const paceAlert = checkPaceWarning(transactions, budget, savedFromContributions, currentDay, daysInMonth);
	if (paceAlert) return paceAlert;

	// Priority 4: Positive reinforcement (all budgeted categories on track)
	const onTrackAlert = await checkAllOnTrack(currentMonth, threshold);
	if (onTrackAlert) return onTrackAlert;

	// Priority 5: Neutral fallback (transaction count)
	return {
		type: 'fallback',
		message: `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} logged this month`,
		icon: BarChart3,
		iconColor: 'text-primary-600',
		bgColor: 'bg-primary-50',
		borderColor: 'border-primary-200',
		linkTo: null
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for budget alerts - categories that are "over" or "approaching" budget.
 * Uses the same getBudgetStatus() logic as the Budget page to ensure consistency.
 * Categories "at budget" (within tolerance) are NOT considered alerts.
 */
async function checkBudgetAlerts(
	month: string,
	_threshold: number // Kept for API compatibility, but we use getBudgetStatus instead
): Promise<DashboardInsight | null> {
	const [budgets, spending, categories] = await Promise.all([
		getCategoryBudgetsForMonth(month),
		getAllCategorySpending(month),
		getAllCategories()
	]);

	if (budgets.length === 0) return null;

	const categoryMap = new Map(categories.map((c) => [c.id!, c]));

	// Find the worst alert using the same status logic as Budget page
	// Priority: "over" (most severe) > "approaching"
	// "at budget" is NOT an alert - it's within tolerance
	let worstAlert: {
		name: string;
		icon: string;
		percent: number;
		status: 'over' | 'approaching';
	} | null = null;

	for (const budget of budgets) {
		const spent = spending.get(budget.categoryId) || 0;
		const statusResult = getBudgetStatus(Math.round(spent), Math.round(budget.budgetAmount));

		// Only alert on "over" or "approaching" - NOT "at" or "under"
		if (statusResult.status === 'over' || statusResult.status === 'approaching') {
			const isWorse =
				!worstAlert ||
				(statusResult.status === 'over' && worstAlert.status === 'approaching') ||
				(statusResult.status === worstAlert.status && statusResult.percentSpent > worstAlert.percent);

			if (isWorse) {
				const category = categoryMap.get(budget.categoryId);
				worstAlert = {
					name: category?.name ?? 'Unknown',
					icon: category?.icon ?? '📦',
					percent: statusResult.percentSpent,
					status: statusResult.status
				};
			}
		}
	}

	if (worstAlert) {
		const isOver = worstAlert.status === 'over';
		return {
			type: 'budget-alert',
			message: `${worstAlert.icon} ${worstAlert.name} ${isOver ? 'over budget' : `at ${Math.round(worstAlert.percent)}% of budget`}`,
			icon: AlertTriangle,
			iconColor: isOver ? 'text-danger-600' : 'text-warning-600',
			bgColor: isOver ? 'bg-danger-50' : 'bg-warning-50',
			borderColor: isOver ? 'border-danger-200' : 'border-warning-200',
			linkTo: '/budget'
		};
	}

	return null;
}

/**
 * Check if spending pace will exceed available budget.
 */
function checkPaceWarning(
	transactions: Transaction[],
	budget: MonthlyBudget | null,
	savedFromContributions: number,
	currentDay: number,
	daysInMonth: number
): DashboardInsight | null {
	// Only show mid-month onwards
	if (currentDay < config.dashboardInsight.paceWarningMinDay) return null;
	if (!budget || budget.income <= 0) return null;

	// Exclude future-dated transactions (e.g. auto-added recurring) from pace calculation
	const pastTransactions = filterUpToDate(transactions);

	// Calculate total spent (user's portion)
	const totalSpent = pastTransactions.reduce((sum, t) => {
		const userAmount = t.isShared ? t.amount - t.partnerShare : t.amount;
		return sum + userAmount;
	}, 0);

	// Avoid division by zero on edge cases
	if (currentDay <= 0) return null;

	// Project end-of-month spending
	const dailyAvg = totalSpent / currentDay;
	const projected = totalSpent + dailyAvg * (daysInMonth - currentDay);

	// Calculate available (income - savings contributions that affect available)
	const available = budget.income - savedFromContributions;

	if (projected > available && available > 0) {
		return {
			type: 'pace-warning',
			message: `On pace to spend ${formatCurrency(Math.round(projected))} by month end`,
			icon: Gauge,
			iconColor: 'text-warning-600',
			bgColor: 'bg-warning-50',
			borderColor: 'border-warning-200',
			linkTo: '/insights'
		};
	}

	return null;
}

/**
 * Check if all budgeted categories are on track (not "over" or "approaching").
 * Uses the same getBudgetStatus() logic as the Budget page.
 */
async function checkAllOnTrack(
	month: string,
	_threshold: number // Kept for API compatibility
): Promise<DashboardInsight | null> {
	const [budgets, spending] = await Promise.all([
		getCategoryBudgetsForMonth(month),
		getAllCategorySpending(month)
	]);

	// Need at least one budgeted category
	if (budgets.length === 0) return null;

	// Check if ALL are on track (not "over" or "approaching")
	let allOnTrack = true;
	for (const budget of budgets) {
		const spent = spending.get(budget.categoryId) || 0;
		const statusResult = getBudgetStatus(Math.round(spent), Math.round(budget.budgetAmount));
		if (statusResult.status === 'over' || statusResult.status === 'approaching') {
			allOnTrack = false;
			break;
		}
	}

	if (allOnTrack) {
		return {
			type: 'on-track',
			message: `All ${budgets.length} budgeted ${budgets.length === 1 ? 'category' : 'categories'} on track`,
			icon: CheckCircle,
			iconColor: 'text-success-600',
			bgColor: 'bg-success-50',
			borderColor: 'border-success-200',
			linkTo: null
		};
	}

	return null;
}
