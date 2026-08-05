import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AutoUpdateService } from './auto-update-service';

class FakeAutoUpdater extends EventEmitter {
  public readonly setFeedURL = vi.fn();
  public readonly checkForUpdates = vi.fn();
}

describe('automatic update status boundary', () => {
  it('does not configure or contact an updater while the app is unpackaged', () => {
    const updater = new FakeAutoUpdater();
    const service = new AutoUpdateService({
      isPackaged: false,
      platform: 'win32',
      version: '0.1.0',
      feedUrl: 'https://updates.example.test/epic-bos',
    }, updater);

    expect(service.start()).toMatchObject({
      state: 'not-configured',
      canCheck: false,
      reason: 'The installed-package update service is disabled while Epic BOS is running from source.',
    });
    expect(updater.setFeedURL).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('reports Linux as unsupported instead of configuring Electron autoUpdater', () => {
    const updater = new FakeAutoUpdater();
    const service = new AutoUpdateService({
      isPackaged: true,
      platform: 'linux',
      version: '0.1.0',
      feedUrl: 'https://updates.example.test/epic-bos',
    }, updater);

    expect(service.start()).toMatchObject({
      state: 'unsupported',
      canCheck: false,
      reason: 'Electron built-in automatic updates are not supported by this Epic BOS Linux package.',
    });
    expect(updater.setFeedURL).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('refuses a feed URL that embeds credentials', () => {
    const updater = new FakeAutoUpdater();
    const service = new AutoUpdateService({
      isPackaged: true,
      platform: 'win32',
      version: '0.1.0',
      feedUrl: 'https://release-user:release-secret@updates.example.test/epic-bos',
    }, updater);

    expect(service.start()).toMatchObject({ state: 'not-configured', feedConfigured: false, canCheck: false });
    expect(updater.setFeedURL).not.toHaveBeenCalled();
  });

  it('makes a packaged Windows build eligible only after a secure feed is configured, without starting a network check', () => {
    const updater = new FakeAutoUpdater();
    const service = new AutoUpdateService({
      isPackaged: true,
      platform: 'win32',
      version: '0.1.0',
      feedUrl: 'https://updates.example.test/epic-bos',
    }, updater);

    expect(service.start()).toMatchObject({
      state: 'available',
      canCheck: true,
      feedOrigin: 'https://updates.example.test',
      updateFound: false,
    });
    expect(updater.setFeedURL).toHaveBeenCalledWith({ url: 'https://updates.example.test/epic-bos' });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('projects updater events without exposing the feed path or attempting a check itself', () => {
    const updater = new FakeAutoUpdater();
    const service = new AutoUpdateService({
      isPackaged: true,
      platform: 'darwin',
      version: '0.1.0',
      feedUrl: 'https://updates.example.test/releases/private-token',
    }, updater);
    service.start();

    updater.emit('checking-for-update');
    expect(service.getStatus()).toMatchObject({ state: 'checking', canCheck: false, updateFound: false });
    updater.emit('update-available');
    expect(service.getStatus()).toMatchObject({ state: 'available', canCheck: false, updateFound: true });
    updater.emit('error', new Error('request failed https://updates.example.test/releases/private-token'));
    expect(service.getStatus()).toMatchObject({ state: 'error', canCheck: false, updateFound: false });
    expect(service.getStatus().reason).not.toContain('private-token');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });
});
