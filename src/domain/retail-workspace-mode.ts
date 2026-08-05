/**
 * Workspace mode is intentionally a small, renderer-safe projection.  It
 * describes the provenance of the workspace without exposing credentials,
 * provider payloads, or any customer data.
 */
export type RetailWorkspaceMode = 'clean' | 'imported' | 'live';

export type RetailWorkspaceModeStatus =
  | 'configured'
  | 'requires-classification';

export type RetailWorkspaceSeed = 'empty' | 'sample' | null;

export interface RetailWorkspaceModeState {
  schemaVersion: 1;
  revision: number;
  status: RetailWorkspaceModeStatus;
  mode: RetailWorkspaceMode | null;
  seed: RetailWorkspaceSeed;
  sourceSystem: string | null;
  evidenceReference: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface RetailWorkspaceModeProjection {
  status: RetailWorkspaceModeStatus;
  mode: RetailWorkspaceMode | null;
  dataStatus:
    | 'empty'
    | 'sample'
    | 'shadow-imported'
    | 'live'
    | 'unclassified';
  label: string;
  description: string;
  sourceSystem: string | null;
  evidenceReference: string | null;
  externalWritePolicy: 'blocked' | 'governed';
  requiresReconciliation: boolean;
  nextAction: string;
  updatedAt: string;
}

export interface TransitionRetailWorkspaceModeInput {
  mode: Exclude<RetailWorkspaceMode, 'clean'>;
  sourceSystem: string;
  evidenceReference: string;
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function requireTimestamp(value: string): string {
  return requireNonEmpty(value, 'Workspace mode timestamp');
}

/** Creates an explicit new-workspace decision; it never creates sample data. */
export function createCleanRetailWorkspaceModeState(
  updatedAt: string,
  seed: Exclude<RetailWorkspaceSeed, null> = 'empty',
  updatedBy = 'system:provisioner',
): RetailWorkspaceModeState {
  return {
    schemaVersion: 1,
    revision: 1,
    status: 'configured',
    mode: 'clean',
    seed,
    sourceSystem: null,
    evidenceReference: null,
    updatedAt: requireTimestamp(updatedAt),
    updatedBy: requireNonEmpty(updatedBy, 'Workspace mode actor'),
  };
}

/**
 * Legacy data without an explicit provenance decision must be classified by
 * an operator.  Treating it as clean would make a later workflow unsafe.
 */
export function createUnclassifiedRetailWorkspaceModeState(
  updatedAt: string,
): RetailWorkspaceModeState {
  return {
    schemaVersion: 1,
    revision: 1,
    status: 'requires-classification',
    mode: null,
    seed: null,
    sourceSystem: null,
    evidenceReference: null,
    updatedAt: requireTimestamp(updatedAt),
    updatedBy: 'system:provenance-guard',
  };
}

export function isRetailWorkspaceModeState(
  value: unknown,
): value is RetailWorkspaceModeState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RetailWorkspaceModeState>;
  const modeIsValid =
    candidate.mode === null ||
    candidate.mode === 'clean' ||
    candidate.mode === 'imported' ||
    candidate.mode === 'live';
  const statusIsValid =
    candidate.status === 'configured' ||
    candidate.status === 'requires-classification';
  const seedIsValid =
    candidate.seed === null || candidate.seed === 'empty' || candidate.seed === 'sample';
  return (
    candidate.schemaVersion === 1 &&
    Number.isInteger(candidate.revision) &&
    (candidate.revision ?? 0) > 0 &&
    statusIsValid &&
    modeIsValid &&
    seedIsValid &&
    (typeof candidate.sourceSystem === 'string' || candidate.sourceSystem === null)
  ) && (
    typeof candidate.evidenceReference === 'string' ||
    candidate.evidenceReference === null
  ) && (
    typeof candidate.updatedAt === 'string' && Boolean(candidate.updatedAt.trim())
  ) && (
    typeof candidate.updatedBy === 'string' && Boolean(candidate.updatedBy.trim())
  );
}

export function transitionRetailWorkspaceMode(
  state: RetailWorkspaceModeState,
  input: TransitionRetailWorkspaceModeInput,
  actorId: string,
  updatedAt: string,
): RetailWorkspaceModeState {
  if (state.status !== 'configured' || state.mode === null) {
    throw new Error('An unclassified workspace must be explicitly classified before it can transition.');
  }
  const sourceSystem = requireNonEmpty(input.sourceSystem, 'Source system');
  const evidenceReference = requireNonEmpty(
    input.evidenceReference,
    'Workspace mode evidence reference',
  );
  const occurredAt = requireTimestamp(updatedAt);
  const updatedBy = requireNonEmpty(actorId, 'Workspace mode actor');

  if (input.mode === 'imported' && state.mode !== 'clean') {
    throw new Error('Only a clean workspace can begin a shadow import.');
  }
  if (input.mode === 'live' && state.mode !== 'imported') {
    throw new Error('A live workspace requires an imported workspace with reconciliation evidence.');
  }

  return {
    schemaVersion: 1,
    revision: state.revision + 1,
    status: 'configured',
    mode: input.mode,
    seed: null,
    sourceSystem,
    evidenceReference,
    updatedAt: occurredAt,
    updatedBy,
  };
}

export function projectRetailWorkspaceMode(
  state: RetailWorkspaceModeState,
): RetailWorkspaceModeProjection {
  if (state.status === 'requires-classification' || state.mode === null) {
    return {
      status: 'requires-classification',
      mode: null,
      dataStatus: 'unclassified',
      label: 'Workspace needs review',
      description:
        'Existing records have no explicit provenance decision, so automatic imports and external writes remain blocked.',
      sourceSystem: null,
      evidenceReference: null,
      externalWritePolicy: 'blocked',
      requiresReconciliation: true,
      nextAction: 'Classify the existing workspace before importing or connecting a live source.',
      updatedAt: state.updatedAt,
    };
  }

  if (state.mode === 'clean') {
    const isSample = state.seed === 'sample';
    return {
      status: 'configured',
      mode: 'clean',
      dataStatus: isSample ? 'sample' : 'empty',
      label: isSample ? 'Legacy sample isolated' : 'Clean workspace',
      description: isSample
        ? 'Historical sample records are isolated from live sources and cannot be published externally.'
        : 'No live business records or external source connection is active.',
      sourceSystem: null,
      evidenceReference: null,
      externalWritePolicy: 'blocked',
      requiresReconciliation: false,
      nextAction: isSample
        ? 'Replace the legacy sample only through the verified workspace reset or start a governed import.'
        : 'Start a read-only import when a verified Bakaloo source is ready.',
      updatedAt: state.updatedAt,
    };
  }

  if (state.mode === 'imported') {
    return {
      status: 'configured',
      mode: 'imported',
      dataStatus: 'shadow-imported',
      label: 'Imported - review required',
      description:
        'Imported records remain read-only until counts, stock, money, and tax evidence reconcile.',
      sourceSystem: state.sourceSystem,
      evidenceReference: state.evidenceReference,
      externalWritePolicy: 'blocked',
      requiresReconciliation: true,
      nextAction: 'Review the import and approve a reconciliation before cutover.',
      updatedAt: state.updatedAt,
    };
  }

  return {
    status: 'configured',
    mode: 'live',
    dataStatus: 'live',
    label: 'Live workspace',
    description:
      'Live operations require governed actions, audit evidence, and connector-specific controls.',
    sourceSystem: state.sourceSystem,
    evidenceReference: state.evidenceReference,
    externalWritePolicy: 'governed',
    requiresReconciliation: false,
    nextAction: 'Monitor sync health and reconcile any governed operational exceptions.',
    updatedAt: state.updatedAt,
  };
}
