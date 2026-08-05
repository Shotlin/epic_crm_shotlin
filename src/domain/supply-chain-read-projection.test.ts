import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createSupplyChainReadProjection } from './supply-chain-read-projection';

function controlledState() {
  const state = createInitialRevenueOpsState();
  state.inventoryItems = [{
    id: 'item-current', productId: 'product-current', code: 'CURRENT', name: 'Current stock item',
    baseUomId: 'uom-each', tracking: 'none', valuationMethod: 'fifo', active: true,
    scope: structuredClone(state.scope), version: 1,
  }, {
    id: 'item-legacy', productId: 'product-legacy', code: 'LEGACY', name: 'Legacy stock item',
    baseUomId: 'uom-each', tracking: 'none', valuationMethod: 'fifo', active: true, version: 1,
  }];
  state.suppliers = [{
    id: 'supplier-current', code: 'SUP-CURRENT', legalName: 'Current Scope Supplies Private Limited',
    stateCode: '27', email: 'orders@example.test', paymentTermDays: 30, categories: ['MRO'],
    status: 'pending', riskRating: 'low', qualificationEvidence: 'Controlled qualification evidence.',
    requestedBy: 'user-avery', requestedAt: '2026-07-17T09:00:00.000Z',
    scope: structuredClone(state.scope), version: 1,
  }];
  state.purchaseRequisitions = [{
    id: 'req-current', number: 'PR-26-27-00001', title: 'Controlled demand', warehouseId: 'wh-current',
    priority: 'normal', neededBy: '2026-08-01', justification: 'Safety stock replenishment.',
    lines: [{ id: 'req-line-1', itemVariantId: 'variant-current', description: 'Current stock item', quantity: 5, estimatedUnitPrice: 100, estimatedValue: 500 }],
    estimatedValue: 500, status: 'submitted', requestedBy: 'user-avery', requestedAt: '2026-07-17T09:00:00.000Z',
    scope: structuredClone(state.scope), version: 1,
  }, {
    id: 'req-legacy', number: 'PR-26-27-00002', title: 'Legacy demand', warehouseId: 'wh-legacy',
    priority: 'normal', neededBy: '2026-08-01', justification: 'Unscoped legacy demand.',
    lines: [{ id: 'req-line-2', itemVariantId: 'variant-legacy', description: 'Legacy stock item', quantity: 5, estimatedUnitPrice: 100, estimatedValue: 500 }],
    estimatedValue: 500, status: 'submitted', requestedBy: 'user-avery', requestedAt: '2026-07-17T09:00:00.000Z',
    version: 1,
  }];
  return state;
}

const readAllowed = () => ({ allowed: true, deniedFields: [] });

