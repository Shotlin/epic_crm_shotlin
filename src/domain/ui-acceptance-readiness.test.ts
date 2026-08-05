import { describe, expect, it } from 'vitest';
import { UI_ACCEPTANCE_CATALOG, createUiAcceptanceScenarioFingerprint, evaluateUiAcceptanceReadiness } from './ui-acceptance-readiness';

const releaseIdentity = 'a'.repeat(64);

describe('UI acceptance readiness', () => {
  it('keeps a browser-safe SHA-256 revision fingerprint for the catalog scenario', () => {
    const scenario = UI_ACCEPTANCE_CATALOG.find((candidate) => candidate.id === 'retail-pos-open-shift')!;

    expect(createUiAcceptanceScenarioFingerprint(scenario)).toBe('4780b73884ddd97c55bbb6cc9be380cbec1f800796a68079e1693a45d4343be4');
  });

  it('keeps every role and screen journey visibly blocked until independently verified for the active release', () => {
    const result = evaluateUiAcceptanceReadiness({ releaseIdentitySha256: releaseIdentity, evidence: [] });

    expect(UI_ACCEPTANCE_CATALOG).toHaveLength(48);
    expect(new Set(UI_ACCEPTANCE_CATALOG.map((scenario) => scenario.persona))).toEqual(new Set(['cashier', 'store-manager', 'hq-finance', 'administrator']));
    expect(result).toMatchObject({ status: 'blocked', requiredCount: 48, verifiedPassedCount: 0 });
    expect(result.rows.find((row) => row.id === 'retail-pos-open-shift')).toMatchObject({ status: 'missing', nextAction: expect.stringMatching(/cashier/i) });
  });

  it('gives every journey a stable surface and a short, numbered click path', () => {
    expect(UI_ACCEPTANCE_CATALOG.every((scenario) => scenario.surfaceId.trim().length > 0)).toBe(true);
    expect(UI_ACCEPTANCE_CATALOG.every((scenario) => scenario.steps.length >= 3)).toBe(true);
    expect(UI_ACCEPTANCE_CATALOG.every((scenario) => scenario.route.kind.trim().length > 0)).toBe(true);
    expect(UI_ACCEPTANCE_CATALOG.find((scenario) => scenario.id === 'retail-pos-cash-checkout')?.route).toEqual({ kind: 'bharat', workspace: 'sales', tab: 'commerce' });
    expect(UI_ACCEPTANCE_CATALOG.find((scenario) => scenario.id === 'crm-pipeline')?.route).toEqual({ kind: 'crm', tab: 'pipeline' });
    expect(UI_ACCEPTANCE_CATALOG.find((scenario) => scenario.id === 'release-artifact')?.route).toEqual({ kind: 'command', surface: 'control', controlTab: 'release' });
    expect(new Set(UI_ACCEPTANCE_CATALOG.map((scenario) => scenario.surfaceId)).size).toBeGreaterThan(0);
    expect(UI_ACCEPTANCE_CATALOG[0]?.steps[0]).toMatchObject({ order: 1 });
  });

  it('accepts only verified, passed evidence tied to both the current release and the exact scenario revision', () => {
    const scenario = UI_ACCEPTANCE_CATALOG.find((candidate) => candidate.id === 'retail-pos-open-shift')!;
    const validEvidence = {
      id: 'uat-1',
      scenarioId: scenario.id,
      scenarioFingerprint: createUiAcceptanceScenarioFingerprint(scenario),
      releaseIdentitySha256: releaseIdentity,
      result: 'passed' as const,
      evidenceReference: 'UAT-POS-OPEN-001',
      submittedBy: 'cashier-1',
      submittedAt: '2026-08-02T10:00:00.000Z',
      status: 'verified' as const,
      verifiedBy: 'manager-1',
      verifiedAt: '2026-08-02T10:05:00.000Z',
      version: 2,
    };

    const current = evaluateUiAcceptanceReadiness({ releaseIdentitySha256: releaseIdentity, evidence: [validEvidence] });
    expect(current.rows.find((row) => row.id === scenario.id)).toMatchObject({ status: 'verified', evidenceId: 'uat-1' });

    const rotatedRelease = evaluateUiAcceptanceReadiness({ releaseIdentitySha256: 'b'.repeat(64), evidence: [validEvidence] });
    expect(rotatedRelease.rows.find((row) => row.id === scenario.id)).toMatchObject({ status: 'stale', nextAction: expect.stringMatching(/active release/i) });

    const changedJourney = evaluateUiAcceptanceReadiness({ releaseIdentitySha256: releaseIdentity, evidence: [{ ...validEvidence, scenarioFingerprint: 'c'.repeat(64) }] });
    expect(changedJourney.rows.find((row) => row.id === scenario.id)).toMatchObject({ status: 'stale', nextAction: expect.stringMatching(/current journey/i) });
  });
});
