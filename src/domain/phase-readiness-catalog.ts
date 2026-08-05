export interface PhaseReadinessEntry {
  id: string;
  phase: string;
  label: string;
  areas: readonly string[];
  readiness: number;
  state: 'active' | 'skeleton' | 'external-gate';
  nextMilestone: string;
}

export const PHASE_READINESS_CATALOG: readonly PhaseReadinessEntry[] = [
  { id: 'phase-0', phase: 'Phase 0', label: 'Electron shell + operating kernel', areas: ['navigation', 'authentication', 'RBAC', 'audit', 'backup'], readiness: 78, state: 'active', nextMilestone: 'Production recovery and release certification' },
  { id: 'phase-1', phase: 'Phase 1', label: 'Party master + CRM depth', areas: ['accounts', 'contacts', 'leads', 'pipelines', 'campaigns'], readiness: 72, state: 'active', nextMilestone: 'Branch-isolated projections and communications' },
  { id: 'phase-2', phase: 'Phase 2', label: 'Sales + India finance', areas: ['quotations', 'orders', 'GST', 'collections', 'treasury'], readiness: 58, state: 'active', nextMilestone: 'Provider certification and statutory filing packs' },
  { id: 'phase-3', phase: 'Phase 3', label: 'Supply chain + manufacturing', areas: ['inventory', 'warehouse', 'procurement', 'MRP', 'quality'], readiness: 54, state: 'active', nextMilestone: 'End-to-end valuation and production costing' },
  { id: 'phase-4', phase: 'Phase 4', label: 'People + service delivery', areas: ['HR', 'payroll', 'projects', 'support', 'field service'], readiness: 51, state: 'skeleton', nextMilestone: 'Payroll/provider and field-device conformance' },
  { id: 'phase-5', phase: 'Phase 5', label: 'Intelligence + ecosystem', areas: ['analytics', 'AI review', 'automation', 'APIs', 'connectors'], readiness: 34, state: 'external-gate', nextMilestone: 'Sandbox credentials, connector evidence, and production approvals' },
];

export function summarizePhaseReadiness(entries: readonly PhaseReadinessEntry[] = PHASE_READINESS_CATALOG): { phases: number; average: number; active: number; skeleton: number; externalGate: number } {
  return {
    phases: entries.length,
    average: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.readiness, 0) / entries.length) : 0,
    active: entries.filter(({ state }) => state === 'active').length,
    skeleton: entries.filter(({ state }) => state === 'skeleton').length,
    externalGate: entries.filter(({ state }) => state === 'external-gate').length,
  };
}
