import { describe, expect, it } from 'vitest';
import { computeRetailElectronicPayoutRailEvidence, type RetailTenderSettlementReconciliationReport } from './retail-reports';
import type { ProviderConformanceCase, ProviderConnector, ProviderReconciliationRun } from '../shared/provider-contracts';

const connector: ProviderConnector = {
  id: 'bank-prod', code: 'BANK-PROD', name: 'Certified Banking Rail', providerLegalName: 'Example Payments Pvt Ltd',
  domain: 'banking', environment: 'production', baseUrl: 'https://provider.invalid', statusPathTemplate: '/status/{id}',
  capabilities: ['statement-pull', 'payment-status-pull'], specificationVersion: '2026.1', credentialStatus: 'configured',
  conformanceStatus: 'production-approved', active: true, createdBy: 'maker', createdAt: '2026-08-01T00:00:00.000Z', version: 1,
};

const conformance = (capability: ProviderConformanceCase['capability'], id: string): ProviderConformanceCase => ({
  id, connectorId: connector.id, capability, paymentRail: 'upi', suiteName: 'Provider settlement suite', suiteVersion: '2026.1',
  scenario: 'Production statement and status pull', environment: 'production', result: 'passed', evidenceReference: 'evidence://provider/run-1',
  resultChecksum: 'a'.repeat(64), preparedBy: 'maker', preparedAt: '2026-08-01T00:00:00.000Z', assessedBy: 'checker', assessedAt: '2026-08-01T01:00:00.000Z', version: 2,
});

const tenderSettlement: RetailTenderSettlementReconciliationReport = {
  currency: 'INR', totalRecordedElectronicAmount: 100, totalBankMatchedElectronicAmount: 100, totalUnmatchedElectronicAmount: 0,
  rows: [
    { method: 'upi', receiptCount: 1, reconciledReceiptCount: 1, matchedLineCount: 1, recordedAmount: 100, bankMatchedAmount: 100, gapAmount: 0, status: 'ready', unmatchedReceiptNumbers: [], nextAction: 'Bank evidence reconciled for this tender.' },
    { method: 'card', receiptCount: 0, reconciledReceiptCount: 0, matchedLineCount: 0, recordedAmount: 0, bankMatchedAmount: 0, gapAmount: 0, status: 'not-applicable', unmatchedReceiptNumbers: [], nextAction: 'No electronic tender evidence in scope.' },
    { method: 'bank-transfer', receiptCount: 0, reconciledReceiptCount: 0, matchedLineCount: 0, recordedAmount: 0, bankMatchedAmount: 0, gapAmount: 0, status: 'not-applicable', unmatchedReceiptNumbers: [], nextAction: 'No electronic tender evidence in scope.' },
    { method: 'cash', receiptCount: 0, reconciledReceiptCount: 0, matchedLineCount: 0, recordedAmount: 0, bankMatchedAmount: 0, gapAmount: 0, status: 'not-applicable', unmatchedReceiptNumbers: [], nextAction: 'No electronic tender evidence in scope.' },
  ], actionRequired: false, nextActions: [],
};

describe('retail electronic payout rail evidence', () => {
  it('keeps a conformance-approved UPI provider gated until a settlement pull exists', () => {
    const report = computeRetailElectronicPayoutRailEvidence({ providers: [connector], conformanceCases: [conformance('statement-pull', 'case-1'), conformance('payment-status-pull', 'case-2')], submissions: [], reconciliationRuns: [], tenderSettlement });
    expect(report.rows.find((row) => row.rail === 'upi')).toMatchObject({ status: 'needs-settlement-run', conformanceEvidenceCount: 2, settlementRunCount: 0 });
    expect(report.rows.find((row) => row.rail === 'card')?.status).toBe('needs-provider-evidence');
  });

  it('marks the rail ready only after a matched provider reconciliation run', () => {
    const run: ProviderReconciliationRun = {
      id: 'run-1', number: 'PCR-1', connectorId: connector.id, submissionIds: ['submission-1'],
      items: [{ submissionId: 'submission-1', localStatus: 'acknowledged', remoteStatus: 'acknowledged', result: 'matched' }],
      status: 'completed', requestedBy: 'operator', requestedAt: '2026-08-01T02:00:00.000Z', completedAt: '2026-08-01T02:01:00.000Z', checksum: 'b'.repeat(64),
    };
    const report = computeRetailElectronicPayoutRailEvidence({ providers: [connector], conformanceCases: [conformance('statement-pull', 'case-1')], submissions: [], reconciliationRuns: [run], tenderSettlement });
    expect(report.rows.find((row) => row.rail === 'upi')).toMatchObject({ status: 'ready', settlementRunCount: 1, matchedSettlementItemCount: 1 });
  });
});
