import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export type SemanticMetricSensitivity = 'operational' | 'financial' | 'restricted';

export interface SemanticMetric {
  key: string;
  label: string;
  value: number | null;
  unit: 'count' | 'inr' | 'hours' | 'percent' | 'units';
  sensitivity: SemanticMetricSensitivity;
  ownerTab: string;
  sourceCollections: string[];
  available: boolean;
}

export interface SemanticMetricCatalog {
  generatedAt: string;
  scope: RevenueOpsSnapshot['scope'];
  metrics: SemanticMetric[];
}

type MetricSource = Pick<RevenueOpsSnapshot, 'scope' | 'metrics'>;

const DEFINITIONS: Array<{ key: keyof RevenueOpsSnapshot['metrics']; label: string; unit: SemanticMetric['unit']; sensitivity: SemanticMetricSensitivity; ownerTab: string; sourceCollections: string[] }> = [
  { key: 'indiaPipeline', label: 'India pipeline value', unit: 'inr', sensitivity: 'financial', ownerTab: 'pursuits', sourceCollections: ['opportunities', 'territoryPerformance'] },
  { key: 'outstandingReceivables', label: 'Outstanding receivables', unit: 'inr', sensitivity: 'financial', ownerTab: 'collections', sourceCollections: ['receivables'] },
  { key: 'forecastLowPoint', label: 'Cash forecast low point', unit: 'inr', sensitivity: 'financial', ownerTab: 'treasury', sourceCollections: ['cashForecastRuns'] },
  { key: 'availableStock', label: 'Available stock', unit: 'units', sensitivity: 'restricted', ownerTab: 'warehouse', sourceCollections: ['binBalances'] },
  { key: 'reorderAlerts', label: 'Open replenishment alerts', unit: 'count', sensitivity: 'operational', ownerTab: 'warehouse', sourceCollections: ['reorderProposals'] },
  { key: 'fulfilmentCompletion', label: 'Fulfilment completion', unit: 'percent', sensitivity: 'operational', ownerTab: 'fulfilment', sourceCollections: ['fulfilmentTasks', 'shipmentPackages'] },
  { key: 'qualityHolds', label: 'Quality holds', unit: 'count', sensitivity: 'operational', ownerTab: 'manufacturing', sourceCollections: ['qualityInspections', 'nonconformances'] },
  { key: 'capacityLoadPercent', label: 'Production capacity load', unit: 'percent', sensitivity: 'operational', ownerTab: 'manufacturing', sourceCollections: ['workOrders', 'workCenters'] },
  { key: 'activeWorkforce', label: 'Active workforce', unit: 'count', sensitivity: 'restricted', ownerTab: 'people', sourceCollections: ['workforceProfiles'] },
  { key: 'slaBreaches', label: 'Open SLA breaches', unit: 'count', sensitivity: 'operational', ownerTab: 'delivery', sourceCollections: ['supportTickets'] },
  { key: 'entitlementHoursRemaining', label: 'Service entitlement hours remaining', unit: 'hours', sensitivity: 'financial', ownerTab: 'close', sourceCollections: ['serviceAgreements', 'serviceEntitlementUsage'] },
  { key: 'entitlementOverageHours', label: 'Service entitlement overage hours', unit: 'hours', sensitivity: 'financial', ownerTab: 'close', sourceCollections: ['serviceEntitlementUsage'] },
  { key: 'projectMarginAtRisk', label: 'Projects with margin at risk', unit: 'count', sensitivity: 'financial', ownerTab: 'close', sourceCollections: ['projectMarginReviews'] },
  { key: 'statutoryExceptions', label: 'Statutory exceptions', unit: 'count', sensitivity: 'restricted', ownerTab: 'statutory', sourceCollections: ['portalReconciliationRuns', 'statutoryOperations'] },
];

/** Creates a stable, permission-aware metric vocabulary for reports and decision workbenches. */
export function buildSemanticMetricCatalog(state: MetricSource, generatedAt = new Date().toISOString()): SemanticMetricCatalog {
  const metrics = DEFINITIONS.map((definition) => {
    const raw = state.metrics[definition.key];
    return { ...definition, value: typeof raw === 'number' && Number.isFinite(raw) ? raw : null, available: typeof raw === 'number' && Number.isFinite(raw) };
  });
  return { generatedAt, scope: state.scope, metrics };
}
