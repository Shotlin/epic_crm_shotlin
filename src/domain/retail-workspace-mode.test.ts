import { describe, expect, it } from 'vitest';
import {
  createCleanRetailWorkspaceModeState,
  projectRetailWorkspaceMode,
  transitionRetailWorkspaceMode,
} from './retail-workspace-mode';

describe('retail workspace mode projection', () => {
  it('describes a clean workspace as local-only instead of presenting fictional business activity', () => {
    const projection = projectRetailWorkspaceMode(
      createCleanRetailWorkspaceModeState('2026-08-03T10:00:00.000Z'),
    );

    expect(projection).toMatchObject({
      status: 'configured',
      mode: 'clean',
      label: 'Clean workspace',
      externalWritePolicy: 'blocked',
      requiresReconciliation: false,
      nextAction: expect.stringMatching(/import/i),
    });
  });

  it('keeps a shadow import read-only until an evidenced cutover is recorded', () => {
    const clean = createCleanRetailWorkspaceModeState('2026-08-03T10:00:00.000Z');
    const imported = transitionRetailWorkspaceMode(
      clean,
      {
        mode: 'imported',
        sourceSystem: 'Bakaloo production',
        evidenceReference: 'BAKALOO-IMPORT-2026-08-03',
      },
      'user-operator',
      '2026-08-03T10:05:00.000Z',
    );

    expect(projectRetailWorkspaceMode(imported)).toMatchObject({
      mode: 'imported',
      label: 'Imported - review required',
      externalWritePolicy: 'blocked',
      requiresReconciliation: true,
      sourceSystem: 'Bakaloo production',
    });
    expect(() => transitionRetailWorkspaceMode(
      clean,
      {
        mode: 'live',
        sourceSystem: 'Bakaloo production',
        evidenceReference: 'CUTOVER-2026-08-03',
      },
      'user-approver',
      '2026-08-03T10:10:00.000Z',
    )).toThrow(/imported workspace/i);
  });
});
