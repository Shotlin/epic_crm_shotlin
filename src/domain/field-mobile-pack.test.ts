import { describe, expect, it } from 'vitest';
import { buildFieldMobilePacks } from './field-mobile-pack';
import { createInitialRevenueOpsState } from './revenue-ops';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const job = (scope: RevenueOpsState['scope']) => ({ id: 'job-1', number: 'FS-1', ticketId: 'ticket-1', accountId: 'account-1', addressId: 'address-1', technicianUserId: 'tech-1', scheduledStart: '2026-07-15T09:00:00.000Z', scheduledEnd: '2026-07-15T12:00:00.000Z', status: 'on-site' as const, report: 'Repair completed.', completionEvidenceReference: 'PHOTO-1', createdBy: 'dispatcher', createdAt: '2026-07-14T00:00:00.000Z', scope, version: 1 });

describe('field mobile packs', () => {
  it('builds a technician-safe pack and flags offline sync conflicts', () => {
    let state = createInitialRevenueOpsState();
    state = { ...state, fieldServiceJobs: [job(state.scope)], supportTickets: [{ id: 'ticket-1', number: 'T-1', agreementId: 'agreement-1', accountId: 'account-1', addressId: 'address-1', title: 'Pump service', details: 'Service required.', channel: 'field' as const, priority: 'high' as const, reportedBy: 'customer', reportedAt: '2026-07-14T00:00:00.000Z', responseDueAt: '2026-07-14T02:00:00.000Z', resolutionDueAt: '2026-07-15T12:00:00.000Z', status: 'in-progress' as const, scope: state.scope, version: 1 }] };
    const addresses: import('../shared/party-contracts').PartyAddress[] = [{ id: 'address-1', accountId: 'account-1', type: 'office' as const, label: 'Plant', line1: '1 Industrial Road', line2: '', city: 'Pune', region: 'MH', postalCode: '411001', countryCode: 'IN', primary: true, status: 'active' as const, version: 1 }];
    const source = { ...state, addresses };
    expect(buildFieldMobilePacks(source, 'tech-1', '2026-07-15T10:00:00.000Z')[0]).toMatchObject({ jobNumber: 'FS-1', offlineReady: true, syncStatus: 'synced', nextAction: 'complete', address: { city: 'Pune' } });
    expect(buildFieldMobilePacks({ ...source, syncStatusByJobId: { 'job-1': 'conflict' } }, 'tech-1')[0]).toMatchObject({ offlineReady: false, syncStatus: 'conflict', nextAction: 'resolve-sync-conflict' });
  });

  it('excludes another technician and another operating scope', () => {
    const state = createInitialRevenueOpsState();
    const addresses: import('../shared/party-contracts').PartyAddress[] = [];
    expect(buildFieldMobilePacks({ ...state, fieldServiceJobs: [job({ companyId: 'other-company', branchId: 'other-branch' })], addresses }, 'tech-1')).toEqual([]);
    expect(buildFieldMobilePacks({ ...state, fieldServiceJobs: [job(state.scope)], addresses }, 'other-tech')).toEqual([]);
  });
});
