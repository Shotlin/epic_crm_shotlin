import { describe, expect, it } from 'vitest';
import { buildServiceOperationsReadiness } from './service-operations-readiness';
import { createInitialRevenueOpsState } from './revenue-ops';

describe('service operations readiness', () => {
  it('correlates entitlement, SLA and field evidence without mutating state', () => {
    const state = createInitialRevenueOpsState();
    const next = { ...state, serviceAgreements: [{ id: 'agreement-1', number: 'SVC-1', accountId: 'account-1', name: 'Priority cover', coverage: 'hybrid' as const, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', includedHours: 10, targets: [], status: 'active' as const, requestedBy: 'maker', requestedAt: '2026-01-01T00:00:00.000Z', scope: state.scope, version: 1 }], serviceEntitlementUsage: [{ id: 'usage-1', number: 'ENT-1', serviceAgreementId: 'agreement-1', timeEntryId: 'time-1', projectId: 'project-1', hours: 12, status: 'overage' as const, consumedBy: 'maker', consumedAt: '2026-07-01T00:00:00.000Z', scope: state.scope, version: 1 }], supportTickets: [{ id: 'ticket-1', number: 'SUP-1', agreementId: 'agreement-1', accountId: 'account-1', title: 'Critical outage', details: 'Service is unavailable.', channel: 'field' as const, priority: 'critical' as const, reportedBy: 'customer', reportedAt: '2026-07-01T00:00:00.000Z', responseDueAt: '2026-07-01T01:00:00.000Z', resolutionDueAt: '2026-07-01T04:00:00.000Z', status: 'in-progress' as const, scope: state.scope, version: 1 }], fieldServiceJobs: [] };
    const summary = buildServiceOperationsReadiness(next, '2026-07-02T12:00:00.000Z');
    expect(summary).toMatchObject({ total: 1, degraded: 1 });
    expect(summary.assessments[0]).toMatchObject({ overageHours: 12, overdueTickets: 1, openFieldJobs: 0, nextAction: 'resolve-sla' });
    expect(next.serviceAgreements).toHaveLength(1);
  });

  it('blocks expired agreements and excludes other scopes', () => {
    const state = createInitialRevenueOpsState();
    const expired = { id: 'agreement-1', number: 'SVC-1', accountId: 'account-1', name: 'Expired', coverage: 'remote' as const, effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', includedHours: 10, targets: [], status: 'active' as const, requestedBy: 'maker', requestedAt: '2025-01-01T00:00:00.000Z', scope: state.scope, version: 1 };
    const other = { ...expired, id: 'agreement-2', number: 'SVC-2', scope: { companyId: 'other', branchId: 'other' } };
    const summary = buildServiceOperationsReadiness({ ...state, serviceAgreements: [expired, other] }, '2026-07-02T00:00:00.000Z');
    expect(summary).toMatchObject({ total: 1, blocked: 1 });
    expect(summary.assessments[0]).toMatchObject({ agreementId: 'agreement-1', nextAction: 'renew' });
  });
});
