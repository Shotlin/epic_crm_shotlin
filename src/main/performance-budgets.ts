import type { PerformanceBudgetResult, PerformanceMeasurement } from '../shared/performance-contracts';

export function evaluatePerformanceBudgets(measurements: PerformanceMeasurement[]): PerformanceBudgetResult {
  for (const measurement of measurements) {
    if (!Number.isFinite(measurement.observedMs) || measurement.observedMs < 0 || !Number.isFinite(measurement.budgetMs) || measurement.budgetMs <= 0 || !measurement.evidenceReference.trim()) {
      throw new Error(`Invalid performance evidence for ${measurement.id}.`);
    }
  }
  const overBudgetIds = measurements.filter(({ observedMs, budgetMs }) => observedMs > budgetMs).map(({ id }) => id);
  return { status: overBudgetIds.length ? 'over-budget' : 'within-budget', overBudgetIds, measurements: measurements.map((measurement) => ({ ...measurement })) };
}
