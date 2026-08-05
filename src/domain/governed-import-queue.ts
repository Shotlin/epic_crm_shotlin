import type { DataExchangeDefinition } from './data-exchange-catalog';

export type GovernedImportStatus = 'queued' | 'validated' | 'approved' | 'handed-off' | 'rejected';

export interface GovernedImportQueueEntry {
  id: string;
  definitionId: string;
  label: string;
  resource: string;
  status: GovernedImportStatus;
  queuedAt: string;
  validatedAt?: string;
  approvedAt?: string;
  handedOffAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export function queueImport(definition: DataExchangeDefinition, now = new Date().toISOString()): GovernedImportQueueEntry | null {
  if (definition.state !== 'ready') return null;
  return {
    id: `import-${definition.id}-${now}`,
    definitionId: definition.id,
    label: definition.label,
    resource: definition.resource,
    status: 'queued',
    queuedAt: now,
  };
}

export function validateImport(entry: GovernedImportQueueEntry, now = new Date().toISOString()): GovernedImportQueueEntry {
  if (entry.status !== 'queued') return entry;
  return { ...entry, status: 'validated', validatedAt: now };
}

export function approveImport(entry: GovernedImportQueueEntry, now = new Date().toISOString()): GovernedImportQueueEntry {
  if (entry.status !== 'validated') return entry;
  return { ...entry, status: 'approved', approvedAt: now };
}

export function handoffImport(entry: GovernedImportQueueEntry, now = new Date().toISOString()): GovernedImportQueueEntry {
  if (entry.status !== 'approved') return entry;
  return { ...entry, status: 'handed-off', handedOffAt: now };
}

export function rejectImport(entry: GovernedImportQueueEntry, reason: string, now = new Date().toISOString()): GovernedImportQueueEntry {
  if (entry.status === 'approved') return entry;
  return { ...entry, status: 'rejected', rejectedAt: now, rejectionReason: reason };
}

export function summarizeImportQueue(entries: readonly GovernedImportQueueEntry[]): Record<GovernedImportStatus, number> {
  return entries.reduce<Record<GovernedImportStatus, number>>((summary, entry) => {
    summary[entry.status] += 1;
    return summary;
  }, { queued: 0, validated: 0, approved: 0, 'handed-off': 0, rejected: 0 });
}

export function serializeImportQueue(entries: readonly GovernedImportQueueEntry[]): string {
  return JSON.stringify(entries);
}

export function restoreImportQueue(serialized: string | null): GovernedImportQueueEntry[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is GovernedImportQueueEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<GovernedImportQueueEntry>;
      return typeof candidate.id === 'string' && typeof candidate.definitionId === 'string' && typeof candidate.label === 'string' && typeof candidate.resource === 'string' && typeof candidate.queuedAt === 'string' && ['queued', 'validated', 'approved', 'handed-off', 'rejected'].includes(candidate.status ?? '');
    });
  } catch {
    return [];
  }
}
