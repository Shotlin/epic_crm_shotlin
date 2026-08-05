import type { OperationalHealthSnapshot, OutboxReplayPlan } from '../shared/kernel-contracts';

export type WebhookDeliveryStatus = 'ready' | 'degraded' | 'blocked';

export interface WebhookDeliveryReadiness {
  status: WebhookDeliveryStatus;
  pending: number;
  failed: number;
  retryable: number;
  conflicts: number;
  blockers: string[];
  nextAction: 'monitor' | 'replay-failures' | 'resolve-conflicts' | 'restore-health';
}

/** Fails closed when the signed-event delivery boundary has unresolved outbox evidence. */
export function buildWebhookDeliveryReadiness(health: OperationalHealthSnapshot | null, replayPlan?: OutboxReplayPlan): WebhookDeliveryReadiness {
  if (!health) return { status: 'blocked', pending: 0, failed: 0, retryable: 0, conflicts: 0, blockers: ['Operational health evidence is unavailable.'], nextAction: 'restore-health' };
  const pending = health.pendingOutboxEvents;
  const failed = health.failedOutboxEvents;
  const retryable = replayPlan?.items.filter(({ classification }) => classification === 'retryable').length ?? 0;
  const conflicts = replayPlan?.items.filter(({ classification }) => classification === 'conflict').length ?? 0;
  const blockers: string[] = [];
  if (!health.databaseIntegrity || !health.auditChainValid || !health.migrationsValid) blockers.push('Kernel integrity evidence is not healthy.');
  if (failed > 0) blockers.push(`${failed} failed event${failed === 1 ? '' : 's'} require deterministic replay.`);
  if (conflicts > 0) blockers.push(`${conflicts} outbox conflict${conflicts === 1 ? '' : 's'} require an accountable resolution.`);
  if (pending > 0 && !replayPlan) blockers.push(`${pending} pending event${pending === 1 ? '' : 's'} await a signed replay plan.`);
  const status: WebhookDeliveryStatus = blockers.some((blocker) => blocker.includes('integrity') || blocker.includes('failed') || blocker.includes('conflict')) ? 'blocked' : pending > 0 ? 'degraded' : 'ready';
  const nextAction: WebhookDeliveryReadiness['nextAction'] = !health.databaseIntegrity || !health.auditChainValid || !health.migrationsValid ? 'restore-health' : conflicts > 0 ? 'resolve-conflicts' : failed > 0 || retryable > 0 ? 'replay-failures' : 'monitor';
  return { status, pending, failed, retryable, conflicts, blockers, nextAction };
}
