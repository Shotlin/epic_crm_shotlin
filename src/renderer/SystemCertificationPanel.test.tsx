import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RetailCertificationFreshnessReport } from '../domain/retail-certification-freshness';
import type { RetailProductionExitGateReport, RetailRolloutReadinessReport } from '../domain/retail-reports';
import { SystemCertificationPanel } from './SystemCertificationPanel';

const exitGate: RetailProductionExitGateReport = {
  status: 'blocked',
  goNoGo: 'hold',
  readyCheckCount: 1,
  blockedCheckCount: 1,
  externalCertificationCheckCount: 1,
  actionRequired: true,
  nextActions: ['Clear the offline sales queue before rollout.', 'Complete real provider certification.'],
  checks: [
    { id: 'store-execution', label: 'Offline POS and store recovery', status: 'blocked', summary: 'Two offline sales need recovery.', nextAction: 'Clear the offline sales queue before rollout.' },
    { id: 'provider-devices', label: 'Payment rails and counter devices', status: 'external-certification', summary: 'One device needs provider evidence.', nextAction: 'Complete real provider certification.' },
  ],
};

const rolloutReadiness: RetailRolloutReadinessReport = {
  status: 'blocked',
  goNoGo: 'hold',
  actionRequired: true,
  readyCheckCount: 1,
  blockedCheckCount: 1,
  externalCertificationCheckCount: 1,
  nextActions: ['Clear the offline sales queue before rollout.', 'Complete real provider certification.'],
  checks: [
    { id: 'retail-exit-gate', label: 'Retail production exit gate', status: 'blocked', summary: '1/2 retail checks ready.', nextAction: 'Clear the offline sales queue before rollout.' },
    { id: 'database-recovery', label: 'Database, audit and migrations', status: 'ready', summary: 'Database recovery evidence is complete.', nextAction: 'Database recovery evidence is complete.' },
    { id: 'outbox-sync', label: 'Event outbox and synchronization', status: 'external-certification', summary: 'Provider evidence remains external.', nextAction: 'Complete real provider certification.' },
  ],
};

const certificationFreshness: RetailCertificationFreshnessReport = {
  asOfDate: '2026-08-02',
  maxEvidenceAgeDays: 90,
  renewalWarningDays: 60,
  totalCount: 2,
  currentCount: 1,
  renewalDueCount: 0,
  expiredCount: 0,
  missingCount: 1,
  hardGateCount: 1,
  actionRequired: true,
  rows: [
    { source: 'provider', ownerId: 'provider-1', ownerCode: 'UPI', ownerName: 'UPI rail', capability: 'payment-release', status: 'current', assessedAt: '2026-07-22T09:00:00.000Z', assessedBy: 'reviewer', evidenceReference: 'UPI-TEST-1', evidenceAgeDays: 11, nextAction: 'Evidence is current.' },
    { source: 'commerce', ownerId: 'ondc-1', ownerCode: 'ONDC', ownerName: 'ONDC sandbox', environment: 'production', capability: 'order-pull', status: 'missing', nextAction: 'Record an independently assessed, checksummed replay.' },
  ],
};

afterEach(() => cleanup());

describe('SystemCertificationPanel', () => {
  it('shows a plain, real go-live decision instead of fabricated readiness scores or drills', () => {
    render(<SystemCertificationPanel exitGate={exitGate} rolloutReadiness={rolloutReadiness} certificationFreshness={certificationFreshness} />);

    const panel = screen.getByTestId('system-certification-panel');
    expect(screen.getByRole('heading', { name: 'Go-live checklist' })).toBeTruthy();
    expect(panel.textContent).toContain('HOLD');
    expect(panel.textContent).toContain('1 local action');
    expect(panel.textContent).toContain('1 external approval');
    expect(panel.textContent).toContain('Clear the offline sales queue before rollout.');
    expect(panel.textContent).toContain('Current credential generation');
    expect(panel.textContent).not.toContain('100%');
    expect(panel.textContent).not.toContain('Run Full System Verification Drill');
  });

  it('copies the actual evidence pack through its one clear action', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(<SystemCertificationPanel exitGate={exitGate} rolloutReadiness={rolloutReadiness} certificationFreshness={certificationFreshness} onCopy={onCopy} />);

    await user.click(screen.getByRole('button', { name: 'Copy checklist' }));
    expect(onCopy).toHaveBeenCalledWith(expect.stringContaining('"goNoGo": "hold"'));
    expect((await screen.findByRole('status')).textContent).toContain('Checklist copied for the rollout review.');
  });
});
