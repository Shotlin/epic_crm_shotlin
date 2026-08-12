import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clickButtonByAriaLabel,
  clickButtonByName,
  closePackagedElectronApp,
  fillInputByLabel,
  forceClosePackagedElectronApp,
  launchPackagedElectronApp,
  requireElectronE2eExecutable,
  type PackagedElectronApp,
  waitForHeading,
  waitForTestId,
} from './support/packaged-app';

const OWNER = {
  displayName: 'Epic Maintenance E2E Owner',
  email: 'e2e.maintenance.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Maintenance',
};

describe('packaged Electron maintenance route', () => {
  it('opens maintenance controls without closing the packaged app', async () => {
    const executable = requireElectronE2eExecutable();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-maintenance-'));
    let app: PackagedElectronApp | null = null;
    let completed = false;
    try {
      app = await launchPackagedElectronApp({ executable, profile });
      await waitForHeading(app, 'Create the owner account');
      await fillInputByLabel(app, 'Owner name', OWNER.displayName);
      await fillInputByLabel(app, 'Work email', OWNER.email);
      await fillInputByLabel(app, 'Password', OWNER.password);
      await fillInputByLabel(app, 'Confirm password', OWNER.password);
      await clickButtonByName(app, 'Enroll owner and continue');
      await waitForHeading(app, 'Build your operating foundation');
      await waitForTestId(app, 'retail-workspace-navigation');
      await clickButtonByAriaLabel(app, 'Stock');
      await clickButtonByAriaLabel(app, 'Maintenance');
      await waitForHeading(app, 'Maintenance and field assets');
      await waitForHeading(app, 'Maintenance command');
      expect(app.rendererErrors).toEqual([]);
      completed = true;
    } finally {
      if (app) {
        if (completed) await closePackagedElectronApp(app);
        else await forceClosePackagedElectronApp(app);
      }
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  }, 120_000);
});
