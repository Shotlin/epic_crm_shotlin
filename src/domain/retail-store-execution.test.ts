import { describe, expect, it } from 'vitest';
import type { RetailDeviceTransportEvidence, RetailDeviceTransportPreflightResult } from '../shared/retail-device-transport-contracts';
import type { RetailOfflineSaleQueueItem } from '../shared/retail-offline-sync-contracts';
import { computeRetailStoreExecutionReadiness } from './retail-reports';

const scope = { companyId: 'company-1', branchId: 'branch-1' };
const checksum = 'a'.repeat(64);

describe('retail store execution readiness', () => {
  it('joins offline queue recovery and physical-device evidence into plain next actions', () => {
    const offlineQueue: RetailOfflineSaleQueueItem[] = [
      { id: 'offline-queued', transactionKey: 'POS-QUEUED', input: { counterId: 'counter-1', cashierShiftId: 'shift-1', transactionKey: 'POS-QUEUED', saleAt: '2025-01-01T10:00:00.000Z', lines: [{ itemVariantId: 'variant-1', binId: 'bin-1', serialUnitIds: [], quantity: 1 }], discountPolicyIds: [], tenders: [{ method: 'cash', amount: 100, reference: 'CASH-1' }] }, payloadChecksum: checksum, status: 'queued', queuedBy: 'cashier-1', queuedAt: '2025-01-01T10:01:00.000Z', attempts: 0, scope, version: 1 },
      { id: 'offline-conflict', transactionKey: 'POS-CONFLICT', input: { counterId: 'counter-1', cashierShiftId: 'shift-1', transactionKey: 'POS-CONFLICT', saleAt: '2025-01-01T10:00:00.000Z', lines: [{ itemVariantId: 'variant-1', binId: 'bin-1', serialUnitIds: [], quantity: 1 }], discountPolicyIds: [], tenders: [{ method: 'cash', amount: 100, reference: 'CASH-2' }] }, payloadChecksum: checksum, status: 'conflict', queuedBy: 'cashier-2', queuedAt: '2025-01-01T10:01:00.000Z', attempts: 1, lastSyncMode: 'recovery', lastSyncEvidenceReference: 'POWER-FAIL-001', conflictReason: 'Stock evidence changed.', scope, version: 3 },
    ];
    const deviceEvidence: RetailDeviceTransportEvidence[] = [
      { id: 'device-prepared', kind: 'barcode-scanner', deviceCode: 'SCAN-1', connection: 'usb', command: 'scan', payloadChecksum: checksum, payloadByteLength: 10, status: 'prepared', requestedBy: 'cashier-1', requestedAt: '2025-01-01T10:00:00.000Z', scope, version: 1 },
      { id: 'device-ack', kind: 'escpos-printer', deviceCode: 'PRINTER-1', connection: 'network', command: 'print', payloadChecksum: checksum, payloadByteLength: 10, status: 'acknowledged', requestedBy: 'cashier-1', requestedAt: '2025-01-01T10:00:00.000Z', acknowledgedBy: 'checker-1', acknowledgedAt: '2025-01-01T10:01:00.000Z', responseReference: 'PRINT-ACK-1', responseChecksum: checksum, responseProtocol: 'escpos-status-v1', responseByteLength: 20, scope, version: 2 },
      { id: 'device-failed', kind: 'cash-drawer', deviceCode: 'DRAWER-1', connection: 'bluetooth', command: 'open-drawer', payloadChecksum: checksum, payloadByteLength: 10, status: 'failed', requestedBy: 'cashier-1', requestedAt: '2025-01-01T10:00:00.000Z', acknowledgedBy: 'checker-1', acknowledgedAt: '2025-01-01T10:01:00.000Z', responseReference: 'DRAWER-TIMEOUT-1', responseProtocol: 'cash-drawer-status-v1', failureReason: 'DRAWER-TIMEOUT-1', scope, version: 2 },
    ];
    const preflightEvidence: Array<RetailDeviceTransportPreflightResult & { id: string; actorId: string; recordedAt: string; scope: typeof scope; version: number }> = [
      { id: 'preflight-scale', kind: 'weighing-scale', connection: 'network', status: 'reachable', host: '10.0.0.5', port: 9100, responseReference: 'SCALE-PING-1', responseChecksum: checksum, responseByteLength: 12, elapsedMs: 15, actorId: 'checker-1', recordedAt: '2025-01-01T10:01:00.000Z', scope, version: 1 },
      { id: 'preflight-drawer', kind: 'cash-drawer', connection: 'bluetooth', status: 'failed', responseReference: 'DRAWER-PING-1', responseChecksum: checksum, responseByteLength: 0, elapsedMs: 100, errorMessage: 'Not reachable', actorId: 'checker-1', recordedAt: '2025-01-01T10:01:00.000Z', scope, version: 1 },
    ];
    const report = computeRetailStoreExecutionReadiness({ offlineQueue, deviceEvidence, preflightEvidence });
    expect(report).toMatchObject({
      offline: { queuedCount: 1, conflictCount: 1, recoveryAttemptCount: 1, actionRequired: true },
      device: { preparedCount: 1, acknowledgedCount: 1, failedCount: 1, actionRequired: true },
      actionRequired: true,
    });
    expect(report.deviceRows.find((row) => row.kind === 'barcode-scanner')).toMatchObject({ status: 'needs-acknowledgement', nextAction: 'Record independent device response evidence.' });
    expect(report.deviceRows.find((row) => row.kind === 'cash-drawer')).toMatchObject({ status: 'needs-recovery', nextAction: 'Review the failed command and prepare a controlled retry.' });
    expect(report.deviceRows.find((row) => row.kind === 'weighing-scale')).toMatchObject({ status: 'ready', nextAction: 'Ready for governed store operation.' });
    expect(report.nextActions).toEqual(expect.arrayContaining([
      'Synchronize the queued offline sale when connectivity is restored.',
      'Review offline conflicts with an independent supervisor.',
      'Record independent device response evidence for prepared commands.',
    ]));
  });
});
