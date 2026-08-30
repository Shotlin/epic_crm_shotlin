import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OperationalHealthSnapshot } from '../shared/kernel-contracts';
import type { RetailWorkspaceStatus, SystemInfo } from '../shared/contracts';
import { RetailSetupReadinessOverviewPanel } from './RetailSetupReadinessOverviewPanel';

afterEach(() => cleanup());

const status = { label: 'Bakaloo retail', status: 'configured', mode: 'clean', dataStatus: 'empty', description: 'Local retail workspace', sourceSystem: null, evidenceReference: null, externalWritePolicy: 'blocked', requiresReconciliation: false, nextAction: 'Configure external providers only after review.', updatedAt: '2026-08-30T00:00:00.000Z' } satisfies RetailWorkspaceStatus;
const systemInfo = { productName: 'Epic BOS', version: '0.1.0', platform: 'win32', dataMode: 'local-first' } satisfies SystemInfo;
const health = { status: 'healthy', databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 4, pendingOutboxEvents: 0, failedOutboxEvents: 0, recentAuditEvents: 3, checkedAt: '2026-08-30T00:00:00.000Z' } as OperationalHealthSnapshot;

describe('RetailSetupReadinessOverviewPanel', () => {
  it('keeps integrations explicit about missing provider truth', () => {
    render(<RetailSetupReadinessOverviewPanel mode="integrations" workspaceStatus={status} systemInfo={systemInfo} health={health} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Connect only what you can verify.' })).toBeTruthy();
    expect(screen.getByText(/provider credentials.*remain external/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /connect provider|send webhook|enable sync/i })).toBeNull();
  });

  it('keeps recovery explicit about drill evidence', () => {
    render(<RetailSetupReadinessOverviewPanel mode="recovery" workspaceStatus={status} systemInfo={systemInfo} health={health} onOpenAdvanced={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Recover the store before you need to.' })).toBeTruthy();
    expect(screen.getByText(/local health check cannot substitute for a tested, recorded recovery/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /restore now|delete backup/i })).toBeNull();
  });
});
