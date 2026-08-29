import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountingJournalDraft,
  JournalLine,
  QuoteTaxPreview,
  RevenueOpsState,
  TaxInvoice,
} from '../shared/revenue-ops-contracts';
import type {
  CheckoutRetailSaleInput,
  CreateRetailCounterInput,
  DecideRetailCashierShiftCloseInput,
  DecideRetailCashierShiftVarianceResolutionInput,
  OpenRetailCashierShiftInput,
  RequestRetailCashierShiftCloseInput,
  RequestRetailCashierShiftVarianceResolutionInput,
  RetailCashierShift,
  RetailCounter,
  RetailSale,
  RetailSaleLine,
  RetailVoucherRedemptionEvidence,
  RetailTenderMethod,
  RetailTender,
} from '../shared/retail-pos-contracts';
import { retailSaleLineToInvoiceLine } from '../shared/retail-pos-contracts';
import { toIndiaBusinessDate } from '../shared/india-business-date';
import type { RetailPromotionRedemption } from '../shared/retail-promotion-contracts';
import { evaluateRetailPromotion } from './retail-promotions';
import { accrueRetailLoyaltyPoints, calculateLoyaltyPointsAccrued, validateLoyaltyRedemption, validateRetailVoucher, redeemRetailLoyaltyPoints } from './retail-loyalty-promotions';
import { issueRetailInventoryAtCounter } from './inventory-warehouse';
import { issueInvoice, recordPayment } from './order-to-cash';
import { assertCreditAvailable } from './collections-finance';
import { isIndiaStateCode, validateGstin } from './revenue-ops';

const money = (value: number): number => Math.round(value * 100) / 100;
const clean = (value: string, label: string, minimum = 2, maximum = 180): string => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  return normalized;
};
const positiveMoney = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0 || money(value) !== value) throw new Error(`${label} must be a positive amount in paise.`);
  return value;
};
const nonNegativeMoney = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0 || money(value) !== value) throw new Error(`${label} must be a non-negative amount in paise.`);
  return value;
};
const quantity = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return Number(value.toFixed(6));
};
const sameScope = (state: RevenueOpsState, value: { scope?: RevenueOpsState['scope'] }): boolean => {
  const scope = value.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
};
const assertScope = (state: RevenueOpsState, values: Array<{ scope?: RevenueOpsState['scope'] }>, label: string): void => {
  if (values.some((value) => !sameScope(state, value))) throw new Error(`${label} must belong to the active company and branch scope.`);
};
const effective = (from: string, to: string | undefined, at: string): boolean => from <= at && (!to || to >= at);
const checksum = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fiscalNumber = (prefix: string, index: number, at: string): string => {
  const [yearToken, monthToken] = toIndiaBusinessDate(at).split('-');
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error('Retail business date is invalid.');
  const start = month >= 4 ? year : year - 1;
  return `${prefix}/${String(start).slice(-2)}-${String(start + 1).slice(-2)}/${String(index).padStart(5, '0')}`;
};
const addDays = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) throw new Error('Retail invoice date is invalid.');
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

function mutate(state: RevenueOpsState): RevenueOpsState {
  const next = structuredClone(state);
  next.revision += 1;
  return next;
}

function counterFor(state: RevenueOpsState, id: string): RetailCounter {
  const counter = state.retailCounters.find((candidate) => candidate.id === id && candidate.active);
  if (!counter || !sameScope(state, counter)) throw new Error('Active retail counter not found in the current operating scope.');
  return counter;
}

function counterConfiguration(state: RevenueOpsState, counter: RetailCounter, at: string): {
  warehouse: RevenueOpsState['warehouses'][number];
  bin: RevenueOpsState['storageBins'][number];
  priceList: RevenueOpsState['priceLists'][number];
  paymentTerm: RevenueOpsState['paymentTerms'][number];
} {
  const warehouse = state.warehouses.find(({ id, active }) => id === counter.warehouseId && active);
  const bin = state.storageBins.find(({ id, status }) => id === counter.sellFromBinId && status === 'available');
  const resolvedZone = bin && state.warehouseZones.find(({ id }) => id === bin.zoneId);
  const priceList = state.priceLists.find(({ id, status, active, effectiveFrom, effectiveTo }) =>
    id === counter.priceListId && status === 'active' && active && effective(effectiveFrom, effectiveTo, at),
  );
  const paymentTerm = state.paymentTerms.find(({ id, active }) => id === counter.paymentTermId && active);
  if (!warehouse || !bin || !resolvedZone || resolvedZone.warehouseId !== warehouse.id || (resolvedZone.purpose !== 'storage' && resolvedZone.purpose !== 'picking')) {
    throw new Error('Retail counter sell-from bin is not an available storage or picking bin in its warehouse.');
  }
  if (!priceList || (priceList.channel !== 'all' && priceList.channel !== 'retail')) throw new Error('Retail counter requires an active retail price list on the checkout date.');
  if (!paymentTerm || paymentTerm.dueDays !== 0) throw new Error('Retail counter requires an active due-on-receipt payment term.');
  assertScope(state, [warehouse, bin, resolvedZone, priceList, paymentTerm], 'Retail counter configuration');
  return { warehouse, bin, priceList, paymentTerm };
}

