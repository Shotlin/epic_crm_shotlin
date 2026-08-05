import { describe, expect, it } from 'vitest';
import {
  createRetailDeliverySlot,
  evaluateRetailDeliveryServiceability,
  openRetailDeliverySlot,
  projectProviderNeutralRoute,
  projectRiderTracking,
  reserveRetailDeliverySlot,
  transitionRetailDelivery,
  validateDeliveryProviderMetadata,
} from './retail-delivery-operations';

const T0 = '2026-08-03T09:00:00.000Z';

const provider = {
  providerCode: 'BAKALOO-ROUTING',
  environment: 'production' as const,
  credentialVersion: 'routing-2026-08-01',
  configurationState: 'configured' as const,
  configuredAt: '2026-08-01T08:00:00.000Z',
};

const providerEvidence = {
  credentialVersion: 'routing-2026-08-01',
  status: 'passed' as const,
  environment: 'production' as const,
  evidenceReference: 'ROUTING-CONFORMANCE-2026-08-01',
  assessedBy: 'checker-1',
  assessedAt: '2026-08-01T09:00:00.000Z',
};

const origin = {
  id: 'outlet-bakaloo',
  label: 'Bakaloo outlet',
  latitude: 22.5726,
  longitude: 88.3639,
  source: 'store-address' as const,
  observedAt: '2026-08-03T08:45:00.000Z',
  evidenceReference: 'OUTLET-ADDRESS-REV-4',
};

const destination = {
  id: 'address-customer-1',
  label: 'Verified customer address',
  latitude: 22.603,
  longitude: 88.398,
  source: 'customer-address' as const,
  observedAt: '2026-08-03T08:46:00.000Z',
  evidenceReference: 'CUSTOMER-ADDRESS-VERIFIED-8',
};

