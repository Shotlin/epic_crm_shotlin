import { describe, expect, it } from 'vitest';
import {
  assertRendererRetailProviderOperationAllowed,
  isRendererRetailProviderOperationAllowed,
  type RendererRetailProviderOperation,
} from './retail-provider-boundary-guard';

const externalOperations: RendererRetailProviderOperation[] = [
  'execute-commerce-sync',
  'record-commerce-sync-receipt',
  'execute-commerce-push',
  'record-commerce-push-outcome',
  'ingest-external-unified-order',
  'record-hub-handoff-outcome',
  'record-carrier-callback',
  'import-commerce-order',
  'record-commerce-order-status',
  'record-commerce-settlement',
];

describe('renderer retail provider boundary', () => {
  it('allows only isolated unpackaged development/test fixtures', () => {
    expect(isRendererRetailProviderOperationAllowed({ isPackaged: false, nodeEnv: 'test' })).toBe(true);
    expect(isRendererRetailProviderOperationAllowed({ isPackaged: false, nodeEnv: 'development' })).toBe(true);
    expect(isRendererRetailProviderOperationAllowed({ isPackaged: false, nodeEnv: 'production' })).toBe(false);
  });

  it('fails closed for every external commerce operation in a packaged app', () => {
    for (const operation of externalOperations) {
      expect(() => assertRendererRetailProviderOperationAllowed({ isPackaged: true, nodeEnv: 'development' }, operation)).toThrow(/retail hub secure boundary/i);
    }
  });
});
