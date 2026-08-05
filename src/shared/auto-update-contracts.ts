/**
 * A capability state, not a claim that a release has been downloaded or
 * certified. `available` means that a packaged Windows/macOS build has a
 * trusted feed configured and Electron can be asked to check it later.
 */
export type AutoUpdateState = 'not-configured' | 'unsupported' | 'available' | 'checking' | 'error';

export interface AutoUpdateStatus {
  state: AutoUpdateState;
  /** The running package version, never a remotely reported version. */
  currentVersion: string;
  platform: NodeJS.Platform;
  packaged: boolean;
  /** True only when a valid HTTPS feed was supplied to Electron. */
  feedConfigured: boolean;
  /** Feed origin only; update paths and query parameters remain private. */
  feedOrigin?: string;
  /** Whether a future controlled check is eligible; this boundary never starts one. */
  canCheck: boolean;
  /** True only after Electron itself emits an update-available/downloading event. */
  updateFound: boolean;
  /** Plain-language explanation suitable for the release-control UI. */
  reason: string;
  observedAt: string;
}