function requestChecksum(input: CheckoutRetailSaleInput, customerAccountId: string): string {
  const normalized = {
    counterId: input.counterId,
    cashierShiftId: input.cashierShiftId,
    transactionKey: input.transactionKey.trim(),
    customerAccountId,
    loyaltyPointsToRedeem: input.loyaltyPointsToRedeem ?? 0,
    loyaltyAccountVersion: input.loyaltyAccountVersion ?? 0,
    voucherCode: input.voucherCode?.trim().toUpperCase() ?? '',
    voucherVersion: input.voucherVersion ?? 0,
    saleAt: input.saleAt,
    discountPolicyIds: [...new Set(input.discountPolicyIds)].sort(),
    lines: input.lines.map((line) => ({
      itemVariantId: line.itemVariantId,
      binId: line.binId,
      batchId: line.batchId ?? '',
      serialUnitIds: [...line.serialUnitIds].sort(),
      quantity: line.quantity,
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    tenders: input.tenders.map((tender) => ({
      method: tender.method,
      amount: tender.amount,
      reference: tender.reference.trim().toUpperCase(),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
  return checksum(normalized);
}

type RetailVoucherCheckoutPlan = Omit<RetailVoucherRedemptionEvidence, 'redeemedAt'>;

/**
 * Voucher input is deliberately not trusted merely because a renderer showed
 * a green badge. The sale boundary resolves the code from persisted, scoped
 * configuration and freezes the exact version that passed its live checks.
 */
function planRetailVoucherCheckout(
  state: RevenueOpsState,
  input: CheckoutRetailSaleInput,
  subtotal: number,
  businessDate: string,
): RetailVoucherCheckoutPlan | undefined {
  const suppliedCode = input.voucherCode?.trim();
  const suppliedVersion = input.voucherVersion;
  if (Boolean(suppliedCode) !== (suppliedVersion !== undefined)) {
    throw new Error('Retail voucher code and version must be supplied together.');
  }
  if (!suppliedCode) return undefined;
  if (suppliedVersion === undefined || !Number.isInteger(suppliedVersion) || suppliedVersion <= 0) throw new Error('Retail voucher version must be a positive integer.');
  const voucherCode = clean(suppliedCode, 'Retail voucher code', 2, 64).toUpperCase();
  const matches = state.retailVouchers.filter((candidate) => candidate.code.trim().toUpperCase() === voucherCode && sameScope(state, candidate));
  if (matches.length !== 1) throw new Error(`Retail voucher ${voucherCode} is not configured in the current operating scope.`);
  const voucher = matches[0]!;
  if (voucher.version !== suppliedVersion) throw new Error(`Retail voucher ${voucherCode} changed. Refresh and retry.`);
  const validation = validateRetailVoucher(voucher, subtotal, businessDate);
  if (!validation.valid) throw new Error(validation.reason ?? `Retail voucher ${voucherCode} is not valid.`);
  return {
    voucherId: voucher.id,
    voucherCode,
    voucherVersion: voucher.version,
    discountAmount: validation.discountAmount,
    eligibleSubtotal: subtotal,
  };
}

function journal(sourceId: string, sourceNumber: string, postingDate: string, lines: JournalLine[]): AccountingJournalDraft {
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  if (totalDebit !== totalCredit || totalDebit <= 0) throw new Error('Retail cost handoff must be balanced and positive.');
  const unsigned = { sourceType: 'retail-sale-cost' as const, sourceId, sourceNumber, postingDate, lines: normalized, totalDebit, totalCredit };
  return {
    id: randomUUID(),
    ...unsigned,
    status: 'ready',
    checksum: checksum(unsigned),
    version: 1,
  };
}

function selectedDiscounts(state: RevenueOpsState, ids: string[], at: string, customerAccountId?: string) {
  const uniqueIds = [...new Set(ids)];
  const policies = uniqueIds.map((id) => state.discountPolicies.find((candidate) =>
    candidate.id === id && candidate.active && effective(candidate.effectiveFrom, candidate.effectiveTo, at) &&
      (candidate.operatingScope ?? state.scope).companyId === state.scope.companyId &&
      (candidate.operatingScope ?? state.scope).branchId === state.scope.branchId,
  ));
  if (policies.some((policy) => !policy) || policies.length !== uniqueIds.length) throw new Error('A selected retail discount policy is missing, inactive, or ineffective.');
  return (policies as NonNullable<typeof policies[number]>[]).filter((policy) => !policy.eligibleCustomerAccountIds?.length || Boolean(customerAccountId && policy.eligibleCustomerAccountIds.includes(customerAccountId)));
}

type ProvisionalRetailLine = {
  inputLine: CheckoutRetailSaleInput['lines'][number];
  checkedQuantity: number;
  product: RevenueOpsState['products'][number];
  item: RevenueOpsState['inventoryItems'][number];
  merchandisingProfile: RevenueOpsState['retailMerchandisingProfiles'][number] | undefined;
  taxCode: RevenueOpsState['taxCodes'][number];
  priceEntry: RevenueOpsState['priceListEntries'][number];
  taxableValue: number;
  listUnitPrice: number;
  giftPolicyId?: string;
};

function priceRetailLines(
  state: RevenueOpsState,
  counter: RetailCounter,
  input: CheckoutRetailSaleInput,
  businessDate: string,
): { lines: RetailSaleLine[]; subtotal: number; discountTotal: number; taxPreview: QuoteTaxPreview; promotionRedemptions: Array<{ policyId: string; campaignCode?: string; discountAmount: number; giftQuantity: number }>; voucherRedemption?: RetailVoucherCheckoutPlan; recipientTreatment: 'registered' | 'unregistered'; recipientGstin: string; placeOfSupplyStateCode: string } {
  if (!input.lines.length || input.lines.length > 500) throw new Error('Retail checkout requires between 1 and 500 lines.');
  const { bin, warehouse } = counterConfiguration(state, counter, businessDate);
  if (!state.profile.gstRegistered || !state.profile.gstin) throw new Error('Retail GST checkout requires a configured GST-registered supplier profile.');
  if (!isIndiaStateCode(warehouse.stateCode)) throw new Error('Retail warehouse state is invalid.');
  const recipientTreatment = input.recipientTreatment ?? 'unregistered';
  const placeOfSupplyStateCode = input.placeOfSupplyStateCode ?? warehouse.stateCode;
  if (!isIndiaStateCode(placeOfSupplyStateCode)) throw new Error('Retail place of supply state is invalid.');
  if (recipientTreatment === 'registered' && !input.customerAccountId) throw new Error('B2B counter invoices require a named customer account.');
  const recipientGstin = recipientTreatment === 'registered' ? validateGstin(input.recipientGstin ?? '', placeOfSupplyStateCode) : '';
  const quantitiesByProduct = new Map<string, number>();
  const allocationKeys = new Set<string>();
  const prepared = input.lines.map((inputLine) => {
    const checkedQuantity = quantity(inputLine.quantity, 'Retail line quantity');
    const scaleProfile = (state.retailScaleProfiles ?? []).find((profile) => profile.itemVariantId === inputLine.itemVariantId && profile.active && sameScope(state, profile));
    if (scaleProfile) {
      const precisionFactor = 10 ** scaleProfile.decimalPrecision;
      if (Math.round(checkedQuantity * precisionFactor) !== checkedQuantity * precisionFactor) throw new Error(`Retail scale quantity for ${inputLine.itemVariantId} exceeds ${scaleProfile.decimalPrecision} decimal places.`);
      if (checkedQuantity < scaleProfile.minimumQuantity || checkedQuantity > scaleProfile.maximumQuantity) throw new Error(`Retail scale quantity for ${inputLine.itemVariantId} must be between ${scaleProfile.minimumQuantity} and ${scaleProfile.maximumQuantity}.`);
    }
    if (inputLine.binId !== bin.id) throw new Error('Retail checkout can issue stock only from the counter sell-from bin.');
    const allocationKey = `${inputLine.itemVariantId}|${inputLine.batchId ?? ''}`;
    if (allocationKeys.has(allocationKey)) throw new Error('Combine retail quantities for the same item and batch into one checkout line.');
    allocationKeys.add(allocationKey);
    const variant = state.itemVariants.find(({ id, active }) => id === inputLine.itemVariantId && active);
    const item = variant && state.inventoryItems.find(({ id, active }) => id === variant.itemId && active);
    const product = item && state.products.find(({ id, active, kind, effectiveFrom, effectiveTo }) =>
      id === item.productId && active && kind === 'goods' && effective(effectiveFrom, effectiveTo, businessDate),
    );
    const taxCode = product && state.taxCodes.find(({ id, kind, reviewStatus, effectiveFrom, effectiveTo }) =>
      id === product.taxCodeId && kind === 'HSN' && reviewStatus === 'verified' && effective(effectiveFrom, effectiveTo, businessDate),
    );
    if (!variant || !item || !product || !taxCode) throw new Error('Retail checkout requires an active inventory variant backed by a verified HSN goods product.');
    assertScope(state, [variant, item, product, taxCode], 'Retail catalogue item');
    quantitiesByProduct.set(product.id, money((quantitiesByProduct.get(product.id) ?? 0) + checkedQuantity));
    return { inputLine, checkedQuantity, variant, item, product, taxCode };
  });
  let provisional: ProvisionalRetailLine[] = prepared.map(({ inputLine, checkedQuantity, product, taxCode, item }) => {
    const productQuantity = quantitiesByProduct.get(product.id) ?? checkedQuantity;
    const priceEntry = [...state.priceListEntries]
      .filter(({ priceListId, productId, minimumQuantity, effectiveFrom, effectiveTo }) =>
        priceListId === counter.priceListId && productId === product.id && minimumQuantity <= productQuantity && effective(effectiveFrom, effectiveTo, businessDate),
      )
      .sort((left, right) => right.minimumQuantity - left.minimumQuantity)[0];
    if (!priceEntry || !sameScope(state, priceEntry)) throw new Error(`No effective retail price exists for ${product.name}.`);
    const taxMode = priceEntry.taxMode ?? 'exclusive';
    const taxFactor = 1 + (taxCode.gstRate + taxCode.cessRate) / 100;
    const taxableValue = taxMode === 'inclusive'
      ? money(checkedQuantity * priceEntry.unitPrice / taxFactor)
      : money(checkedQuantity * priceEntry.unitPrice);
    return {
      inputLine,
      checkedQuantity,
      product,
      item,
      merchandisingProfile: state.retailMerchandisingProfiles.find((profile) => profile.itemId === item.id && sameScope(state, profile)),
      taxCode,
      priceEntry,
      taxableValue,
      listUnitPrice: money(taxableValue / checkedQuantity),
    };
  });
  const customerAccountId = input.customerAccountId ?? counter.walkInAccountId;
  const policies = selectedDiscounts(state, input.discountPolicyIds, businessDate, customerAccountId);
  const paidSubtotal = money(provisional.reduce((total, line) => total + line.taxableValue, 0));
  const voucherRedemption = planRetailVoucherCheckout(state, input, paidSubtotal, businessDate);
  if (voucherRedemption && input.loyaltyPointsToRedeem !== undefined) {
    throw new Error('A retail voucher cannot be combined with loyalty-point redemption in the same checkout.');
  }
  if (voucherRedemption && policies.some((policy) => policy.promotionType !== 'gift')) {
    throw new Error('A retail voucher cannot be combined with non-gift promotions in the same checkout.');
  }
  // Keep the voucher allocation pinned to paid goods. A later zero-price gift
  // line must never absorb a taxable discount or distort GST evidence.
  const paidLineIndexes = provisional.map((_line, index) => index);
  const policyIndexes = (policy: typeof policies[number]): number[] => {
    const hasRetailTargeting = Boolean(policy.eligibleRetailCategoryIds?.length || policy.eligibleRetailBrandIds?.length || policy.eligibleRetailRackBinIds?.length);
    return provisional.flatMap(({ product, merchandisingProfile }, index) => {
      if (policy.scope === 'product' && product.id !== policy.productId) return [];
      if (!hasRetailTargeting) return [index];
      return merchandisingProfile &&
        (!policy.eligibleRetailCategoryIds?.length || policy.eligibleRetailCategoryIds.includes(merchandisingProfile.categoryId)) &&
        (!policy.eligibleRetailBrandIds?.length || Boolean(merchandisingProfile.brandId && policy.eligibleRetailBrandIds.includes(merchandisingProfile.brandId))) &&
        (!policy.eligibleRetailRackBinIds?.length || Boolean(merchandisingProfile.rackBinId && policy.eligibleRetailRackBinIds.includes(merchandisingProfile.rackBinId))) ? [index] : [];
    });
  };
  const giftPolicies = policies.filter((policy) => policy.promotionType === 'gift');
  const promotionRedemptions: Array<{ policyId: string; campaignCode?: string; discountAmount: number; giftQuantity: number }> = [];
  for (const policy of giftPolicies) {
    const eligibleIndexes = policyIndexes(policy);
    const eligibleLines = eligibleIndexes.map((index) => provisional[index]!);
    const eligibleProductSubtotal = money(eligibleLines.reduce((total, line) => total + line.taxableValue, 0));
    const eligibleQuantity = eligibleLines.reduce((total, line) => total + line.checkedQuantity, 0);
    const evaluation = evaluateRetailPromotion({ policy, subtotal: paidSubtotal, eligibleProductSubtotal, eligibleQuantity, targetedSubtotal: policy.eligibleRetailCategoryIds?.length || policy.eligibleRetailBrandIds?.length || policy.eligibleRetailRackBinIds?.length ? eligibleProductSubtotal : undefined, customerAccountId });
    if (!evaluation.eligible || evaluation.freeQuantity <= 0) continue;
    promotionRedemptions.push({ policyId: policy.id, campaignCode: policy.campaignCode, discountAmount: 0, giftQuantity: evaluation.freeQuantity });
    const giftVariant = state.itemVariants.find(({ id, active }) => id === policy.giftItemVariantId && active);
    const giftItem = giftVariant && state.inventoryItems.find(({ id, active }) => id === giftVariant.itemId && active);
    const giftProduct = giftItem && state.products.find(({ id, active, kind, effectiveFrom, effectiveTo }) => id === giftItem.productId && active && kind === 'goods' && effective(effectiveFrom, effectiveTo, businessDate));
    const giftTaxCode = giftProduct && state.taxCodes.find(({ id, kind, reviewStatus, effectiveFrom, effectiveTo }) => id === giftProduct.taxCodeId && kind === 'HSN' && reviewStatus === 'verified' && effective(effectiveFrom, effectiveTo, businessDate));
    if (!giftVariant || !giftItem || !giftProduct || !giftTaxCode) throw new Error(`Gift promotion ${policy.code} requires an active, verified goods SKU.`);
    assertScope(state, [giftVariant, giftItem, giftProduct, giftTaxCode], 'Retail gift SKU');
    if (giftItem.tracking !== 'none') throw new Error(`Gift SKU ${giftVariant.sku} must be non-batch and non-serial for automatic POS fulfilment.`);
    const giftBalance = state.binBalances.find(({ binId, itemVariantId, batchId, scope }) => binId === bin.id && itemVariantId === giftVariant.id && !batchId && sameScope(state, { scope }));
    if (!giftBalance || giftBalance.available < evaluation.freeQuantity) throw new Error(`Gift promotion ${policy.code} cannot be fulfilled: ${giftVariant.sku} has insufficient counter-bin stock.`);
    const giftPriceEntry = [...state.priceListEntries]
      .filter(({ priceListId, productId, minimumQuantity, effectiveFrom, effectiveTo }) => priceListId === counter.priceListId && productId === giftProduct.id && minimumQuantity <= evaluation.freeQuantity && effective(effectiveFrom, effectiveTo, businessDate))
      .sort((left, right) => right.minimumQuantity - left.minimumQuantity)[0];
    if (!giftPriceEntry || !sameScope(state, giftPriceEntry)) throw new Error(`Gift promotion ${policy.code} has no effective retail price for ${giftProduct.name}.`);
    provisional = [...provisional, {
      inputLine: { itemVariantId: giftVariant.id, binId: bin.id, serialUnitIds: [], quantity: evaluation.freeQuantity },
      checkedQuantity: evaluation.freeQuantity,
      product: giftProduct,
      item: giftItem,
      merchandisingProfile: state.retailMerchandisingProfiles.find((profile) => profile.itemId === giftItem.id && sameScope(state, profile)),
      taxCode: giftTaxCode,
      priceEntry: giftPriceEntry,
      taxableValue: 0,
      listUnitPrice: money(giftPriceEntry.unitPrice),
      giftPolicyId: policy.id,
    }];
  }
  const subtotal = paidSubtotal;
  const loyaltyAccount = state.retailLoyaltyAccounts.find((candidate) => candidate.customerAccountId === customerAccountId && sameScope(state, candidate));
  let loyaltyDiscount = 0;
  if (input.loyaltyPointsToRedeem !== undefined) {
    if (!loyaltyAccount || input.loyaltyAccountVersion !== loyaltyAccount.version) throw new Error('Loyalty account changed. Refresh the customer balance before checkout.');
    const redemption = validateLoyaltyRedemption(loyaltyAccount.pointsBalance, input.loyaltyPointsToRedeem);
    if (!redemption.valid) throw new Error(redemption.reason ?? 'Loyalty redemption is invalid.');
    loyaltyDiscount = Math.min(redemption.discountAmount, subtotal);
  }
  const calculations = policies.filter((policy) => policy.promotionType !== 'gift').map((policy) => {
    const hasRetailTargeting = Boolean(policy.eligibleRetailCategoryIds?.length || policy.eligibleRetailBrandIds?.length || policy.eligibleRetailRackBinIds?.length);
    const eligibleIndexes = policyIndexes(policy);
    const eligibleLines = eligibleIndexes.map((index) => provisional[index]!);
    const eligibleProductSubtotal = money(eligibleLines.reduce((total, line) => total + line.taxableValue, 0));
    const eligibleQuantity = eligibleLines.reduce((total, line) => total + line.checkedQuantity, 0);
    const evaluation = evaluateRetailPromotion({ policy, subtotal, eligibleProductSubtotal, eligibleQuantity, targetedSubtotal: hasRetailTargeting ? eligibleProductSubtotal : undefined, customerAccountId });
    return { policy, amount: evaluation.eligible ? evaluation.discountAmount : 0, eligibleIndexes };
  }).filter(({ amount }) => amount > 0);
  calculations.forEach(({ policy, amount }) => promotionRedemptions.push({ policyId: policy.id, campaignCode: policy.campaignCode, discountAmount: amount, giftQuantity: 0 }));
  const stackable = calculations.filter(({ policy }) => policy.stackable);
  const bestExclusive = calculations.filter(({ policy }) => !policy.stackable).sort((left, right) => right.amount - left.amount)[0];
  const discountTotal = money(stackable.reduce((total, item) => total + item.amount, 0) + (bestExclusive?.amount ?? 0) + loyaltyDiscount + (voucherRedemption?.discountAmount ?? 0));
  if (discountTotal > subtotal) throw new Error('Retail discount total cannot exceed the priced goods value.');
  const lineDiscounts = provisional.map(() => 0);
  const allocate = (amount: number, indexes: number[]): void => {
    if (!amount || !indexes.length) return;
    const eligibleSubtotal = money(indexes.reduce((total, index) => total + provisional[index]!.taxableValue, 0));
    if (eligibleSubtotal <= 0) return;
    let allocated = 0;
    indexes.forEach((index, position) => {
      const share = position === indexes.length - 1
        ? money(amount - allocated)
        : money(amount * provisional[index]!.taxableValue / eligibleSubtotal);
      lineDiscounts[index] = money((lineDiscounts[index] ?? 0) + share);
      allocated = money(allocated + share);
    });
  };
  stackable.forEach((item) => allocate(item.amount, item.eligibleIndexes));
  if (bestExclusive) allocate(bestExclusive.amount, bestExclusive.eligibleIndexes);
  if (loyaltyDiscount) allocate(loyaltyDiscount, provisional.map((_, index) => index));
  if (voucherRedemption) allocate(voucherRedemption.discountAmount, paidLineIndexes);
  const lines = provisional.map((line, index): RetailSaleLine => {
    const discountAmount = money(lineDiscounts[index] ?? 0);
    const taxableValue = money(line.taxableValue - discountAmount);
    const gstAmount = state.profile.gstRegistered ? money(taxableValue * line.taxCode.gstRate / 100) : 0;
    const cessAmount = state.profile.gstRegistered ? money(taxableValue * line.taxCode.cessRate / 100) : 0;
    return {
      id: randomUUID(),
      itemVariantId: line.inputLine.itemVariantId,
      catalogProductId: line.product.id,
      binId: line.inputLine.binId,
      batchId: line.inputLine.batchId,
      serialUnitIds: [...line.inputLine.serialUnitIds],
      description: line.product.name,
      hsnSac: line.taxCode.code,
      quantity: line.checkedQuantity,
      listUnitPrice: line.listUnitPrice,
      unitPrice: money(taxableValue / line.checkedQuantity),
      taxableValue,
      gstRate: line.taxCode.gstRate,
      gstAmount,
      taxCodeId: line.taxCode.id,
      priceListEntryId: line.priceEntry.id,
      discountAmount,
      cessRate: line.taxCode.cessRate,
      cessAmount,
      lineTotal: money(taxableValue + gstAmount + cessAmount),
      lineCostTotal: 0,
      isGift: Boolean(line.giftPolicyId),
      promotionPolicyId: line.giftPolicyId,
    };
  });
  const taxableValue = money(lines.reduce((total, line) => total + line.taxableValue, 0));
  // A receipt is legally and operationally composed of the frozen line
  // amounts. Summing the raw taxable × rate values here would round a second
  // time at document level and can manufacture/lose a paisa compared with
  // the invoice lines, return credits and tender total. Keep the preview
  // exactly reconcilable to those individually rounded line taxes instead.
  const gstTotal = money(lines.reduce(
    (total, line) => total + (line.gstAmount ?? money(line.taxableValue * line.gstRate / 100)),
    0,
  ));
  const cess = money(lines.reduce((total, line) => total + line.cessAmount, 0));
  const intraState = placeOfSupplyStateCode === warehouse.stateCode;
  const cgst = intraState ? money(gstTotal / 2) : 0;
  const sgst = intraState ? money(gstTotal - cgst) : 0;
  return {
    lines,
    subtotal,
    discountTotal,
    taxPreview: {
      treatment: intraState ? 'intra-state' : 'inter-state',
      taxableValue,
      cgst,
      sgst,
      igst: intraState ? 0 : gstTotal,
      cess,
      totalTax: money(gstTotal + cess),
      grandTotal: money(lines.reduce((total, line) => total + line.lineTotal, 0)),
      determination: 'commercial-estimate',
    },
    promotionRedemptions,
    voucherRedemption,
    recipientTreatment,
    recipientGstin,
    placeOfSupplyStateCode,
  };
}

/** Server-side preview used by governed workflows that will later call checkoutRetailSale. */
export function priceRetailReplacementLines(
  state: RevenueOpsState,
  input: Pick<CheckoutRetailSaleInput, 'counterId' | 'lines' | 'saleAt'>,
): { lines: RetailSaleLine[]; subtotal: number; discountTotal: number; taxPreview: QuoteTaxPreview } {
  const counter = counterFor(state, input.counterId);
  return priceRetailLines(state, counter, {
    counterId: input.counterId,
    cashierShiftId: 'exchange-pricing',
    transactionKey: 'exchange-pricing',
    saleAt: input.saleAt,
    lines: input.lines,
    discountPolicyIds: [],
    tenders: [],
  }, toIndiaBusinessDate(input.saleAt));
}

function validateTenders(state: RevenueOpsState, input: CheckoutRetailSaleInput, grandTotal: number, customerAccountId: string): RetailTender[] {
  if (!input.tenders.length || input.tenders.length > 8) throw new Error('Retail checkout requires between 1 and 8 tender entries.');
  const customerCreditTenders = input.tenders.filter(({ method }) => method === 'customer-credit');
  if (customerCreditTenders.length > 0) {
    if (customerCreditTenders.length !== 1 || input.tenders.length !== 1) throw new Error('Customer credit must be the sole tender for a counter sale.');
    if (!state.creditLimitControls.some(({ accountId, status }) => accountId === customerAccountId && status === 'approved')) throw new Error('Customer credit requires an approved INR credit-limit control.');
    assertCreditAvailable(state, customerAccountId, grandTotal);
  }
  const uniqueReferences = new Set<string>();
  const tenders = input.tenders.map((tender): RetailTender => {
    const amount = positiveMoney(tender.amount, 'Retail tender amount');
    const reference = clean(tender.reference, 'Retail tender reference', 3, 120).toUpperCase();
    const key = `${tender.method}|${reference}`;
    if (uniqueReferences.has(key) || state.paymentReceipts.some((receipt) => receipt.method === tender.method && receipt.reference.toUpperCase() === reference && sameScope(state, receipt))) {
      throw new Error('Retail tender reference is already recorded.');
    }
    uniqueReferences.add(key);
    if ((tender.method === 'upi' || tender.method === 'card') && reference.length < 6) throw new Error('UPI and card tenders require provider evidence references.');
    if (tender.method === 'store-credit') {
      const credit = (state.retailStoreCredits ?? []).find((c) => (c.number.toUpperCase() === reference || c.id === reference) && c.status === 'active' && sameScope(state, c));
      if (!credit) throw new Error(`Active retail store credit ${reference} not found.`);
      if (credit.customerAccountId !== customerAccountId) throw new Error(`Store credit ${reference} belongs to a different customer account.`);
      if (money(credit.availableAmount) < amount) throw new Error(`Store credit ${reference} available balance (₹${credit.availableAmount}) is less than tender amount (₹${amount}).`);
    }
    return { id: randomUUID(), method: tender.method, amount, reference };
  });
  if (money(tenders.reduce((total, tender) => total + tender.amount, 0)) !== grandTotal) {
    throw new Error('Retail tenders must equal the GST invoice grand total exactly.');
  }
  return tenders;
}

export function createRetailCounter(state: RevenueOpsState, input: CreateRetailCounterInput, id: string = randomUUID()): RevenueOpsState {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) throw new Error('Retail counter code must use 2-32 letters, numbers, dashes, or underscores.');
  if (state.retailCounters.some((counter) => counter.code === code && sameScope(state, counter))) throw new Error('Retail counter code already exists.');
  const now = new Date().toISOString();
  const provisional: RetailCounter = {
    id,
    code,
    name: clean(input.name, 'Retail counter name'),
    warehouseId: input.warehouseId,
    sellFromBinId: input.sellFromBinId,
    priceListId: input.priceListId,
    walkInAccountId: clean(input.walkInAccountId, 'Walk-in customer account', 2, 120),
    paymentTermId: input.paymentTermId,
    active: true,
    scope: structuredClone(state.scope),
    version: 1,
  };
  counterConfiguration(state, provisional, toIndiaBusinessDate(now));
  const next = mutate(state);
  next.retailCounters.unshift(provisional);
  return next;
}

export function openRetailCashierShift(state: RevenueOpsState, input: OpenRetailCashierShiftInput, actorId: string, id: string = randomUUID(), now = new Date().toISOString()): RevenueOpsState {
  const counter = counterFor(state, input.counterId);
  counterConfiguration(state, counter, toIndiaBusinessDate(now));
  if (state.retailCashierShifts.some((shift) => shift.counterId === counter.id && shift.status !== 'closed' && sameScope(state, shift))) {
    throw new Error('This retail counter already has an open or closing-reviewed cashier shift.');
  }
  const openingCash = nonNegativeMoney(input.openingCash, 'Opening cash');
  const next = mutate(state);
  const shift: RetailCashierShift = {
    id,
    number: fiscalNumber('SHIFT', state.retailCashierShifts.length + 1, now),
    counterId: counter.id,
    cashierId: actorId,
    openedAt: now,
    openingCash,
    status: 'open',
    scope: structuredClone(state.scope),
    version: 1,
  };
  next.retailCashierShifts.unshift(shift);
  return next;
}

/**
 * The single retail completion boundary. It prices server-side, issues a B2C
 * GST invoice, records each tender, removes physical stock, and adds a COGS
 * handoff. All intermediate states stay local; an error returns no mutation.
 */
export function checkoutRetailSale(state: RevenueOpsState, input: CheckoutRetailSaleInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const transactionKey = clean(input.transactionKey, 'Retail transaction key', 8, 120);
  const counter = counterFor(state, input.counterId);
  const shift = state.retailCashierShifts.find(({ id }) => id === input.cashierShiftId);
  if (!shift || !sameScope(state, shift) || shift.counterId !== counter.id || shift.status !== 'open' || shift.cashierId !== actorId) {
    throw new Error('Retail checkout requires the assigned cashier’s open shift at this counter.');
  }
  const saleAtMillis = Date.parse(input.saleAt);
  const shiftOpenedAtMillis = Date.parse(shift.openedAt);
  if (!Number.isFinite(saleAtMillis) || !Number.isFinite(shiftOpenedAtMillis) || saleAtMillis < shiftOpenedAtMillis) throw new Error('Retail sale time must be valid and occur after the cashier shift opened.');
  const customerAccountId = input.customerAccountId ? clean(input.customerAccountId, 'Retail customer account', 2, 120) : counter.walkInAccountId;
  const requestHash = requestChecksum({ ...input, transactionKey }, customerAccountId);
  const existing = state.retailSales.find((sale) => sale.transactionKey === transactionKey && sameScope(state, sale));
  if (existing) {
    if (existing.requestChecksum !== requestHash) throw new Error('Retail transaction key was already used with different checkout data.');
    if (existing.status !== 'completed') throw new Error('Retail transaction is still being finalized. Refresh before retrying.');
    return state;
  }
  const businessDate = toIndiaBusinessDate(input.saleAt);
  const { paymentTerm } = counterConfiguration(state, counter, businessDate);
  const priced = priceRetailLines(state, counter, input, businessDate);
  const tenders = validateTenders(state, input, priced.taxPreview.grandTotal, customerAccountId);
  const saleId = randomUUID();
  const invoiceId = randomUUID();
  const saleNumber = fiscalNumber('POS', state.retailSales.length + 1, input.saleAt);
  const voucherRedemption: RetailVoucherRedemptionEvidence | undefined = priced.voucherRedemption
    ? { ...priced.voucherRedemption, redeemedAt: now }
    : undefined;
  const processing: RetailSale = {
    id: saleId,
    number: saleNumber,
    counterId: counter.id,
    cashierShiftId: shift.id,
    cashierId: actorId,
    customerAccountId,
    recipientTreatment: priced.recipientTreatment,
    recipientGstin: priced.recipientGstin,
    placeOfSupplyStateCode: priced.placeOfSupplyStateCode,
    transactionKey,
    requestChecksum: requestHash,
    saleAt: input.saleAt,
    invoiceId,
    paymentReceiptIds: [],
    lines: priced.lines,
    subtotal: priced.subtotal,
    discountTotal: priced.discountTotal,
    taxPreview: priced.taxPreview,
    tenders,
    costTotal: 0,
    status: 'processing',
    scope: structuredClone(state.scope),
    version: 1,
  };
  const invoice: TaxInvoice = {
    id: invoiceId,
    number: `DRAFT-${invoiceId.slice(0, 8).toUpperCase()}`,
    documentKind: 'tax-invoice',
    sourceKind: 'retail-sale',
    retailSaleId: saleId,
    accountId: customerAccountId,
    recipientTreatment: priced.recipientTreatment,
    recipientGstin: priced.recipientGstin,
    placeOfSupplyStateCode: priced.placeOfSupplyStateCode,
    reverseCharge: false,
    currency: 'INR',
    invoiceDate: businessDate,
    dueDate: addDays(businessDate, paymentTerm.dueDays),
    paymentTermId: paymentTerm.id,
    status: 'draft',
    irpStatus: 'not-applicable',
    serviceMilestoneIds: [],
    shipmentPackageIds: [],
    lines: priced.lines.map(retailSaleLineToInvoiceLine),
    subtotal: priced.subtotal,
    discountTotal: priced.discountTotal,
    taxPreview: priced.taxPreview,
    amountDue: priced.taxPreview.grandTotal,
    createdBy: actorId,
    createdAt: now,
    scope: structuredClone(state.scope),
    version: 1,
  };
  let next = structuredClone(state);
  next.revision += 1;
  next.retailSales.unshift(processing);
  next.invoices.unshift(invoice);
  next = issueInvoice(next, { id: invoice.id, expectedVersion: invoice.version }, actorId, now);
  const receivable = next.receivables.find(({ invoiceId: candidate }) => candidate === invoiceId);
  if (!receivable) throw new Error('Retail invoice issuance did not create a receivable.');
  const receiptIds: string[] = [];
  for (const tender of tenders) {
    if (tender.method === 'customer-credit') continue;
    const receiptId = randomUUID();
    next = recordPayment(next, {
      accountId: customerAccountId,
      receivedAt: input.saleAt,
      method: tender.method,
      reference: tender.reference,
      amount: tender.amount,
      allocations: [{ receivableId: receivable.id, amount: tender.amount }],
      retailSaleId: saleId,
      retailCashierShiftId: shift.id,
    }, actorId, receiptId);
    receiptIds.push(receiptId);
    if (tender.method === 'store-credit') {
      next.retailStoreCredits = (next.retailStoreCredits ?? []).map((credit) => {
        if ((credit.number.toUpperCase() === tender.reference.toUpperCase() || credit.id === tender.reference) && sameScope(next, credit)) {
          const newAvailable = money(credit.availableAmount - tender.amount);
          return {
            ...credit,
            availableAmount: newAvailable,
            status: newAvailable <= 0 ? ('redeemed' as const) : credit.status,
            version: credit.version + 1,
          };
        }
        return credit;
      });
    }
  }
  const costs = new Map<string, number>();
  for (const line of priced.lines) {
    const combo = (next.retailProductCombos ?? []).find(
      (candidate) => candidate.parentItemVariantId === line.itemVariantId && candidate.active && sameScope(next, candidate),
    );
    if (combo && combo.components.length > 0) {
      let comboCost = 0;
      for (const component of combo.components) {
        const issuedComp = issueRetailInventoryAtCounter(next, {
          warehouseId: counter.warehouseId,
          binId: line.binId,
          itemVariantId: component.itemVariantId,
          batchId: line.batchId,
          serialUnitIds: [],
          quantity: money(line.quantity * component.quantity),
          reference: `${saleNumber} (${combo.code})`,
          occurredAt: input.saleAt,
        }, actorId);
        next = issuedComp.state;
        comboCost = money(comboCost + issuedComp.totalCost);
      }
      costs.set(line.id, comboCost);
    } else {
      const issued = issueRetailInventoryAtCounter(next, {
        warehouseId: counter.warehouseId,
        binId: line.binId,
        itemVariantId: line.itemVariantId,
        batchId: line.batchId,
        serialUnitIds: line.serialUnitIds,
        quantity: line.quantity,
        reference: saleNumber,
        occurredAt: input.saleAt,
      }, actorId);
      next = issued.state;
      costs.set(line.id, issued.totalCost);
    }
  }
  const costTotal = money([...costs.values()].reduce((total, value) => total + value, 0));
  if (costTotal <= 0) throw new Error('Retail checkout requires valued inventory cost layers before sale completion.');
  const costDraft = journal(saleId, saleNumber, businessDate, [
    { accountCode: 'cost-of-goods-sold', debit: costTotal, credit: 0, memo: saleNumber },
    { accountCode: 'inventory-asset', debit: 0, credit: costTotal, memo: saleNumber },
  ]);
  const completed: RetailSale = {
    ...processing,
    receivableId: receivable.id,
    paymentReceiptIds: receiptIds,
    lines: processing.lines.map((line) => ({ ...line, lineCostTotal: costs.get(line.id) ?? 0 })),
    costTotal,
    voucherRedemption,
    status: 'completed',
    completedAt: now,
    version: processing.version + 1,
  };
  next.retailSales = next.retailSales.map((sale) => sale.id === saleId ? completed : sale);
  next.journalDrafts.unshift(costDraft);
  const promotionRedemptions: RetailPromotionRedemption[] = priced.promotionRedemptions.map((redemption) => ({
    id: randomUUID(),
    promotionPolicyId: redemption.policyId,
    saleId,
    campaignCode: redemption.campaignCode,
    customerAccountId,
    redeemedAt: now,
    discountAmount: redemption.discountAmount,
    giftQuantity: redemption.giftQuantity,
    scope: structuredClone(next.scope),
    version: 1,
  }));
  next.retailPromotionRedemptions = promotionRedemptions.concat(next.retailPromotionRedemptions);
  next.revision += 1;
  if (input.loyaltyPointsToRedeem !== undefined) next = redeemRetailLoyaltyPoints(next, { customerAccountId, points: input.loyaltyPointsToRedeem, referenceId: saleNumber, expectedVersion: input.loyaltyAccountVersion! }, actorId, now);
  const loyaltyPoints = calculateLoyaltyPointsAccrued(priced.taxPreview.grandTotal);
  if (loyaltyPoints > 0) next = accrueRetailLoyaltyPoints(next, customerAccountId, loyaltyPoints, saleNumber, actorId, now);
  if (voucherRedemption) {
    const voucher = next.retailVouchers.find((candidate) => candidate.id === voucherRedemption.voucherId && sameScope(next, candidate));
    if (!voucher || voucher.version !== voucherRedemption.voucherVersion) {
      throw new Error('Retail voucher changed before its completed sale could be finalized. Refresh and retry.');
    }
    next.retailVouchers = next.retailVouchers.map((candidate) => candidate.id === voucher.id
      ? { ...candidate, currentUsageCount: candidate.currentUsageCount + 1, version: candidate.version + 1 }
      : candidate);
  }
  return next;
}

export function requestRetailCashierShiftClose(state: RevenueOpsState, input: RequestRetailCashierShiftCloseInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const shift = state.retailCashierShifts.find(({ id }) => id === input.id);
  if (!shift || !sameScope(state, shift)) throw new Error('Retail cashier shift not found in the current operating scope.');
  if (shift.version !== input.expectedVersion) throw new Error('Retail cashier shift changed. Refresh and retry.');
  if (shift.status !== 'open' || shift.cashierId !== actorId) throw new Error('Only the assigned cashier can request closure of an open retail shift.');
  const declaredCash = nonNegativeMoney(input.declaredCash, 'Declared drawer cash');
  const cashSales = state.retailSales
    .filter((sale) => sale.cashierShiftId === shift.id && sale.status === 'completed' && sameScope(state, sale))
    .reduce((total, sale) => total + sale.tenders.filter((tender) => tender.method === 'cash').reduce((sum, tender) => sum + tender.amount, 0), 0);
  const cashRefunds = state.retailReturns
    .filter((returnCase) => returnCase.status === 'approved' && sameScope(state, returnCase))
    .flatMap((returnCase) => returnCase.financialCredit?.settlements ?? [])
    .filter((settlement) => settlement.status === 'cash-refunded' && settlement.cashierShiftId === shift.id)
    .reduce((total, settlement) => total + settlement.amount, 0);
  const expectedCash = money(shift.openingCash + cashSales - cashRefunds);
  const tenderMethods: RetailTenderMethod[] = ['cash', 'upi', 'card', 'cheque', 'store-credit', 'customer-credit', 'other'];
  const expectedTenders = new Map<RetailTenderMethod, number>(tenderMethods.map((method) => [method, 0]));
  state.retailSales
    .filter((sale) => sale.cashierShiftId === shift.id && sale.status === 'completed' && sameScope(state, sale))
    .flatMap((sale) => sale.tenders)
    .forEach((tender) => expectedTenders.set(tender.method, money((expectedTenders.get(tender.method) ?? 0) + tender.amount)));
  state.retailReturns
    .filter((returnCase) => returnCase.status === 'approved' && sameScope(state, returnCase))
    .flatMap((returnCase) => returnCase.financialCredit?.settlements ?? [])
    .filter((settlement) => settlement.cashierShiftId === shift.id && ['cash-refunded', 'provider-refunded'].includes(settlement.status))
    .forEach((settlement) => {
      const method: RetailTenderMethod = settlement.method === 'cash-refund' ? 'cash' : settlement.providerMethod ?? 'other';
      expectedTenders.set(method, money((expectedTenders.get(method) ?? 0) - settlement.amount));
    });
  expectedTenders.set('cash', money((expectedTenders.get('cash') ?? 0) + shift.openingCash));
  const declaredTenders = input.declaredTenders;
  let tenderReconciliation: RetailCashierShift['tenderReconciliation'];
  let tenderVariance: number | undefined;
  if (declaredTenders) {
    if (declaredTenders.length !== tenderMethods.length || new Set(declaredTenders.map(({ method }) => method)).size !== tenderMethods.length || tenderMethods.some((method) => !declaredTenders.some((declaration) => declaration.method === method))) {
      throw new Error('Tender close requires exactly one declaration for every configured tender rail.');
    }
    tenderReconciliation = tenderMethods.map((method) => {
      const declared = nonNegativeMoney(declaredTenders.find((candidate) => candidate.method === method)!.amount, `${method} tender declaration`);
      const expected = money(expectedTenders.get(method) ?? 0);
      return { method, expected, declared, variance: money(declared - expected) };
    });
    tenderVariance = money(tenderReconciliation.reduce((total, item) => total + Math.abs(item.variance), 0));
  }
  const updated: RetailCashierShift = {
    ...shift,
    status: 'close-requested',
    closeRequestedBy: actorId,
    closeRequestedAt: now,
    declaredCash,
    expectedCash,
    variance: money(declaredCash - expectedCash),
    tenderReconciliation,
    tenderVariance,
    closeEvidenceReference: clean(input.evidenceReference, 'Shift-close evidence reference', 3, 120),
    rejectionReason: undefined,
    version: shift.version + 1,
  };
  const next = mutate(state);
  next.retailCashierShifts = next.retailCashierShifts.map((candidate) => candidate.id === shift.id ? updated : candidate);
  return next;
}

function varianceAccount(method: RetailTenderMethod): JournalLine['accountCode'] {
  if (method === 'cash') return 'cash-on-hand';
  if (method === 'upi') return 'upi-clearing';
  if (method === 'card') return 'card-clearing';
  if (method === 'cheque') return 'bank-clearing';
  return 'unapplied-cash';
}

function cashierVarianceJournal(shift: RetailCashierShift, now: string): AccountingJournalDraft {
  const reconciliations = shift.tenderReconciliation?.filter((item) => item.variance !== 0)
    ?? (shift.variance ? [{ method: 'cash' as const, expected: shift.expectedCash ?? 0, declared: shift.declaredCash ?? 0, variance: shift.variance }] : []);
  const lines: JournalLine[] = reconciliations.flatMap((item) => {
    const amount = Math.abs(item.variance);
    const accountCode = varianceAccount(item.method);
    return item.variance < 0
      ? [{ accountCode: 'cash-variance-expense' as const, debit: amount, credit: 0, memo: `${shift.number} ${item.method} short` }, { accountCode, debit: 0, credit: amount, memo: `${shift.number} ${item.method} short` }]
      : [{ accountCode, debit: amount, credit: 0, memo: `${shift.number} ${item.method} over` }, { accountCode: 'cash-variance-expense' as const, debit: 0, credit: amount, memo: `${shift.number} ${item.method} over` }];
  });
  if (!lines.length) throw new Error('A variance-resolution journal requires a non-zero tender variance.');
  const normalized = lines.map((line) => ({ ...line, debit: money(line.debit), credit: money(line.credit) }));
  const totalDebit = money(normalized.reduce((total, line) => total + line.debit, 0));
  const totalCredit = money(normalized.reduce((total, line) => total + line.credit, 0));
  const unsigned = { sourceType: 'retail-cashier-variance' as const, sourceId: shift.id, sourceNumber: shift.number, postingDate: toIndiaBusinessDate(now), lines: normalized, totalDebit, totalCredit, externalReference: `SHIFT-VARIANCE-${shift.id}` };
  return { id: randomUUID(), ...unsigned, status: 'ready', checksum: checksum(unsigned), version: 1 };
}

export function requestRetailCashierShiftVarianceResolution(state: RevenueOpsState, input: RequestRetailCashierShiftVarianceResolutionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const shift = state.retailCashierShifts.find(({ id }) => id === input.id);
  if (!shift || !sameScope(state, shift)) throw new Error('Retail cashier shift not found in the current operating scope.');
  if (shift.version !== input.expectedVersion) throw new Error('Retail cashier shift changed. Refresh and retry.');
  if (shift.status !== 'close-requested') throw new Error('Variance resolution is available only after a shift close request.');
  if (shift.cashierId === actorId || shift.closeRequestedBy === actorId) throw new Error('The cashier and close requester cannot prepare their own variance resolution.');
  if ((shift.variance ?? 0) === 0 && (shift.tenderVariance ?? 0) === 0) throw new Error('This shift has no variance requiring finance resolution.');
  if (shift.varianceResolutionStatus === 'requested' || shift.varianceResolutionStatus === 'approved') throw new Error('This shift already has an active variance resolution.');
  const updated: RetailCashierShift = {
    ...shift,
    varianceResolutionStatus: 'requested',
    varianceResolutionReason: clean(input.reason, 'Variance resolution reason', 6, 500),
    varianceResolutionReference: clean(input.evidenceReference, 'Variance resolution evidence reference', 3, 160),
    varianceResolutionRequestedBy: actorId,
    varianceResolutionRequestedAt: now,
    varianceResolutionDecidedBy: undefined,
    varianceResolutionDecidedAt: undefined,
    version: shift.version + 1,
  };
  const next = mutate(state);
  next.retailCashierShifts = next.retailCashierShifts.map((candidate) => candidate.id === shift.id ? updated : candidate);
  return next;
}

export function decideRetailCashierShiftVarianceResolution(state: RevenueOpsState, input: DecideRetailCashierShiftVarianceResolutionInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const shift = state.retailCashierShifts.find(({ id }) => id === input.id);
  if (!shift || !sameScope(state, shift)) throw new Error('Retail cashier shift not found in the current operating scope.');
  if (shift.version !== input.expectedVersion) throw new Error('Retail cashier shift changed. Refresh and retry.');
  if (shift.status !== 'close-requested' || shift.varianceResolutionStatus !== 'requested') throw new Error('Only a requested variance resolution can be decided.');
  if (shift.cashierId === actorId || shift.closeRequestedBy === actorId || shift.varianceResolutionRequestedBy === actorId) throw new Error('Variance resolution requires an independent finance checker.');
  const evidenceReference = clean(input.evidenceReference, 'Variance resolution decision evidence', 3, 160);
  const next = mutate(state);
  const updated: RetailCashierShift = {
    ...shift,
    varianceResolutionStatus: input.decision,
    varianceResolutionReference: evidenceReference,
    varianceResolutionDecidedBy: actorId,
    varianceResolutionDecidedAt: now,
    version: shift.version + 1,
  };
  next.retailCashierShifts = next.retailCashierShifts.map((candidate) => candidate.id === shift.id ? updated : candidate);
  if (input.decision === 'approved') next.journalDrafts.unshift(cashierVarianceJournal(shift, now));
  return next;
}

export function decideRetailCashierShiftClose(state: RevenueOpsState, input: DecideRetailCashierShiftCloseInput, actorId: string, now = new Date().toISOString()): RevenueOpsState {
  const shift = state.retailCashierShifts.find(({ id }) => id === input.id);
  if (!shift || !sameScope(state, shift)) throw new Error('Retail cashier shift not found in the current operating scope.');
  if (shift.version !== input.expectedVersion) throw new Error('Retail cashier shift changed. Refresh and retry.');
  if (shift.status !== 'close-requested') throw new Error('Only a submitted retail shift close can be reviewed.');
  if (shift.cashierId === actorId || shift.closeRequestedBy === actorId) throw new Error('Retail shift closure requires an independent reviewer.');
  const evidenceReference = clean(input.evidenceReference, 'Shift-close review evidence', 3, 120);
  const approved = input.decision === 'approved';
  if (approved && (shift.variance !== 0 || (shift.tenderVariance ?? 0) !== 0) && shift.varianceResolutionStatus !== 'approved') {
    throw new Error('A tender variance requires an approved controlled finance adjustment before this retail shift can close.');
  }
  const updated: RetailCashierShift = approved
    ? { ...shift, status: 'closed', closedBy: actorId, closedAt: now, reviewerEvidenceReference: evidenceReference, version: shift.version + 1 }
    : { ...shift, status: 'open', reviewerEvidenceReference: evidenceReference, rejectionReason: evidenceReference, closeRequestedBy: undefined, closeRequestedAt: undefined, declaredCash: undefined, expectedCash: undefined, variance: undefined, tenderReconciliation: undefined, tenderVariance: undefined, varianceResolutionStatus: undefined, varianceResolutionReason: undefined, varianceResolutionReference: undefined, varianceResolutionRequestedBy: undefined, varianceResolutionRequestedAt: undefined, varianceResolutionDecidedBy: undefined, varianceResolutionDecidedAt: undefined, closeEvidenceReference: undefined, version: shift.version + 1 };
  const next = mutate(state);
  next.retailCashierShifts = next.retailCashierShifts.map((candidate) => candidate.id === shift.id ? updated : candidate);
  if (approved) {
    const cashReceiptIds = new Set(next.paymentReceipts
      .filter((receipt) => receipt.retailCashierShiftId === shift.id && receipt.method === 'cash' && receipt.status === 'recorded')
      .map(({ id }) => id));
    next.paymentReceipts = next.paymentReceipts.map((receipt) => cashReceiptIds.has(receipt.id)
      ? { ...receipt, status: 'reconciled', reconciledBy: actorId, reconciledAt: now, version: receipt.version + 1 }
      : receipt);
    next.journalDrafts = next.journalDrafts.map((draft) => draft.sourceType === 'payment' && cashReceiptIds.has(draft.sourceId)
      ? { ...draft, status: 'ready', version: draft.version + 1 }
      : draft);
  }
  return next;
}
