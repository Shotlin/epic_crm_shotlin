import type { ReportPackCatalog, ReportPackReadiness } from './report-packs';
import type { SemanticMetricCatalog } from './semantic-metrics';

export type SavedReportViewVisibility = 'shared' | 'private';

export interface SavedReportView {
  id: string;
  name: string;
  packId: string;
  audience: 'executive' | 'finance' | 'operations' | 'service';
  scope: SemanticMetricCatalog['scope'];
  metricKeys: string[];
  columns: Array<{ key: string; label: string; unit: string; sensitivity: string }>;
  filters: Array<{ field: string; operator: 'available' | 'greater-than' | 'less-than'; value?: number }>;
  sourceCollections: string[];
  visibility: SavedReportViewVisibility;
  readiness: ReportPackReadiness;
  coveragePercent: number;
}

export interface SavedReportViewCatalog {
  generatedAt: string;
  scope: SemanticMetricCatalog['scope'];
  views: SavedReportView[];
}

/** Builds reusable, exact-scope views without permitting arbitrary fields or ungoverned filters. */
export function buildSavedReportViewCatalog(catalog: SemanticMetricCatalog, reports: ReportPackCatalog): SavedReportViewCatalog {
  const views = reports.packs.map((pack) => ({
    id: `view-${pack.id}`,
    name: `${pack.name} · governed view`,
    packId: pack.id,
    audience: pack.audience,
    scope: catalog.scope,
    metricKeys: pack.metricKeys,
    columns: pack.metrics.map(({ key, label, unit, sensitivity }) => ({ key, label, unit, sensitivity })),
    filters: pack.metrics.map(({ key }) => ({ field: key, operator: 'available' as const })),
    sourceCollections: pack.sourceCollections,
    visibility: 'shared' as const,
    readiness: pack.readiness,
    coveragePercent: pack.coveragePercent,
  }));
  return { generatedAt: catalog.generatedAt, scope: catalog.scope, views };
}
