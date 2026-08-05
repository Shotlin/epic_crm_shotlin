import { createHash } from 'node:crypto';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';
import type { BusinessDatabase, StoredIntelligenceRecord } from './database';
import { reviewGovernedAnomaly, type AnomalyReviewInput, type GovernedAnomaly } from '../domain/governed-anomaly-queue';
import type { GovernedReportExecution } from '../domain/report-execution';
import {
  createRetailReportDeliveryPlan,
  decideRetailReportDeliveryPlan,
  prepareRetailReportDeliveryAttempt,
  recordRetailReportDeliveryResult,
} from '../domain/report-delivery';
import type {
  CreateRetailReportDeliveryPlanInput,
  DecideRetailReportDeliveryPlanInput,
  PrepareRetailReportDeliveryAttemptInput,
  RecordRetailReportDeliveryResultInput,
  RetailReportDeliveryAttempt,
  RetailReportDeliveryPlan,
  RetailReportDeliveryState,
} from '../shared/report-delivery-contracts';

function checksum(payloadJson: string): string {
  return createHash('sha256').update(payloadJson, 'utf8').digest('hex');
}

function decode<T>(record: StoredIntelligenceRecord): T {
  if (checksum(record.payloadJson) !== record.payloadChecksum) throw new Error(`Intelligence evidence ${record.id} failed checksum verification.`);
  return JSON.parse(record.payloadJson) as T;
}

function record(scope: OperatingRecordScope, id: string, payloadJson: string, status: string, version: number, createdAt: string, updatedAt: string): StoredIntelligenceRecord {
  return { id, companyId: scope.companyId, branchId: scope.branchId, payloadJson, payloadChecksum: checksum(payloadJson), status, version, createdAt, updatedAt };
}

export class IntelligenceStore {
  public constructor(private readonly database: BusinessDatabase) {}

  public saveAnomaly(scope: OperatingRecordScope, anomaly: GovernedAnomaly, updatedAt = new Date().toISOString()): GovernedAnomaly {
    const existing = this.database.getIntelligenceAnomaly(anomaly.id);
    if (existing && existing.companyId === scope.companyId && existing.branchId === scope.branchId && existing.version > anomaly.version) return decode<GovernedAnomaly>(existing);
    const payloadJson = JSON.stringify(anomaly);
    this.database.upsertIntelligenceAnomaly(record(scope, anomaly.id, payloadJson, anomaly.status, anomaly.version, anomaly.generatedAt, updatedAt));
    return anomaly;
  }

  public listAnomalies(scope: OperatingRecordScope): GovernedAnomaly[] {
    return this.database.listIntelligenceAnomalies(scope.companyId, scope.branchId).map((item) => decode<GovernedAnomaly>(item));
  }

  public reviewAnomaly(scope: OperatingRecordScope, id: string, input: AnomalyReviewInput, updatedAt = new Date().toISOString()): GovernedAnomaly {
    const stored = this.database.getIntelligenceAnomaly(id);
    if (!stored || stored.companyId !== scope.companyId || stored.branchId !== scope.branchId) throw new Error('Anomaly is outside the active company and branch scope.');
    const reviewed = reviewGovernedAnomaly(decode<GovernedAnomaly>(stored), input);
    this.saveAnomaly(scope, reviewed, updatedAt);
    return reviewed;
  }

  public saveReportExecution(scope: OperatingRecordScope, execution: GovernedReportExecution): GovernedReportExecution {
    if (execution.scope.companyId !== scope.companyId || execution.scope.branchId !== scope.branchId) throw new Error('Report execution is outside the active company and branch scope.');
    const payloadJson = JSON.stringify(execution);
    this.database.upsertIntelligenceReportExecution(record(scope, execution.id, payloadJson, execution.status, 1, execution.generatedAt, execution.generatedAt));
    return execution;
  }

  public listReportExecutions(scope: OperatingRecordScope): GovernedReportExecution[] {
    return this.database.listIntelligenceReportExecutions(scope.companyId, scope.branchId).map((item) => decode<GovernedReportExecution>(item));
  }

