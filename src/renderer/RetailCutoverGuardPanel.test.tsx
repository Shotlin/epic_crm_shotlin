import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RetailCutoverPlan, RetailHubCutoverAssessment } from '../shared/retail-cutover-contracts';
import { RetailCutoverGuardPanel } from './RetailCutoverGuardPanel';

afterEach(() => cleanup());

const scope = { companyId: 'company-northstar', branchId: 'branch-main' };

function cutoverPlan(phase: RetailCutoverPlan['phase'] = 'shadow'): RetailCutoverPlan {
  return {
    id: 'cutover-orders-2026-08-04',
    capability: 'orders',
    sourceSystem: 'bakaloo',
    targetSystem: 'epic-bos',
    scope,
    phase,
    version: 1,
    baselineChecksum: 'a'.repeat(64),
    reconciliation: { remoteRecordCount: 3, localRecordCount: 3, differenceCount: 0, remoteChecksum: 'b'.repeat(64), localChecksum: 'c'.repeat(64), reconciliationChecksum: 'd'.repeat(64), evidenceReference: 'HUB-RECON-1' },
    preparedBy: 'maker',
    preparedAt: '2026-08-04T08:00:00.000Z',
    transitions: [{ fromPhase: 'new', toPhase: 'shadow', decision: 'create', fromVersion: 0, toVersion: 1, actorId: 'maker', at: '2026-08-04T08:00:00.000Z' }],
  };
}

function assessment(overrides: Partial<RetailHubCutoverAssessment> = {}): RetailHubCutoverAssessment {
  return {
    source: 'bakaloo',
    scope: { tenantId: 'tenant-1', ...scope },
    capability: 'orders',
    status: 'ready-for-parallel-run',
    blockers: [],
    requiredEntities: ['order'],
    planId: 'hub-orders-001',
    planChecksum: 'a'.repeat(64),
    remoteRecordCount: 3,
    localRecordCount: 3,
    differenceCount: 0,
    remoteChecksum: 'a'.repeat(64),
    localChecksum: 'b'.repeat(64),
    reconciliationChecksum: 'c'.repeat(64),
    approvalDecisionId: 'decision-1',
    credentialRevision: 4,
    rollbackReference: 'rollback-1',
    writeBackAllowed: false,
    ...overrides,
  };
}

function renderPanel(options: {
  plans?: RetailCutoverPlan[];
  onCreate?: ReturnType<typeof vi.fn>;
  onCreateFromHubAssessment?: ReturnType<typeof vi.fn>;
  onFetchHubAssessment?: ReturnType<typeof vi.fn>;
  onAdvance?: ReturnType<typeof vi.fn>;
} = {}) {
  const onCreate = options.onCreate ?? vi.fn(async () => undefined);
  const onCreateFromHubAssessment = options.onCreateFromHubAssessment ?? vi.fn(async () => undefined);
  const onFetchHubAssessment = options.onFetchHubAssessment ?? vi.fn(async () => { throw new Error('not used'); });
  const onAdvance = options.onAdvance ?? vi.fn(async () => undefined);
  render(
    <RetailCutoverGuardPanel
      plans={options.plans ?? []}
      scope={scope}
      onRefresh={vi.fn(async () => undefined)}
      onCreate={onCreate}
      onCreateFromHubAssessment={onCreateFromHubAssessment}
      onFetchHubAssessment={onFetchHubAssessment}
      onAdvance={onAdvance}
    />,
  );
  return { onCreate, onCreateFromHubAssessment, onFetchHubAssessment, onAdvance };
}

async function fetchReadyAssessment(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /open verified hub assessment/i }));
  await user.type(screen.getByLabelText('Approved Hub HTTPS URL'), 'https://hub.example.in');
  await user.type(screen.getByLabelText('Batch ID'), 'batch-1');
  await user.click(screen.getByRole('button', { name: /fetch verified assessment/i }));
}

describe('RetailCutoverGuardPanel', () => {
  it('does not expose a manual cutover-plan form to an operator', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderPanel();

    await user.click(screen.getByRole('button', { name: /open verified hub assessment/i }));

    expect(screen.getByText(/cannot create a plan from typed counts, checksums, or a locally imported json file/i)).toBeTruthy();
    expect(screen.queryByLabelText('Baseline checksum')).toBeNull();
    expect(screen.queryByLabelText('Remote checksum')).toBeNull();
    expect(screen.queryByLabelText('Local checksum')).toBeNull();
    expect(screen.queryByLabelText('Reconciliation checksum')).toBeNull();
    expect(screen.queryByLabelText(/choose assessment json/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /register shadow plan/i })).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('registers only a ready assessment returned through the Hub transport', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    const onCreateFromHubAssessment = vi.fn(async () => undefined);
    const onFetchHubAssessment = vi.fn(async () => assessment());
    renderPanel({ onCreate, onCreateFromHubAssessment, onFetchHubAssessment });

    await fetchReadyAssessment(user);

    await waitFor(() => expect(onFetchHubAssessment).toHaveBeenCalledWith({ baseUrl: 'https://hub.example.in', batchId: 'batch-1', capability: 'orders' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/system evidence: hub-assessment:\/\/hub-orders-001/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /register verified hub assessment/i }));
    await waitFor(() => expect(onCreateFromHubAssessment).toHaveBeenCalledWith(expect.objectContaining({ scope, evidenceReference: 'hub-assessment://hub-orders-001', assessment: expect.objectContaining({ planId: 'hub-orders-001' }) })));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('keeps a blocked Hub assessment visible but not registrable', async () => {
    const user = userEvent.setup();
    const onFetchHubAssessment = vi.fn(async () => assessment({ status: 'blocked', blockers: ['Credential generation is stale.'], planId: 'hub-orders-blocked', localRecordCount: 0, differenceCount: 1 }));
    renderPanel({ onFetchHubAssessment });

    await fetchReadyAssessment(user);

    expect(await screen.findByText(/credential generation is stale/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /register verified hub assessment/i })).toHaveProperty('disabled', true);
  });

  it('offers only the phase decision that matches the persisted plan phase', async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn(async () => undefined);
    renderPanel({ plans: [cutoverPlan()], onAdvance });

    await user.click(screen.getByRole('button', { name: /orders/i }));
    expect(screen.getByRole('button', { name: /start parallel run/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve independently/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /start parallel run/i }));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith(expect.objectContaining({ id: 'cutover-orders-2026-08-04', decision: 'start-parallel', expectedVersion: 1 })));
  });

  it('fails closed when the Hub response claims a write-back permission', async () => {
    const user = userEvent.setup();
    const onFetchHubAssessment = vi.fn(async () => ({ ...assessment(), writeBackAllowed: true }));
    renderPanel({ onFetchHubAssessment });

    await fetchReadyAssessment(user);

    expect((await screen.findByRole('alert')).textContent).toMatch(/read-only bakaloo assessments/i);
    expect(screen.queryByRole('button', { name: /register verified hub assessment/i })).toBeNull();
  });
});
