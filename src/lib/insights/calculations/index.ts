/**
 * Re-exports all calculation functions.
 */

export { getUserAmount, getSpendingByCategory, getTotalSpent } from './spending';
export { calculateNeedsVsWants, calculateNeedsVsWantsFull } from './needs-wants';
export { computeTopCategoryShift, computeCategoryDeepDiveShift } from './category-shift';
export { computeCategoryAverages, computeCategoryStats, computeWeightedCategoryStats } from './category-averages';
export type { CategoryStats, WeightedStatsOptions } from './category-averages';
export { detectAnomalies } from './anomalies';
export { calculatePaceProjection } from './pace-projection';
export { calculateVelocityComparison } from './velocity';
export { getTopMerchant, countMerchantVisits } from './top-merchant';
export { computeYTDStats } from './ytd-stats';
export {
	computeStdDev,
	computeMedian,
	computeZScore,
	generateDecayWeights,
	computeWeightedMean,
	computeWeightedStdDev
} from './stats';
export { computeMonthReview } from './month-review';
export type { MonthReviewResult } from './month-review';
