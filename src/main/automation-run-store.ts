import { createHash } from 'node:crypto';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';
import type { BusinessDatabase, StoredAutomationRun } from './database';
import { approveAutomationRun, completeAutomationRun, retryAutomationRun, startAutomationRun, type AutomationRun, type AutomationRunOutcome } from '../domain/workflow-execution';

function checksum(payloadJson: string): string { return createHash('sha256').update(payloadJson, 'utf8').digest('hex'); }
function decode(record: StoredAutomationRun): AutomationRun { if (checksum(record.payloadJson) !== record.payloadChecksum) throw new Error(`Automation run ${record.id} failed checksum verification.`); return JSON.parse(record.payloadJson) as AutomationRun; }
function stored(scope: OperatingRecordScope, run: AutomationRun, updatedAt: string): StoredAutomationRun { const payloadJson = JSON.stringify(run); return { id: run.id, companyId: scope.companyId, branchId: scope.branchId, payloadJson, payloadChecksum: checksum(payloadJson), status: run.status, version: run.version, createdAt: run.proposedAt, updatedAt }; }

export class AutomationRunStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public save(scope: OperatingRecordScope, run: AutomationRun, updatedAt = new Date().toISOString()): AutomationRun {
    const existing = this.database.getAutomationRunByIdempotency(scope.companyId, scope.branchId, run.idempotencyKey);
    if (existing && existing.id !== run.id) throw new Error('Automation idempotency key is already bound to another run.');
    this.database.upsertAutomationRun(stored(scope, run, updatedAt));
    return run;
  }

  public get(scope: OperatingRecordScope, id: string): AutomationRun | null {
    const record = this.database.getAutomationRun(id);
    if (!record || record.companyId !== scope.companyId || record.branchId !== scope.branchId) return null;
    return decode(record);
  }

  public list(scope: OperatingRecordScope): AutomationRun[] { return this.database.listAutomationRuns(scope.companyId, scope.branchId).map(decode); }

  public approve(scope: OperatingRecordScope, id: string, approverId: string, approvedAt?: string): AutomationRun {
    const run = this.get(scope, id); if (!run) throw new Error('Automation run is outside the active scope.');
    return this.save(scope, approveAutomationRun(run, approverId, approvedAt));
  }

  public start(scope: OperatingRecordScope, id: string, operatorId: string, startedAt?: string): AutomationRun {
    const run = this.get(scope, id); if (!run) throw new Error('Automation run is outside the active scope.');
    return this.save(scope, startAutomationRun(run, operatorId, startedAt));
  }

  public retry(scope: OperatingRecordScope, id: string, operatorId: string, reason: string, retriedAt?: string): AutomationRun {
    const run = this.get(scope, id); if (!run) throw new Error('Automation run is outside the active scope.');
    return this.save(scope, retryAutomationRun(run, operatorId, reason, retriedAt));
  }

  public complete(scope: OperatingRecordScope, id: string, outcome: AutomationRunOutcome): AutomationRun {
    const run = this.get(scope, id); if (!run) throw new Error('Automation run is outside the active scope.');
    return this.save(scope, completeAutomationRun(run, outcome));
  }
}
