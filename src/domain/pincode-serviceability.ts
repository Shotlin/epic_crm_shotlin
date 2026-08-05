import type { PartyAddress } from '../shared/party-contracts';
import { currentIndiaBusinessDate, INDIA_BUSINESS_TIME_ZONE } from '../shared/india-business-date';
import type {
  CreateDeliveryPromiseInput,
  CreatePincodeServiceabilityRuleInput,
  DecidePincodeServiceabilityRuleInput,
  DeliveryPromise,
  DeliveryServiceLevel,
  FrozenDeliveryAddress,
  PincodeServiceabilityRule,
  RevenueOpsState,
  ServiceabilityWeekday,
} from '../shared/revenue-ops-contracts';

const INDIA_TIME_ZONE = INDIA_BUSINESS_TIME_ZONE;
const ALL_WEEKDAYS: ServiceabilityWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export type ServiceabilityAssessmentStatus =
  | 'serviceable'
  | 'blocked'
  | 'configuration-required'
  | 'review-required'
  | 'not-applicable';

export interface PincodeServiceabilityAssessment {
  status: ServiceabilityAssessmentStatus;
  reason: string;
  rule?: PincodeServiceabilityRule;
  dispatchBy?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  calendarBasis?: DeliveryPromise['calendarBasis'];
}

export interface AssessPincodeServiceabilityInput {
  address: FrozenDeliveryAddress;
  originLocationId: string;
  carrierAdapterId?: string;
  serviceLevel: DeliveryServiceLevel;
  paymentMode: CreateDeliveryPromiseInput['paymentMode'];
  estimatedWeightKg: number;
  orderValue: number;
  requestedAt: string;
}

export interface DeliveryPromiseDispatchItem {
  promise: DeliveryPromise;
  packageId?: string;
  packageNumber?: string;
  status: 'awaiting-package' | 'in-progress' | 'fulfilled' | 'at-risk';
}

type ScopeSource = Pick<RevenueOpsState, 'scope'>;

function isInActiveScope(state: ScopeSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

function generatedId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error('Secure identifier generation is unavailable.');
  return id;
}

function clean(value: string, label: string, minimum: number, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  }
  return normalized;
}

function dateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a real calendar date.`);
  }
  return value;
}

function normalizeStateCode(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim();
  if (!/^\d{2}$/.test(normalized)) throw new Error('Destination state code must use the two-digit GST state code.');
  return normalized;
}

function normalizePin(value: string, label: string, length: number): string {
  const normalized = value.trim();
  if (!new RegExp(`^\\d{${length}}$`).test(normalized)) {
    throw new Error(`${label} must contain exactly ${length} digits.`);
  }
  return normalized;
}

function normalizeCutoff(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw new Error('Cut-off time must use 24-hour HH:mm format in Asia/Kolkata.');
  }
  return normalized;
}

function uniqueWeekdays(days: ServiceabilityWeekday[]): ServiceabilityWeekday[] {
  const normalized = [...new Set(days)];
  if (!normalized.length || normalized.some((day) => !ALL_WEEKDAYS.includes(day))) {
    throw new Error('At least one valid weekly service day is required.');
  }
  return normalized;
}

function pinSpecificity(rule: PincodeServiceabilityRule): number {
  if (rule.pinMatchKind === 'exact') return 60;
  if (rule.pinMatchKind === 'range') return 40;
  return 10 + rule.pinStart.length;
}

function localIndiaParts(value: string): { date: string; time: string; weekday: ServiceabilityWeekday } {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error('Requested time must be a valid ISO timestamp.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const weekday = part('weekday').toLowerCase().slice(0, 3) as ServiceabilityWeekday;
  if (!ALL_WEEKDAYS.includes(weekday)) throw new Error('Unable to determine the India working day.');
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}`, weekday };
}

function weekdayForDate(value: string): ServiceabilityWeekday {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return ALL_WEEKDAYS[(day + 6) % 7]!;
}

