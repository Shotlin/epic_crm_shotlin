import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RetailWorkspaceModeProjection } from '../domain/retail-workspace-mode';
import { RetailWorkspaceStatusBadge } from './RetailWorkspaceStatusBadge';

afterEach(() => cleanup());

function projection(
  overrides: Partial<RetailWorkspaceModeProjection> = {},
): RetailWorkspaceModeProjection {
  return {
    status: 'configured',
    mode: 'clean',
    dataStatus: 'sample',
    label: 'Legacy sample isolated',
    description: 'Historical sample records are isolated from live sources and cannot be published externally.',
    sourceSystem: null,
    evidenceReference: null,
    externalWritePolicy: 'blocked',
    requiresReconciliation: false,
    nextAction: 'Replace the legacy sample only through the verified workspace reset or start a governed import.',
    updatedAt: '2026-08-03T10:00:00.000Z',
    ...overrides,
  };
}

describe('RetailWorkspaceStatusBadge', () => {
  it('shows a legacy-cleanup workspace honestly without implying that live sync is healthy', () => {
    render(<RetailWorkspaceStatusBadge projection={projection()} />);

    const status = screen.getByRole('status', { name: 'Workspace status: Legacy cleanup' });
    expect(status.textContent).toContain('Legacy cleanup');
    expect(status.textContent).toContain('Legacy sample isolated');
    expect(status.textContent).toContain('Historical sample records are isolated from live sources');
    expect(status.textContent).toContain('Next: Replace the legacy sample only through the verified workspace reset');
    expect(status.textContent).toContain('External writes blocked');
    expect(status.textContent).not.toMatch(/sync (healthy|connected|successful)/i);
  });

  it('makes an imported workspace visibly review-only and identifies its recorded source', () => {
    render(
      <RetailWorkspaceStatusBadge
        projection={projection({
          mode: 'imported',
          dataStatus: 'shadow-imported',
          label: 'Imported - review required',
          description: 'Imported records remain read-only until counts, stock, money, and tax evidence reconcile.',
          sourceSystem: 'Bakaloo production',
          evidenceReference: 'BAKALOO-IMPORT-2026-08-03',
          requiresReconciliation: true,
          nextAction: 'Review the import and approve a reconciliation before cutover.',
        })}
      />,
    );

    const status = screen.getByRole('status', { name: 'Workspace status: Imported' });
    expect(status.textContent).toContain('Imported - review required');
    expect(status.textContent).toContain('Bakaloo production');
    expect(status.textContent).toContain('Reconciliation required');
    expect(status.textContent).toContain('Next: Review the import and approve a reconciliation before cutover.');
  });

  it.each([
    {
      dataStatus: 'empty' as const,
      label: 'Clean workspace',
      shortLabel: 'Clean',
      externalWritePolicy: 'blocked' as const,
    },
    {
      dataStatus: 'live' as const,
      label: 'Live workspace',
      shortLabel: 'Live',
      externalWritePolicy: 'governed' as const,
    },
  ])('labels a $shortLabel workspace without inventing a sync result', ({
    dataStatus,
    label,
    shortLabel,
    externalWritePolicy,
  }) => {
    render(
      <RetailWorkspaceStatusBadge
        projection={projection({
          mode: dataStatus === 'live' ? 'live' : 'clean',
          dataStatus,
          label,
          externalWritePolicy,
        })}
      />,
    );

    const status = screen.getByRole('status', { name: `Workspace status: ${shortLabel}` });
    expect(status.textContent).toContain(shortLabel);
    expect(status.textContent).not.toMatch(/sync (healthy|connected|successful)/i);
  });

  it('fails closed with a Needs review label when provenance has not been classified', () => {
    render(
      <RetailWorkspaceStatusBadge
        projection={projection({
          status: 'requires-classification',
          mode: null,
          dataStatus: 'unclassified',
          label: 'Workspace needs review',
          description: 'Existing records have no explicit provenance decision.',
          requiresReconciliation: true,
          nextAction: 'Classify the existing workspace before importing or connecting a live source.',
        })}
      />,
    );

    const status = screen.getByRole('status', { name: 'Workspace status: Needs review' });
    expect(status.textContent).toContain('Workspace needs review');
    expect(status.textContent).toContain('External writes blocked');
    expect(status.textContent).toContain('Needs review');
  });
});
