import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetailSetupOverviewPanel } from './RetailSetupOverviewPanel';

describe('RetailSetupOverviewPanel', () => {
  afterEach(() => cleanup());

  it('explains a clean local workspace without inventing provider readiness', () => {
    render(<RetailSetupOverviewPanel
      workspaceStatus={{ status: 'configured', mode: 'clean', dataStatus: 'empty', label: 'Bakaloo retail workspace', description: 'Ready', sourceSystem: null, evidenceReference: null, externalWritePolicy: 'blocked', requiresReconciliation: false, nextAction: 'Choose a store setup path.', updatedAt: '2026-08-04T00:00:00.000Z' }}
      systemInfo={{ productName: 'Epic BOS', version: '0.1.3', platform: 'win32', dataMode: 'local-first' }}
      health={{ checkedAt: '2026-08-04T00:00:00.000Z', status: 'healthy', databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 23, pendingOutboxEvents: 0, failedOutboxEvents: 0, recentAuditEvents: 0 }}
      onOpenAdvanced={vi.fn()}
    />);

    expect(screen.getByRole('heading', { name: 'Configure once. Operate safely every day.' })).toBeTruthy();
    expect(screen.getAllByText('Ready for your first setup')[0]).toBeTruthy();
    expect(screen.getByText('Blocked')).toBeTruthy();
    expect(screen.getByText('No device profiles')).toBeTruthy();
    expect(screen.getByText(/Provider credentials, device drivers, recovery drills, and live imports are never implied/i)).toBeTruthy();
  });

  it('sends each setup task to its governed destination instead of a generic admin screen', () => {
    const onOpenDestination = vi.fn();
    render(<RetailSetupOverviewPanel
      workspaceStatus={{ status: 'configured', mode: 'clean', dataStatus: 'empty', label: 'Bakaloo retail workspace', description: 'Ready', sourceSystem: null, evidenceReference: null, externalWritePolicy: 'blocked', requiresReconciliation: false, nextAction: 'Choose a store setup path.', updatedAt: '2026-08-04T00:00:00.000Z' }}
      systemInfo={null}
      health={null}
      onOpenDestination={onOpenDestination}
    />);

    fireEvent.click(screen.getAllByRole('button', { name: /printer, scanner & scale/i })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /access & approvals/i })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /data & backup/i })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: /^release/i })[0]!);

    expect(onOpenDestination).toHaveBeenNthCalledWith(1, 'devices');
    expect(onOpenDestination).toHaveBeenNthCalledWith(2, 'access');
    expect(onOpenDestination).toHaveBeenNthCalledWith(3, 'storage');
    expect(onOpenDestination).toHaveBeenNthCalledWith(4, 'release');
  });
});
