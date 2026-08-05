import { describe, expect, it } from 'vitest';
import { createPeopleReadProjection } from './people-read-projection';
import { createInitialRevenueOpsState } from './revenue-ops';

function controlledState() {
  const state = createInitialRevenueOpsState();
  const [avery, priya, lee] = state.workforceProfiles;
  if (!avery || !priya || !lee) throw new Error('Seeded workforce profiles are required for this test.');
  state.workforceProfiles = [
    { ...avery, scope: structuredClone(state.scope) },
    {
      ...priya,
      scope: { companyId: 'company-other', branchId: 'branch-other' },
    },
    { ...lee },
  ];
  state.payrollCompensations = [{
    id: 'compensation-avery',
    number: 'CMP-26-27-00001',
    workforceProfileId: 'workforce-avery',
    userId: 'user-avery',
    monthlyBasic: 120000,
    monthlyAllowances: 35000,
    paymentMethod: 'bank-transfer',
    paymentReferenceToken: 'vault://compensation/avery',
    effectiveFrom: '2026-04-01',
    status: 'active',
    requestedBy: 'system',
    requestedAt: '2026-04-01T00:00:00.000Z',
    decidedBy: 'system',
    decidedAt: '2026-04-01T00:00:00.000Z',
    decisionRemarks: 'Seeded controlled compensation.',
    scope: structuredClone(state.scope),
    version: 1,
  }];
  return state;
}

const readAllowed = () => ({ allowed: true, deniedFields: [] });

describe('people read projection', () => {
  it('fails closed outside the active company and branch, including legacy records without scope', () => {
    const state = controlledState();

    const projection = createPeopleReadProjection(
      state,
      readAllowed,
      '2026-07-16T09:00:00.000Z',
    );

    expect(projection.scope).toEqual(state.scope);
    expect(projection.generatedAt).toBe('2026-07-16T09:00:00.000Z');
    expect(projection.workforceProfiles.map(({ id }) => id)).toEqual(['workforce-avery']);
    expect(projection.payrollCompensations.map(({ id }) => id)).toEqual(['compensation-avery']);
    expect(projection.hiddenCollections).toEqual([]);
  });

  it('omits an entire collection when its resource read permission is denied', () => {
    const projection = createPeopleReadProjection(controlledState(), (resource) => (
      resource === 'workforce.profile'
        ? { allowed: false, deniedFields: [] }
        : readAllowed()
    ));

    expect(projection.workforceProfiles).toEqual([]);
    expect(projection.hiddenCollections).toContain('workforceProfiles');
    expect(projection.payrollCompensations).toHaveLength(1);
  });

  it('physically removes denied payroll fields without mutating the stored record', () => {
    const state = controlledState();
    const projection = createPeopleReadProjection(state, (resource) => (
      resource === 'payroll.compensation'
        ? {
            allowed: true,
            deniedFields: ['monthlyBasic', 'paymentReferenceToken'],
          }
        : readAllowed()
    ));

    expect(projection.payrollCompensations[0]).not.toHaveProperty('monthlyBasic');
    expect(projection.payrollCompensations[0]).not.toHaveProperty('paymentReferenceToken');
    expect(projection.payrollCompensations[0]).toHaveProperty('monthlyAllowances', 35000);
    expect(projection.redactedFields['payroll.compensation']).toEqual([
      'monthlyBasic',
      'paymentReferenceToken',
    ]);
    expect(state.payrollCompensations[0]).toHaveProperty('monthlyBasic', 120000);
    expect(state.payrollCompensations[0]).toHaveProperty(
      'paymentReferenceToken',
      'vault://compensation/avery',
    );
  });
});
