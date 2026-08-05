import type { GspConnector } from './connector.js';
import { SandboxGspConnector } from './sandbox.js';
import { RestGspConnector } from './rest.js';

// Factory: GSP_PROVIDER=rest uses the live IRP; anything else (default) uses the sandbox.
let cached: GspConnector | null = null;

export function getGsp(): GspConnector {
  if (cached) return cached;
  const provider = (process.env.GSP_PROVIDER || 'sandbox').toLowerCase();
  cached = provider === 'rest' ? new RestGspConnector() : new SandboxGspConnector();
  console.log(`[gsp] using provider=${provider}`);
  return cached;
}

export function company() {
  return {
    gstin: process.env.EPIC_SUPPLIER_GSTIN || '',
    name: process.env.EPIC_COMPANY_NAME || 'Epic BOS Demo',
    addr: process.env.EPIC_COMPANY_ADDR || '',
    state: process.env.EPIC_SUPPLIER_STATE || '29',
  };
}
