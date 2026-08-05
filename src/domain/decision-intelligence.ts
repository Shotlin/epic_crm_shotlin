import type { RevenueOpsSnapshot } from '../shared/revenue-ops-contracts';

export type DecisionSignalSeverity = 'critical' | 'attention';
export type DecisionSignalDestination = 'treasury' | 'close' | 'statutory' | 'ledger' | 'warehouse' | 'fulfilment' | 'manufacturing' | 'people' | 'delivery';

export interface DecisionSignal {
  id: string;
  severity: DecisionSignalSeverity;
  title: string;
  detail: string;
  destination: DecisionSignalDestination;
  action: string;
  evidenceCount: number;
  sourceMetrics: string[];
  ownerRole: 'finance' | 'operations' | 'manufacturing' | 'people' | 'service';
}

/** Builds explainable, scoped cross-domain signals from existing operational metrics. */
export function buildOperationalDecisionSignals(state: Pick<RevenueOpsSnapshot, 'metrics'>): DecisionSignal[] {
  const metrics = state.metrics;
  const reorderAlerts = metrics.reorderAlerts ?? 0;
  const warehouseTaskBacklog = metrics.warehouseTaskBacklog ?? 0;
  const activeShipments = metrics.activeShipments ?? 0;
  const fulfilmentCompletion = metrics.fulfilmentCompletion ?? 0;
  const qualityHolds = metrics.qualityHolds ?? 0;
  const openNonconformances = metrics.openNonconformances ?? 0;
  const approvedUnavailableHours = metrics.approvedUnavailableHours ?? 0;
  const slaBreaches = metrics.slaBreaches ?? 0;
  const signals: DecisionSignal[] = [];
  const add = (condition: boolean, signal: DecisionSignal): void => { if (condition) signals.push(signal); };
  add(reorderAlerts > 0, { id: 'replenishment-risk', severity: 'critical', title: 'Replenishment risk', detail: `${reorderAlerts} reorder proposal${reorderAlerts === 1 ? '' : 's'} need review before stock coverage falls below policy.`, destination: 'warehouse', action: 'Open warehouse controls', evidenceCount: reorderAlerts, sourceMetrics: ['reorderAlerts'], ownerRole: 'operations' });
  add(warehouseTaskBacklog > 0, { id: 'warehouse-backlog', severity: 'attention', title: 'Warehouse execution backlog', detail: `${warehouseTaskBacklog} warehouse task${warehouseTaskBacklog === 1 ? '' : 's'} remain planned, active, or blocked.`, destination: 'warehouse', action: 'Open warehouse controls', evidenceCount: warehouseTaskBacklog, sourceMetrics: ['warehouseTaskBacklog'], ownerRole: 'operations' });
  add(fulfilmentCompletion < 100 && activeShipments > 0, { id: 'fulfilment-proof-gap', severity: 'attention', title: 'Fulfilment proof gap', detail: `${activeShipments} active shipment${activeShipments === 1 ? '' : 's'} remain while fulfilment completion is ${fulfilmentCompletion}%.`, destination: 'fulfilment', action: 'Open fulfilment tower', evidenceCount: activeShipments, sourceMetrics: ['activeShipments', 'fulfilmentCompletion'], ownerRole: 'operations' });
  add(qualityHolds > 0 || openNonconformances > 0, { id: 'quality-release-risk', severity: 'critical', title: 'Quality release risk', detail: `${qualityHolds} quality hold${qualityHolds === 1 ? '' : 's'} and ${openNonconformances} open nonconformance${openNonconformances === 1 ? '' : 's'} require disposition.`, destination: 'manufacturing', action: 'Open quality controls', evidenceCount: qualityHolds + openNonconformances, sourceMetrics: ['qualityHolds', 'openNonconformances'], ownerRole: 'manufacturing' });
  add(approvedUnavailableHours > 0, { id: 'people-capacity-constraint', severity: 'attention', title: 'People capacity constraint', detail: `${approvedUnavailableHours} approved unavailable workforce hour${approvedUnavailableHours === 1 ? '' : 's'} reduce planned delivery capacity.`, destination: 'people', action: 'Open people ledger', evidenceCount: approvedUnavailableHours, sourceMetrics: ['approvedUnavailableHours'], ownerRole: 'people' });
  add(slaBreaches > 0, { id: 'service-sla-breach', severity: 'critical', title: 'Service SLA breach', detail: `${slaBreaches} service SLA clock${slaBreaches === 1 ? '' : 's'} are overdue and need an accountable response.`, destination: 'delivery', action: 'Open delivery command', evidenceCount: slaBreaches, sourceMetrics: ['slaBreaches'], ownerRole: 'service' });
  return signals;
}