  private listReportDeliveryState(scope: OperatingRecordScope): RetailReportDeliveryState {
    return {
      plans: this.database.listIntelligenceReportDeliveryPlans(scope.companyId, scope.branchId).map((item) => decode<RetailReportDeliveryPlan>(item)),
      attempts: this.database.listIntelligenceReportDeliveryAttempts(scope.companyId, scope.branchId).map((item) => decode<RetailReportDeliveryAttempt>(item)),
    };
  }

  private persistReportDeliveryState(scope: OperatingRecordScope, previous: RetailReportDeliveryState, next: RetailReportDeliveryState, updatedAt: string): void {
    const previousPlans = new Map(previous.plans.map((plan) => [plan.id, plan]));
    for (const plan of next.plans) {
      const prior = previousPlans.get(plan.id);
      if (prior && JSON.stringify(prior) === JSON.stringify(plan)) continue;
      const payloadJson = JSON.stringify(plan);
      this.database.upsertIntelligenceReportDeliveryPlan(record(scope, plan.id, payloadJson, plan.status, plan.version, plan.createdAt, updatedAt));
    }
    const previousAttempts = new Map(previous.attempts.map((attempt) => [attempt.id, attempt]));
    for (const attempt of next.attempts) {
      const prior = previousAttempts.get(attempt.id);
      if (prior && JSON.stringify(prior) === JSON.stringify(attempt)) continue;
      const payloadJson = JSON.stringify(attempt);
      this.database.upsertIntelligenceReportDeliveryAttempt(record(scope, attempt.id, payloadJson, attempt.status, attempt.version, attempt.preparedAt, updatedAt));
    }
  }

  public listReportDeliveryPlans(scope: OperatingRecordScope): RetailReportDeliveryPlan[] {
    return this.listReportDeliveryState(scope).plans;
  }

  public listReportDeliveryAttempts(scope: OperatingRecordScope): RetailReportDeliveryAttempt[] {
    return this.listReportDeliveryState(scope).attempts;
  }

  public createReportDeliveryPlan(scope: OperatingRecordScope, input: CreateRetailReportDeliveryPlanInput, actorId: string, now = new Date().toISOString()): RetailReportDeliveryPlan {
    const previous = this.listReportDeliveryState(scope);
    const next = createRetailReportDeliveryPlan(previous, input, actorId, scope, undefined, now);
    this.persistReportDeliveryState(scope, previous, next, now);
    return next.plans[0]!;
  }

  public decideReportDeliveryPlan(scope: OperatingRecordScope, input: DecideRetailReportDeliveryPlanInput, actorId: string, now = new Date().toISOString()): RetailReportDeliveryPlan {
    const previous = this.listReportDeliveryState(scope);
    const next = decideRetailReportDeliveryPlan(previous, input, actorId, now, scope);
    this.persistReportDeliveryState(scope, previous, next, now);
    return next.plans.find((plan) => plan.id === input.id)!;
  }

  public prepareReportDeliveryAttempt(scope: OperatingRecordScope, input: PrepareRetailReportDeliveryAttemptInput, actorId: string, id?: string): RetailReportDeliveryAttempt {
    const previous = this.listReportDeliveryState(scope);
    const next = prepareRetailReportDeliveryAttempt(previous, input, actorId, scope, id);
    const now = next.attempts[0]!.preparedAt;
    this.persistReportDeliveryState(scope, previous, next, now);
    return next.attempts[0]!;
  }

  public recordReportDeliveryResult(scope: OperatingRecordScope, input: RecordRetailReportDeliveryResultInput, actorId: string, now = new Date().toISOString()): RetailReportDeliveryAttempt {
    const previous = this.listReportDeliveryState(scope);
    const next = recordRetailReportDeliveryResult(previous, input, actorId, scope, now);
    this.persistReportDeliveryState(scope, previous, next, now);
    return next.attempts.find((attempt) => attempt.id === input.id)!;
  }
}
