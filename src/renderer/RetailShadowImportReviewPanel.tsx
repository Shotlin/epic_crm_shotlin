import { FileSearch, ShieldCheck, Upload, X } from 'lucide-react';
import { useState, type ChangeEvent, type ReactNode } from 'react';

interface ShadowImportPreview {
  fileName: string;
  batchId: string;
  source: string;
  observedAt: string;
  cursor: string;
  declaredChecksum: string;
  recordCount: number;
  mappedRecordCount: number;
  unmappedRecordCount: number;
  duplicateIdentityCount: number;
  entityCounts: Array<{ entity: string; observed: number; declared: number | null }>;
}

/**
 * Local preview only. The Hub remains the authority for checksum verification
 * and registry ingestion; this surface deliberately cannot import or sync.
 */
export function RetailShadowImportReviewPanel(): ReactNode {
  const [preview, setPreview] = useState<ShadowImportPreview | null>(null);
  const [error, setError] = useState('');

  async function previewFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setPreview(null);
    try {
      const parsed: unknown = JSON.parse(await readFileText(file));
      const next = parsePreview(parsed, file.name);
      setPreview(next);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'The export could not be previewed.');
    }
    event.target.value = '';
  }

  function clearPreview(): void {
    setPreview(null);
    setError('');
  }

  return (
    <article className="panel panel--wide shadow-import-review" data-testid="shadow-import-review">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Bakaloo data bridge</span>
          <h2>Review an export before it reaches Epic BOS</h2>
          <p>Preview only. No record is imported, changed, or sent back to Bakaloo from this screen.</p>
        </div>
        <FileSearch size={19} aria-hidden="true" />
      </div>
      <div className="bharat-panel__actions">
        <label className="button button--primary" htmlFor="shadow-import-file">
          <Upload size={15} aria-hidden="true" /> Choose JSON export
        </label>
        <input id="shadow-import-file" data-testid="shadow-import-file" type="file" accept="application/json,.json" onChange={(event) => void previewFile(event)} hidden />
        <span className="policy-chip"><ShieldCheck size={14} aria-hidden="true" /> Hub verification required</span>
        {preview ? <button type="button" className="button button--quiet" onClick={clearPreview}><X size={14} aria-hidden="true" /> Clear preview</button> : null}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {preview ? (
        <>
          <div className="metric-strip" aria-label="Shadow import preview summary">
            <div><span>Batch</span><strong>{preview.batchId}</strong><small>{preview.fileName}</small></div>
            <div><span>Source</span><strong>{preview.source}</strong><small>read-only export</small></div>
            <div><span>Records</span><strong>{preview.recordCount.toLocaleString('en-IN')}</strong><small>{preview.entityCounts.length} entity types observed</small></div>
            <div><span>Identity map</span><strong>{preview.mappedRecordCount.toLocaleString('en-IN')} mapped</strong><small>{preview.unmappedRecordCount.toLocaleString('en-IN')} require review</small></div>
            <div><span>Conflicts</span><strong>{preview.duplicateIdentityCount.toLocaleString('en-IN')}</strong><small>duplicate external identities</small></div>
            <div><span>Cursor</span><strong>{preview.cursor || 'Not supplied'}</strong><small>{preview.observedAt}</small></div>
          </div>
          <div className="ledger-register" aria-label="Shadow import entity counts">
            {preview.entityCounts.map((entry) => <div key={entry.entity}><div><strong>{entry.entity}</strong><small>Observed {entry.observed.toLocaleString('en-IN')} · Declared {entry.declared === null ? 'not declared' : entry.declared.toLocaleString('en-IN')}</small></div><em data-status={entry.declared === null || entry.declared === entry.observed ? 'ready' : 'attention'}>{entry.declared === null || entry.declared === entry.observed ? 'review' : 'count mismatch'}</em></div>)}
          </div>
          <p className="ledger-sheet__note"><strong>Next step:</strong> the Retail Hub must verify checksum <code>{preview.declaredChecksum || 'not supplied'}</code>, resolve the {preview.unmappedRecordCount + preview.duplicateIdentityCount} identity review item{preview.unmappedRecordCount + preview.duplicateIdentityCount === 1 ? '' : 's'}, and register the evidence. This preview cannot approve reconciliation or enable live writes.</p>
        </>
      ) : (
        <div className="bharat-empty"><FileSearch size={22} aria-hidden="true" /><strong>No export selected</strong><span>Choose a JSON shadow export to inspect its scope before Hub verification.</span></div>
      )}
    </article>
  );
}

function parsePreview(value: unknown, fileName: string): ShadowImportPreview {
  if (!isRecord(value) || value.format !== 'epic-bos-shadow-import' || value.version !== 1) throw new Error('Choose an epic-bos-shadow-import version 1 export.');
  if (!isRecord(value.evidence)) throw new Error('The export does not contain an evidence object.');
  const evidence = value.evidence;
  if (evidence.source !== 'bakaloo') throw new Error('Only Bakaloo shadow exports can be previewed here.');
  if (typeof evidence.batchId !== 'string' || !evidence.batchId.trim()) throw new Error('The export is missing a batch ID.');
  if (!Array.isArray(evidence.records)) throw new Error('The export is missing its records array.');
  const declaredCounts = isRecord(evidence.declaredCounts) ? evidence.declaredCounts : {};
  const observed = new Map<string, number>();
  const identities = new Set<string>();
  let mappedRecordCount = 0;
  let unmappedRecordCount = 0;
  let duplicateIdentityCount = 0;
  evidence.records.forEach((record) => {
    if (!isRecord(record) || typeof record.entity !== 'string') throw new Error('Every export record must declare an entity.');
    observed.set(record.entity, (observed.get(record.entity) ?? 0) + 1);
    const identity = `${record.entity}:${typeof record.externalId === 'string' ? record.externalId : ''}`;
    if (identities.has(identity)) duplicateIdentityCount += 1;
    identities.add(identity);
    if (typeof record.epicBosId === 'string' && record.epicBosId.trim()) mappedRecordCount += 1;
    else unmappedRecordCount += 1;
  });
  const entities = new Set([...observed.keys(), ...Object.keys(declaredCounts)]);
  return {
    fileName,
    batchId: evidence.batchId,
    source: evidence.source,
    observedAt: typeof evidence.observedAt === 'string' ? evidence.observedAt : 'Not supplied',
    cursor: isRecord(evidence.cursor) && typeof evidence.cursor.value === 'string' ? evidence.cursor.value : '',
    declaredChecksum: typeof evidence.declaredChecksum === 'string' ? evidence.declaredChecksum : '',
    recordCount: evidence.records.length,
    mappedRecordCount,
    unmappedRecordCount,
    duplicateIdentityCount,
    entityCounts: [...entities].sort().map((entity) => ({ entity, observed: observed.get(entity) ?? 0, declared: typeof declaredCounts[entity] === 'number' ? declaredCounts[entity] : null })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readFileText(file: File): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('The selected export could not be read.'));
      reader.readAsText(file);
    });
  }
  if (typeof file.text === 'function') return file.text();
  return Promise.reject(new Error('The selected export could not be read.'));
}
