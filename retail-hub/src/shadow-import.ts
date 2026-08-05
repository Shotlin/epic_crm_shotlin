import { createHash } from 'node:crypto';

/**
 * The fixed vocabulary makes a shadow import auditable before any source
 * system is granted a write path into Epic BOS.
 */
export const shadowImportEntities = [
  'shop',
  'staff',
  'catalog',
  'variant',
  'inventory',
  'customer',
  'address',
  'order',
  'order-line',
  'payment',
  'wallet-refund',
  'voucher',
  'rider',
  'delivery',
  'settlement',
  'campaign',
  'review',
  'storefront-content',
] as const;

export type ShadowImportEntity = (typeof shadowImportEntities)[number];
export type ShadowImportSource = 'bakaloo';

export interface ShadowImportCursorInput {
  value: string;
  observedAt: string;
}

export interface ShadowImportRecord {
  entity: ShadowImportEntity;
  externalId: string;
  /**
   * The existing Epic BOS identity is intentionally explicit. An omitted
   * identity is a review conflict, never an implicit create operation.
   */
  epicBosId?: string;
  payload: unknown;
}

export interface ShadowImportEvidenceForChecksum {
  batchId: string;
  source: ShadowImportSource;
  observedAt: string;
  cursor: ShadowImportCursorInput;
  declaredCounts: Partial<Record<ShadowImportEntity, number>>;
  records: readonly ShadowImportRecord[];
  /** Non-secret source credential generation used for this snapshot. */
  credentialRevision?: number;
}

export interface ShadowImportEvidence extends ShadowImportEvidenceForChecksum {
  /** SHA-256 evidence supplied by the read-only source export. */
  declaredChecksum: string;
}

export interface ImportBatch {
  id: string;
  source: ShadowImportSource;
  mode: 'shadow-read-only';
  writeBackAllowed: false;
  observedAt: string;
  credentialRevision?: number;
  status: 'ready-for-review' | 'blocked';
  integrity: {
    algorithm: 'sha256';
    declaredChecksum: string;
    computedChecksum: string;
    checksumVerified: boolean;
  };
}

export interface ExternalIdMap {
  batchId: string;
  source: ShadowImportSource;
  entity: ShadowImportEntity;
  externalId: string;
  epicBosId: string;
  recordChecksum: string;
  mappedAt: string;
}

export interface ImportCursor {
  batchId: string;
  source: ShadowImportSource;
  value: string;
  observedAt: string;
}

export type ShadowImportConflictKind =
  | 'checksum-mismatch'
  | 'count-variance'
  | 'duplicate-external-id'
  | 'unmapped-external-record';

export interface ShadowImportConflict {
  id: string;
  batchId: string;
  source: ShadowImportSource;
  kind: ShadowImportConflictKind;
  status: 'open';
  entity?: ShadowImportEntity;
  externalId?: string;
  declared?: number;
  observed?: number;
  message: string;
}

export interface ReconciliationEntityResult {
  entity: ShadowImportEntity;
  declared: number | null;
  observed: number;
  variance: number | null;
  status: 'matched' | 'needs-review';
}

export interface ReconciliationReport {
  batchId: string;
  source: ShadowImportSource;
  observedAt: string;
  status: 'reconciled' | 'needs-review' | 'blocked';
  entities: readonly ReconciliationEntityResult[];
}

export interface ShadowImportPlan {
  batch: ImportBatch;
  externalIdMaps: readonly ExternalIdMap[];
  cursors: readonly ImportCursor[];
  conflicts: readonly ShadowImportConflict[];
  reconciliation: ReconciliationReport;
}

/**
 * Computes the exact evidence checksum without performing I/O, authentication,
 * database work, or remote side effects.
 */
export function checksumShadowImportEvidence(
  evidence: ShadowImportEvidenceForChecksum,
): string {
  const canonicalEvidence = {
    batchId: evidence.batchId,
    source: evidence.source,
    observedAt: evidence.observedAt,
    cursor: evidence.cursor,
    declaredCounts: evidence.declaredCounts,
    records: evidence.records.map((record) => ({
      entity: record.entity,
      externalId: record.externalId,
      epicBosId: record.epicBosId ?? null,
      payload: record.payload,
    })),
    ...(evidence.credentialRevision === undefined ? {} : { credentialRevision: evidence.credentialRevision }),
  };
  return sha256(canonicalJson(canonicalEvidence));
}

/**
 * Builds immutable review evidence only. This function has no persistence,
 * no network transport, and no path to create or update business records.
 */
