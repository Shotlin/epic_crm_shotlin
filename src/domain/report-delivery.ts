import { createHash } from 'node:crypto';
import type {
  CreateRetailReportDeliveryPlanInput,
  DecideRetailReportDeliveryPlanInput,
  PrepareRetailReportDeliveryAttemptInput,
  RecordRetailReportDeliveryResultInput,
  RetailReportDeliveryAttempt,
  RetailReportDeliveryPlan,
  RetailReportDeliveryState,
} from '../shared/report-delivery-contracts';
export type { RetailReportDeliveryState } from '../shared/report-delivery-contracts';
import type { OperatingRecordScope } from '../shared/revenue-ops-contracts';

function clean(value: string, label: string, minimum = 2, maximum = 500): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
}

function sameScope(left: OperatingRecordScope, right: OperatingRecordScope): boolean {
  return left.companyId === right.companyId && left.branchId === right.branchId;
}

function isoDate(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(Date.parse(`${normalized}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`);
  return normalized;
}

function clock(value: string, label: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${label} must use HH:MM.`);
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function timestamp(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function planNumber(plans: RetailReportDeliveryPlan[], effectiveFrom: string): string {
  const year = Number(effectiveFrom.slice(0, 4));
  const fiscalStart = Number(effectiveFrom.slice(5, 7)) >= 4 ? year : year - 1;
  const fiscalEnd = String((fiscalStart + 1) % 100).padStart(2, '0');
  return `RPTD-${String(fiscalStart).slice(-2)}-${fiscalEnd}-${String(plans.length + 1).padStart(5, '0')}`;
}

function attemptNumber(attempts: RetailReportDeliveryAttempt[], preparedAt: string): string {
  const year = Number(preparedAt.slice(0, 4));
  const fiscalStart = Number(preparedAt.slice(5, 7)) >= 4 ? year : year - 1;
  const fiscalEnd = String((fiscalStart + 1) % 100).padStart(2, '0');
  return `RPTX-${String(fiscalStart).slice(-2)}-${fiscalEnd}-${String(attempts.length + 1).padStart(5, '0')}`;
}

function localParts(now: Date): { day: string; hour: number; minute: number; weekday: number } {
  const shifted = new Date(now.getTime() + 330 * 60_000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), weekday: shifted.getUTCDay() || 7 };
}

function slotFor(plan: RetailReportDeliveryPlan, now: Date): { key: string; due: boolean } {
  const parts = localParts(now);
  const current = parts.hour * 60 + parts.minute;
  const start = clock(plan.windowStart, 'Delivery window start');
  const end = clock(plan.windowEnd, 'Delivery window end');
  const withinWindow = start <= end ? current >= start && current <= end : current >= start || current <= end;
  const cadenceDue = plan.frequency === 'daily' || (plan.frequency === 'weekly' ? parts.weekday === plan.runDay : Number(parts.day.slice(8, 10)) === plan.runDay);
  return { key: plan.frequency === 'daily' ? parts.day : plan.frequency === 'weekly' ? `${parts.day}-w${plan.runDay}` : `${parts.day.slice(0, 7)}-d${plan.runDay}`, due: withinWindow && cadenceDue };
}

function clone(state: RetailReportDeliveryState): RetailReportDeliveryState {
  return { plans: structuredClone(state.plans), attempts: structuredClone(state.attempts) };
}

export function createRetailReportDeliveryPlan(state: RetailReportDeliveryState, input: CreateRetailReportDeliveryPlanInput, actorId: string, scope: OperatingRecordScope, id: string | undefined = undefined, now = new Date().toISOString()): RetailReportDeliveryState {
  if (!actorId.trim()) throw new Error('Report delivery plan requires an accountable maker.');
  const effectiveFrom = isoDate(input.effectiveFrom, 'Effective-from date');
  const effectiveTo = input.effectiveTo ? isoDate(input.effectiveTo, 'Effective-to date') : undefined;
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('Effective-to date cannot precede effective-from date.');
  clock(input.windowStart, 'Delivery window start');
  clock(input.windowEnd, 'Delivery window end');
  if (input.frequency !== 'daily' && (!input.runDay || input.runDay < 1 || input.runDay > (input.frequency === 'weekly' ? 7 : 28))) throw new Error(`A ${input.frequency} delivery requires a valid run day.`);
  if (input.frequency === 'daily' && input.runDay !== undefined) throw new Error('Daily delivery must not specify a run day.');
  if (input.channel === 'whatsapp' && input.recipients.some((recipient) => !/^\+\d{10,15}$/.test(recipient.destination.trim()))) throw new Error('WhatsApp recipients must use an international phone number.');
  if (input.channel === 'email' && input.recipients.some((recipient) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.destination.trim()))) throw new Error('Email recipients must use a valid address.');
  if (!input.recipients.length || input.recipients.length > 100) throw new Error('A delivery plan requires 1-100 recipients.');
  const ids = new Set<string>();
  const destinations = new Set<string>();
  const recipients = input.recipients.map((recipient) => {
    const recipientId = clean(recipient.id, 'Recipient id', 2, 120);
    if (ids.has(recipientId)) throw new Error('Recipient ids must be unique.');
    ids.add(recipientId);
    const destination = clean(recipient.destination, 'Recipient destination', 3, 254);
    if (destinations.has(destination.toLowerCase())) throw new Error('Recipient destinations must be unique.');
    destinations.add(destination.toLowerCase());
    if (recipient.kind === 'customer-contact' && !recipient.consentId?.trim()) throw new Error('Customer report recipients require affirmative consent evidence.');
    return { ...recipient, id: recipientId, label: clean(recipient.label, 'Recipient label', 2, 120), destination, consentId: recipient.consentId?.trim() || undefined };
  });
  const createdAt = timestamp(now, 'Plan creation timestamp');
  const next = clone(state);
  const providerConnectorId = input.providerConnectorId?.trim() || undefined;
  next.plans.unshift({ scope: structuredClone(scope), id: id ?? crypto.randomUUID(), number: planNumber(next.plans, effectiveFrom), reportPackId: clean(input.reportPackId, 'Report pack id', 3, 120), channel: input.channel, ...(providerConnectorId ? { providerConnectorId } : {}), frequency: input.frequency, ...(input.runDay === undefined ? {} : { runDay: input.runDay }), timeZone: 'Asia/Kolkata', windowStart: input.windowStart, windowEnd: input.windowEnd, effectiveFrom, ...(effectiveTo ? { effectiveTo } : {}), recipients, notes: clean(input.notes, 'Delivery plan notes', 4, 500), status: 'draft', createdBy: actorId.trim(), createdAt, version: 1 });
  return next;
}

export function decideRetailReportDeliveryPlan(state: RetailReportDeliveryState, input: DecideRetailReportDeliveryPlanInput, actorId: string, now = new Date().toISOString(), scope?: OperatingRecordScope): RetailReportDeliveryState {
  const plan = state.plans.find((candidate) => candidate.id === input.id && (!scope || sameScope(candidate.scope, scope)));
  if (!plan) throw new Error('Report delivery plan not found.');
  if (plan.version !== input.expectedVersion) throw new Error('Report delivery plan changed. Refresh and retry.');
  if (plan.status !== 'draft') throw new Error('Only draft report delivery plans can be decided.');
  if (plan.createdBy === actorId) throw new Error('Report delivery approval requires an independent checker.');
  const decidedAt = timestamp(now, 'Plan decision timestamp');
  const next = clone(state);
  next.plans = next.plans.map((candidate) => candidate.id === plan.id ? { ...candidate, status: input.decision, approvedBy: input.decision === 'approved' ? actorId : undefined, approvedAt: input.decision === 'approved' ? decidedAt : undefined, decisionRemarks: clean(input.remarks, 'Decision remarks', 4, 500), version: candidate.version + 1 } : candidate);
  return next;
}

export function prepareRetailReportDeliveryAttempt(state: RetailReportDeliveryState, input: PrepareRetailReportDeliveryAttemptInput, actorId: string, scope: OperatingRecordScope, id: string | undefined = undefined): RetailReportDeliveryState {
  const plan = state.plans.find((candidate) => candidate.id === input.id && sameScope(candidate.scope, scope));
  if (!plan) throw new Error('Report delivery plan not found.');
  if (plan.version !== input.expectedVersion) throw new Error('Report delivery plan changed. Refresh and retry.');
  if (plan.status !== 'approved') throw new Error('Only approved report delivery plans can be prepared.');
  const now = new Date(input.now ?? new Date().toISOString());
  if (!Number.isFinite(now.getTime())) throw new Error('Delivery preparation timestamp is invalid.');
  const { key: slotKey, due } = slotFor(plan, now);
  if (!due) throw new Error('The scheduled delivery is not due in the configured India time window.');
  const idempotencyKey = `report-delivery:${plan.id}:${slotKey}`;
  if (state.attempts.some((attempt) => attempt.idempotencyKey === idempotencyKey && sameScope(attempt.scope, scope))) throw new Error('A delivery attempt for this schedule slot already exists.');
  const preparedAt = now.toISOString();
  const payloadChecksum = createHash('sha256').update(JSON.stringify({ planId: plan.id, planVersion: plan.version, reportPackId: plan.reportPackId, channel: plan.channel, recipients: plan.recipients.map(({ id, destination, consentId }) => ({ id, destination, consentId })), slotKey }), 'utf8').digest('hex');
  const next = clone(state);
  next.attempts.unshift({ scope: structuredClone(scope), id: id ?? crypto.randomUUID(), number: attemptNumber(next.attempts, preparedAt), planId: plan.id, reportPackId: plan.reportPackId, channel: plan.channel, slotKey, idempotencyKey, recipientCount: plan.recipients.length, payloadChecksum, status: 'prepared', preparedBy: actorId.trim() || 'scheduler', preparedAt, version: 1 });
  return next;
}

export function recordRetailReportDeliveryResult(state: RetailReportDeliveryState, input: RecordRetailReportDeliveryResultInput, actorId: string, scope: OperatingRecordScope, now = new Date().toISOString()): RetailReportDeliveryState {
  if (!actorId.trim()) throw new Error('Delivery result requires an accountable adapter.');
  const attempt = state.attempts.find((candidate) => candidate.id === input.id && sameScope(candidate.scope, scope));
  if (!attempt) throw new Error('Report delivery attempt not found.');
  if (attempt.version !== input.expectedVersion) throw new Error('Report delivery attempt changed. Refresh and retry.');
  if (attempt.status !== 'prepared' && attempt.status !== 'handed-off') throw new Error('Only prepared or handed-off delivery attempts can receive a provider result.');
  if (input.outcome !== 'failed' && !input.externalReference?.trim()) throw new Error('Successful provider results require an external reference.');
  if (input.outcome === 'failed' && !input.errorMessage?.trim()) throw new Error('Failed provider results require an error message.');
  const happenedAt = timestamp(now, 'Delivery result timestamp');
  const next = clone(state);
  next.attempts = next.attempts.map((candidate) => candidate.id === attempt.id ? { ...candidate, status: input.outcome, ...(input.outcome === 'handed-off' ? { handedOffAt: happenedAt } : {}), ...(input.outcome === 'acknowledged' ? { acknowledgedAt: happenedAt } : {}), ...(input.externalReference ? { externalReference: clean(input.externalReference, 'External reference', 3, 200) } : {}), ...(input.responseChecksum ? { responseChecksum: input.responseChecksum } : {}), ...(input.errorMessage ? { errorMessage: clean(input.errorMessage, 'Provider error', 4, 500) } : {}), version: candidate.version + 1 } : candidate);
  return next;
}
