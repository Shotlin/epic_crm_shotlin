import { describe, expect, it } from 'vitest';
import { buildRetailHubStoreEdgeWorkerMetricsUrl, fetchRetailHubStoreEdgeWorkerMetrics } from './retail-hub-store-edge-metrics-client';

const report = {
  metrics: { runs: 4, claimed: 12, completed: 10, retryable: 1, deadLetter: 1, lastRunAt: '2026-08-06T15:00:00.000Z' },
  observedAt: '2026-08-06T15:00:01.000Z',
  writeBackAllowed: false,
};

function response(status = 200, body: unknown = report) {
  return { status, contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode(JSON.stringify(body)) };
}

describe('Retail Hub Store Edge worker metrics client', () => {
  it('builds a credential-free metrics URL', () => {
    expect(buildRetailHubStoreEdgeWorkerMetricsUrl('https://hub.example.in/')).toBe('https://hub.example.in/v1/store-edge/worker/metrics');
    expect(() => buildRetailHubStoreEdgeWorkerMetricsUrl('http://hub.example.in')).toThrow(/HTTPS/i);
    expect(() => buildRetailHubStoreEdgeWorkerMetricsUrl('https://hub.example.in?token=bad')).toThrow(/credential-free/i);
  });

  it('accepts a valid read-only, internally consistent metrics report', async () => {
    let requested = '';
    const result = await fetchRetailHubStoreEdgeWorkerMetrics({ baseUrl: 'https://hub.example.in' }, { request: async (url) => { requested = url; return response(); } });
    expect(requested).toBe('https://hub.example.in/v1/store-edge/worker/metrics');
    expect(result).toEqual(report);
  });

  it('rejects write-back claims, inconsistent counters and unauthenticated responses', async () => {
    await expect(fetchRetailHubStoreEdgeWorkerMetrics({ baseUrl: 'https://hub.example.in' }, { request: async () => response(403, {}) })).rejects.toThrow(/HTTP 403/i);
    await expect(fetchRetailHubStoreEdgeWorkerMetrics({ baseUrl: 'https://hub.example.in' }, { request: async () => response(200, { ...report, writeBackAllowed: true }) })).rejects.toThrow(/read-only/i);
    await expect(fetchRetailHubStoreEdgeWorkerMetrics({ baseUrl: 'https://hub.example.in' }, { request: async () => response(200, { ...report, metrics: { ...report.metrics, completed: 99 } }) })).rejects.toThrow(/inconsistent/i);
  });
});
