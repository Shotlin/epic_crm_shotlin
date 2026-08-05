import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RetailSetupOverviewPanel } from './RetailSetupOverviewPanel';

describe('RetailSetupOverviewPanel', () => {
  it('explains a clean local workspace without inventing provider readiness', () => {
    render(<RetailSetupOverviewPanel
      workspaceStatus={{ status: 'configured', mode: 'clean', dataStatus: 'empty', label: 'Bakaloo retail workspace', description: 'Ready', sourceSystem: null, evidenceReference: null, externalWritePolicy: 'blocked', requiresReconciliation: false, nextAction: 'Choose a store setup path.', updatedAt: '2026-08-04T00:00:00.000Z' }}
      systemInfo={{ productName: 'Epic BOS', version: '0.1.3', platform: 'win32', dataMode: 'local-first' }}
      health={{ checkedAt: '2026-08-04T00:00:00.000Z', status: 'healthy', databaseIntegrity: true, auditChainValid: true, migrationsValid: true, appliedMigrations: 23, pendingOutboxEvents: 0, failedOutboxEvents: 0, recentAuditEvents: 0 }}
      onOpenAdvanced={vi.fn()}
    />);

    expect(screen.getByRole('heading', { name: 'Set up Epic BOS with confidence' })).toBeTruthy();
    expect(screen.getByText('Ready for your first setup')).toBeTruthy();
    expect(screen.getByText('External writes blocked')).toBeTruthy();
    expect(screen.getByText('No device profiles')).toBeTruthy();
    expect(screen.getByText(/Provider credentials, device drivers, and live imports are never implied/i)).toBeTruthy();
  });
});
