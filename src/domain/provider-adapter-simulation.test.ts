/**
 * provider-adapter-simulation.test.ts
 *
 * Unit tests for provider adapter simulation and auto-conflict resolution engine.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveMappingConflicts,
  runProviderSimulation,
  type RemoteConflictItem,
} from './provider-adapter-simulation';

const mockConflicts: RemoteConflictItem[] = [
  {
    id: 'conf-1',
    providerId: 'ondc-seller-node-1',
    category: 'marketplace-ondc',
    remoteReference: 'ONDC-ORD-9988',
    conflictKind: 'sku-unmapped',
    remotePayloadSummary: 'Item SKU #AMZ-991 not found in local catalog',
    confidenceScore: 92,
    status: 'queued',
  },
  {
    id: 'conf-2',
    providerId: 'ondc-seller-node-1',
    category: 'marketplace-ondc',
    remoteReference: 'ONDC-ORD-9989',
    conflictKind: 'tax-rate-mismatch',
    remotePayloadSummary: 'Remote tax 12% vs local HSN 18%',
    confidenceScore: 65,
    status: 'queued',
  },
];

describe('provider-adapter-simulation domain', () => {
  it('auto-resolves high-confidence conflicts and escalates low-confidence ones', () => {
    const resolved = resolveMappingConflicts(mockConflicts, 85);

    expect(resolved[0]?.status).toBe('auto-resolved');
    expect(resolved[0]?.resolvedMapping).toContain('AUTO-SKU-MAP');

    expect(resolved[1]?.status).toBe('escalated-to-human');
    expect(resolved[1]?.resolutionNotes).toContain('Escalated to maker-checker queue');
  });

  it('runs provider simulation pass cleanly', () => {
    const report = runProviderSimulation(
      {
        providerId: 'ondc-seller-node-1',
        category: 'marketplace-ondc',
        latencyMs: 120,
        simulatedSuccessRatePct: 98.0,
        autoResolveConfidenceThreshold: 85,
      },
      mockConflicts,
    );

    expect(report.providerId).toBe('ondc-seller-node-1');
    expect(report.conflictsQueued).toBe(2);
    expect(report.conflictsAutoResolved).toBe(1);
    expect(report.conflictsEscalated).toBe(1);
    expect(report.autoResolutionSuccessRatePct).toBe(50);
  });
});
