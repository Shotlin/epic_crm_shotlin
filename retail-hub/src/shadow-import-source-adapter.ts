import {
  buildShadowImportPlan,
  checksumShadowImportEvidence,
  type ShadowImportCursorInput,
  type ShadowImportEntity,
  type ShadowImportEvidence,
  type ShadowImportPlan,
  type ShadowImportRecord,
} from './shadow-import';

/** One page returned by a server-side Bakaloo adapter. It has no write method. */
export interface ShadowImportSourcePage {
  cursor: ShadowImportCursorInput;
  observedAt: string;
  records: readonly ShadowImportRecord[];
  /** Source-declared snapshot totals. At least one page must provide them. */
  declaredCounts?: Partial<Record<ShadowImportEntity, number>>;
  nextCursor?: ShadowImportCursorInput;
  done: boolean;
}

/**
 * Credential-free adapter seam. Implementations may close over a protected
 * server-side vault client, but no secret is accepted from the renderer or
 * returned in evidence.
 */
export interface ShadowImportSourceAdapter {
  readonly source: 'bakaloo';
  /** Non-secret credential generation used by the server-side adapter. */
  readonly credentialRevision?: number;
  pullPage(input: { cursor?: string }): Promise<ShadowImportSourcePage>;
}

export interface CollectShadowImportEvidenceInput {
  batchId: string;
  observedAt: string;
  initialCursor?: string;
  maxPages?: number;
  maxRecords?: number;
}

export interface ShadowImportPullResult {
  evidence: ShadowImportEvidence;
  plan: ShadowImportPlan;
  pagesFetched: number;
  recordsFetched: number;
}

const credentialKey = /(?:password|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|authorization|client[-_]?secret)/i;

/**
 * Pulls a bounded read-only snapshot and converts it into the existing
 * checksum/reconciliation plan. It never persists, mutates, or calls a source
 * write endpoint; the injected adapter exposes only pullPage.
 */
export async function collectShadowImportEvidence(
  adapter: ShadowImportSourceAdapter,
  input: CollectShadowImportEvidenceInput,
): Promise<ShadowImportPullResult> {
  if (adapter.source !== 'bakaloo') throw new Error('Shadow-import adapter source must be Bakaloo.');
  const batchId = nonBlank(input.batchId, 'Batch ID');
  const observedAt = timestamp(input.observedAt, 'Observed time');
  const maxPages = boundedInteger(input.maxPages ?? 500, 1, 10_000, 'Maximum pages');
  const maxRecords = boundedInteger(input.maxRecords ?? 1_000_000, 1, 5_000_000, 'Maximum records');
  if (adapter.credentialRevision !== undefined && (!Number.isInteger(adapter.credentialRevision) || adapter.credentialRevision < 1)) throw new Error('Shadow-import adapter credential revision must be a positive integer.');
  const seenCursors = new Set<string>();
  const records: ShadowImportRecord[] = [];
  let declaredCounts: Partial<Record<ShadowImportEntity, number>> | undefined;
  let cursor = input.initialCursor?.trim() || undefined;
  let lastCursor: ShadowImportCursorInput | undefined;
  let pagesFetched = 0;
  let completed = false;

  while (!completed) {
    if (pagesFetched >= maxPages) throw new Error(`Shadow-import pull exceeded the ${maxPages}-page safety limit.`);
    const page = await adapter.pullPage(cursor === undefined ? {} : { cursor });
    pagesFetched += 1;
    validatePage(page);
    const pageCursor = page.cursor.value.trim();
    if (seenCursors.has(pageCursor)) throw new Error('Shadow-import source returned a repeated cursor; pull stopped to prevent duplicate ingestion.');
    seenCursors.add(pageCursor);
    lastCursor = { value: pageCursor, observedAt: timestamp(page.cursor.observedAt, 'Cursor observed time') };
    assertSafePayload(page.records);
    records.push(...page.records);
    if (records.length > maxRecords) throw new Error(`Shadow-import pull exceeded the ${maxRecords}-record safety limit.`);
    if (page.declaredCounts !== undefined) {
      validateDeclaredCounts(page.declaredCounts);
      const nextCounts = JSON.stringify(page.declaredCounts);
      if (declaredCounts !== undefined && JSON.stringify(declaredCounts) !== nextCounts) throw new Error('Shadow-import source changed declared totals during one snapshot.');
      declaredCounts = { ...page.declaredCounts };
    }
    if (page.done) {
      completed = true;
      continue;
    }
    if (!page.nextCursor) throw new Error('Shadow-import source page is not complete but did not provide a next cursor.');
    const nextCursor = page.nextCursor.value.trim();
    if (!nextCursor || nextCursor === pageCursor) throw new Error('Shadow-import source next cursor must advance the current page.');
    cursor = nextCursor;
  }

  if (!lastCursor) throw new Error('Shadow-import source returned no page cursor.');
  if (declaredCounts === undefined) throw new Error('Shadow-import source must provide declared snapshot totals before reconciliation.');
  const evidenceForChecksum = { batchId, source: 'bakaloo' as const, observedAt, cursor: lastCursor, declaredCounts, records, ...(adapter.credentialRevision === undefined ? {} : { credentialRevision: adapter.credentialRevision }) };
  const evidence: ShadowImportEvidence = { ...evidenceForChecksum, declaredChecksum: checksumShadowImportEvidence(evidenceForChecksum) };
  return { evidence, plan: buildShadowImportPlan(evidence), pagesFetched, recordsFetched: records.length };
}

function validatePage(page: ShadowImportSourcePage): void {
  if (!page || typeof page !== 'object') throw new Error('Shadow-import source returned an invalid page.');
  if (!page.cursor || typeof page.cursor.value !== 'string' || !page.cursor.value.trim()) throw new Error('Shadow-import source page must contain a non-blank cursor.');
  timestamp(page.observedAt, 'Page observed time');
  if (!Array.isArray(page.records)) throw new Error('Shadow-import source page records must be an array.');
  if (typeof page.done !== 'boolean') throw new Error('Shadow-import source page must declare done=true or done=false.');
}

function validateDeclaredCounts(counts: Partial<Record<ShadowImportEntity, number>>): void {
  for (const [entity, count] of Object.entries(counts)) {
    if (!Number.isInteger(count) || (count as number) < 0) throw new Error(`Declared total for ${entity} must be a non-negative integer.`);
  }
}

function assertSafePayload(value: unknown, path = 'records'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafePayload(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (credentialKey.test(key)) throw new Error(`Credential-like field ${path}.${key} is not allowed in shadow-import evidence.`);
    assertSafePayload(nested, `${path}.${key}`);
  }
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function nonBlank(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must not be blank.`);
  return value.trim();
}

function timestamp(value: string, label: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp.`);
  return date.toISOString();
}
