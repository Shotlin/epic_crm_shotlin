import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import { browserChecksum } from '../shared/browser-checksum';

export type OperationalScenario = 'base' | 'conservative' | 'upside';
export type CapacityScenarioStatus = 'stable' | 'watch' | 'overload';
export type InventoryScenarioStatus = 'covered' | 'watch' | 'shortfall';
export type ScenarioReadiness = 'ready' | 'attention' | 'blocked';

export interface OperationalScenarioResult {
  scenario: OperationalScenario;
  assumptions: { demandFactor: number; reservationFactor: number; horizonDays: number };
  assumptionKey: string;
  capacity: { projectedLoadPercent: number; overloadPercent: number; status: CapacityScenarioStatus };
  inventory: { projectedAvailable: number; reservedUnits: number; reorderAlerts: number; status: InventoryScenarioStatus };
}

export interface OperationalScenarioSummary {
  generatedAt: string;
  sourceEvidence: { capacityLoadPercent: number; availableStock: number; reservedStock: number; reorderAlerts: number };
  scenarios: OperationalScenarioResult[];
  readiness: ScenarioReadiness;
  missingEvidence: string[];
  checksum: string;
}

type ScenarioSource = Pick<RevenueOpsSnapshot, 'metrics'>;

/** Compares capacity and inventory outcomes under explicit, review-only assumptions. */
export function buildOperationalScenarios(state: ScenarioSource, horizonDays = 30, generatedAt = new Date().toISOString()): OperationalScenarioSummary {
  const metrics = state.metrics;
  const required = ['capacityLoadPercent', 'availableStock', 'reservedStock', 'reorderAlerts'] as const;
  const missingEvidence = required.filter((key) => typeof metrics[key] !== 'number' || !Number.isFinite(metrics[key]));
  const baseLoad = metrics.capacityLoadPercent ?? 0;
  const availableStock = metrics.availableStock ?? 0;
  const reservedStock = metrics.reservedStock ?? 0;
  const reorderAlerts = metrics.reorderAlerts ?? 0;
  const variants: Array<[OperationalScenario, number, number]> = [['conservative', 0.8, 0.8], ['base', 1, 1], ['upside', 1.2, 1.15]];
  const scenarios = variants.map(([scenario, demandFactor, reservationFactor]) => {
    const assumptions = { demandFactor, reservationFactor, horizonDays };
    const projectedLoadPercent = Math.round(baseLoad * demandFactor * 100) / 100;
    const overloadPercent = Math.max(0, Math.round((projectedLoadPercent - 100) * 100) / 100);
    const projectedAvailable = Math.round((availableStock - reservedStock * reservationFactor) * 100) / 100;
    const capacityStatus: CapacityScenarioStatus = projectedLoadPercent > 100 ? 'overload' : projectedLoadPercent > 85 ? 'watch' : 'stable';
    const inventoryStatus: InventoryScenarioStatus = projectedAvailable < 0 ? 'shortfall' : reorderAlerts > 0 || projectedAvailable < reservedStock * 0.25 ? 'watch' : 'covered';
    return { scenario, assumptions, assumptionKey: JSON.stringify(assumptions), capacity: { projectedLoadPercent, overloadPercent, status: capacityStatus }, inventory: { projectedAvailable, reservedUnits: Math.round(reservedStock * reservationFactor * 100) / 100, reorderAlerts, status: inventoryStatus } };
  });
  const sourceEvidence = { capacityLoadPercent: baseLoad, availableStock, reservedStock, reorderAlerts };
  const readiness: ScenarioReadiness = missingEvidence.length === required.length ? 'blocked' : missingEvidence.length ? 'attention' : 'ready';
  const unsigned = { sourceEvidence, scenarios, horizonDays, missingEvidence };
  const checksum = browserChecksum(JSON.stringify(unsigned));
  return { generatedAt, sourceEvidence, scenarios, readiness, missingEvidence, checksum };
}

export function verifyOperationalScenarioChecksum(summary: OperationalScenarioSummary): boolean {
  const { checksum, sourceEvidence, scenarios, missingEvidence } = summary;
  const horizonDays = scenarios[0]?.assumptions.horizonDays ?? 0;
  const expected = browserChecksum(JSON.stringify({ sourceEvidence, scenarios, horizonDays, missingEvidence }));
  return Boolean(checksum) && checksum === expected;
}
