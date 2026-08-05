import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type ServiceReadiness = 'ready' | 'degraded' | 'blocked';

export interface ServiceAgreementAssessment {
  agreementId: string;
  number: string;
  name: string;
  accountId: string;
  coverage: 'remote' | 'on-site' | 'hybrid';
  readiness: ServiceReadiness;
  includedHours: number;
  usedHours: number;
  remainingHours: number;
  overageHours: number;
  openTickets: number;
  overdueTickets: number;
  openFieldJobs: number;
  blockers: string[];
  nextAction: 'monitor' | 'review-overage' | 'resolve-sla' | 'dispatch' | 'renew';
}

export interface ServiceOperationsReadinessSummary {
  generatedAt: string;
  total: number;
  ready: number;
  degraded: number;
  blocked: number;
  assessments: ServiceAgreementAssessment[];
}

type ServiceSource = Pick<RevenueOpsSnapshot, 'scope' | 'serviceAgreements' | 'serviceEntitlementUsage' | 'supportTickets' | 'fieldServiceJobs'>;

function inScope(state: ServiceSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/** Read-only service control tower: entitlement runway, SLA clocks, and field dispatch evidence. */
export function buildServiceOperationsReadiness(state: ServiceSource, asOf = new Date().toISOString()): ServiceOperationsReadinessSummary {
  const today = asOf.slice(0, 10);
  const now = Date.parse(asOf);
  const assessments = state.serviceAgreements.filter((agreement) => agreement.status === 'active' && inScope(state, agreement)).map((agreement) => {
    const usages = state.serviceEntitlementUsage.filter((usage) => usage.serviceAgreementId === agreement.id && inScope(state, usage));
    const usedHours = usages.reduce((sum, usage) => sum + usage.hours, 0);
    const overageHours = usages.filter(({ status }) => status === 'overage').reduce((sum, usage) => sum + usage.hours, 0);
    const tickets = state.supportTickets.filter((ticket) => ticket.agreementId === agreement.id && inScope(state, ticket) && !['resolved', 'closed', 'cancelled'].includes(ticket.status));
    const overdueTickets = tickets.filter((ticket) => (ticket.respondedAt ? false : Date.parse(ticket.responseDueAt) < now) || (ticket.resolvedAt ? false : Date.parse(ticket.resolutionDueAt) < now)).length;
    const openFieldJobs = state.fieldServiceJobs.filter((job) => job.ticketId && tickets.some(({ id }) => id === job.ticketId) && inScope(state, job) && !['completed', 'cancelled'].includes(job.status)).length;
    const blockers: string[] = [];
    if (agreement.effectiveTo < today) blockers.push('Agreement coverage has expired; renewal is required.');
    if (overageHours > 0) blockers.push(`${overageHours.toFixed(1)} service hours are over entitlement.`);
    if (overdueTickets > 0) blockers.push(`${overdueTickets} open ticket${overdueTickets === 1 ? '' : 's'} has an overdue SLA clock.`);
    if (tickets.some((ticket) => ticket.channel === 'field' || ticket.priority === 'critical') && openFieldJobs === 0) blockers.push('A field-critical case has no open field-service job.');
    const readiness: ServiceReadiness = agreement.effectiveTo < today ? 'blocked' : blockers.length ? 'degraded' : 'ready';
    const nextAction: ServiceAgreementAssessment['nextAction'] = agreement.effectiveTo < today ? 'renew' : overdueTickets ? 'resolve-sla' : openFieldJobs === 0 && tickets.some((ticket) => ticket.channel === 'field' || ticket.priority === 'critical') ? 'dispatch' : overageHours > 0 ? 'review-overage' : 'monitor';
    return { agreementId: agreement.id, number: agreement.number, name: agreement.name, accountId: agreement.accountId, coverage: agreement.coverage, readiness, includedHours: agreement.includedHours, usedHours, remainingHours: Math.max(0, agreement.includedHours - usedHours), overageHours, openTickets: tickets.length, overdueTickets, openFieldJobs, blockers, nextAction };
  }).sort((left, right) => left.number.localeCompare(right.number));
  return { generatedAt: asOf, total: assessments.length, ready: assessments.filter(({ readiness }) => readiness === 'ready').length, degraded: assessments.filter(({ readiness }) => readiness === 'degraded').length, blocked: assessments.filter(({ readiness }) => readiness === 'blocked').length, assessments };
}
