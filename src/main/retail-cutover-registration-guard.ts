export interface RetailCutoverRegistrationRuntime {
  isPackaged: boolean;
  nodeEnv?: string;
}

/**
 * Directly typed cutover plans remain useful only for isolated test and local
 * development fixtures. A packaged app must receive plans through the
 * verified Retail Hub assessment route instead.
 */
export function isManualRetailCutoverRegistrationAllowed(runtime: RetailCutoverRegistrationRuntime): boolean {
  return !runtime.isPackaged && (runtime.nodeEnv === 'test' || runtime.nodeEnv === 'development');
}

export function assertManualRetailCutoverRegistrationAllowed(runtime: RetailCutoverRegistrationRuntime): void {
  if (!isManualRetailCutoverRegistrationAllowed(runtime)) {
    throw new Error('Direct manual cutover-plan registration is disabled outside test/development. Fetch a verified, read-only Retail Hub assessment instead.');
  }
}
