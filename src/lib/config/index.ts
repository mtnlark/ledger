/**
 * Centralized configuration for the Ledger app.
 * All magic numbers and hardcoded values should be defined here.
 */

export const config = {
	/**
	 * Category display defaults when category is not found
	 */
	category: {
		defaultIcon: '📝',
		defaultColor: '#8A847C',
		defaultName: 'Unknown'
	},

	/**
	 * Budget alert thresholds
	 */
	budget: {
		/** Threshold for "approaching budget" alert (within $X of limit) */
		approachingThreshold: 5,
		/**
		 * Epsilon for floating point comparison (cents).
		 * Used for determining if spending equals budget amount.
		 */
		epsilon: 0.01,
		/** Number of months to look back for budget suggestions */
		suggestionMonths: 6,
		/** Decay factor for weighted average (0.85 = 15% decay per month) */
		suggestionDecay: 0.85,
		/** Base headroom multiplier for stdDev (0.5 = half a standard deviation) */
		suggestionHeadroom: 0.5,
		/** Percent threshold for "approaching" status (e.g., 80 = 80%) */
		approachingThresholdPercent: 80,
		/** Percent below 100% to treat as "at budget" (e.g., 1 = 99%+) */
		atBudgetUnderTolerancePercent: 1,
		/** Minimum dollar amount over budget to still be "at budget" */
		atBudgetOverToleranceMin: 2,
		/** Percent of budget over to still be "at budget" (e.g., 1 = 1%) */
		atBudgetOverTolerancePercent: 1
	},

	/**
	 * Recurring expense detection thresholds
	 */
	recurring: {
		/** Maximum coefficient of variation to be considered recurring (50%) */
		maxVariance: 0.5,
		/** Variance threshold below which amount is "fixed" vs "variable" (15%) */
		fixedVarianceThreshold: 0.15,
		/** Interval patterns for frequency detection (in days) */
		intervals: {
			monthly: { min: 25, max: 35 },
			semiAnnual: { min: 160, max: 200 },
			annual: { min: 350, max: 380 }
		}
	},

	/**
	 * Subscription staleness detection
	 */
	subscription: {
		/** Days without charge before monthly subscription is considered stale */
		monthlyStaleDays: 60,
		/** Months without charge before semi-annual subscription is considered stale */
		semiAnnualStaleMonths: 8,
		/** Months without charge before annual subscription is considered stale */
		annualStaleMonths: 13
	},

	/**
	 * Recurring suggestions auto-entry
	 */
	recurringSuggestions: {
		/** Tolerance for matching existing transactions (15% = allow 15% amount difference) */
		amountTolerance: 0.15
	},

	/**
	 * Date parsing configuration
	 */
	date: {
		/** 2-digit years below this are 2000s, at or above are 1900s */
		twoDigitYearCutoff: 50
	},

	/**
	 * Insights and smart takeaways thresholds
	 */
	/**
	 * Dashboard insight widget settings
	 */
	dashboardInsight: {
		/** Percent threshold for budget alerts (show if spending > this %) */
		budgetAlertThreshold: 90,
		/** Minimum day of month to show pace warnings */
		paceWarningMinDay: 10,
		/** Dismiss duration in hours */
		dismissDurationHours: 24
	},

	/**
	 * Notification scheduling
	 */
	notifications: {
		/** Scheduler tick interval in milliseconds */
		checkIntervalMs: 60_000,
		/** Default daily reminder time (24h) */
		defaultDailyTime: '20:00',
		/** Default weekly/monthly notification time (24h) */
		defaultWeeklyTime: '09:00',
		defaultMonthlyTime: '09:00',
		/** Day of week for weekly review (0=Sun, 1=Mon, ..., 6=Sat) */
		weeklyReviewDay: 1
	},

	insights: {
		/** Anomaly detection settings */
		anomaly: {
			/** Minimum 3-month average to detect anomalies ($) */
			minAverage: 20,
			/** Z-score threshold: flag if spending exceeds this many SDs above mean */
			zScoreThreshold: 2.0,
			/** Maximum number of anomalies to show */
			maxToShow: 2,
			/** Fallback ratio when stdDev is 0 (single month of history) */
			fallbackRatioThreshold: 1.5
		},
		/** Category shift detection settings */
		shift: {
			/** Days into month to consider "early" */
			earlyMonthCutoff: 15,
			/** Ratio threshold for early month skip (current/previous) */
			earlyMonthRatio: 0.2,
			/** Z-score threshold: shift significant if > N stddevs */
			zScoreThreshold: 1.0,
			/** Minimum amount in either month to consider */
			minAmount: 20,
			/** Fallback dollar difference when stdDev is 0 */
			fallbackMinDifference: 30
		},
		/** Spending velocity comparison */
		velocity: {
			/** Minimum percent change to show comparison (also floor for adaptive threshold) */
			percentThreshold: 5
		},
		/** Top merchant detection */
		topMerchant: {
			/** Minimum visits to show merchant */
			minVisits: 2
		},
		/** General takeaways settings */
		takeaways: {
			/** Maximum number of takeaways to display */
			maxCount: 3,
			/** Number of months to average for comparisons */
			monthsToAverage: 3
		}
	}
} as const;

/** Type for the config object */
export type AppConfig = typeof config;