function addBusinessDays(value: string, count: number, workingDays: ServiceabilityWeekday[]): string {
  if (!Number.isInteger(count) || count < 0) throw new Error('Business-day offsets must be whole positive numbers.');
  const cursor = new Date(`${value}T00:00:00.000Z`);
  const allowed = new Set(workingDays);
  while (!allowed.has(weekdayForDate(cursor.toISOString().slice(0, 10)))) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  let remaining = count;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (allowed.has(weekdayForDate(cursor.toISOString().slice(0, 10)))) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

function matchesPin(rule: PincodeServiceabilityRule, postalCode: string): boolean {
  if (rule.pinMatchKind === 'exact') return postalCode === rule.pinStart;
  if (rule.pinMatchKind === 'prefix') return postalCode.startsWith(rule.pinStart);
  return postalCode >= rule.pinStart && postalCode <= (rule.pinEnd ?? '');
}

function ruleIsEffective(rule: PincodeServiceabilityRule, date: string): boolean {
  return rule.status === 'active' && rule.effectiveFrom <= date && (!rule.effectiveTo || rule.effectiveTo >= date);
}

function ruleScore(rule: PincodeServiceabilityRule, carrierAdapterId?: string): readonly [number, number, number, number] {
  return [
    rule.priority,
    carrierAdapterId && rule.carrierAdapterId === carrierAdapterId ? 2 : rule.carrierAdapterId ? 0 : 1,
    rule.destinationStateCode ? 1 : 0,
    pinSpecificity(rule),
  ];
}

function sameScore(left: readonly number[], right: readonly number[]): boolean {
  return left.every((value, index) => value === right[index]);
}

function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index]! - left[index]!;
  }
  return 0;
}

