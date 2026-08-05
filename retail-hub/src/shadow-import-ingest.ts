import { buildShadowImportPlan, type ShadowImportEvidence, type ShadowImportPlan } from './shadow-import';
import type { ShadowImportRegistry } from './shadow-import-registry';

const CREDENTIAL_KEY = /(?:password|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|authorization|client[-_]?secret)/i;

/** Parses the versioned read-only export envelope without I/O or write-back. */
export function parseShadowImportEvidenceJson(json: string): ShadowImportEvidence {
  if (typeof json !== 'string' || json.trim() === '') throw new Error('Shadow-import JSON is required.');

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Shadow-import file must contain valid JSON.');
  }

  if (!isRecord(value) || value.format !== 'epic-bos-shadow-import' || value.version !== 1) {
    throw new Error('Shadow-import file must declare format epic-bos-shadow-import version 1.');
  }
  if (!isRecord(value.evidence)) throw new Error('Shadow-import file must contain an evidence object.');
  rejectCredentialKeys(value.evidence);

  const evidence = value.evidence as unknown as ShadowImportEvidence;
  if (evidence.source !== 'bakaloo') throw new Error('Shadow-import source must be Bakaloo.');
  return evidence;
}

/** Builds the immutable review plan, then stores only that plan in the registry. */
export function ingestShadowImportEvidenceJson(
  json: string,
  registry: ShadowImportRegistry,
): ShadowImportPlan {
  const plan = buildShadowImportPlan(parseShadowImportEvidenceJson(json));
  registry.replacePlan(plan);
  return plan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectCredentialKeys(value: unknown, path = 'evidence'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectCredentialKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key)) throw new Error(`Credential-like field ${path}.${key} is not allowed in shadow-import evidence.`);
    rejectCredentialKeys(nested, `${path}.${key}`);
  }
}
