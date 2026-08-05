export type BusinessWorkflowState = 'ready' | 'skeleton' | 'external-gate';

export interface BusinessWorkflowDefinition {
  id: string;
  label: string;
  description: string;
  ownerWorkspace: 'command' | 'crm' | 'sales' | 'finance' | 'operations' | 'people' | 'service' | 'intelligence';
  state: BusinessWorkflowState;
  indiaPriority: 'core' | 'high' | 'extended';
  steps: readonly string[];
}

export const BUSINESS_WORKFLOW_CATALOG: readonly BusinessWorkflowDefinition[] = [
  { id: 'lead-to-cash', label: 'Lead to Cash', description: 'Convert demand into an approved order, fulfilment, invoice and collection.', ownerWorkspace: 'crm', state: 'ready', indiaPriority: 'core', steps: ['Lead', 'Opportunity', 'Quotation', 'Sales order', 'Fulfilment', 'Invoice', 'Collection'] },
  { id: 'procure-to-pay', label: 'Procure to Pay', description: 'Control supplier demand, receipts, matching and payment release.', ownerWorkspace: 'operations', state: 'ready', indiaPriority: 'core', steps: ['Requisition', 'RFQ', 'Purchase order', 'Receipt', 'Three-way match', 'Bill', 'Payment'] },
  { id: 'record-to-report', label: 'Record to Report', description: 'Move governed source transactions into close, statements and review evidence.', ownerWorkspace: 'finance', state: 'ready', indiaPriority: 'core', steps: ['Source event', 'Journal draft', 'Approval', 'Reconciliation', 'Period close', 'Statements', 'Audit pack'] },
  { id: 'hire-to-retire', label: 'Hire to Retire', description: 'Manage the employee lifecycle, payroll and statutory obligations.', ownerWorkspace: 'people', state: 'ready', indiaPriority: 'core', steps: ['Requisition', 'Applicant', 'Offer', 'Onboarding', 'Attendance', 'Payroll', 'Exit'] },
  { id: 'plan-to-produce', label: 'Plan to Produce', description: 'Translate demand into material planning, production, quality and stock.', ownerWorkspace: 'operations', state: 'ready', indiaPriority: 'high', steps: ['Demand', 'MPS/MRP', 'BOM', 'Work order', 'Quality', 'Finished goods', 'Costing'] },
  { id: 'service-to-cash', label: 'Service to Cash', description: 'Deliver a project or field job with SLA evidence and billing handoff.', ownerWorkspace: 'service', state: 'ready', indiaPriority: 'high', steps: ['Case/charter', 'Schedule', 'Dispatch', 'Time/evidence', 'Acceptance', 'Milestone bill', 'Collection'] },
  { id: 'gst-compliance', label: 'GST Compliance', description: 'Prepare India tax evidence and reconcile provider responses before filing.', ownerWorkspace: 'finance', state: 'external-gate', indiaPriority: 'core', steps: ['Tax invoice', 'E-invoice', 'E-way bill', 'GSTR workpaper', 'Portal pull', 'Exception review', 'Filing pack'] },
  { id: 'inventory-control', label: 'Inventory Control', description: 'Maintain traceable stock from receipt through movement, count and valuation.', ownerWorkspace: 'operations', state: 'ready', indiaPriority: 'core', steps: ['Receipt', 'Putaway', 'Bin balance', 'Pick/pack', 'Transfer', 'Cycle count', 'Valuation'] },
  { id: 'insight-to-action', label: 'Insight to Action', description: 'Turn governed metrics and anomalies into accountable interventions.', ownerWorkspace: 'intelligence', state: 'skeleton', indiaPriority: 'extended', steps: ['Metric', 'Signal', 'Review', 'Decision', 'Approval', 'Action', 'Outcome'] },
];

export function summarizeBusinessWorkflows(workflows: readonly BusinessWorkflowDefinition[] = BUSINESS_WORKFLOW_CATALOG): { total: number; ready: number; skeleton: number; externalGate: number; steps: number } {
  return {
    total: workflows.length,
    ready: workflows.filter(({ state }) => state === 'ready').length,
    skeleton: workflows.filter(({ state }) => state === 'skeleton').length,
    externalGate: workflows.filter(({ state }) => state === 'external-gate').length,
    steps: workflows.reduce((count, workflow) => count + workflow.steps.length, 0),
  };
}
