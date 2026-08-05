import { describe, expect, it } from 'vitest';
import { createInitialRevenueOpsState } from './revenue-ops';
import { createManufacturingReadProjection } from './manufacturing-read-projection';

function controlledState() {
  const state = createInitialRevenueOpsState();
  state.workCenters = [{
    id: 'center-current', code: 'CUT-01', name: 'Controlled cutting cell', warehouseId: 'warehouse-1',
    capacityMinutesPerDay: 480, efficiencyPercent: 85, costRatePerHour: 900, active: true,
    scope: structuredClone(state.scope), version: 1,
  }, {
    id: 'center-legacy', code: 'OLD-01', name: 'Legacy cell', warehouseId: 'warehouse-1',
    capacityMinutesPerDay: 480, efficiencyPercent: 80, costRatePerHour: 800, active: false, version: 1,
  }];
  return state;
}
const allowed = () => ({ allowed: true, deniedFields: [] });

describe('manufacturing read projection', () => {
  it('filters engineering records by exact company and branch, excluding unscoped legacy records', () => {
    const projection = createManufacturingReadProjection(controlledState(), allowed);
    expect(projection.workCenters.map(({ id }) => id)).toEqual(['center-current']);
  });

  it('hides engineering records and dependent capacity metrics when read access is denied', () => {
    const projection = createManufacturingReadProjection(controlledState(), (resource) => (
      resource === 'manufacturing.engineering' ? { allowed: false, deniedFields: [] } : allowed()
    ));
    expect(projection.workCenters).toEqual([]);
    expect(projection.hiddenCollections).toEqual(expect.arrayContaining(['workCenters', 'bomRevisions', 'qualityPlans']));
    expect(projection.redactedMetrics).toContain('capacityLoadPercent');
  });

  it('physically removes denied work-center cost without mutating stored state', () => {
    const state = controlledState();
    const projection = createManufacturingReadProjection(state, (resource) => (
      resource === 'manufacturing.engineering' ? { allowed: true, deniedFields: ['costRatePerHour'] } : allowed()
    ));
    expect(projection.workCenters[0]).not.toHaveProperty('costRatePerHour');
    expect(state.workCenters[0]).toHaveProperty('costRatePerHour', 900);
  });
});
