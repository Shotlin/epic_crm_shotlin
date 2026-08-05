import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCleanRevenueOpsState, getRevenueOpsSnapshot } from '../domain/revenue-ops';
import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';
import type { ProviderSubmission } from '../shared/provider-contracts';
import { ProviderResponseEvidencePanel } from './ProviderResponseEvidencePanel';

const SNAPSHOT_TIME = '2026-07-21T12:00:00.000Z';

function cleanRevenue(): RevenueOpsSnapshot {
  return getRevenueOpsSnapshot(createCleanRevenueOpsState(), { opportunities: [], accounts: [], contacts: [], addresses: [], activeUserIds: [] }, SNAPSHOT_TIME);
}

afterEach(() => cleanup());

describe('ProviderResponseEvidencePanel', () => {
  it('requires real reference and checksum before recording an acknowledgement', async () => {
    const user = userEvent.setup();
    const base = cleanRevenue();
    const submission: ProviderSubmission = {
      id: 'submission-1', number: 'PCX/26-27/00001', connectorId: 'bank-1', domain: 'banking', capability: 'payment-release', sourceKind: 'payment-proposal', sourceIds: ['payment-1'], payloadChecksum: 'a'.repeat(64), status: 'handed-off', preparedBy: 'maker', preparedAt: SNAPSHOT_TIME, handedOffBy: 'releaser', handedOffAt: SNAPSHOT_TIME, requestReference: 'BANK-PACK-1', version: 2,
    };
    const onRecord = vi.fn().mockResolvedValue(undefined);
    render(<ProviderResponseEvidencePanel revenue={{ ...base, providerSubmissions: [submission] }} actorId="reviewer" busy={false} onRecord={onRecord} />);

    expect(screen.getByText('Awaiting external response')).toBeTruthy();
    const button = screen.getByRole('button', { name: /Record acknowledgement/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('External response reference'), 'BANK-ACK-1');
    await user.type(screen.getByLabelText('Response payload SHA-256'), 'b'.repeat(64));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'submission-1', externalReference: 'BANK-ACK-1', responseChecksum: 'b'.repeat(64) }));
  });

  it('records a provider failure with an error message and response checksum', async () => {
    const user = userEvent.setup();
    const base = cleanRevenue();
    const submission: ProviderSubmission = {
      id: 'submission-2', number: 'PCX/26-27/00002', connectorId: 'bank-1', domain: 'banking', capability: 'payment-release', sourceKind: 'payment-proposal', sourceIds: ['payment-2'], payloadChecksum: 'c'.repeat(64), status: 'handed-off', preparedBy: 'maker', preparedAt: SNAPSHOT_TIME, handedOffBy: 'releaser', handedOffAt: SNAPSHOT_TIME, requestReference: 'BANK-PACK-2', version: 2,
    };
    const onRecord = vi.fn().mockResolvedValue(undefined);
    render(<ProviderResponseEvidencePanel revenue={{ ...base, providerSubmissions: [submission] }} actorId="reviewer" busy={false} onRecord={onRecord} />);

    await user.selectOptions(screen.getByLabelText('Provider outcome'), 'failed');
    const button = screen.getByRole('button', { name: /Record provider failure/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Provider error message'), 'Beneficiary account rejected by bank rail');
    await user.type(screen.getByLabelText('Response payload SHA-256'), 'd'.repeat(64));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'submission-2', outcome: 'failed', errorMessage: 'Beneficiary account rejected by bank rail', responseChecksum: 'd'.repeat(64) }));
  });
});