export function buildShadowImportPlan(evidence: ShadowImportEvidence): ShadowImportPlan {
  assertNonBlank('batchId', evidence.batchId);
  assertNonBlank('cursor.value', evidence.cursor.value);
  assertTimestamp('observedAt', evidence.observedAt);
  assertTimestamp('cursor.observedAt', evidence.cursor.observedAt);
  validateDeclaredCounts(evidence.declaredCounts);
  if (evidence.credentialRevision !== undefined && (!Number.isInteger(evidence.credentialRevision) || evidence.credentialRevision < 1)) throw new Error('Credential revision must be a positive integer.');

  const computedChecksum = checksumShadowImportEvidence(evidence);
  const checksumVerified = computedChecksum === evidence.declaredChecksum;
  const conflicts: ShadowImportConflict[] = [];
  const externalIdMaps: ExternalIdMap[] = [];
  const seenChecksums = new Map<string, string>();
  const observedCounts = new Map<ShadowImportEntity, number>();

  for (const record of evidence.records) {
    validateRecord(record);
    observedCounts.set(record.entity, (observedCounts.get(record.entity) ?? 0) + 1);

    const recordChecksum = sha256(canonicalJson({
      entity: record.entity,
      externalId: record.externalId,
      epicBosId: record.epicBosId ?? null,
      payload: record.payload,
    }));
    const sourceIdentity = `${record.entity}:${record.externalId}`;
    const priorChecksum = seenChecksums.get(sourceIdentity);

    if (priorChecksum !== undefined && priorChecksum !== recordChecksum) {
      conflicts.push(createConflict({
        batchId: evidence.batchId,
        source: evidence.source,
        kind: 'duplicate-external-id',
        entity: record.entity,
        externalId: record.externalId,
        message: 'The source export contains conflicting records with the same external identity.',
      }));
      continue;
    }

    seenChecksums.set(sourceIdentity, recordChecksum);

    if (record.epicBosId === undefined || record.epicBosId.trim() === '') {
      conflicts.push(createConflict({
        batchId: evidence.batchId,
        source: evidence.source,
        kind: 'unmapped-external-record',
        entity: record.entity,
        externalId: record.externalId,
        message: 'The source record has no approved Epic BOS identity map.',
      }));
      continue;
    }

    externalIdMaps.push({
      batchId: evidence.batchId,
      source: evidence.source,
      entity: record.entity,
      externalId: record.externalId,
      epicBosId: record.epicBosId,
      recordChecksum,
      mappedAt: evidence.observedAt,
    });
  }

  if (!checksumVerified) {
    conflicts.push(createConflict({
      batchId: evidence.batchId,
      source: evidence.source,
      kind: 'checksum-mismatch',
      message: 'The supplied source checksum does not match the observed shadow-import evidence.',
    }));
  }

  const reconciliationEntities = reconcileEntityCounts(evidence, observedCounts, conflicts);
  const hasCountVariance = reconciliationEntities.some((entity) => entity.status === 'needs-review');
  const hasAnyConflict = conflicts.length > 0;
  const reconciliationStatus: ReconciliationReport['status'] = !checksumVerified
    ? 'blocked'
    : hasAnyConflict || hasCountVariance
      ? 'needs-review'
      : 'reconciled';

  return {
    batch: {
      id: evidence.batchId,
      source: evidence.source,
      mode: 'shadow-read-only',
      writeBackAllowed: false,
      observedAt: evidence.observedAt,
      credentialRevision: evidence.credentialRevision,
      status: reconciliationStatus === 'reconciled' ? 'ready-for-review' : 'blocked',
      integrity: {
        algorithm: 'sha256',
        declaredChecksum: evidence.declaredChecksum,
        computedChecksum,
        checksumVerified,
      },
    },
    externalIdMaps,
    cursors: [{
      batchId: evidence.batchId,
      source: evidence.source,
      value: evidence.cursor.value,
      observedAt: evidence.cursor.observedAt,
    }],
    conflicts,
    reconciliation: {
      batchId: evidence.batchId,
      source: evidence.source,
      observedAt: evidence.observedAt,
      status: reconciliationStatus,
      entities: reconciliationEntities,
    },
  };
}

function reconcileEntityCounts(
  evidence: ShadowImportEvidence,
  observedCounts: ReadonlyMap<ShadowImportEntity, number>,
  conflicts: ShadowImportConflict[],
): ReconciliationEntityResult[] {
  const entities = shadowImportEntities.filter((entity) => (
    evidence.declaredCounts[entity] !== undefined || observedCounts.has(entity)
  ));

  return entities.map((entity) => {
    const declared = evidence.declaredCounts[entity] ?? null;
    const observed = observedCounts.get(entity) ?? 0;
    const variance = declared === null ? null : observed - declared;
    const status = variance === 0 ? 'matched' : 'needs-review';

    if (status === 'needs-review') {
      conflicts.push(createConflict({
        batchId: evidence.batchId,
        source: evidence.source,
        kind: 'count-variance',
        entity,
        declared: declared ?? undefined,
        observed,
        message: 'The declared source count and observed shadow-import count do not reconcile.',
      }));
    }

    return { entity, declared, observed, variance, status };
  });
}

function createConflict(input: Omit<ShadowImportConflict, 'id' | 'status'>): ShadowImportConflict {
  const identity = canonicalJson({
    batchId: input.batchId,
    kind: input.kind,
    entity: input.entity ?? null,
    externalId: input.externalId ?? null,
    declared: input.declared ?? null,
    observed: input.observed ?? null,
  });

  return {
    ...input,
    id: `conflict_${sha256(identity).slice(0, 20)}`,
    status: 'open',
  };
}

function validateRecord(record: ShadowImportRecord): void {
  if (!shadowImportEntities.includes(record.entity)) {
    throw new Error(`Unsupported shadow-import entity: ${record.entity}`);
  }
  assertNonBlank('record.externalId', record.externalId);
  if (record.epicBosId !== undefined) {
    assertNonBlank('record.epicBosId', record.epicBosId);
  }
}

function validateDeclaredCounts(counts: Partial<Record<ShadowImportEntity, number>>): void {
  for (const [entity, count] of Object.entries(counts)) {
    if (!shadowImportEntities.includes(entity as ShadowImportEntity)) {
      throw new Error(`Unsupported declared-count entity: ${entity}`);
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Declared count for ${entity} must be a non-negative integer.`);
    }
  }
}

function assertNonBlank(field: string, value: string): void {
  if (value.trim() === '') {
    throw new Error(`${field} must not be blank.`);
  }
}

function assertTimestamp(field: string, value: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-8601 timestamp.`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** A deterministic JSON encoder used for traceable source evidence. */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Evidence cannot contain a non-finite number.');
      return JSON.stringify(value);
    case 'undefined':
      throw new Error('Evidence cannot contain undefined values.');
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new Error('Evidence contains a non-serializable value.');
    case 'object':
      if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
      }
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    default:
      throw new Error(`Unsupported evidence value: ${String(value)}`);
  }
}
