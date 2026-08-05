import { describe, expect, it } from 'vitest';
import { buildRetailProviderReadiness } from './retail-provider-readiness';
import { createInitialRevenueOpsState } from './revenue-ops';

describe('retail provider and device readiness', () => {
  it('keeps unconfigured external rails and devices visibly blocked', () => {
    const report = buildRetailProviderReadiness(createInitialRevenueOpsState());
    expect(report.find(({ kind }) => kind === 'upi')).toMatchObject({ status: 'blocked' });
    expect(report.find(({ kind }) => kind === 'card')).toMatchObject({ status: 'blocked' });
    expect(report.find(({ kind }) => kind === 'printer')).toMatchObject({ status: 'blocked' });
    expect(report.find(({ kind }) => kind === 'scale')).toMatchObject({ status: 'blocked' });
  });

  it('requires production credentials and passed provider evidence before UPI/card rails are ready', () => {
    const state = createInitialRevenueOpsState();
    state.providerConnectors = [{
      id: 'bank-prod', code: 'BANK-PROD', name: 'Bank rail', providerLegalName: 'Certified Bank', domain: 'banking', environment: 'production',
      baseUrl: 'https://bank.example.in', statusPathTemplate: '/payments/{id}', capabilities: ['payment-status-pull', 'statement-pull'],
      specificationVersion: 'v1', credentialStatus: 'configured', conformanceStatus: 'production-approved', active: true,
      createdBy: 'admin', createdAt: '2026-07-31T08:00:00.000Z', scope: structuredClone(state.scope), version: 2,
    }];
    let report = buildRetailProviderReadiness(state);
    expect(report.find(({ kind }) => kind === 'upi')).toMatchObject({ status: 'external' });
    state.providerConformanceCases = [{
      id: 'case-bank', connectorId: 'bank-prod', suiteName: 'Retail payment rails', suiteVersion: '1.0', scenario: 'Statement and payment status pull',
      environment: 'production', result: 'passed', evidenceReference: 'BANK-SANDBOX-PROD-001', resultChecksum: 'a'.repeat(64),
      preparedBy: 'maker', preparedAt: '2026-07-31T08:10:00.000Z', assessedBy: 'checker', assessedAt: '2026-07-31T08:20:00.000Z', scope: structuredClone(state.scope), version: 2,
    }];
    report = buildRetailProviderReadiness(state);
    expect(report.find(({ kind }) => kind === 'upi')).toMatchObject({ status: 'ready', evidenceReferences: ['BANK-SANDBOX-PROD-001'] });
    expect(report.find(({ kind }) => kind === 'card')).toMatchObject({ status: 'ready' });
  });

  it('distinguishes a certified printer with pending dispatch acknowledgement from a ready device', () => {
    const state = createInitialRevenueOpsState();
    state.retailPrinterAdapters = [{ id: 'printer-1', code: 'PRINTER-1', name: 'Thermal', connection: 'usb', status: 'certified', supportedTemplates: ['barcode'], lastTestEvidence: 'ESC/POS-TEST-01', scope: structuredClone(state.scope), version: 2 }];
    state.retailLabelPrintDispatches = [{ id: 'dispatch-1', labelPrintRunId: 'run-1', printerAdapterId: 'printer-1', status: 'prepared', payloadChecksum: 'b'.repeat(64), requestedBy: 'maker', requestedAt: '2026-07-31T08:00:00.000Z', scope: structuredClone(state.scope), version: 1 }];
    let printer = buildRetailProviderReadiness(state).find(({ kind }) => kind === 'printer')!;
    expect(printer).toMatchObject({ status: 'external', blockers: ['A prepared label payload still needs independent device acknowledgement.'] });
    state.retailLabelPrintDispatches[0] = { ...state.retailLabelPrintDispatches[0]!, status: 'acknowledged', acknowledgedBy: 'checker', acknowledgedAt: '2026-07-31T08:05:00.000Z' };
    printer = buildRetailProviderReadiness(state).find(({ kind }) => kind === 'printer')!;
    expect(printer).toMatchObject({ status: 'ready' });
  });
});
