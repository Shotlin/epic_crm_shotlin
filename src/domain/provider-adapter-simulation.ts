/**
 * provider-adapter-simulation.ts
 *
 * Phase R8 – Final Provider Adapter Simulation & Conflict Auto-Resolution Engine
 *
 * Provides deterministic simulation of third-party marketplace, payment, messaging,
 * and OCR provider adapters with automated mapping conflict resolution and replay validation.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ProviderCategory = 'payment-gateway' | 'marketplace-ondc' | 'ocr-engine' | 'messaging-dlt';

export interface RemoteConflictItem {
  id: string;
  providerId: string;
  category: ProviderCategory;
  remoteReference: string;
  localReference?: string;
  conflictKind: 'sku-unmapped' | 'price-mismatch' | 'tax-rate-mismatch' | 'duplicate-order' | 'payload-checksum-mismatch';
  remotePayloadSummary: string;
  confidenceScore: number; // 0-100
  status: 'queued' | 'auto-resolved' | 'escalated-to-human' | 'ignored';
  resolvedMapping?: string;
  resolutionNotes?: string;
}

export interface ProviderSimulationConfig {
  providerId: string;
  category: ProviderCategory;
  latencyMs: number;
  simulatedSuccessRatePct: number; // e.g. 98.5%
  autoResolveConfidenceThreshold: number; // e.g. 85%
}

export interface ProviderSimulationReport {
  providerId: string;
  category: ProviderCategory;
  totalEventsProcessed: number;
  successfulEvents: number;
  failedEvents: number;
  conflictsQueued: number;
  conflictsAutoResolved: number;
  conflictsEscalated: number;
  autoResolutionSuccessRatePct: number;
  processedConflicts: RemoteConflictItem[];
}

/**
 * Evaluates and attempts auto-resolution of queued remote mapping conflicts.
 */
export function resolveMappingConflicts(
  conflicts: RemoteConflictItem[],
  confidenceThreshold = 85,
): RemoteConflictItem[] {
  return conflicts.map((conflict) => {
    if (conflict.status !== 'queued') return conflict;

    if (conflict.confidenceScore >= confidenceThreshold) {
      let resolvedMapping = '';
      let notes = '';

      switch (conflict.conflictKind) {
        case 'sku-unmapped':
          resolvedMapping = `AUTO-SKU-MAP-${conflict.remoteReference}`;
          notes = `Auto-matched high-confidence (${conflict.confidenceScore}%) remote SKU to local master.`;
          break;
        case 'price-mismatch':
          resolvedMapping = `ACCEPT-REMOTE-PRICE`;
          notes = `Accepted promotion-adjusted remote price with ${conflict.confidenceScore}% confidence.`;
          break;
        case 'tax-rate-mismatch':
          resolvedMapping = `ALIGN-LOCAL-GST-HSN`;
          notes = `Aligned remote line item tax to verified local HSN master rate.`;
          break;
        case 'duplicate-order':
          resolvedMapping = `DEDUP-REPLAY-PRESERVED`;
          notes = `Idempotent request replayed original local order reference without duplicating.`;
          break;
        case 'payload-checksum-mismatch':
          resolvedMapping = `RE-FETCH-PAYLOAD`;
          notes = `Checksum mismatch triggered automated provider payload re-query.`;
          break;
      }

      return {
        ...conflict,
        status: 'auto-resolved',
        resolvedMapping,
        resolutionNotes: notes,
      };
    } else {
      return {
        ...conflict,
        status: 'escalated-to-human',
        resolutionNotes: `Confidence ${conflict.confidenceScore}% is below auto-resolution threshold (${confidenceThreshold}%). Escalated to maker-checker queue.`,
      };
    }
  });
}

/**
 * Runs a simulation pass over provider events and conflict queue.
 */
export function runProviderSimulation(
  config: ProviderSimulationConfig,
  incomingConflicts: RemoteConflictItem[],
): ProviderSimulationReport {
  const processedConflicts = resolveMappingConflicts(
    incomingConflicts.filter((c) => c.providerId === config.providerId),
    config.autoResolveConfidenceThreshold,
  );

  const totalEventsProcessed = incomingConflicts.length + 10;
  const failedEvents = Math.round(totalEventsProcessed * ((100 - config.simulatedSuccessRatePct) / 100));
  const successfulEvents = totalEventsProcessed - failedEvents;

  const conflictsQueued = processedConflicts.length;
  const conflictsAutoResolved = processedConflicts.filter((c) => c.status === 'auto-resolved').length;
  const conflictsEscalated = processedConflicts.filter((c) => c.status === 'escalated-to-human').length;

  const autoResolutionSuccessRatePct = conflictsQueued > 0
    ? round2((conflictsAutoResolved / conflictsQueued) * 100)
    : 100;

  return {
    providerId: config.providerId,
    category: config.category,
    totalEventsProcessed,
    successfulEvents,
    failedEvents,
    conflictsQueued,
    conflictsAutoResolved,
    conflictsEscalated,
    autoResolutionSuccessRatePct,
    processedConflicts,
  };
}
