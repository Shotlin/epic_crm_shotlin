import { createHash } from 'node:crypto';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';
import type { FinanceCompletionSnapshot } from '../domain/finance-completion';
import type { BusinessDatabase, StoredFinanceCompletionRecord } from './database';

export type FinanceWorkpaperStatus = 'draft' | 'reviewed' | 'approved';

function checksum(payloadJson: string): string { return createHash('sha256').update(payloadJson, 'utf8').digest('hex'); }
function decode(record: StoredFinanceCompletionRecord): FinanceCompletionSnapshot {
  if (checksum(record.payloadJson) !== record.payloadChecksum) throw new Error(`Finance workpaper ${record.id} failed checksum verification.`);
  return JSON.parse(record.payloadJson) as FinanceCompletionSnapshot;
}

function validateApprovalSnapshot(snapshot: FinanceCompletionSnapshot): void {
  if (snapshot.consolidation.entityCount < 1) throw new Error('Finance workpaper approval requires at least one consolidation entity.');
  if (snapshot.gst.filingReadiness !== 'ready') throw new Error('GST workpaper is not filing-ready; resolve statutory exceptions and HSN evidence first.');
  if (snapshot.landedCost.exceptions > 0 || snapshot.landedCost.allocationCoverage < 100) throw new Error('Landed-cost workpaper has unresolved allocation exceptions.');
  if (snapshot.people.blocked > 0) throw new Error('Payroll or expense posting evidence remains blocked.');
  for (const fx of snapshot.fx) {
    if (!Number.isFinite(fx.rate) || fx.rate <= 0 || !fx.rateEvidence.trim()) throw new Error(`FX workpaper for ${fx.currencyCode} is missing positive approved-rate evidence.`);
  }
}

export class FinanceCompletionStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public save(scope: OperatingRecordScope, id: string, snapshot: FinanceCompletionSnapshot, actorId: string, status: FinanceWorkpaperStatus = 'draft', expectedVersion?: number): FinanceCompletionSnapshot {
    if (!actorId.trim()) throw new Error('Finance workpaper requires an authenticated actor.');
    const existing = this.database.getFinanceCompletionWorkpaper(id);
    if (existing && (existing.companyId !== scope.companyId || existing.branchId !== scope.branchId)) throw new Error('Finance workpaper is outside the active company and branch scope.');
    if (existing && expectedVersion !== undefined && existing.version !== expectedVersion) throw new Error('Finance workpaper is stale. Refresh before saving.');
    const previousPayload = existing ? JSON.parse(existing.payloadJson) as { reviewedBy?: string } : {};
    if (existing && status === 'approved' && existing.status !== 'reviewed') throw new Error('A finance workpaper must be independently reviewed before approval.');
    if (existing && status === 'approved' && previousPayload.reviewedBy === actorId) throw new Error('The reviewer cannot approve the same finance workpaper.');
    if (status === 'approved') validateApprovalSnapshot(snapshot);
    const now = new Date().toISOString(); const payloadJson = JSON.stringify({ ...snapshot, reviewedBy: status === 'reviewed' || status === 'approved' ? actorId : previousPayload.reviewedBy });
    this.database.upsertFinanceCompletionWorkpaper({ id, companyId: scope.companyId, branchId: scope.branchId, payloadJson, payloadChecksum: checksum(payloadJson), status, version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? now, updatedAt: now });
    return decode(this.database.getFinanceCompletionWorkpaper(id)!);
  }

  public list(scope: OperatingRecordScope): FinanceCompletionSnapshot[] { return this.database.listFinanceCompletionWorkpapers(scope.companyId, scope.branchId).map(decode); }
}
