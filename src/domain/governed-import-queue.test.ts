import { describe, expect, it } from 'vitest';
import { DATA_EXCHANGE_CATALOG } from './data-exchange-catalog';
import { approveImport, handoffImport, queueImport, rejectImport, restoreImportQueue, serializeImportQueue, summarizeImportQueue, validateImport } from './governed-import-queue';

describe('governed import queue', () => {
  it('requires a ready data pack before queueing', () => {
    expect(queueImport(DATA_EXCHANGE_CATALOG.find(({ id }) => id === 'party-import')!, '2026-07-18T10:00:00.000Z')).not.toBeNull();
    expect(queueImport(DATA_EXCHANGE_CATALOG.find(({ id }) => id === 'product-import')!, '2026-07-18T10:00:00.000Z')).not.toBeNull();
  });

  it('moves imports through validation and maker-checker approval', () => {
    const source = queueImport(DATA_EXCHANGE_CATALOG[0]!, '2026-07-18T10:00:00.000Z')!;
    const validated = validateImport(source, '2026-07-18T10:01:00.000Z');
    const approved = approveImport(validated, '2026-07-18T10:02:00.000Z');
    expect(approved.status).toBe('approved');
    expect(handoffImport(approved, '2026-07-18T10:03:00.000Z').status).toBe('handed-off');
    expect(approveImport(source).status).toBe('queued');
    expect(rejectImport(approved, 'too late').status).toBe('approved');
  });

  it('summarizes queue state for an operations dashboard', () => {
    const source = queueImport(DATA_EXCHANGE_CATALOG[0]!, '2026-07-18T10:00:00.000Z')!;
    const validated = validateImport(source);
    expect(summarizeImportQueue([source, validated, approveImport(validated), handoffImport(approveImport(validated)), rejectImport(source, 'invalid row')])).toEqual({ queued: 1, validated: 1, approved: 1, 'handed-off': 1, rejected: 1 });
  });

  it('round-trips only valid persisted queue entries', () => {
    const source = queueImport(DATA_EXCHANGE_CATALOG[0]!, '2026-07-18T10:00:00.000Z')!;
    expect(restoreImportQueue(serializeImportQueue([source]))).toEqual([source]);
    expect(restoreImportQueue('{"unsafe":true}')).toEqual([]);
  });
});
