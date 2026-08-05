export type PerformanceMetricId = 'startup' | 'ipc-read' | 'renderer-interaction' | 'backup';

export interface PerformanceMeasurement {
  id: PerformanceMetricId;
  label: string;
  observedMs: number;
  budgetMs: number;
  evidenceReference: string;
}

export interface PerformanceBudgetResult {
  status: 'within-budget' | 'over-budget';
  overBudgetIds: PerformanceMetricId[];
  measurements: PerformanceMeasurement[];
}
