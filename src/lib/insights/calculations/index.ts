/**
 * Re-exports all calculation functions.
 */

export { getUserAmount, getSpendingByCategory, getTotalSpent } from './spending';
export { calculateNeedsVsWants, calculateNeedsVsWantsFull } from './needs-wants';
export { computeTopCategoryShift, computeCategoryDeepDiveShift } from './category-shift';
export { computeCategoryAverages } from './category-averages';
export { detectAnomalies } from './anomalies';
export { calculatePaceProjection } from './pace-projection';
export { calculateVelocityComparison } from './velocity';
export { getTopMerchant } from './top-merchant';
export { computeYTDStats } from './ytd-stats';
