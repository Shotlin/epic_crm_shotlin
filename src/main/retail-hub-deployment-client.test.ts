import { describe, expect, it, vi } from 'vitest';
import { buildDeploymentPreflightUrl, fetchRetailHubDeploymentPreflight } from './retail-hub-deployment-client';

const report = {
  schema: 'epic-bos-retail-hub-deployment-preflight' as const,
  generatedAt: '2026-08-06T12:00:00.000Z',
  status: 'hold' as const,
  environment: 'production' as const,
  writeBackAllowed: false as const,
  invalidKeys: [],
  checks: [{ id: 'authentication', status: 'hold' as const, summary: 'A trusted authorization boundary is required.' }],
  blockers: ['authentication'],
};

describe('Retail Hub deployment client', () => {
  it('builds a credential-free HTTPS preflight URL', () => {
    expect(buildDeploymentPreflightUrl({ baseUrl: 'https://hub.example.in/control/' })).toBe('https://hub.example.in/control/v1/deployment/preflight');
    expect(() => buildDeploymentPreflightUrl({ baseUrl: 'http://hub.example.in' })).toThrow(/HTTPS/);
    expect(() => buildDeploymentPreflightUrl({ baseUrl: 'https://user:pass@hub.example.in' })).toThrow(/credential-free/);
  });

  it('validates a value-free server report and never adds renderer credentials', async () => {
    const request = vi.fn(async (url: string) => {
      expect(url).toBe('https://hub.example.in/v1/deployment/preflight');
      return { status: 200, contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode(JSON.stringify(report)) };
    });
    await expect(fetchRetailHubDeploymentPreflight({ baseUrl: 'https://hub.example.in' }, { request })).resolves.toEqual(report);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects a response that attempts to enable write-back', async () => {
    const request = vi.fn(async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ ...report, writeBackAllowed: true })) }));
    await expect(fetchRetailHubDeploymentPreflight({ baseUrl: 'https://hub.example.in' }, { request })).rejects.toThrow(/write-back/);
  });
});
