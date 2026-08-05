import { describe, expect, it } from 'vitest';
import { computeRetailCertificationFreshness } from './retail-certification-freshness';
import type { RetailCommerceConformanceCase, RetailCommerceConnector, RetailOcrProviderProfile } from '../shared/retail-commerce-contracts';
import type { ProviderConformanceCase, ProviderConnector } from '../shared/provider-contracts';

const checksum = 'a'.repeat(64);
const commerceConnector = (): RetailCommerceConnector => ({
  id: 'commerce-1', code: 'ONDC-PROD', name: 'ONDC seller', channel: 'ondc', environment: 'production', baseUrl: 'https://ondc.example', capabilities: ['order-pull', 'settlement-pull'], credentialStatus: 'configured', status: 'certified', createdBy: 'maker', createdAt: '2026-01-01T00:00:00.000Z', version: 1,
});
const commerceCase = (capability: 'order-pull' | 'settlement-pull', assessedAt = '2026-08-01T10:00:00.000Z'): RetailCommerceConformanceCase => ({
  id: `commerce-${capability}`, connectorId: 'commerce-1', capability, suiteName: 'ONDC production', suiteVersion: '1.0', scenario: `${capability} replay`, result: 'passed', evidenceReference: `ONDC-${capability}`, resultChecksum: checksum, preparedBy: 'maker', preparedAt: '2026-08-01T09:00:00.000Z', assessedBy: 'checker', assessedAt, version: 2,
});
const ocrProvider = (testedAt = '2026-08-01T10:00:00.000Z'): RetailOcrProviderProfile => ({
  id: 'ocr-1', code: 'OCR-INDIA', name: 'Invoice OCR', mode: 'api', baseUrl: 'https://ocr.example', status: 'certified', credentialStatus: 'configured', supportedDocumentKinds: ['supplier-invoice'], createdBy: 'maker', createdAt: '2026-01-01T00:00:00.000Z', testEvidenceByDocumentKind: { 'supplier-invoice': { evidence: 'OCR-REPLAY-1', testedAt, testedBy: 'checker', checksum } }, version: 2,
});
const providerConnector = (): ProviderConnector => ({
  id: 'bank-1', code: 'BANK-PROD', name: 'Banking adapter', providerLegalName: 'Bank Ltd', domain: 'banking', environment: 'production', baseUrl: 'https://bank.example.in', statusPathTemplate: '/v1/status/{reference}', capabilities: ['payment-release'], specificationVersion: '2026.08', credentialStatus: 'configured', conformanceStatus: 'production-approved', active: true, createdBy: 'maker', createdAt: '2026-01-01T00:00:00.000Z', version: 1,
});
const providerCase = (assessedAt = '2026-08-01T10:00:00.000Z'): ProviderConformanceCase => ({
  id: 'bank-payment-release', connectorId: 'bank-1', capability: 'payment-release', suiteName: 'Bank production', suiteVersion: '1.0', scenario: 'payment replay', environment: 'production', result: 'passed', evidenceReference: 'BANK-REPLAY-1', resultChecksum: checksum, preparedBy: 'maker', preparedAt: '2026-08-01T09:00:00.000Z', assessedBy: 'checker', assessedAt, version: 2,
});

describe('retail certification evidence freshness', () => {
  it('keeps independently assessed current evidence eligible across commerce, OCR, and banking', () => {
    const report = computeRetailCertificationFreshness({
      commerceConnectors: [commerceConnector()], commerceCases: [commerceCase('order-pull'), commerceCase('settlement-pull')], ocrProviders: [ocrProvider()], providerConnectors: [providerConnector()], providerCases: [providerCase()], asOfDate: '2026-08-02',
    });
    expect(report).toMatchObject({ totalCount: 4, currentCount: 4, renewalDueCount: 0, expiredCount: 0, missingCount: 0, hardGateCount: 0, actionRequired: false });
    expect(report.rows.every((row) => row.status === 'current')).toBe(true);
  });

  it('holds production when evidence is expired or a declared capability has no independently assessed replay', () => {
    const report = computeRetailCertificationFreshness({
      commerceConnectors: [commerceConnector()], commerceCases: [commerceCase('order-pull', '2026-04-01T10:00:00.000Z')], ocrProviders: [ocrProvider('2026-04-01T10:00:00.000Z')], providerConnectors: [providerConnector()], providerCases: [providerCase()], asOfDate: '2026-08-02',
    });
    expect(report).toMatchObject({ totalCount: 4, currentCount: 1, expiredCount: 2, missingCount: 1, hardGateCount: 3, actionRequired: true });
    expect(report.rows.find((row) => row.capability === 'settlement-pull')).toMatchObject({ status: 'missing', nextAction: 'Record an independently assessed, checksummed replay.' });
    expect(report.rows.find((row) => row.source === 'ocr')).toMatchObject({ status: 'expired', nextAction: 'Run and independently assess a fresh provider replay.' });
  });

  it('warns before expiry without treating still-valid evidence as an expired certification', () => {
    const report = computeRetailCertificationFreshness({
      commerceConnectors: [commerceConnector()], commerceCases: [commerceCase('order-pull', '2026-06-01T10:00:00.000Z'), commerceCase('settlement-pull', '2026-06-01T10:00:00.000Z')], ocrProviders: [ocrProvider('2026-06-01T10:00:00.000Z')], providerConnectors: [providerConnector()], providerCases: [providerCase('2026-06-01T10:00:00.000Z')], asOfDate: '2026-08-02',
    });
    expect(report).toMatchObject({ renewalDueCount: 4, expiredCount: 0, missingCount: 0, hardGateCount: 0, actionRequired: true });
    expect(report.rows.every((row) => row.status === 'renewal-due')).toBe(true);
  });
});
