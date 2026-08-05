import type { RevenueOpsMetrics } from '../shared/revenue-ops-contracts';
import { browserChecksum } from '../shared/browser-checksum';

export type AnomalySeverity = 'critical' | 'high' | 'medium';
export type AnomalyComparator = 'gte' | 'lte';
export type AnomalyReviewStatus = 'open' | 'accepted' | 'dismissed' | 'snoozed';
export type AnomalyDestination = 'finance' | 'treasury' | 'sales' | 'warehouse' | 'procurement' | 'manufacturing' | 'people' | 'service' | 'projects' | 'statutory' | 'collections' | 'delivery';

export interface AnomalyPolicy {
  id: string;
  label: string;
  metric: keyof RevenueOpsMetrics;
  comparator: AnomalyComparator;
  threshold: number;
  severity: AnomalySeverity;
  destination: AnomalyDestination;
  ownerRole: string;
  recommendation: string;
  policyVersion: string;
}

export interface GovernedAnomaly {
  id: string;
  policyId: string;
  policyVersion: string;
  label: string;
  metric: keyof RevenueOpsMetrics;
  observedValue: number;
  comparator: AnomalyComparator;
  threshold: number;
  severity: AnomalySeverity;
  destination: AnomalyDestination;
  ownerRole: string;
  recommendation: string;
  evidenceReference: string;
  generatedAt: string;
  status: AnomalyReviewStatus;
  version: number;
  review?: AnomalyReview;
}

export interface AnomalyReview {
  decision: Exclude<AnomalyReviewStatus, 'open'>;
  reviewerId: string;
  reviewedAt: string;
  rationale: string;
}

export interface GovernedAnomalyQueue {
  generatedAt: string;
  policyVersion: string;
  anomalies: GovernedAnomaly[];
  checksum: string;
}

export interface AnomalyReviewInput {
  decision: Exclude<AnomalyReviewStatus, 'open'>;
  reviewerId?: string;
  reviewedAt: string;
  rationale: string;
  expectedVersion: number;
}

function canonicalQueuePayload(queue: Pick<GovernedAnomalyQueue, 'generatedAt' | 'policyVersion' | 'anomalies'>): string {
  return JSON.stringify({ generatedAt: queue.generatedAt, policyVersion: queue.policyVersion, anomalies: queue.anomalies });
}

function stableAnomalyId(policy: AnomalyPolicy, observedValue: number, generatedAt: string): string {
  return `${policy.id}-${browserChecksum(JSON.stringify({ policy: policy.id, policyVersion: policy.policyVersion, observedValue, generatedAt })).slice(0, 16)}`;
}

function breaches(policy: AnomalyPolicy, value: number): boolean {
  return policy.comparator === 'gte' ? value >= policy.threshold : value <= policy.threshold;
}

/**
 * Produces recommendations only. No anomaly can mutate a business record or
 * execute an AI-suggested action without an explicit human review transition.
 */
export function buildGovernedAnomalyQueue(
  metrics: Partial<RevenueOpsMetrics>,
  policies: AnomalyPolicy[],
  generatedAt = new Date().toISOString(),
): GovernedAnomalyQueue {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Anomaly queue timestamp is invalid.');
  const sortedPolicies = [...policies].sort((left, right) => left.id.localeCompare(right.id));
  const anomalies = sortedPolicies.flatMap((policy) => {
    const value = metrics[policy.metric];
    if (typeof value !== 'number' || !Number.isFinite(value) || !breaches(policy, value)) return [];
    return [{
      id: stableAnomalyId(policy, value, generatedAt),
      policyId: policy.id,
      policyVersion: policy.policyVersion,
      label: policy.label,
      metric: policy.metric,
      observedValue: value,
      comparator: policy.comparator,
      threshold: policy.threshold,
      severity: policy.severity,
      destination: policy.destination,
      ownerRole: policy.ownerRole,
      recommendation: policy.recommendation,
      evidenceReference: `metric:${String(policy.metric)}@${generatedAt}`,
      generatedAt,
      status: 'open' as const,
      version: 1,
    }];
  });
  const queue = { generatedAt, policyVersion: sortedPolicies.map((policy) => `${policy.id}@${policy.policyVersion}`).join('|'), anomalies };
  return { ...queue, checksum: browserChecksum(canonicalQueuePayload(queue)) };
}

export function verifyGovernedAnomalyQueueChecksum(queue: GovernedAnomalyQueue): boolean {
  const expected = browserChecksum(canonicalQueuePayload(queue));
  return queue.checksum === expected;
}

/** Applies an explicit human decision, with optimistic concurrency and maker/checker separation. */
export function reviewGovernedAnomaly(anomaly: GovernedAnomaly, input: AnomalyReviewInput): GovernedAnomaly {
  if (input.expectedVersion !== anomaly.version) throw new Error('Anomaly review is stale.');
  if (anomaly.status !== 'open') throw new Error('Only open anomalies can be reviewed.');
  if (!input.reviewerId?.trim() || input.reviewerId.trim().toLowerCase() === 'ai-agent') throw new Error('A human reviewer is required.');
  if (!input.rationale.trim()) throw new Error('Review rationale is required.');
  if (!Number.isFinite(Date.parse(input.reviewedAt))) throw new Error('Review timestamp is invalid.');
  return { ...anomaly, status: input.decision, version: anomaly.version + 1, review: { decision: input.decision, reviewerId: input.reviewerId.trim(), reviewedAt: input.reviewedAt, rationale: input.rationale.trim() } };
}
