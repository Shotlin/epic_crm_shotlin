import { describe, expect, it } from 'vitest';
import { computeRetailProductionExitGate } from './retail-reports';
import type { RetailMarketplaceProductionReadinessReport, RetailOndcProductionReadinessReport, RetailProviderDeviceReadinessReport, RetailReportDeliveryReadinessReport, RetailStoreExecutionReadinessReport } from './retail-reports';

const storeExecution = { offline: { queuedCount: 0, syncingCount: 0, conflictCount: 0, syncedCount: 1, discardedCount: 0, recoveryAttemptCount: 0, staleQueueCount: 0, journalGapCount: 0, recoveryEvidenceGapCount: 0, duplicateTransactionKeyCount: 0, actionRequired: false }, device: { preparedCount: 0, acknowledgedCount: 4, failedCount: 0, reachablePreflightCount: 0, failedPreflightCount: 0, actionRequired: false }, deviceRows: [], actionRequired: false, nextActions: [] } as RetailStoreExecutionReadinessReport;
const providerDevices = { total: 2, ready: 2, external: 0, blocked: 0, evidenceCount: 2, actionRequired: false, rows: [] } as RetailProviderDeviceReadinessReport;
const marketplace = { fromDate: '2026-08-01', toDate: '2026-08-01', connectorCount: 1, productionReadyCount: 1, conformanceReadyCount: 1, syncPendingCount: 0, syncFailureCount: 0, syncExceptionCount: 0, orderHandoffGapCount: 0, returnEvidenceGapCount: 0, settlementCount: 1, settlementReadyCount: 1, settlementVarianceExposure: 0, actionRequired: false, rows: [] } as RetailMarketplaceProductionReadinessReport;
const ondc = { fromDate: '2026-08-01', toDate: '2026-08-01', connectorCount: 1, productionReadyCount: 1, conformanceReadyCount: 1, externalCertificationGates: 0, pushAcknowledgedCount: 2, pushAcknowledgementGapCount: 0, syncEvidenceGapCount: 0, orderHandoffGapCount: 0, returnEvidenceGapCount: 0, settlementCount: 1, settlementReadyCount: 1, settlementEvidenceGapCount: 0, settlementVarianceExposure: 0, actionRequired: false, rows: [] } as RetailOndcProductionReadinessReport;
const scheduledDelivery = { fromDate: '2026-08-01', toDate: '2026-08-01', planCount: 1, approvedPlanCount: 1, draftPlanCount: 0, pausedPlanCount: 0, rejectedPlanCount: 0, recipientCount: 1, consentGapCount: 0, attemptCount: 1, preparedAttemptCount: 0, handedOffAttemptCount: 0, acknowledgedAttemptCount: 1, failedAttemptCount: 0, providerBoundPlanCount: 1, providerReadyPlanCount: 1, unboundPlanCount: 0, externalCertificationGates: 0, actionRequired: false, rows: [] } as RetailReportDeliveryReadinessReport;

describe('retail production exit gate', () => {
  it('gives a go only when every composed evidence surface is clear', () => {
    const report = computeRetailProductionExitGate({ storeExecution, providerDevices, marketplace, ondc, scheduledDelivery });
    expect(report).toMatchObject({ status: 'ready', goNoGo: 'go', readyCheckCount: 5, blockedCheckCount: 0, externalCertificationCheckCount: 0, actionRequired: false });
  });

  it('holds rollout and distinguishes local blockers from external certification', () => {
    const report = computeRetailProductionExitGate({
      storeExecution: { ...storeExecution, offline: { ...storeExecution.offline, conflictCount: 1, actionRequired: true }, actionRequired: true, nextActions: ['Review offline conflicts with an independent supervisor.'] },
      providerDevices: { ...providerDevices, external: 1, ready: 1, actionRequired: true },
      marketplace, ondc, scheduledDelivery,
    });
    expect(report).toMatchObject({ status: 'blocked', goNoGo: 'hold', blockedCheckCount: 1, externalCertificationCheckCount: 1, actionRequired: true });
    expect(report.nextActions).toEqual(expect.arrayContaining(['Review offline conflicts with an independent supervisor.', 'Complete provider or physical-device certification with real evidence.']));
  });
});