describe('retail delivery and maps safety boundary', () => {
  it('fails closed when an address has no verified serviceability decision', () => {
    const missingAddress = evaluateRetailDeliveryServiceability({
      outletId: 'outlet-bakaloo',
      address: undefined,
      rules: [],
      at: T0,
    });
    expect(missingAddress).toMatchObject({
      status: 'unverified',
      serviceable: false,
      evidenceReferences: [],
    });
    expect(missingAddress.blockers).toContain('A verified delivery address is required before serviceability can be decided.');

    const unmatchedAddress = evaluateRetailDeliveryServiceability({
      outletId: 'outlet-bakaloo',
      address: {
        id: 'address-unknown',
        postalCode: '700001',
        verifiedAt: T0,
        evidenceReference: 'ADDRESS-VERIFY-1',
      },
      rules: [],
      at: T0,
    });
    expect(unmatchedAddress).toMatchObject({ status: 'unverified', serviceable: false });
    expect(unmatchedAddress.blockers).toContain('No active, evidence-backed serviceability rule covers this address.');
  });

  it('never accepts secret material or obsolete certification evidence in provider metadata', () => {
    expect(() => validateDeliveryProviderMetadata({ ...provider, apiKey: 'must-never-enter-epic-bos' }))
      .toThrow('must not include a secret');

    const route = projectProviderNeutralRoute({
      provider,
      conformanceEvidence: { ...providerEvidence, credentialVersion: 'routing-2026-07-01' },
      origin,
      destination,
      routeEvidence: {
        providerCode: 'BAKALOO-ROUTING',
        credentialVersion: 'routing-2026-08-01',
        providerResponseReference: 'ROUTE-QUOTE-001',
        payloadChecksum: 'a'.repeat(64),
        observedAt: T0,
        estimatedArrivalAt: '2026-08-03T09:35:00.000Z',
        distanceKm: 6.4,
      },
    });
    expect(route).toMatchObject({ status: 'blocked', eta: { status: 'unavailable' } });
    expect(route.reconciliationRequired).toBe(true);
    expect(route.blockers).toContain('Provider conformance evidence does not match the configured credential version.');
  });

  it('does not invent map pins or an ETA until verified locations and a current provider route response exist', () => {
    const unavailable = projectProviderNeutralRoute({
      provider,
      conformanceEvidence: providerEvidence,
      origin,
      destination: undefined,
      routeEvidence: undefined,
    });
    expect(unavailable).toMatchObject({
      status: 'blocked',
      map: { status: 'unavailable', pins: [] },
      eta: { status: 'unavailable' },
    });

    const routed = projectProviderNeutralRoute({
      provider,
      conformanceEvidence: providerEvidence,
      origin,
      destination,
      routeEvidence: {
        providerCode: 'BAKALOO-ROUTING',
        credentialVersion: 'routing-2026-08-01',
        providerResponseReference: 'ROUTE-QUOTE-002',
        payloadChecksum: 'b'.repeat(64),
        observedAt: T0,
        estimatedArrivalAt: '2026-08-03T09:35:00.000Z',
        distanceKm: 6.4,
      },
    });
    expect(routed).toMatchObject({
      status: 'ready',
      map: {
        status: 'evidence-backed',
        pins: [
          expect.objectContaining({ locationId: 'outlet-bakaloo' }),
          expect.objectContaining({ locationId: 'address-customer-1' }),
        ],
      },
      eta: {
        status: 'evidence-backed',
        estimatedArrivalAt: '2026-08-03T09:35:00.000Z',
      },
      reconciliationRequired: false,
    });
  });

  it('opens and reserves a delivery slot only after serviceability evidence, capacity, and an order reference are present', () => {
    const draft = createRetailDeliverySlot({
      id: 'slot-am',
      outletId: 'outlet-bakaloo',
      startsAt: '2026-08-03T10:00:00.000Z',
      endsAt: '2026-08-03T12:00:00.000Z',
      capacity: 1,
    }, 'planner-1', T0);
    expect(draft.status).toBe('draft');

    expect(() => openRetailDeliverySlot(draft, {
      expectedVersion: 1,
      serviceability: { status: 'unverified', serviceable: false, ruleId: undefined, evidenceReferences: [], blockers: [] },
      openingEvidenceReference: 'SLOT-OPEN-001',
    }, 'planner-1', T0)).toThrow('serviceable');

    const open = openRetailDeliverySlot(draft, {
      expectedVersion: 1,
      serviceability: {
        status: 'serviceable',
        serviceable: true,
        ruleId: 'rule-700001',
        evidenceReferences: ['RULE-700001-REV-3', 'ADDRESS-VERIFY-1'],
        blockers: [],
      },
      openingEvidenceReference: 'SLOT-OPEN-001',
    }, 'planner-1', T0);
    const reserved = reserveRetailDeliverySlot(open, {
      expectedVersion: 2,
      orderId: 'order-1',
      orderEvidenceReference: 'ORDER-1-APPROVED',
    }, 'dispatcher-1', T0);
    expect(reserved).toMatchObject({ status: 'full', reservationOrderIds: ['order-1'] });
    expect(() => reserveRetailDeliverySlot(reserved, {
      expectedVersion: 3,
      orderId: 'order-2',
      orderEvidenceReference: 'ORDER-2-APPROVED',
    }, 'dispatcher-1', T0)).toThrow('open slot with spare capacity');
  });

  it('shows rider tracking only from current, consented, evidence-backed observations and never synthesizes ETA', () => {
    const noSignal = projectRiderTracking({
      assignment: {
        deliveryId: 'delivery-1',
        riderId: 'rider-1',
        status: 'accepted',
        acceptedAt: T0,
        assignmentEvidenceReference: 'RIDER-ASSIGN-001',
        trackingConsentReference: 'RIDER-CONSENT-001',
      },
      observation: undefined,
      now: '2026-08-03T09:05:00.000Z',
    });
    expect(noSignal).toMatchObject({ status: 'awaiting-signal', mapPin: undefined, eta: { status: 'unavailable' } });

    const signal = projectRiderTracking({
      assignment: {
        deliveryId: 'delivery-1',
        riderId: 'rider-1',
        status: 'accepted',
        acceptedAt: T0,
        assignmentEvidenceReference: 'RIDER-ASSIGN-001',
        trackingConsentReference: 'RIDER-CONSENT-001',
      },
      observation: {
        deliveryId: 'delivery-1',
        riderId: 'rider-1',
        source: 'rider-device',
        deviceEventReference: 'DEVICE-EVENT-001',
        payloadChecksum: 'c'.repeat(64),
        observedAt: '2026-08-03T09:04:00.000Z',
        location: {
          id: 'rider-signal-1',
          label: 'Rider device observation',
          latitude: 22.58,
          longitude: 88.37,
          source: 'rider-device',
          observedAt: '2026-08-03T09:04:00.000Z',
          evidenceReference: 'DEVICE-EVENT-001',
        },
      },
      now: '2026-08-03T09:05:00.000Z',
    });
    expect(signal).toMatchObject({
      status: 'live-evidence',
      mapPin: expect.objectContaining({ locationId: 'rider-signal-1' }),
      eta: { status: 'unavailable' },
      reconciliationRequired: true,
    });
  });

  it('requires proof of delivery and COD custody evidence before a COD delivery can be recorded as delivered', () => {
    const assigned = {
      id: 'delivery-1',
      orderId: 'order-1',
      status: 'out-for-delivery' as const,
      paymentMode: 'cod' as const,
      codExpectedAmount: 480,
      riderAssignment: {
        deliveryId: 'delivery-1',
        riderId: 'rider-1',
        status: 'accepted' as const,
        acceptedAt: T0,
        assignmentEvidenceReference: 'RIDER-ASSIGN-001',
        trackingConsentReference: 'RIDER-CONSENT-001',
      },
      version: 3,
    };

    expect(() => transitionRetailDelivery(assigned, {
      expectedVersion: 3,
      toStatus: 'delivered',
      proofOfDelivery: undefined,
      codCustody: undefined,
    }, 'rider-1', T0)).toThrow('proof of delivery');

    expect(() => transitionRetailDelivery(assigned, {
      expectedVersion: 3,
      toStatus: 'delivered',
      proofOfDelivery: {
        method: 'customer-otp',
        evidenceReference: 'POD-DELIVERY-1',
        payloadChecksum: 'd'.repeat(64),
        capturedAt: T0,
        capturedBy: 'rider-1',
      },
      codCustody: {
        caseId: 'cod-1',
        status: 'handed-to-carrier',
        expectedAmount: 480,
        evidenceReference: 'COD-HANDOVER-1',
        occurredAt: T0,
      },
    }, 'rider-1', T0)).toThrow('carrier-collected');

    const delivered = transitionRetailDelivery(assigned, {
      expectedVersion: 3,
      toStatus: 'delivered',
      proofOfDelivery: {
        method: 'customer-otp',
        evidenceReference: 'POD-DELIVERY-1',
        payloadChecksum: 'd'.repeat(64),
        capturedAt: T0,
        capturedBy: 'rider-1',
      },
      codCustody: {
        caseId: 'cod-1',
        status: 'carrier-collected',
        expectedAmount: 480,
        collectedAmount: 480,
        evidenceReference: 'COD-COLLECTION-1',
        occurredAt: T0,
      },
    }, 'rider-1', T0);
    expect(delivered).toMatchObject({
      status: 'delivered',
      reconciliation: {
        status: 'required',
        nextAction: 'Record carrier remittance and reconcile the COD case to a bank receipt.',
      },
    });
  });
});
