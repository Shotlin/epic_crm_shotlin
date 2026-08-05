import { randomUUID } from 'node:crypto';
import type {
  CreateProjectContractVariationInput,
  CreateProjectCurrencyProfileInput,
  CreateProjectExchangeRateInput,
  CreateProjectResourcePlanInput,
  CreateProjectRetainerInput,
  CreateRetainerDrawdownInput,
  DecideProjectContractVariationInput,
  DecideProjectCurrencyProfileInput,
  DecideProjectExchangeRateInput,
  DecideProjectResourcePlanInput,
  DecideProjectRetainerInput,
  DecideRetainerDrawdownInput,
  GenerateProjectMarginReviewInput,
  ProjectCommercialCurrency,
  ProjectCurrencyProfile,
  ProjectExchangeRate,
  ReviewProjectMarginInput,
} from '../shared/project-commercial-contracts';
import type { RevenueOpsState } from '../shared/revenue-ops-contracts';

const mutate = (state: RevenueOpsState): RevenueOpsState => { const next = structuredClone(state); next.revision += 1; return next; };
const money = (value: number): number => Math.round(value * 100) / 100;
const hours = (value: number): number => Number(value.toFixed(4));
const clean = (value: string, label: string, min = 2, max = 500): string => { const normalized = value.trim().replace(/\s+/g, ' '); if (normalized.length < min || normalized.length > max) throw new Error(`${label} must contain ${min}-${max} characters.`); return normalized; };
const validDate = (value: string, label: string): string => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) throw new Error(`${label} must use YYYY-MM-DD.`); return value; };
const fiscalNumber = (prefix: string, sequence: number, at: string): string => { const date = new Date(at); const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; return `${prefix}-${String(year).slice(-2)}-${String(year + 1).slice(-2)}-${String(sequence).padStart(5, '0')}`; };
const datesOverlap = (leftFrom: string, leftTo: string, rightFrom: string, rightTo: string): boolean => leftFrom <= rightTo && rightFrom <= leftTo;
const daysInclusive = (from: string, to: string): number => Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;

function currentProject(state: RevenueOpsState, projectId: string) {
  const project = state.deliveryProjects.find((item) => item.id === projectId && ['active', 'on-hold'].includes(item.status));
  if (!project) throw new Error('Project commercial control requires an active or on-hold delivery project.');
  return project;
}

function projectManager(state: RevenueOpsState, projectId: string, actorId: string) {
  const project = currentProject(state, projectId);
  if (project.managerUserId !== actorId) throw new Error('Only the delivery project manager can submit this commercial control.');
  return project;
}

function activeProfile(state: RevenueOpsState, projectId: string): ProjectCurrencyProfile | undefined {
  return state.projectCurrencyProfiles.find((profile) => profile.projectId === projectId && profile.status === 'active');
}

function verifiedRate(state: RevenueOpsState, id: string | undefined, sourceCurrency: ProjectCommercialCurrency, onDate: string): ProjectExchangeRate | undefined {
  if (sourceCurrency === 'INR') return undefined;
  const rate = state.projectExchangeRates.find((item) => item.id === id && item.status === 'verified');
  if (!rate || rate.sourceCurrency !== sourceCurrency || rate.targetCurrency !== 'INR' || rate.effectiveFrom > onDate || rate.effectiveTo < onDate) throw new Error('A verified INR exchange-rate evidence record covering this commercial date is required.');
  return rate;
}

function commercialContext(state: RevenueOpsState, projectId: string, onDate: string) {
  const profile = activeProfile(state, projectId);
  if (!profile) return { currency: 'INR' as const, rateId: undefined, rate: 1, baseRevenueInr: currentProject(state, projectId).budgetAmount };
  const rate = verifiedRate(state, profile.exchangeRateId, profile.contractCurrency, onDate);
  return { currency: profile.contractCurrency, rateId: rate?.id, rate: rate?.rate ?? 1, baseRevenueInr: profile.baselineAmountInr };
}

function ensureCommercialMaker(checker: string | undefined, actorId: string, label: string): void {
  if (checker === actorId) throw new Error(`${label} maker cannot decide the same record.`);
}

