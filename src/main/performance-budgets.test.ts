import { describe, expect, it } from 'vitest';
import { evaluatePerformanceBudgets } from './performance-budgets';

describe('performance budgets', () => {
  it('classifies all measured paths without inventing telemetry', () => {
    const result = evaluatePerformanceBudgets([
      { id: 'startup', label: 'Cold startup', observedMs: 1200, budgetMs: 2000, evidenceReference: 'PERF-START-1' },
      { id: 'ipc-read', label: 'Scoped IPC read', observedMs: 250, budgetMs: 200, evidenceReference: 'PERF-IPC-1' },
    ]);
    expect(result.status).toBe('over-budget');
    expect(result.overBudgetIds).toEqual(['ipc-read']);
  });

  it('rejects malformed measurements', () => {
    expect(() => evaluatePerformanceBudgets([{ id: 'backup', label: 'Backup', observedMs: -1, budgetMs: 1000, evidenceReference: 'PERF-1' }])).toThrow('Invalid performance evidence');
  });
});