describe('supply-chain read projection', () => {
  it('filters procurement and inventory records by exact company and branch, excluding unscoped legacy records', () => {
    const projection = createSupplyChainReadProjection(controlledState(), readAllowed);

    expect(projection.inventoryItems.map(({ id }) => id)).toEqual(['item-current']);
    expect(projection.suppliers.map(({ id }) => id)).toEqual(['supplier-current']);
    expect(projection.purchaseRequisitions.map(({ id }) => id)).toEqual(['req-current']);
  });

  it('hides purchase requisitions and their metric when requisition read access is denied', () => {
    const projection = createSupplyChainReadProjection(controlledState(), (resource) => (
      resource === 'procurement.requisition' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));

    expect(projection.purchaseRequisitions).toEqual([]);
    expect(projection.hiddenCollections).toContain('purchaseRequisitions');
    expect(projection.redactedMetrics).toContain('requisitionsAwaitingApproval');
  });

  it('hides every inventory-master collection when inventory read access is denied', () => {
    const projection = createSupplyChainReadProjection(controlledState(), (resource) => (
      resource === 'inventory.master' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));

    expect(projection.inventoryItems).toEqual([]);
    expect(projection.warehouses).toEqual([]);
    expect(projection.hiddenCollections).toEqual(expect.arrayContaining([
      'uoms', 'uomConversions', 'inventoryItems', 'itemVariants', 'warehouses',
    ]));
  });

  it('hides supplier qualification records and their metric when supplier read access is denied', () => {
    const projection = createSupplyChainReadProjection(controlledState(), (resource) => (
      resource === 'procurement.supplier' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));

    expect(projection.suppliers).toEqual([]);
    expect(projection.hiddenCollections).toContain('suppliers');
    expect(projection.redactedMetrics).toContain('supplierQualificationPending');
  });

  it('retains only the active company-and-branch physical fulfilment evidence', () => {
    const state = createInitialRevenueOpsState();
    const foreign = { companyId: 'company-foreign', branchId: 'branch-foreign' };
    const own = structuredClone(state.scope);
    state.stockLocations = [
      { id: 'loc-own', code: 'OWN', name: 'Own stock location', stateCode: '27', active: true, scope: own, version: 1 },
      { id: 'loc-foreign', code: 'FOR', name: 'Foreign stock location', stateCode: '27', active: true, scope: foreign, version: 1 },
      { id: 'loc-legacy', code: 'OLD', name: 'Unscoped legacy location', stateCode: '27', active: true, version: 1 },
    ];
    state.stockPositions = [
      { id: 'position-own', locationId: 'loc-own', productId: 'product-own', onHand: 4, reserved: 1, available: 3, scope: own, version: 1 },
      { id: 'position-foreign', locationId: 'loc-foreign', productId: 'product-foreign', onHand: 40, reserved: 10, available: 30, scope: foreign, version: 1 },
      { id: 'position-legacy', locationId: 'loc-legacy', productId: 'product-legacy', onHand: 2, reserved: 0, available: 2, version: 1 },
    ];
    state.stockMovements = [
      { id: 'movement-own', locationId: 'loc-own', productId: 'product-own', type: 'receipt', quantity: 4, reference: 'GRN-OWN', occurredAt: '2026-07-20T00:00:00.000Z', recordedBy: 'user-own', resultingOnHand: 4, resultingReserved: 1, scope: own },
      { id: 'movement-foreign', locationId: 'loc-foreign', productId: 'product-foreign', type: 'receipt', quantity: 40, reference: 'GRN-FOR', occurredAt: '2026-07-20T00:00:00.000Z', recordedBy: 'user-foreign', resultingOnHand: 40, resultingReserved: 10, scope: foreign },
    ];
    state.stockReservations = [
      { id: 'reservation-own', salesOrderId: 'order-own', lineId: 'line-own', locationId: 'loc-own', productId: 'product-own', quantity: 1, status: 'reserved', reservedBy: 'user-own', reservedAt: '2026-07-20T00:00:00.000Z', scope: own, version: 1 },
      { id: 'reservation-foreign', salesOrderId: 'order-foreign', lineId: 'line-foreign', locationId: 'loc-foreign', productId: 'product-foreign', quantity: 10, status: 'reserved', reservedBy: 'user-foreign', reservedAt: '2026-07-20T00:00:00.000Z', scope: foreign, version: 1 },
    ];
    state.shipmentPackages = [
      { id: 'shipment-own', number: 'SHP-OWN', salesOrderId: 'order-own', fromLocationId: 'loc-own', items: [], grossWeightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1, status: 'planned', ewayBillRequired: false, createdBy: 'user-own', createdAt: '2026-07-20T00:00:00.000Z', scope: own, version: 1 },
      { id: 'shipment-foreign', number: 'SHP-FOR', salesOrderId: 'order-foreign', fromLocationId: 'loc-foreign', items: [], grossWeightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1, status: 'planned', ewayBillRequired: false, createdBy: 'user-foreign', createdAt: '2026-07-20T00:00:00.000Z', scope: foreign, version: 1 },
    ];
    state.shipmentEvents = [
      { id: 'event-own', shipmentPackageId: 'shipment-own', status: 'planned', occurredAt: '2026-07-20T00:00:00.000Z', location: 'Own bay', notes: 'Own package planned.', source: 'operator', recordedBy: 'user-own', scope: own },
      { id: 'event-foreign', shipmentPackageId: 'shipment-foreign', status: 'planned', occurredAt: '2026-07-20T00:00:00.000Z', location: 'Foreign bay', notes: 'Foreign package planned.', source: 'operator', recordedBy: 'user-foreign', scope: foreign },
    ];
    state.carrierAdapters = [
      { id: 'carrier-own', code: 'OWN', name: 'Own carrier', mode: 'manual', status: 'configured', capability: ['tracking'], scope: own, version: 1 },
      { id: 'carrier-foreign', code: 'FOR', name: 'Foreign carrier', mode: 'manual', status: 'configured', capability: ['tracking'], scope: foreign, version: 1 },
    ];
    state.returnAuthorizations = [
      { id: 'return-own', number: 'RMA-OWN', shipmentPackageId: 'shipment-own', reason: 'Own return evidence.', items: [], status: 'requested', requestedBy: 'user-own', requestedAt: '2026-07-20T00:00:00.000Z', scope: own, version: 1 },
      { id: 'return-foreign', number: 'RMA-FOR', shipmentPackageId: 'shipment-foreign', reason: 'Foreign return evidence.', items: [], status: 'requested', requestedBy: 'user-foreign', requestedAt: '2026-07-20T00:00:00.000Z', scope: foreign, version: 1 },
    ];
    state.pincodeServiceabilityRules = [
      { id: 'rule-own', code: 'OWN-400001', name: 'Own serviceability', originLocationId: 'loc-own', pinMatchKind: 'exact', pinStart: '400001', pinEnd: '400001', serviceLevel: 'standard', serviceable: true, codAllowed: false, dispatchLeadBusinessDays: 1, transitMinBusinessDays: 2, transitMaxBusinessDays: 3, workingDays: ['mon'], priority: 1, effectiveFrom: '2026-07-01', status: 'active', evidenceReference: 'Own delivery policy evidence.', createdBy: 'user-own', createdAt: '2026-07-20T00:00:00.000Z', scope: own, version: 1 },
      { id: 'rule-foreign', code: 'FOR-110001', name: 'Foreign serviceability', originLocationId: 'loc-foreign', pinMatchKind: 'exact', pinStart: '110001', pinEnd: '110001', serviceLevel: 'standard', serviceable: true, codAllowed: false, dispatchLeadBusinessDays: 1, transitMinBusinessDays: 2, transitMaxBusinessDays: 3, workingDays: ['mon'], priority: 1, effectiveFrom: '2026-07-01', status: 'active', evidenceReference: 'Foreign delivery policy evidence.', createdBy: 'user-foreign', createdAt: '2026-07-20T00:00:00.000Z', scope: foreign, version: 1 },
      { id: 'rule-legacy', code: 'OLD-600001', name: 'Legacy serviceability', originLocationId: 'loc-legacy', pinMatchKind: 'exact', pinStart: '600001', pinEnd: '600001', serviceLevel: 'standard', serviceable: true, codAllowed: false, dispatchLeadBusinessDays: 1, transitMinBusinessDays: 2, transitMaxBusinessDays: 3, workingDays: ['mon'], priority: 1, effectiveFrom: '2026-07-01', status: 'active', evidenceReference: 'Legacy delivery policy evidence.', createdBy: 'user-legacy', createdAt: '2026-07-20T00:00:00.000Z', version: 1 },
    ];
    state.deliveryPromises = [
      { id: 'promise-own', salesOrderId: 'order-own', shipToAddress: { addressId: 'address-own', label: 'Own address', line1: 'Own lane', line2: '', city: 'Mumbai', stateCode: '27', postalCode: '400001', countryCode: 'IN', sourceVersion: 1, capturedAt: '2026-07-20T00:00:00.000Z' }, originLocationId: 'loc-own', ruleId: 'rule-own', ruleCode: 'OWN-400001', ruleVersion: 1, serviceLevel: 'standard', paymentMode: 'prepaid', estimatedWeightKg: 1, orderValue: 100, dispatchBy: '2026-07-21', deliveryFrom: '2026-07-23', deliveryTo: '2026-07-24', timeZone: 'Asia/Kolkata', calendarBasis: 'weekly-policy-only', calculationFingerprint: 'own-promise', status: 'active', createdBy: 'user-own', createdAt: '2026-07-20T00:00:00.000Z', scope: own, version: 1 },
      { id: 'promise-foreign', salesOrderId: 'order-foreign', shipToAddress: { addressId: 'address-foreign', label: 'Foreign address', line1: 'Foreign lane', line2: '', city: 'Delhi', stateCode: '07', postalCode: '110001', countryCode: 'IN', sourceVersion: 1, capturedAt: '2026-07-20T00:00:00.000Z' }, originLocationId: 'loc-foreign', ruleId: 'rule-foreign', ruleCode: 'FOR-110001', ruleVersion: 1, serviceLevel: 'standard', paymentMode: 'prepaid', estimatedWeightKg: 1, orderValue: 100, dispatchBy: '2026-07-21', deliveryFrom: '2026-07-23', deliveryTo: '2026-07-24', timeZone: 'Asia/Kolkata', calendarBasis: 'weekly-policy-only', calculationFingerprint: 'foreign-promise', status: 'active', createdBy: 'user-foreign', createdAt: '2026-07-20T00:00:00.000Z', scope: foreign, version: 1 },
      { id: 'promise-legacy', salesOrderId: 'order-legacy', shipToAddress: { addressId: 'address-legacy', label: 'Legacy address', line1: 'Legacy lane', line2: '', city: 'Chennai', stateCode: '33', postalCode: '600001', countryCode: 'IN', sourceVersion: 1, capturedAt: '2026-07-20T00:00:00.000Z' }, originLocationId: 'loc-legacy', ruleId: 'rule-legacy', ruleCode: 'OLD-600001', ruleVersion: 1, serviceLevel: 'standard', paymentMode: 'prepaid', estimatedWeightKg: 1, orderValue: 100, dispatchBy: '2026-07-21', deliveryFrom: '2026-07-23', deliveryTo: '2026-07-24', timeZone: 'Asia/Kolkata', calendarBasis: 'weekly-policy-only', calculationFingerprint: 'legacy-promise', status: 'active', createdBy: 'user-legacy', createdAt: '2026-07-20T00:00:00.000Z', version: 1 },
    ];

    const projection = createSupplyChainReadProjection(state, readAllowed);
    expect(projection.stockLocations.map(({ id }) => id)).toEqual(['loc-own']);
    expect(projection.stockPositions.map(({ id }) => id)).toEqual(['position-own']);
    expect(projection.stockMovements.map(({ id }) => id)).toEqual(['movement-own']);
    expect(projection.stockReservations.map(({ id }) => id)).toEqual(['reservation-own']);
    expect(projection.shipmentPackages.map(({ id }) => id)).toEqual(['shipment-own']);
    expect(projection.shipmentEvents.map(({ id }) => id)).toEqual(['event-own']);
    expect(projection.carrierAdapters.map(({ id }) => id)).toEqual(['carrier-own']);
    expect(projection.returnAuthorizations.map(({ id }) => id)).toEqual(['return-own']);
    expect(projection.pincodeServiceabilityRules.map(({ id }) => id)).toEqual(['rule-own']);
    expect(projection.deliveryPromises.map(({ id }) => id)).toEqual(['promise-own']);
  });

  it('hides serviceability policies and delivery promises when inventory execution read access is denied', () => {
    const state = createInitialRevenueOpsState();
    state.pincodeServiceabilityRules = [{
      id: 'rule-1', code: 'MUMBAI-400001', name: 'Mumbai serviceability', originLocationId: 'loc-1',
      pinMatchKind: 'exact', pinStart: '400001', pinEnd: '400001', serviceLevel: 'standard', serviceable: true, codAllowed: false,
      dispatchLeadBusinessDays: 1, transitMinBusinessDays: 2, transitMaxBusinessDays: 3, workingDays: ['mon'], priority: 1,
      effectiveFrom: '2026-07-01', status: 'active', evidenceReference: 'Approved Mumbai delivery policy.',
      createdBy: 'user-1', createdAt: '2026-07-20T00:00:00.000Z', scope: structuredClone(state.scope), version: 1,
    }];
    state.deliveryPromises = [{
      id: 'promise-1', salesOrderId: 'order-1', shipToAddress: { addressId: 'address-1', label: 'Mumbai address', line1: 'Retail lane', line2: '', city: 'Mumbai', stateCode: '27', postalCode: '400001', countryCode: 'IN', sourceVersion: 1, capturedAt: '2026-07-20T00:00:00.000Z' }, originLocationId: 'loc-1', ruleId: 'rule-1', ruleCode: 'MUMBAI-400001', ruleVersion: 1,
      serviceLevel: 'standard', paymentMode: 'prepaid', estimatedWeightKg: 1, orderValue: 100,
      dispatchBy: '2026-07-21', deliveryFrom: '2026-07-23', deliveryTo: '2026-07-24',
      timeZone: 'Asia/Kolkata', calendarBasis: 'weekly-policy-only', calculationFingerprint: 'promise-1', status: 'active',
      createdBy: 'user-1', createdAt: '2026-07-20T00:00:00.000Z', scope: structuredClone(state.scope), version: 1,
    }];

    const projection = createSupplyChainReadProjection(state, (resource) => (
      resource === 'inventory.execution' ? { allowed: false, deniedFields: [] } : readAllowed()
    ));

    expect(projection.pincodeServiceabilityRules).toEqual([]);
    expect(projection.deliveryPromises).toEqual([]);
    expect(projection.hiddenCollections).toEqual(expect.arrayContaining([
      'pincodeServiceabilityRules', 'deliveryPromises',
    ]));
  });
});
