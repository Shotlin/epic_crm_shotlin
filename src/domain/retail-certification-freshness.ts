import type {
  RetailCommerceConformanceCase,
  RetailCommerceConnector,
  RetailOcrDocumentKind,
  RetailOcrProviderProfile,
  RetailOcrProviderTestEvidence,
} from '../shared/retail-commerce-contracts';
import { retailCommerceConformanceMatchesCredentialRevision, retailOcrEvidenceMatchesCredentialRevision } from '../shared/retail-commerce-contracts';
import type { ProviderCapability, ProviderConformanceCase, ProviderConnector } from '../shared/provider-contracts';
import { providerConformanceMatchesCredentialRevision, providerCredentialLifecycle } from '../shared/provider-contracts';

export type RetailCertificationEvidenceSource = 'commerce' | 'ocr' | 'provider';
export type RetailCertificationEvidenceStatus = 'current' | 'renewal-due' | 'expired' | 'missing';

export interface RetailCertificationFreshnessRow {
  source: RetailCertificationEvidenceSource;
  ownerId: string;
  ownerCode: string;
  ownerName: string;
  environment?: 'sandbox' | 'production';
  capability: string;
  status: RetailCertificationEvidenceStatus;
  assessedAt?: string;
  assessedBy?: string;
  evidenceReference?: string;
  evidenceAgeDays?: number;
  nextAction: string;
}

export interface RetailCertificationFreshnessReport {
  asOfDate: string;
  maxEvidenceAgeDays: number;
  renewalWarningDays: number;
  totalCount: number;
  currentCount: number;
  renewalDueCount: number;
  expiredCount: number;
  missingCount: number;
  hardGateCount: number;
  actionRequired: boolean;
  rows: RetailCertificationFreshnessRow[];
}

