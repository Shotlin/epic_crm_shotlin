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
  displayName: 'Epic Intelligence E2E Owner',
  email: 'e2e.intelligence.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Intelligence',
};

describe('packaged Electron intelligence route', () => {
  it('opens detailed intelligence without freezing the renderer', async () => {
    const executable = requireElectronE2eExecutable();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-intelligence-'));
    let app: PackagedElectronApp | null = null;
    let completed = false;
    const startedAt = Date.now();
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
      await clickButtonByAriaLabel(app, 'Home');
      await clickButtonByAriaLabel(app, 'Retail insights');
      await waitForTestId(app, 'commerce-performance');
      await waitForTestId(app, 'commerce-insights');
      await waitForTestId(app, 'intelligence-evidence-panel');
      await app.cdp.evaluate(`document.querySelector('.main-content')?.scrollTo({ top: 0, left: 0, behavior: 'instant' })`);
      expect(app.rendererErrors).toEqual([]);
      expect(Date.now() - startedAt).toBeLessThan(120_000);
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