export function createProjectExchangeRate(state: RevenueOpsState, input: CreateProjectExchangeRateInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const effectiveFrom = validDate(input.effectiveFrom, 'Exchange-rate effective-from date'); const effectiveTo = validDate(input.effectiveTo, 'Exchange-rate effective-to date');
  if (effectiveTo < effectiveFrom || !Number.isFinite(input.rate) || input.rate <= 0 || input.rate > 10_000_000) throw new Error('Exchange-rate period or rate is invalid.');
  const next = mutate(state); next.projectExchangeRates.unshift({ id, number: fiscalNumber('PFX', state.projectExchangeRates.length + 1, now), sourceCurrency: input.sourceCurrency, targetCurrency: 'INR', rate: money(input.rate), effectiveFrom, effectiveTo, sourceReference: clean(input.sourceReference, 'Exchange-rate source reference', 3, 160), evidenceReference: clean(input.evidenceReference, 'Exchange-rate evidence reference', 3, 240), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideProjectExchangeRate(state: RevenueOpsState, input: DecideProjectExchangeRateInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const rate = state.projectExchangeRates.find((item) => item.id === input.id);
  if (!rate || rate.status !== 'submitted' || rate.version !== input.expectedVersion) throw new Error('Exchange-rate record is stale or no longer awaiting verification.'); ensureCommercialMaker(rate.requestedBy, actorId, 'Exchange-rate');
  const next = mutate(state); next.projectExchangeRates = next.projectExchangeRates.map((item) => item.id === rate.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Exchange-rate decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createProjectCurrencyProfile(state: RevenueOpsState, input: CreateProjectCurrencyProfileInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const project = projectManager(state, input.projectId, actorId);
  if (state.projectCurrencyProfiles.some((profile) => profile.projectId === project.id && ['submitted', 'active'].includes(profile.status))) throw new Error('The project already has a current currency-profile request.');
  if (!Number.isFinite(input.contractBaselineAmount) || input.contractBaselineAmount < 0 || input.contractBaselineAmount > 1_000_000_000_000) throw new Error('Contract baseline amount is invalid.');
  const rate = verifiedRate(state, input.exchangeRateId, input.contractCurrency, project.startDate);
  if (input.contractCurrency === 'INR' && input.exchangeRateId) throw new Error('INR project profiles cannot carry a foreign-currency exchange rate.');
  const next = mutate(state); next.projectCurrencyProfiles.unshift({ id, number: fiscalNumber('PCP', state.projectCurrencyProfiles.length + 1, now), projectId: project.id, contractCurrency: input.contractCurrency, functionalCurrency: 'INR', contractBaselineAmount: money(input.contractBaselineAmount), baselineAmountInr: money(input.contractBaselineAmount * (rate?.rate ?? 1)), conversionBasis: input.conversionBasis, exchangeRateId: rate?.id, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideProjectCurrencyProfile(state: RevenueOpsState, input: DecideProjectCurrencyProfileInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const profile = state.projectCurrencyProfiles.find((item) => item.id === input.id);
  if (!profile || profile.status !== 'submitted' || profile.version !== input.expectedVersion) throw new Error('Project currency profile is stale or no longer awaiting activation.'); ensureCommercialMaker(profile.requestedBy, actorId, 'Project currency profile');
  const project = currentProject(state, profile.projectId); if (input.decision === 'active') { verifiedRate(state, profile.exchangeRateId, profile.contractCurrency, project.startDate); if (state.projectCurrencyProfiles.some((item) => item.id !== profile.id && item.projectId === profile.projectId && item.status === 'active')) throw new Error('A project can have only one active currency profile.'); }
  const next = mutate(state); next.projectCurrencyProfiles = next.projectCurrencyProfiles.map((item) => item.id === profile.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Project currency-profile decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createProjectContractVariation(state: RevenueOpsState, input: CreateProjectContractVariationInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const project = projectManager(state, input.projectId, actorId); const effectiveDate = validDate(input.effectiveDate, 'Variation effective date');
  if (effectiveDate < project.startDate || effectiveDate > project.targetDate || !Number.isFinite(input.amountDelta) || Math.abs(input.amountDelta) > 1_000_000_000_000) throw new Error('Variation amount or effective date is invalid.');
  const context = commercialContext(state, project.id, effectiveDate);
  const next = mutate(state); next.projectContractVariations.unshift({ id, number: fiscalNumber('PCV', state.projectContractVariations.length + 1, now), projectId: project.id, title: clean(input.title, 'Variation title'), kind: input.kind, amountDelta: money(input.amountDelta), amountDeltaInr: money(input.amountDelta * context.rate), currency: context.currency, effectiveDate, rationale: clean(input.rationale, 'Variation rationale', 4), evidenceReference: clean(input.evidenceReference, 'Variation evidence reference', 3, 240), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideProjectContractVariation(state: RevenueOpsState, input: DecideProjectContractVariationInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const variation = state.projectContractVariations.find((item) => item.id === input.id);
  if (!variation || variation.status !== 'submitted' || variation.version !== input.expectedVersion) throw new Error('Project contract variation is stale or no longer awaiting approval.'); ensureCommercialMaker(variation.requestedBy, actorId, 'Project contract variation');
  const next = mutate(state); next.projectContractVariations = next.projectContractVariations.map((item) => item.id === variation.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Variation decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createProjectRetainer(state: RevenueOpsState, input: CreateProjectRetainerInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const project = projectManager(state, input.projectId, actorId); const effectiveFrom = validDate(input.effectiveFrom, 'Retainer effective-from date'); const effectiveTo = validDate(input.effectiveTo, 'Retainer effective-to date');
  if (effectiveTo < effectiveFrom || effectiveFrom < project.startDate || effectiveTo > project.targetDate || !Number.isFinite(input.contractAmount) || input.contractAmount <= 0 || input.contractAmount > 1_000_000_000_000 || !Number.isFinite(input.includedHours) || input.includedHours <= 0 || input.includedHours > 10_000_000) throw new Error('Retainer period, amount, or included hours are invalid.');
  const context = commercialContext(state, project.id, effectiveFrom);
  const next = mutate(state); next.projectRetainers.unshift({ id, number: fiscalNumber('PTR', state.projectRetainers.length + 1, now), projectId: project.id, accountId: project.accountId, name: clean(input.name, 'Retainer name'), currency: context.currency, contractAmount: money(input.contractAmount), contractAmountInr: money(input.contractAmount * context.rate), includedHours: hours(input.includedHours), effectiveFrom, effectiveTo, billingCadence: input.billingCadence, evidenceReference: clean(input.evidenceReference, 'Retainer evidence reference', 3, 240), status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideProjectRetainer(state: RevenueOpsState, input: DecideProjectRetainerInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const retainer = state.projectRetainers.find((item) => item.id === input.id);
  if (!retainer || retainer.status !== 'submitted' || retainer.version !== input.expectedVersion) throw new Error('Project retainer is stale or no longer awaiting activation.'); ensureCommercialMaker(retainer.requestedBy, actorId, 'Project retainer');
  const next = mutate(state); next.projectRetainers = next.projectRetainers.map((item) => item.id === retainer.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Retainer decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function createRetainerDrawdown(state: RevenueOpsState, input: CreateRetainerDrawdownInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const retainer = state.projectRetainers.find((item) => item.id === input.retainerId && item.status === 'active'); if (!retainer) throw new Error('Only an active project retainer may be drawn down.'); projectManager(state, retainer.projectId, actorId);
  const timeEntryIds = [...new Set(input.timeEntryIds)]; if (!timeEntryIds.length || timeEntryIds.length !== input.timeEntryIds.length) throw new Error('Retainer drawdown needs one or more unique approved billable time entries.');
  const entries = timeEntryIds.map((idValue) => state.timeEntries.find((entry) => entry.id === idValue));
  if (entries.some((entry) => !entry || entry.status !== 'approved' || !entry.billable || entry.projectId !== retainer.projectId || entry.workDate < retainer.effectiveFrom || entry.workDate > retainer.effectiveTo)) throw new Error('Retainer drawdown requires approved, billable project time within the retainer period.');
  if (state.retainerDrawdowns.some((drawdown) => drawdown.retainerId === retainer.id && drawdown.status !== 'rejected' && drawdown.timeEntryIds.some((entryId) => timeEntryIds.includes(entryId)))) throw new Error('A time entry may be used only once in a current retainer drawdown.');
  const totalHours = hours(entries.reduce((total, entry) => total + entry!.hours, 0)); const previouslyDrawn = state.retainerDrawdowns.filter((drawdown) => drawdown.retainerId === retainer.id && drawdown.status !== 'rejected').reduce((total, drawdown) => total + drawdown.hours, 0);
  if (previouslyDrawn + totalHours > retainer.includedHours) throw new Error('Retainer drawdown exceeds the contracted included-hours balance.');
  const amount = money((totalHours / retainer.includedHours) * retainer.contractAmount); const amountInr = money((totalHours / retainer.includedHours) * retainer.contractAmountInr);
  const next = mutate(state); next.retainerDrawdowns.unshift({ id, number: fiscalNumber('PTD', state.retainerDrawdowns.length + 1, now), retainerId: retainer.id, projectId: retainer.projectId, timeEntryIds, hours: totalHours, amount, amountInr, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideRetainerDrawdown(state: RevenueOpsState, input: DecideRetainerDrawdownInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const drawdown = state.retainerDrawdowns.find((item) => item.id === input.id);
  if (!drawdown || drawdown.status !== 'submitted' || drawdown.version !== input.expectedVersion) throw new Error('Retainer drawdown is stale or no longer awaiting review.'); ensureCommercialMaker(drawdown.requestedBy, actorId, 'Retainer drawdown');
  const next = mutate(state); next.retainerDrawdowns = next.retainerDrawdowns.map((item) => item.id === drawdown.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Retainer-drawdown decision remarks', 4), version: item.version + 1 } : item); return next;
}

function overlappingPlannedHours(state: RevenueOpsState, workforceProfileId: string, periodFrom: string, periodTo: string): number {
  return state.projectResourcePlans.filter((plan) => plan.workforceProfileId === workforceProfileId && plan.status === 'active' && datesOverlap(plan.periodFrom, plan.periodTo, periodFrom, periodTo)).reduce((total, plan) => {
    const overlapFrom = plan.periodFrom > periodFrom ? plan.periodFrom : periodFrom; const overlapTo = plan.periodTo < periodTo ? plan.periodTo : periodTo;
    return total + plan.plannedHours * (daysInclusive(overlapFrom, overlapTo) / daysInclusive(plan.periodFrom, plan.periodTo));
  }, 0);
}

export function createProjectResourcePlan(state: RevenueOpsState, input: CreateProjectResourcePlanInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const project = projectManager(state, input.projectId, actorId); const profile = state.workforceProfiles.find((item) => item.id === input.workforceProfileId && item.status === 'active'); if (!profile) throw new Error('Resource plan requires an active workforce profile.');
  const periodFrom = validDate(input.periodFrom, 'Resource-plan period-from date'); const periodTo = validDate(input.periodTo, 'Resource-plan period-to date');
  if (periodTo < periodFrom || periodFrom < project.startDate || periodTo > project.targetDate || !Number.isFinite(input.plannedHours) || input.plannedHours <= 0 || input.plannedHours > 10_000_000) throw new Error('Resource-plan period or hours are invalid.');
  const capacity = profile.standardDailyHours * daysInclusive(periodFrom, periodTo); if (overlappingPlannedHours(state, profile.id, periodFrom, periodTo) + input.plannedHours > capacity) throw new Error('Resource plan exceeds the workforce member’s planned period capacity.');
  const next = mutate(state); next.projectResourcePlans.unshift({ id, number: fiscalNumber('PRP', state.projectResourcePlans.length + 1, now), projectId: project.id, workforceProfileId: profile.id, userId: profile.userId, periodFrom, periodTo, plannedHours: hours(input.plannedHours), hourlyCost: profile.hourlyCost, plannedCostInr: money(input.plannedHours * profile.hourlyCost), billable: input.billable, status: 'submitted', requestedBy: actorId, requestedAt: now, version: 1 }); return next;
}

export function decideProjectResourcePlan(state: RevenueOpsState, input: DecideProjectResourcePlanInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const plan = state.projectResourcePlans.find((item) => item.id === input.id);
  if (!plan || plan.status !== 'submitted' || plan.version !== input.expectedVersion) throw new Error('Project resource plan is stale or no longer awaiting activation.'); ensureCommercialMaker(plan.requestedBy, actorId, 'Project resource plan');
  if (input.decision === 'active') { const profile = state.workforceProfiles.find((item) => item.id === plan.workforceProfileId && item.status === 'active'); if (!profile || overlappingPlannedHours(state, plan.workforceProfileId, plan.periodFrom, plan.periodTo) + plan.plannedHours > profile.standardDailyHours * daysInclusive(plan.periodFrom, plan.periodTo)) throw new Error('Resource plan exceeds currently available workforce planning capacity.'); }
  const next = mutate(state); next.projectResourcePlans = next.projectResourcePlans.map((item) => item.id === plan.id ? { ...item, status: input.decision, decidedBy: actorId, decidedAt: now, decisionRemarks: clean(input.remarks, 'Resource-plan decision remarks', 4), version: item.version + 1 } : item); return next;
}

export function generateProjectMarginReview(state: RevenueOpsState, input: GenerateProjectMarginReviewInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const project = projectManager(state, input.projectId, actorId); const asOfDate = validDate(input.asOfDate, 'Margin-review as-of date'); const context = commercialContext(state, project.id, asOfDate);
  const approvedVariationInr = money(state.projectContractVariations.filter((variation) => variation.projectId === project.id && variation.status === 'approved' && variation.effectiveDate <= asOfDate).reduce((total, variation) => total + variation.amountDeltaInr, 0));
  const retainerCoverageInr = money(state.projectRetainers.filter((retainer) => retainer.projectId === project.id && retainer.status === 'active' && retainer.effectiveFrom <= asOfDate).reduce((total, retainer) => total + retainer.contractAmountInr, 0));
  const recognizedEvidenceInr = money(state.projectBillingClaims.filter((claim) => claim.projectId === project.id && ['recognized', 'invoiced'].includes(claim.status)).reduce((total, claim) => total + claim.recognizedAmount * context.rate, 0));
  const approvedDeliveryCostInr = money(state.timeEntries.filter((entry) => entry.projectId === project.id && entry.status === 'approved' && entry.workDate <= asOfDate).reduce((total, entry) => total + entry.costAmount, 0));
  const plannedResourceCostInr = money(state.projectResourcePlans.filter((plan) => plan.projectId === project.id && plan.status === 'active').reduce((total, plan) => total + plan.plannedCostInr, 0));
  const forecastRevenueInr = money(context.baseRevenueInr + approvedVariationInr); const forecastCostInr = Math.max(approvedDeliveryCostInr, plannedResourceCostInr); const forecastMarginInr = money(forecastRevenueInr - forecastCostInr); const forecastMarginPercent = forecastRevenueInr ? Number(((forecastMarginInr / forecastRevenueInr) * 100).toFixed(2)) : 0;
  const next = mutate(state); next.projectMarginReviews.unshift({ id, number: fiscalNumber('PMR', state.projectMarginReviews.length + 1, now), projectId: project.id, asOfDate, contractCurrency: context.currency, exchangeRateId: context.rateId, baseRevenueInr: money(context.baseRevenueInr), approvedVariationInr, retainerCoverageInr, forecastRevenueInr, recognizedEvidenceInr, approvedDeliveryCostInr, plannedResourceCostInr, forecastCostInr, forecastMarginInr, forecastMarginPercent, status: 'generated', generatedBy: actorId, generatedAt: now, version: 1 }); return next;
}

export function reviewProjectMargin(state: RevenueOpsState, input: ReviewProjectMarginInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const review = state.projectMarginReviews.find((item) => item.id === input.id);
  if (!review || review.status !== 'generated' || review.version !== input.expectedVersion) throw new Error('Project margin review is stale or no longer awaiting review.'); ensureCommercialMaker(review.generatedBy, actorId, 'Project margin review');
  const next = mutate(state); next.projectMarginReviews = next.projectMarginReviews.map((item) => item.id === review.id ? { ...item, status: input.decision, reviewedBy: actorId, reviewedAt: now, reviewRemarks: clean(input.remarks, 'Margin-review remarks', 4), version: item.version + 1 } : item); return next;
}
