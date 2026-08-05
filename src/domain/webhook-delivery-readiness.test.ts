import { describe, expect, it } from 'vitest';
import { buildWebhookDeliveryReadiness } from './webhook-delivery-readiness';
import type { OperationalHealthSnapshot, OutboxReplayPlan } from '../shared/kernel-contracts';

const healthy: OperationalHealthSnapshot = { checkedAt: '2026-07-18T00:00:00.000Z', status: 'healthy', databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 9, pendingOutboxEvents: 0, failedOutboxEvents: 0, recentAuditEvents: 4 };
const plan: OutboxReplayPlan = { generatedAt: healthy.checkedAt, checkpointRevision: 3, signature: 'sig', items: [{ id: 'event-1', type: 'webhook.publish', aggregateType: 'webhook', aggregateId: 'hook-1', occurredAt: healthy.checkedAt, attempts: 2, classification: 'retryable', reason: 'Previous delivery failed; deterministic retry is allowed.' }, { id: 'event-2', type: 'webhook.publish', aggregateType: 'webhook', aggregateId: 'hook-2', occurredAt: healthy.checkedAt, attempts: 1, classification: 'conflict', reason: 'Aggregate ordering conflict.' }] };

describe('webhook delivery readiness', () => {
  it('blocks failed and conflicting event delivery until replay or resolution', () => {
    const readiness = buildWebhookDeliveryReadiness({ ...healthy, pendingOutboxEvents: 2, failedOutboxEvents: 1 }, plan);
    expect(readiness).toMatchObject({ status: 'blocked', pending: 2, failed: 1, retryable: 1, conflicts: 1, nextAction: 'resolve-conflicts' });
    expect(readiness.blockers).toHaveLength(2);
  });

  it('reports a clean boundary when integrity and outbox evidence are clear', () => {
    expect(buildWebhookDeliveryReadiness(healthy)).toMatchObject({ status: 'ready', nextAction: 'monitor' });
  });

  it('fails closed when health evidence is missing', () => {
    expect(buildWebhookDeliveryReadiness(null)).toMatchObject({ status: 'blocked', nextAction: 'restore-health' });
  });
});
