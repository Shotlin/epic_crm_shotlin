import type { AutoUpdateStatus } from '../shared/auto-update-contracts';

export interface AutoUpdaterPort {
  setFeedURL(options: { url: string }): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface AutoUpdateRuntime {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  version: string;
  feedUrl?: string;
}

function secureFeed(url: string | undefined): URL | undefined {
  if (!url?.trim()) return undefined;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeUpdaterError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Unknown updater failure.');
  const withoutUrls = message.replace(/https?:\/\/[^\s)]+/giu, '[update endpoint redacted]');
  return withoutUrls.replace(/\s+/gu, ' ').trim().slice(0, 240) || 'Unknown updater failure.';
}

/**
 * Deliberately bounded bridge around Electron's built-in updater. It configures
 * supported packaged builds and observes Electron events, but never calls
 * `checkForUpdates`, downloads, installs, or restarts the application.
 */
export class AutoUpdateService {
  private status: AutoUpdateStatus;
  private started = false;

  public constructor(
    private readonly runtime: AutoUpdateRuntime,
    private readonly updater: AutoUpdaterPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.status = this.createStatus({
      state: 'not-configured',
      feedConfigured: false,
      canCheck: false,
      updateFound: false,
      reason: 'Automatic update status has not initialized yet.',
    });
  }

  public start(): AutoUpdateStatus {
    if (this.started) return this.getStatus();
    this.started = true;
    const feed = secureFeed(this.runtime.feedUrl);

    if (!this.runtime.isPackaged) {
      this.status = this.createStatus({
        state: 'not-configured',
        feedConfigured: Boolean(feed),
        feedOrigin: feed?.origin,
        canCheck: false,
        updateFound: false,
        reason: 'The installed-package update service is disabled while Epic BOS is running from source.',
      });
      return this.getStatus();
    }

    if (this.runtime.platform === 'linux') {
      this.status = this.createStatus({
        state: 'unsupported',
        feedConfigured: Boolean(feed),
        feedOrigin: feed?.origin,
        canCheck: false,
        updateFound: false,
        reason: 'Electron built-in automatic updates are not supported by this Epic BOS Linux package.',
      });
      return this.getStatus();
    }

    if (this.runtime.platform !== 'win32' && this.runtime.platform !== 'darwin') {
      this.status = this.createStatus({
        state: 'unsupported',
        feedConfigured: Boolean(feed),
        feedOrigin: feed?.origin,
        canCheck: false,
        updateFound: false,
        reason: `Electron built-in automatic updates are not supported on ${this.runtime.platform}.`,
      });
      return this.getStatus();
    }

    if (!feed) {
      this.status = this.createStatus({
        state: 'not-configured',
        feedConfigured: false,
        canCheck: false,
        updateFound: false,
        reason: 'Automatic updates need a valid HTTPS EPIC_BOS_UPDATE_FEED_URL and independently verified signed release evidence.',
      });
      return this.getStatus();
    }

    try {
      this.updater.setFeedURL({ url: feed.toString() });
      this.registerListeners(feed.origin);
      this.status = this.createStatus({
        state: 'available',
        feedConfigured: true,
        feedOrigin: feed.origin,
        canCheck: true,
        updateFound: false,
        reason: 'A secure update feed is configured. No network update check has been started by Epic BOS.',
      });
    } catch (error) {
      this.status = this.createStatus({
        state: 'error',
        feedConfigured: false,
        canCheck: false,
        updateFound: false,
        reason: `Electron could not configure the automatic update service: ${sanitizeUpdaterError(error)}`,
      });
    }
    return this.getStatus();
  }

  public getStatus(): AutoUpdateStatus {
    return { ...this.status };
  }

  private registerListeners(feedOrigin: string): void {
    this.updater.on('checking-for-update', () => {
      this.status = this.createStatus({
        state: 'checking',
        feedConfigured: true,
        feedOrigin,
        canCheck: false,
        updateFound: false,
        reason: 'Electron is checking the configured update feed. No update result has been confirmed yet.',
      });
    });
    this.updater.on('update-available', () => {
      this.status = this.createStatus({
        state: 'available',
        feedConfigured: true,
        feedOrigin,
        canCheck: false,
        updateFound: true,
        reason: 'Electron reported a newer update. This boundary has not downloaded, installed, or restarted the app.',
      });
    });
    this.updater.on('update-not-available', () => {
      this.status = this.createStatus({
        state: 'available',
        feedConfigured: true,
        feedOrigin,
        canCheck: true,
        updateFound: false,
        reason: 'Electron reported no newer update from the configured feed.',
      });
    });
    this.updater.on('update-downloaded', () => {
      this.status = this.createStatus({
        state: 'available',
        feedConfigured: true,
        feedOrigin,
        canCheck: false,
        updateFound: true,
        reason: 'Electron reported an update download. Installation and restart remain deliberately disabled pending controlled release handling.',
      });
    });
    this.updater.on('error', (error: unknown) => {
      this.status = this.createStatus({
        state: 'error',
        feedConfigured: true,
        feedOrigin,
        canCheck: false,
        updateFound: false,
        reason: `Electron automatic update service error: ${sanitizeUpdaterError(error)}`,
      });
    });
  }

  private createStatus(status: Omit<AutoUpdateStatus, 'currentVersion' | 'platform' | 'packaged' | 'observedAt'>): AutoUpdateStatus {
    return {
      ...status,
      currentVersion: this.runtime.version,
      platform: this.runtime.platform,
      packaged: this.runtime.isPackaged,
      observedAt: this.now(),
    };
  }
}
