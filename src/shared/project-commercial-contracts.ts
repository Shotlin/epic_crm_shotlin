export type ProjectCommercialStatus = 'submitted' | 'active' | 'rejected' | 'cancelled';
export type ProjectCommercialCurrency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'AUD' | 'CAD' | 'JPY';

export interface ProjectExchangeRate {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  sourceCurrency: ProjectCommercialCurrency;
  targetCurrency: 'INR';
  rate: number;
  effectiveFrom: string;
  effectiveTo: string;
  sourceReference: string;
  evidenceReference: string;
  status: 'submitted' | 'verified' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface ProjectCurrencyProfile {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  projectId: string;
  contractCurrency: ProjectCommercialCurrency;
  functionalCurrency: 'INR';
  contractBaselineAmount: number;
  baselineAmountInr: number;
  conversionBasis: 'verified-spot' | 'contractual';
  exchangeRateId?: string;
  status: ProjectCommercialStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface ProjectContractVariation {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  projectId: string;
  title: string;
  kind: 'scope' | 'rate' | 'schedule' | 'commercial';
  amountDelta: number;
  amountDeltaInr: number;
  currency: ProjectCommercialCurrency;
  effectiveDate: string;
  rationale: string;
  evidenceReference: string;
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface ProjectRetainer {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  projectId: string;
  accountId?: string;
  name: string;
  currency: ProjectCommercialCurrency;
  contractAmount: number;
  contractAmountInr: number;
  includedHours: number;
  effectiveFrom: string;
  effectiveTo: string;
  billingCadence: 'monthly' | 'quarterly' | 'one-time';
  evidenceReference: string;
  status: ProjectCommercialStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface RetainerDrawdown {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  retainerId: string;
  projectId: string;
  timeEntryIds: string[];
  hours: number;
  amount: number;
  amountInr: number;
  status: 'submitted' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface ProjectResourcePlan {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  projectId: string;
  workforceProfileId: string;
  userId: string;
  periodFrom: string;
  periodTo: string;
  plannedHours: number;
  hourlyCost: number;
  plannedCostInr: number;
  billable: boolean;
  status: ProjectCommercialStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionRemarks?: string;
  version: number;
}

export interface ProjectMarginReview {
  scope?: OperatingRecordScope;
  id: string;
  number: string;
  projectId: string;
  asOfDate: string;
  contractCurrency: ProjectCommercialCurrency;
  exchangeRateId?: string;
  baseRevenueInr: number;
  approvedVariationInr: number;
  retainerCoverageInr: number;
  forecastRevenueInr: number;
  recognizedEvidenceInr: number;
  approvedDeliveryCostInr: number;
  plannedResourceCostInr: number;
  forecastCostInr: number;
  forecastMarginInr: number;
  forecastMarginPercent: number;
  status: 'generated' | 'reviewed' | 'rejected';
  generatedBy: string;
  generatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
  version: number;
}

export interface CreateProjectExchangeRateInput { sourceCurrency: Exclude<ProjectCommercialCurrency, 'INR'>; rate: number; effectiveFrom: string; effectiveTo: string; sourceReference: string; evidenceReference: string }
export interface DecideProjectExchangeRateInput { id: string; decision: 'verified' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateProjectCurrencyProfileInput { projectId: string; contractCurrency: ProjectCommercialCurrency; contractBaselineAmount: number; conversionBasis: ProjectCurrencyProfile['conversionBasis']; exchangeRateId?: string }
export interface DecideProjectCurrencyProfileInput { id: string; decision: 'active' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateProjectContractVariationInput { projectId: string; title: string; kind: ProjectContractVariation['kind']; amountDelta: number; effectiveDate: string; rationale: string; evidenceReference: string }
export interface DecideProjectContractVariationInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateProjectRetainerInput { projectId: string; name: string; contractAmount: number; includedHours: number; effectiveFrom: string; effectiveTo: string; billingCadence: ProjectRetainer['billingCadence']; evidenceReference: string }
export interface DecideProjectRetainerInput { id: string; decision: 'active' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateRetainerDrawdownInput { retainerId: string; timeEntryIds: string[] }
export interface DecideRetainerDrawdownInput { id: string; decision: 'approved' | 'rejected'; remarks: string; expectedVersion: number }
export interface CreateProjectResourcePlanInput { projectId: string; workforceProfileId: string; periodFrom: string; periodTo: string; plannedHours: number; billable: boolean }
export interface DecideProjectResourcePlanInput { id: string; decision: 'active' | 'rejected'; remarks: string; expectedVersion: number }
export interface GenerateProjectMarginReviewInput { projectId: string; asOfDate: string }
export interface ReviewProjectMarginInput { id: string; decision: 'reviewed' | 'rejected'; remarks: string; expectedVersion: number }
import type { OperatingRecordScope } from './revenue-ops-contracts';
