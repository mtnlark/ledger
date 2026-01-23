/**
 * Insights Calculation Layer - Public API
 *
 * Usage:
 *   import { getInsightsEngine } from '$lib/insights';
 *   const engine = getInsightsEngine();
 *   const spending = engine.getSpendingByCategory(transactions, month);
 */

export { getInsightsEngine, resetInsightsEngine, InsightsEngine } from './insights-engine';

export type {
	AnomalyResult,
	PaceProjectionResult,
	NeedsVsWantsResult,
	NeedsWantsFullResult,
	VelocityComparisonResult,
	TopMerchantResult,
	CategoryShiftResult,
	CategoryDeepDiveShift,
	YTDStatsResult
} from './types';