function fingerprint(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `policy-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function activeOrigin(state: Pick<RevenueOpsState, 'scope' | 'stockLocations'>, id: string) {
  return state.stockLocations.find((location) => location.id === id && location.active && isInActiveScope(state, location));
}

function activeCarrier(state: Pick<RevenueOpsState, 'scope' | 'carrierAdapters'>, id: string | undefined) {
  if (!id) return undefined;
  return state.carrierAdapters.find((carrier) => carrier.id === id && carrier.status !== 'disabled' && isInActiveScope(state, carrier));
}

function assertRuleShape(input: CreatePincodeServiceabilityRuleInput): {
  code: string;
  pinStart: string;
  pinEnd?: string;
  destinationStateCode?: string;
  cutoffLocalTime?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  workingDays: ServiceabilityWeekday[];
} {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,31}$/.test(code)) {
    throw new Error('Serviceability rule code must use 2-32 letters, digits, or dashes.');
  }
  const pinLength = input.pinMatchKind === 'prefix' ? input.pinStart.trim().length : 6;
  if (input.pinMatchKind === 'prefix' && (pinLength < 1 || pinLength > 6)) {
    throw new Error('PIN prefix rules must use one to six digits.');
  }
  const pinStart = normalizePin(input.pinStart, 'PIN start', pinLength);
  const pinEnd = input.pinMatchKind === 'range'
    ? normalizePin(input.pinEnd ?? '', 'PIN end', 6)
    : undefined;
  if (input.pinMatchKind !== 'range' && input.pinEnd?.trim()) {
    throw new Error('Only PIN range rules may include a PIN end.');
  }
  if (pinEnd && pinStart > pinEnd) throw new Error('PIN range end cannot precede its start.');
  const effectiveFrom = dateOnly(input.effectiveFrom, 'Effective-from date');
  const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo, 'Effective-to date') : undefined;
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('Effective-to date cannot precede effective-from date.');
  if (!Number.isInteger(input.dispatchLeadBusinessDays) || input.dispatchLeadBusinessDays < 0 || input.dispatchLeadBusinessDays > 90) {
    throw new Error('Dispatch lead must be between 0 and 90 business days.');
  }
  if (!Number.isInteger(input.transitMinBusinessDays) || !Number.isInteger(input.transitMaxBusinessDays) || input.transitMinBusinessDays < 0 || input.transitMaxBusinessDays < input.transitMinBusinessDays || input.transitMaxBusinessDays > 120) {
    throw new Error('Transit window must use whole business days with a valid 0-120 day range.');
  }
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 10000) {
    throw new Error('Priority must be a whole number between 0 and 10,000.');
  }
  if (input.codMaximumAmount !== undefined && (!Number.isFinite(input.codMaximumAmount) || input.codMaximumAmount <= 0)) {
    throw new Error('COD maximum must be a positive amount when supplied.');
  }
  if (!input.codAllowed && input.codMaximumAmount !== undefined) {
    throw new Error('A COD maximum can only be configured when COD is allowed.');
  }
  if (input.maximumWeightKg !== undefined && (!Number.isFinite(input.maximumWeightKg) || input.maximumWeightKg <= 0)) {
    throw new Error('Maximum shipment weight must be positive when supplied.');
  }
  return {
    code,
    pinStart,
    pinEnd,
    destinationStateCode: normalizeStateCode(input.destinationStateCode),
    cutoffLocalTime: normalizeCutoff(input.cutoffLocalTime),
    effectiveFrom,
    effectiveTo,
    workingDays: uniqueWeekdays(input.workingDays),
  };
}

export function freezeDeliveryAddress(address: PartyAddress, capturedAt = new Date().toISOString()): FrozenDeliveryAddress {
  return {
    addressId: address.id,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    stateCode: address.region,
    postalCode: address.postalCode,
    countryCode: address.countryCode.trim().toUpperCase(),
    sourceVersion: address.version,
    capturedAt,
  };
}

export function createPincodeServiceabilityRule(
  state: RevenueOpsState,
  input: CreatePincodeServiceabilityRuleInput,
  actorId: string,
  id = generatedId(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const normalized = assertRuleShape(input);
  if (!activeOrigin(state, input.originLocationId)) throw new Error('Serviceability rule needs an active origin stock location.');
  if (input.carrierAdapterId && !activeCarrier(state, input.carrierAdapterId)) throw new Error('Serviceability rule references an inactive carrier boundary.');
  if (state.pincodeServiceabilityRules.some((rule) => rule.code === normalized.code)) throw new Error('Serviceability rule code already exists.');
  const rule: PincodeServiceabilityRule = {
    id,
    code: normalized.code,
    name: clean(input.name, 'Serviceability rule name', 3, 160),
    originLocationId: input.originLocationId,
    carrierAdapterId: input.carrierAdapterId,
    destinationStateCode: normalized.destinationStateCode,
    pinMatchKind: input.pinMatchKind,
    pinStart: normalized.pinStart,
    pinEnd: normalized.pinEnd,
    serviceLevel: input.serviceLevel,
    serviceable: input.serviceable,
    codAllowed: input.codAllowed,
    codMaximumAmount: input.codMaximumAmount,
    maximumWeightKg: input.maximumWeightKg,
    cutoffLocalTime: normalized.cutoffLocalTime,
    dispatchLeadBusinessDays: input.dispatchLeadBusinessDays,
    transitMinBusinessDays: input.transitMinBusinessDays,
    transitMaxBusinessDays: input.transitMaxBusinessDays,
    workingDays: normalized.workingDays,
    priority: input.priority,
    effectiveFrom: normalized.effectiveFrom,
    effectiveTo: normalized.effectiveTo,
    evidenceReference: clean(input.evidenceReference, 'Policy evidence reference', 4, 300),
    status: 'draft',
    createdBy: actorId,
    createdAt: now,
    scope: structuredClone(state.scope),
    version: 1,
  };
  return { ...state, revision: state.revision + 1, pincodeServiceabilityRules: [...state.pincodeServiceabilityRules, rule] };
}

export function decidePincodeServiceabilityRule(
  state: RevenueOpsState,
  input: DecidePincodeServiceabilityRuleInput,
  actorId: string,
  now = new Date().toISOString(),
): RevenueOpsState {
  const rule = state.pincodeServiceabilityRules.find((candidate) => candidate.id === input.id && isInActiveScope(state, candidate));
  if (!rule || rule.version !== input.expectedVersion) throw new Error('Serviceability rule changed. Refresh and retry.');
  if (input.decision === 'activate') {
    if (rule.createdBy === actorId) throw new Error('Serviceability rule maker cannot activate the same customer commitment.');
    if (!activeOrigin(state, rule.originLocationId)) throw new Error('Cannot activate a rule whose origin stock location is inactive.');
    if (rule.carrierAdapterId && !activeCarrier(state, rule.carrierAdapterId)) throw new Error('Cannot activate a rule whose carrier boundary is inactive.');
  }
  const rationale = clean(input.rationale, 'Serviceability decision rationale', 4, 500);
  const updated: PincodeServiceabilityRule = input.decision === 'activate'
    ? { ...rule, status: 'active', activatedBy: actorId, activatedAt: now, suspendedBy: undefined, suspendedAt: undefined, decisionRationale: rationale, version: rule.version + 1 }
    : { ...rule, status: 'suspended', suspendedBy: actorId, suspendedAt: now, decisionRationale: rationale, version: rule.version + 1 };
  return { ...state, revision: state.revision + 1, pincodeServiceabilityRules: state.pincodeServiceabilityRules.map((candidate) => candidate.id === updated.id ? updated : candidate) };
}

export function assessPincodeServiceability(
  state: Pick<RevenueOpsState, 'scope' | 'stockLocations' | 'carrierAdapters' | 'pincodeServiceabilityRules'>,
  input: AssessPincodeServiceabilityInput,
): PincodeServiceabilityAssessment {
  const address = input.address;
  const countryCode = address.countryCode.trim().toUpperCase();
  if (countryCode !== 'IN') {
    return { status: 'not-applicable', reason: 'Domestic PIN policy does not apply to this export or non-India address.' };
  }
  const postalCode = address.postalCode.trim();
  if (!/^\d{6}$/.test(postalCode)) {
    return { status: 'review-required', reason: 'Indian delivery promises require a six-digit PIN code on the selected address.' };
  }
  if (!/^\d{2}$/.test(address.stateCode.trim())) {
    return { status: 'review-required', reason: 'Indian delivery promises require a two-digit GST state code on the selected address.' };
  }
  if (!Number.isFinite(input.estimatedWeightKg) || input.estimatedWeightKg <= 0) {
    return { status: 'review-required', reason: 'An estimated shipment weight is required before making a delivery commitment.' };
  }
  if (!Number.isFinite(input.orderValue) || input.orderValue < 0) {
    return { status: 'review-required', reason: 'A valid order value is required before making a delivery commitment.' };
  }
  const origin = activeOrigin(state, input.originLocationId);
  if (!origin) return { status: 'review-required', reason: 'Select an active ship-from stock location.' };
  if (input.carrierAdapterId && !activeCarrier(state, input.carrierAdapterId)) {
    return { status: 'review-required', reason: 'The selected carrier boundary is unavailable or disabled.' };
  }
  const requested = localIndiaParts(input.requestedAt);
  const candidates = state.pincodeServiceabilityRules.filter((rule) =>
    isInActiveScope(state, rule) && ruleIsEffective(rule, requested.date) &&
    rule.originLocationId === origin.id &&
    rule.serviceLevel === input.serviceLevel &&
    (!input.carrierAdapterId || !rule.carrierAdapterId || rule.carrierAdapterId === input.carrierAdapterId) &&
    (!rule.destinationStateCode || rule.destinationStateCode === address.stateCode.trim()) &&
    matchesPin(rule, postalCode),
  );
  if (!candidates.length) {
    return { status: 'configuration-required', reason: 'No active internal PIN policy matches this origin, destination, and service level.' };
  }
  const ranked = candidates.map((rule) => ({ rule, score: ruleScore(rule, input.carrierAdapterId) })).sort((left, right) => compareScores(left.score, right.score));
  const winner = ranked[0]!;
  if (ranked[1] && sameScore(winner.score, ranked[1].score)) {
    return { status: 'review-required', reason: 'More than one active internal PIN policy has equal precedence. Resolve policy priority before promising delivery.' };
  }
  const rule = winner.rule;
  if (!rule.serviceable) return { status: 'blocked', reason: `Policy ${rule.code} explicitly blocks this delivery route.`, rule };
  if (input.paymentMode === 'cod' && !rule.codAllowed) return { status: 'blocked', reason: `Policy ${rule.code} does not permit cash-on-delivery.`, rule };
  if (input.paymentMode === 'cod' && rule.codMaximumAmount !== undefined && input.orderValue > rule.codMaximumAmount) {
    return { status: 'blocked', reason: `Policy ${rule.code} caps cash-on-delivery below this order value.`, rule };
  }
  if (rule.maximumWeightKg !== undefined && input.estimatedWeightKg > rule.maximumWeightKg) {
    return { status: 'blocked', reason: `Policy ${rule.code} caps shipment weight below this estimated package.`, rule };
  }
  const cutoffMissed = Boolean(rule.cutoffLocalTime && requested.time > rule.cutoffLocalTime);
  const dispatchBy = addBusinessDays(requested.date, rule.dispatchLeadBusinessDays + (cutoffMissed ? 1 : 0), rule.workingDays);
  return {
    status: 'serviceable',
    reason: `Internal policy ${rule.code} matched. The date window uses its weekly calendar only; public holidays and carrier feeds are not assumed.`,
    rule,
    dispatchBy,
    deliveryFrom: addBusinessDays(dispatchBy, rule.transitMinBusinessDays, rule.workingDays),
    deliveryTo: addBusinessDays(dispatchBy, rule.transitMaxBusinessDays, rule.workingDays),
    calendarBasis: 'weekly-policy-only',
  };
}

export function createDeliveryPromise(
  state: RevenueOpsState,
  input: CreateDeliveryPromiseInput,
  shipToAddress: FrozenDeliveryAddress,
  actorId: string,
  id = generatedId(),
  now = new Date().toISOString(),
): RevenueOpsState {
  const order = state.salesOrders.find((candidate) => candidate.id === input.salesOrderId && !['cancelled', 'completed'].includes(candidate.status) && isInActiveScope(state, candidate));
  if (!order) throw new Error('An active sales order is required for a delivery promise.');
  if (shipToAddress.addressId !== input.shipToAddressId) throw new Error('Delivery address evidence does not match the selected Party Master address.');
  if (!order.lines.some((line) => state.products.some((product) => product.id === line.catalogProductId && product.kind === 'goods' && product.active && isInActiveScope(state, product)))) {
    throw new Error('Only an active goods sales order can receive a commercial delivery promise.');
  }
  const requestedAt = input.requestedAt ?? now;
  const assessment = assessPincodeServiceability(state, {
    address: shipToAddress,
    originLocationId: input.originLocationId,
    carrierAdapterId: input.carrierAdapterId,
    serviceLevel: input.serviceLevel,
    paymentMode: input.paymentMode,
    estimatedWeightKg: input.estimatedWeightKg,
    orderValue: order.taxPreview.grandTotal,
    requestedAt,
  });
  if (assessment.status !== 'serviceable' || !assessment.rule || !assessment.dispatchBy || !assessment.deliveryFrom || !assessment.deliveryTo) {
    throw new Error(`Delivery promise cannot be created: ${assessment.reason}`);
  }
  const promise: DeliveryPromise = {
    id,
    salesOrderId: order.id,
    shipToAddress: structuredClone(shipToAddress),
    originLocationId: input.originLocationId,
    carrierAdapterId: input.carrierAdapterId ?? assessment.rule.carrierAdapterId,
    ruleId: assessment.rule.id,
    ruleCode: assessment.rule.code,
    ruleVersion: assessment.rule.version,
    serviceLevel: input.serviceLevel,
    paymentMode: input.paymentMode,
    estimatedWeightKg: input.estimatedWeightKg,
    orderValue: order.taxPreview.grandTotal,
    dispatchBy: assessment.dispatchBy,
    deliveryFrom: assessment.deliveryFrom,
    deliveryTo: assessment.deliveryTo,
    timeZone: INDIA_TIME_ZONE,
    calendarBasis: assessment.calendarBasis ?? 'weekly-policy-only',
    calculationFingerprint: fingerprint({
      orderId: order.id,
      address: shipToAddress,
      ruleId: assessment.rule.id,
      ruleVersion: assessment.rule.version,
      requestedAt,
      serviceLevel: input.serviceLevel,
      paymentMode: input.paymentMode,
      estimatedWeightKg: input.estimatedWeightKg,
      window: [assessment.dispatchBy, assessment.deliveryFrom, assessment.deliveryTo],
    }),
    status: 'active',
    createdBy: actorId,
    createdAt: now,
    scope: structuredClone(state.scope),
    version: 1,
  };
  const deliveryPromises = state.deliveryPromises.map((candidate) => isInActiveScope(state, candidate) && candidate.salesOrderId === order.id && candidate.status === 'active'
    ? { ...candidate, status: 'superseded' as const, supersededAt: now, version: candidate.version + 1 }
    : candidate);
  return { ...state, revision: state.revision + 1, deliveryPromises: [...deliveryPromises, promise] };
}

export function buildDeliveryPromiseDispatchQueue(
  state: Pick<RevenueOpsState, 'scope' | 'deliveryPromises' | 'shipmentPackages'>,
  asOfDate = currentIndiaBusinessDate(),
): DeliveryPromiseDispatchItem[] {
  return state.deliveryPromises.filter((promise) => isInActiveScope(state, promise) && ['active', 'fulfilled'].includes(promise.status)).map((promise) => {
    const shipment = state.shipmentPackages.find((candidate) => isInActiveScope(state, candidate) && candidate.deliveryPromiseId === promise.id);
    const status: DeliveryPromiseDispatchItem['status'] = promise.status === 'fulfilled'
      ? 'fulfilled'
      : !shipment
        ? (promise.dispatchBy < asOfDate ? 'at-risk' : 'awaiting-package')
        : ['delivered', 'returned'].includes(shipment.status)
          ? 'fulfilled'
          : promise.deliveryTo < asOfDate
            ? 'at-risk'
            : 'in-progress';
    return { promise: structuredClone(promise), packageId: shipment?.id, packageNumber: shipment?.number, status };
  }).sort((left, right) => left.promise.deliveryTo.localeCompare(right.promise.deliveryTo));
}