const sha256 = (value: string | undefined): boolean => /^[a-f0-9]{64}$/i.test(value ?? '');
const dateOnly = (value: string): string => value.slice(0, 10);
const validDate = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)));
const daysBetween = (from: string, to: string): number | undefined => {
  if (!validDate(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(`${to}T00:00:00.000Z`))) return undefined;
  const diff = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${dateOnly(from)}T00:00:00.000Z`);
  return diff < 0 ? undefined : Math.floor(diff / 86_400_000);
};

function classifyEvidence({ assessedAt, asOfDate, maxEvidenceAgeDays, renewalWarningDays }: { assessedAt?: string; asOfDate: string; maxEvidenceAgeDays: number; renewalWarningDays: number }): { status: RetailCertificationEvidenceStatus; ageDays?: number } {
  const ageDays = daysBetween(assessedAt ?? '', asOfDate);
  if (ageDays === undefined) return { status: 'missing' };
  if (ageDays > maxEvidenceAgeDays) return { status: 'expired', ageDays };
  if (ageDays >= renewalWarningDays) return { status: 'renewal-due', ageDays };
  return { status: 'current', ageDays };
}

function nextAction(status: RetailCertificationEvidenceStatus): string {
  if (status === 'current') return 'Evidence is current.';
  if (status === 'renewal-due') return 'Run an independent replay before the renewal deadline.';
  if (status === 'expired') return 'Run and independently assess a fresh provider replay.';
  return 'Record an independently assessed, checksummed replay.';
}

function latest<T extends { assessedAt?: string }>(records: T[]): T | undefined {
  return records.slice().sort((left, right) => (right.assessedAt ?? '').localeCompare(left.assessedAt ?? ''))[0];
}

function validCommerceCase(item: RetailCommerceConformanceCase, connector: RetailCommerceConnector): boolean {
  return item.result === 'passed'
    && Boolean(item.evidenceReference?.trim())
    && sha256(item.resultChecksum)
    && Boolean(item.assessedBy?.trim())
    && item.assessedBy !== item.preparedBy
    && validDate(item.assessedAt)
    && retailCommerceConformanceMatchesCredentialRevision(connector, item);
}

function validProviderCase(item: ProviderConformanceCase, connector: ProviderConnector): boolean {
  return item.environment === connector.environment
    && item.result === 'passed'
    && Boolean(item.evidenceReference?.trim())
    && sha256(item.resultChecksum)
    && Boolean(item.assessedBy?.trim())
    && item.assessedBy !== item.preparedBy
    && validDate(item.assessedAt)
    && providerConformanceMatchesCredentialRevision(connector, item);
}

function validOcrEvidence(evidence: RetailOcrProviderTestEvidence | undefined, provider: RetailOcrProviderProfile): evidence is RetailOcrProviderTestEvidence {
  return Boolean(evidence?.evidence.trim() && evidence.testedBy.trim() && evidence.testedBy !== provider.createdBy && validDate(evidence.testedAt) && sha256(evidence.checksum) && retailOcrEvidenceMatchesCredentialRevision(provider, evidence));
}

/**
 * Computes a common 90-day evidence policy for every production provider
 * surface. It is deliberately read-only: fresh provider evidence still needs
 * the normal connector, credential, and independent approval gates.
 */
export function computeRetailCertificationFreshness({
  commerceConnectors,
  commerceCases,
  ocrProviders,
  providerConnectors,
  providerCases,
  asOfDate,
  maxEvidenceAgeDays = 90,
  renewalWarningDays = 60,
}: {
  commerceConnectors: RetailCommerceConnector[];
  commerceCases: RetailCommerceConformanceCase[];
  ocrProviders: RetailOcrProviderProfile[];
  providerConnectors: ProviderConnector[];
  providerCases: ProviderConformanceCase[];
  asOfDate: string;
  maxEvidenceAgeDays?: number;
  renewalWarningDays?: number;
}): RetailCertificationFreshnessReport {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !Number.isFinite(Date.parse(`${asOfDate}T00:00:00.000Z`))) throw new Error('Certification freshness requires an as-of date in YYYY-MM-DD format.');
  if (!Number.isInteger(maxEvidenceAgeDays) || maxEvidenceAgeDays < 1) throw new Error('Certification evidence age must be a positive whole number of days.');
  if (!Number.isInteger(renewalWarningDays) || renewalWarningDays < 0 || renewalWarningDays > maxEvidenceAgeDays) throw new Error('Certification renewal warning must be between zero and the evidence age limit.');

  const rows: RetailCertificationFreshnessRow[] = [];
  commerceConnectors.filter((connector) => connector.environment === 'production' && connector.status !== 'suspended').forEach((connector) => {
    connector.capabilities.forEach((capability) => {
      const matches = commerceCases.filter((item) => item.connectorId === connector.id && validCommerceCase(item, connector) && (item.capability === capability || (connector.capabilities.length === 1 && !item.capability)));
      const evidence = latest(matches);
      const classified = classifyEvidence({ assessedAt: evidence?.assessedAt, asOfDate, maxEvidenceAgeDays, renewalWarningDays });
      rows.push({ source: 'commerce', ownerId: connector.id, ownerCode: connector.code, ownerName: connector.name, environment: connector.environment, capability, status: classified.status, assessedAt: evidence?.assessedAt, assessedBy: evidence?.assessedBy, evidenceReference: evidence?.evidenceReference, evidenceAgeDays: classified.ageDays, nextAction: nextAction(classified.status) });
    });
  });
  ocrProviders.filter((provider) => provider.mode === 'api' && provider.status !== 'suspended').forEach((provider) => {
    provider.supportedDocumentKinds.forEach((documentKind: RetailOcrDocumentKind) => {
      const evidence = provider.testEvidenceByDocumentKind?.[documentKind];
      const currentEvidence = validOcrEvidence(evidence, provider) ? evidence : undefined;
      const classified = classifyEvidence({ assessedAt: currentEvidence?.testedAt, asOfDate, maxEvidenceAgeDays, renewalWarningDays });
      rows.push({ source: 'ocr', ownerId: provider.id, ownerCode: provider.code, ownerName: provider.name, capability: documentKind, status: classified.status, assessedAt: currentEvidence?.testedAt, assessedBy: currentEvidence?.testedBy, evidenceReference: currentEvidence?.evidence, evidenceAgeDays: classified.ageDays, nextAction: nextAction(classified.status) });
    });
  });
  providerConnectors.filter((connector) => connector.active && connector.environment === 'production' && connector.conformanceStatus !== 'suspended').forEach((connector) => {
    const credentialState = providerCredentialLifecycle(connector, `${asOfDate}T23:59:59.999Z`);
    connector.capabilities.forEach((capability: ProviderCapability) => {
      if (credentialState !== 'configured') {
        rows.push({ source: 'provider', ownerId: connector.id, ownerCode: connector.code, ownerName: connector.name, environment: connector.environment, capability, status: 'missing', nextAction: credentialState === 'expired' ? 'Reseal expired provider credentials before replaying evidence.' : credentialState === 'revoked' ? 'Reseal revoked provider credentials before replaying evidence.' : 'Configure protected provider credentials before replaying evidence.' });
        return;
      }
      const matches = providerCases.filter((item) => item.connectorId === connector.id && validProviderCase(item, connector) && (item.capability === capability || (connector.capabilities.length === 1 && !item.capability)));
      const evidence = latest(matches);
      const classified = classifyEvidence({ assessedAt: evidence?.assessedAt, asOfDate, maxEvidenceAgeDays, renewalWarningDays });
      rows.push({ source: 'provider', ownerId: connector.id, ownerCode: connector.code, ownerName: connector.name, environment: connector.environment, capability, status: classified.status, assessedAt: evidence?.assessedAt, assessedBy: evidence?.assessedBy, evidenceReference: evidence?.evidenceReference, evidenceAgeDays: classified.ageDays, nextAction: nextAction(classified.status) });
    });
  });
  const weight: Record<RetailCertificationEvidenceStatus, number> = { missing: 4, expired: 3, 'renewal-due': 2, current: 1 };
  rows.sort((left, right) => weight[right.status] - weight[left.status] || left.ownerCode.localeCompare(right.ownerCode) || left.capability.localeCompare(right.capability));
  const currentCount = rows.filter((row) => row.status === 'current').length;
  const renewalDueCount = rows.filter((row) => row.status === 'renewal-due').length;
  const expiredCount = rows.filter((row) => row.status === 'expired').length;
  const missingCount = rows.filter((row) => row.status === 'missing').length;
  return { asOfDate, maxEvidenceAgeDays, renewalWarningDays, totalCount: rows.length, currentCount, renewalDueCount, expiredCount, missingCount, hardGateCount: expiredCount + missingCount, actionRequired: renewalDueCount + expiredCount + missingCount > 0, rows };
}
