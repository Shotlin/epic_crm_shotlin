import type { SemanticMetric, SemanticMetricCatalog, SemanticMetricSensitivity } from './semantic-metrics';

export type ReportPackReadiness = 'ready' | 'partial' | 'blocked';

export interface ReportPackEvidence {
  metricKey: string;
  ownerTab: string;
  sourceCollections: string[];
  available: boolean;
}

export interface ReportPack {
  id: string;
  name: string;
  audience: 'executive' | 'finance' | 'operations' | 'service';
  metricKeys: string[];
  metrics: SemanticMetric[];
  sensitivity: SemanticMetricSensitivity;
  sourceCollections: string[];
  readiness: ReportPackReadiness;
  missingMetricKeys: string[];
  coveragePercent: number;
  evidence: ReportPackEvidence[];
}

export interface ReportPackCatalog {
  generatedAt: string;
  scope: SemanticMetricCatalog['scope'];
  packs: ReportPack[];
}

const DEFINITIONS: Array<Pick<ReportPack, 'id' | 'name' | 'audience' | 'metricKeys'>> = [
  { id: 'executive-pulse', name: 'Executive operating pulse', audience: 'executive', metricKeys: ['indiaPipeline', 'outstandingReceivables', 'forecastLowPoint', 'fulfilmentCompletion', 'slaBreaches'] },
  { id: 'finance-control', name: 'Finance control pack', audience: 'finance', metricKeys: ['outstandingReceivables', 'forecastLowPoint', 'projectMarginAtRisk', 'statutoryExceptions'] },
  { id: 'operations-control', name: 'Operations control pack', audience: 'operations', metricKeys: ['availableStock', 'reorderAlerts', 'fulfilmentCompletion', 'qualityHolds', 'capacityLoadPercent'] },
  { id: 'service-control', name: 'Service control pack', audience: 'service', metricKeys: ['slaBreaches', 'activeWorkforce', 'entitlementHoursRemaining', 'entitlementOverageHours'] },
];

function severity(sensitivities: SemanticMetricSensitivity[]): SemanticMetricSensitivity {
  if (sensitivities.includes('restricted')) return 'restricted';
  if (sensitivities.includes('financial')) return 'financial';
  return 'operational';
}

/** Builds predefined reports from the metric vocabulary without querying ungoverned fields. */
export function buildReportPackCatalog(catalog: SemanticMetricCatalog): ReportPackCatalog {
  const byKey = new Map(catalog.metrics.map((metric) => [metric.key, metric]));
  const packs = DEFINITIONS.map((definition) => {
    const metrics = definition.metricKeys.map((key) => byKey.get(key)).filter((metric): metric is SemanticMetric => Boolean(metric));
    const missingMetricKeys = definition.metricKeys.filter((key) => !byKey.get(key)?.available);
    const sourceCollections = [...new Set(metrics.flatMap(({ sourceCollections: sources }) => sources))].sort();
    const readiness: ReportPackReadiness = missingMetricKeys.length === definition.metricKeys.length ? 'blocked' : missingMetricKeys.length ? 'partial' : 'ready';
    const evidence = definition.metricKeys.map((metricKey) => {
      const metric = byKey.get(metricKey);
      return { metricKey, ownerTab: metric?.ownerTab ?? 'unavailable', sourceCollections: metric?.sourceCollections ?? [], available: Boolean(metric?.available) };
    });
    const coveragePercent = Math.round((evidence.filter(({ available }) => available).length / definition.metricKeys.length) * 100);
    return { ...definition, metrics, sensitivity: severity(metrics.map(({ sensitivity: value }) => value)), sourceCollections, readiness, missingMetricKeys, coveragePercent, evidence };
  });
  return { generatedAt: catalog.generatedAt, scope: catalog.scope, packs };
}
