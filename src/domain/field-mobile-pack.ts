import type { PartyAddress } from '../shared/party-contracts';
import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type MobileSyncStatus = 'synced' | 'pending' | 'conflict';

export interface FieldMobilePack {
  jobId: string;
  jobNumber: string;
  technicianUserId: string;
  ticketNumber: string;
  customerAccountId: string;
  address?: Pick<PartyAddress, 'label' | 'line1' | 'line2' | 'city' | 'region' | 'postalCode' | 'countryCode'>;
  offlineReady: boolean;
  syncStatus: MobileSyncStatus;
  reportCaptured: boolean;
  completionEvidenceCaptured: boolean;
  blockers: string[];
  nextAction: 'download' | 'arrive' | 'capture-evidence' | 'resolve-sync-conflict' | 'sync' | 'complete';
}

type FieldMobileSource = Pick<RevenueOpsSnapshot, 'scope' | 'fieldServiceJobs' | 'supportTickets'> & { addresses: PartyAddress[]; syncStatusByJobId?: Record<string, MobileSyncStatus> };

function inScope(state: FieldMobileSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/** Builds a technician-safe offline work pack; it never implies that local edits are synchronized. */
export function buildFieldMobilePacks(state: FieldMobileSource, technicianUserId: string, asOf = new Date().toISOString()): FieldMobilePack[] {
  return state.fieldServiceJobs.filter((job) => job.technicianUserId === technicianUserId && !['cancelled', 'completed'].includes(job.status) && inScope(state, job)).map((job) => {
    const ticket = state.supportTickets.find((candidate) => candidate.id === job.ticketId && inScope(state, candidate));
    const addressRecord = state.addresses.find((address) => address.id === job.addressId && address.status === 'active' && address.accountId === job.accountId);
    const syncStatus = state.syncStatusByJobId?.[job.id] ?? (job.status === 'on-site' && job.report ? 'synced' : 'pending');
    const blockers: string[] = [];
    if (!ticket || ['cancelled', 'closed'].includes(ticket.status)) blockers.push('Support case is unavailable or closed.');
    if (!addressRecord) blockers.push('Active customer site address is missing.');
    if (job.status === 'planned') blockers.push('Technician has not received a dispatched job.');
    if (syncStatus === 'conflict') blockers.push('Offline completion has a synchronization conflict.');
    if (job.status === 'on-site' && !job.report?.trim()) blockers.push('Completion report is not captured.');
    if (job.status === 'on-site' && !job.completionEvidenceReference?.trim()) blockers.push('Completion evidence reference is missing.');
    if (job.scheduledEnd < asOf && job.status !== 'on-site') blockers.push('Scheduled window has elapsed; review dispatch state.');
    const offlineReady = Boolean(ticket && addressRecord && job.status === 'on-site' && syncStatus !== 'conflict');
    const nextAction: FieldMobilePack['nextAction'] = syncStatus === 'conflict' ? 'resolve-sync-conflict' : job.status === 'planned' ? 'download' : job.status === 'dispatched' ? 'arrive' : !job.report?.trim() || !job.completionEvidenceReference?.trim() ? 'capture-evidence' : syncStatus === 'pending' ? 'sync' : 'complete';
    return { jobId: job.id, jobNumber: job.number, technicianUserId: job.technicianUserId, ticketNumber: ticket?.number ?? job.ticketId, customerAccountId: job.accountId, address: addressRecord ? { label: addressRecord.label, line1: addressRecord.line1, line2: addressRecord.line2, city: addressRecord.city, region: addressRecord.region, postalCode: addressRecord.postalCode, countryCode: addressRecord.countryCode } : undefined, offlineReady, syncStatus, reportCaptured: Boolean(job.report?.trim()), completionEvidenceCaptured: Boolean(job.completionEvidenceReference?.trim()), blockers: [...new Set(blockers)], nextAction };
  }).sort((left, right) => left.jobNumber.localeCompare(right.jobNumber));
}
