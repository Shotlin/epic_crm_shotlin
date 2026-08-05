import { describe, expect, it } from 'vitest';
import { BUSINESS_WORKFLOW_CATALOG, summarizeBusinessWorkflows } from './business-workflow-catalog';

describe('business workflow catalog', () => {
  it('covers the core cross-functional journeys', () => {
    expect(BUSINESS_WORKFLOW_CATALOG.map(({ id }) => id)).toEqual(expect.arrayContaining(['lead-to-cash', 'procure-to-pay', 'record-to-report', 'hire-to-retire', 'gst-compliance']));
  });

  it('summarizes step and release-gate coverage', () => {
    const summary = summarizeBusinessWorkflows();
    expect(summary.total).toBeGreaterThanOrEqual(9);
    expect(summary.steps).toBeGreaterThan(summary.total);
    expect(summary.externalGate).toBeGreaterThan(0);
  });
});
