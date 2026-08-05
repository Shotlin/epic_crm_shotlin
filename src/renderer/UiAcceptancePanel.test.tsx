import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateUiAcceptanceReadiness, UI_ACCEPTANCE_CATALOG, type UiAcceptanceEvidence } from '../domain/ui-acceptance-readiness';
import { UiAcceptancePanel } from './UiAcceptancePanel';

afterEach(() => cleanup());

describe('UiAcceptancePanel', () => {
  it('uses plain-language journey choices and records real evidence without claiming untested screens are certified', async () => {
    const user = userEvent.setup();
    const onRecord = vi.fn().mockResolvedValue(undefined);
    const onOpenRoute = vi.fn();
    const readiness = evaluateUiAcceptanceReadiness({ releaseIdentitySha256: 'a'.repeat(64), evidence: [] });
    render(<UiAcceptancePanel readiness={readiness} evidence={[]} activeActorId="admin-1" busy={false} onRecord={onRecord} onOpenRoute={onOpenRoute} />);

    expect(screen.getByText('0 / 48 verified')).toBeTruthy();
    expect(screen.getByText(/No screen is called certified/i)).toBeTruthy();
    expect(screen.getByText(/Sign in as a cashier/i)).toBeTruthy();
    expect(screen.getByText(/Step 1/i)).toBeTruthy();
    expect(screen.getByText(/Open Counter & shift/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Open this workbench/i }));
    expect(onOpenRoute).toHaveBeenCalledWith({ kind: 'bharat', workspace: 'sales', tab: 'commerce' });
    await user.selectOptions(screen.getByLabelText('Acceptance journey'), 'retail-pos-open-shift');
    await user.type(screen.getByLabelText('Acceptance evidence reference'), 'UAT-POS-OPEN-001');
    await user.click(screen.getByRole('button', { name: 'Record this check' }));
    expect(onRecord).toHaveBeenCalledWith({ scenarioId: 'retail-pos-open-shift', result: 'passed', evidenceReference: 'UAT-POS-OPEN-001', notes: undefined });
  });

  it('shows independent review only to someone other than the tester', async () => {
    const scenario = UI_ACCEPTANCE_CATALOG[0]!;
    const evidence: UiAcceptanceEvidence[] = [{ id: 'uat-1', scenarioId: scenario.id, scenarioFingerprint: 'b'.repeat(64), releaseIdentitySha256: 'a'.repeat(64), result: 'passed', evidenceReference: 'UAT-POS-OPEN-001', submittedBy: 'cashier-1', submittedAt: '2026-08-02T10:00:00.000Z', status: 'submitted', version: 1 }];
    const readiness = evaluateUiAcceptanceReadiness({ releaseIdentitySha256: 'a'.repeat(64), evidence });
    const onDecide = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<UiAcceptancePanel readiness={readiness} evidence={evidence} activeActorId="cashier-1" busy={false} onDecide={onDecide} />);
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();

    rerender(<UiAcceptancePanel readiness={readiness} evidence={evidence} activeActorId="manager-1" busy={false} onDecide={onDecide} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Verify' }));
    expect(onDecide).toHaveBeenCalledWith({ id: 'uat-1', decision: 'verified' });
  });
});
