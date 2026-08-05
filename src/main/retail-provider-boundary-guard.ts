export interface RetailProviderBoundaryRuntime {
  isPackaged: boolean;
  nodeEnv?: string;
}

/** External facts must originate at the certified Retail Hub boundary. */
export type RendererRetailProviderOperation =
  | 'execute-commerce-sync'
  | 'record-commerce-sync-receipt'
  | 'execute-commerce-push'
  | 'record-commerce-push-outcome'
  | 'ingest-external-unified-order'
  | 'record-hub-handoff-outcome'
  | 'record-carrier-callback'
  | 'import-commerce-order'
  | 'record-commerce-order-status'
  | 'record-commerce-settlement';

/**
 * Direct provider activity is deliberately available only to isolated local
 * fixture environments. Production Electron renderers cannot use this path;
 * a certified Retail Hub must own credentials, execution, and receipt proof.
 */
export function isRendererRetailProviderOperationAllowed(runtime: RetailProviderBoundaryRuntime): boolean {
  return !runtime.isPackaged && (runtime.nodeEnv === 'test' || runtime.nodeEnv === 'development');
}

export function assertRendererRetailProviderOperationAllowed(
  runtime: RetailProviderBoundaryRuntime,
  operation: RendererRetailProviderOperation,
): void {
  if (!isRendererRetailProviderOperationAllowed(runtime)) {
    throw new Error(`Renderer ${operation.replaceAll('-', ' ')} is disabled outside test/development. The Retail Hub secure boundary must execute the certified connector and record a credential-revision-bound provider receipt with independent evidence.`);
  }
}
