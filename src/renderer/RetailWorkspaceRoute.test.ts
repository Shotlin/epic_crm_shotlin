import { describe, expect, it } from 'vitest';
import {
  RETAIL_WORKSPACE_ROUTES,
  resolveRetailWorkspaceRoute,
} from './RetailWorkspaceRoute';

describe('RetailWorkspaceRoute', () => {
  it('defines the eight plain-language retail destinations in a stable order', () => {
    expect(RETAIL_WORKSPACE_ROUTES.map((route) => route.id)).toEqual([
      'home',
      'sell',
      'stock',
      'deliver',
      'customers',
      'money',
      'insights',
      'setup',
    ]);
  });

  it('resolves retail deep links to their canonical direct workspace route', () => {
    const route = resolveRetailWorkspaceRoute('/retail/deliver');

    expect(route).toMatchObject({
      id: 'deliver',
      label: 'Deliver',
      workbenchId: 'retail-delivery',
      adapter: {
        key: 'deliver',
        target: { kind: 'bharat', workspaceId: 'operations', bharatTab: 'fulfilment' },
      },
    });
  });

  it('falls back to Home instead of exposing a broken or generic workspace', () => {
    expect(resolveRetailWorkspaceRoute('commercial-flow').id).toBe('home');
    expect(resolveRetailWorkspaceRoute(undefined).label).toBe('Home');
  });
});
