import { describe, expect, it } from 'vitest';
import type { RetailCommerceConnector } from '../shared/retail-commerce-contracts';
import { computeRetailChannelHealth } from './retail-channel-health';

const connector: RetailCommerceConnector = {
  id: 'connector-1', code: 'ONDC-SANDBOX', name: 'ONDC sandbox', channel: 'ondc', environment: 'sandbox', baseUrl: 'https://sandbox.example.test', capabilities: ['order-pull'], credentialStatus: 'configured', status: 'configured', createdBy: 'maker', createdAt: '2026-07-30T09:00:00.000Z', version: 2,
};

describe('retail channel health', () => {
  it('surfaces connector, sync, duplicate-order, return and settlement evidence gaps deterministically', () => {
    const report = computeRetailChannelHealth({
      connectors: [connector],
      syncRuns: [{ id: 'sync-1', number: 'RSYNC-1', connectorId: 'connector-1', kind: 'orders', status: 'completed-with-exceptions', requestChecksum: 'a'.repeat(64), recordsRead: 3, recordsAccepted: 2, recordsRejected: 1, requestedBy: 'maker', requestedAt: '2026-07-30T10:00:00.000Z', completedAt: '2026-07-30T10:01:00.000Z', version: 1 }],
      orders: [
        { id: 'order-1', connectorId: 'connector-1', remoteOrderId: 'REMOTE-1', orderNumber: 'ONDC-1', status: 'returned', lines: [], totalAmount: 118, remoteCreatedAt: '2026-07-30T08:00:00.000Z', remotePayloadChecksum: 'b'.repeat(64), importedBy: 'maker', importedAt: '2026-07-30T10:02:00.000Z', version: 1 },
        { id: 'order-2', connectorId: 'connector-1', remoteOrderId: 'REMOTE-1', orderNumber: 'ONDC-1-DUP', status: 'imported', lines: [], totalAmount: 118, remoteCreatedAt: '2026-07-30T08:00:00.000Z', remotePayloadChecksum: 'c'.repeat(64), importedBy: 'maker', importedAt: '2026-07-30T10:03:00.000Z', version: 1 },
      ],
      settlements: [{ id: 'settlement-1', number: 'RSET-1', connectorId: 'connector-1', settlementReference: 'SET-1', periodFrom: '2026-07-01', periodTo: '2026-07-30', grossAmount: 1000, feeAmount: 50, taxWithheldAmount: 10, netAmount: 940, localNetAmount: 900, varianceAmount: 40, orderIds: [], remotePayloadChecksum: 'd'.repeat(64), status: 'variance-review', requestedBy: 'maker', requestedAt: '2026-07-30T10:04:00.000Z', version: 1 }],
      generatedAt: '2026-07-30T10:05:00.000Z',
    });
    expect(report).toMatchObject({ connectorCount: 1, certifiedConnectorCount: 0, syncRunCount: 1, orderCount: 2, settlementCount: 1, settlementVarianceTotal: 40, openConflictCount: 7 });
    expect(report.conflicts.map(({ kind }) => kind)).toEqual(['settlement-variance', 'duplicate-remote-order', 'duplicate-remote-order', 'return-evidence-gap', 'sync-exceptions', 'order-not-handed-off', 'connector-not-certified']);
    expect(report.conflicts.find(({ kind }) => kind === 'return-evidence-gap')?.suggestedAction).toContain('approved local return');
  });

  it('returns a clean report when certified channels have no unresolved evidence gaps', () => {
    const certified = { ...connector, status: 'certified' as const };
    const report = computeRetailChannelHealth({ connectors: [certified], syncRuns: [], orders: [], settlements: [], generatedAt: '2026-07-30T10:05:00.000Z' });
    expect(report).toMatchObject({ connectorCount: 1, certifiedConnectorCount: 1, openConflictCount: 0, settlementVarianceTotal: 0, conflicts: [] });
  });

  it('flags a repeated successful pull cursor before it can be treated as a fresh page', () => {
    const report = computeRetailChannelHealth({
      connectors: [{ ...connector, status: 'certified' }],
      syncRuns: [
        { id: 'sync-cursor-1', number: 'RSYNC-1', connectorId: 'connector-1', kind: 'orders', status: 'completed', requestChecksum: 'a'.repeat(64), remoteCursor: 'cursor-42', recordsRead: 2, recordsAccepted: 2, recordsRejected: 0, requestedBy: 'maker', requestedAt: '2026-07-30T10:00:00.000Z', completedAt: '2026-07-30T10:01:00.000Z', version: 1 },
        { id: 'sync-cursor-2', number: 'RSYNC-2', connectorId: 'connector-1', kind: 'orders', status: 'completed', requestChecksum: 'b'.repeat(64), remoteCursor: 'cursor-42', recordsRead: 0, recordsAccepted: 0, recordsRejected: 0, requestedBy: 'maker', requestedAt: '2026-07-30T11:00:00.000Z', completedAt: '2026-07-30T11:01:00.000Z', version: 1 },
      ],
      orders: [],
      settlements: [],
    });
    expect(report.conflicts).toContainEqual(expect.objectContaining({ kind: 'sync-cursor-replay', sourceId: 'sync-cursor-2', severity: 'high' }));
  });

  it('surfaces provider terminal status divergence without changing local custody state', () => {
    const report = computeRetailChannelHealth({
      connectors: [{ ...connector, status: 'certified' }],
      syncRuns: [],
      orders: [{ id: 'order-status-1', connectorId: 'connector-1', remoteOrderId: 'REMOTE-STATUS-1', orderNumber: 'ONDC-STATUS-1', status: 'imported', remoteStatus: 'cancelled', remoteStatusUpdatedAt: '2026-07-30T12:00:00.000Z', remoteStatusEvidence: 'Provider cancellation cursor 101', lines: [], totalAmount: 118, remoteCreatedAt: '2026-07-30T08:00:00.000Z', remotePayloadChecksum: 'b'.repeat(64), remoteStatusChecksum: 'c'.repeat(64), importedBy: 'maker', importedAt: '2026-07-30T10:02:00.000Z', version: 2 }],
      settlements: [],
    });
    expect(report.conflicts).toContainEqual(expect.objectContaining({ kind: 'order-status-conflict', sourceId: 'order-status-1', severity: 'critical' }));
  });
});
