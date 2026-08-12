import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  captureScreenshot,
  closePackagedElectronApp,
  fillInputByLabel,
  forceClosePackagedElectronApp,
  launchPackagedElectronApp,
  requireElectronE2eExecutable,
  type PackagedElectronApp,
  waitForExactText,
  waitForHeading,
  waitForTestId,
  clickButtonByName,
  getBridgeSurface,
  hasHeading,
} from './support/packaged-app';
import { inspectOwnerBootstrapDatabase } from './support/sqlite-proof';
import { materializeProtectedE2eDatabase } from './support/protected-database-proof';

const SCENARIO = 'owner-bootstrap-restart';
const OWNER = {
  displayName: 'Epic E2E Owner',
  email: 'e2e.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Owner',
};

function artifactDirectory(): string {
  const root = process.env.EPIC_BOS_E2E_ARTIFACTS_DIR?.trim();
  if (!root) {
    throw new Error(
      'EPIC_BOS_E2E_ARTIFACTS_DIR is required. Run this scenario through pnpm test:e2e:electron.',
    );
  }
  return path.join(path.resolve(root), SCENARIO);
}

describe('packaged Electron owner bootstrap and restart', () => {
  it('persists a clean workspace through the real preload, IPC, SQLite, and a second app process', async () => {
    const executable = requireElectronE2eExecutable();
    const artifacts = artifactDirectory();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-owner-'));
    const databasePath = path.join(profile, 'data', 'epic-bos.sqlite3');
    await mkdir(artifacts, { recursive: true });

    let first: PackagedElectronApp | null = null;
    let second: PackagedElectronApp | null = null;
    let completed = false;

    try {
      first = await launchPackagedElectronApp({ executable, profile });
      await waitForHeading(first, 'Create the owner account');

      // This observes the real context-isolated preload without calling its
      // mutation directly. The subsequent form action is the only write.
      expect(await getBridgeSurface(first)).toEqual({
        bootstrapOwner: 'function',
        rawIpcRenderer: 'undefined',
        rawRequire: 'undefined',
      });

      await fillInputByLabel(first, 'Owner name', OWNER.displayName);
      await fillInputByLabel(first, 'Work email', OWNER.email);
      await fillInputByLabel(first, 'Password', OWNER.password);
      await fillInputByLabel(first, 'Confirm password', OWNER.password);
      await clickButtonByName(first, 'Enroll owner and continue');

      await waitForHeading(first, 'Build your operating foundation');
      await waitForTestId(first, 'clean-workspace-onboarding');
      await waitForExactText(first, 'Clean workspace');
      await captureScreenshot(first, path.join(artifacts, '01-enrolled-clean-workspace.png'));
      expect(first.rendererErrors).toEqual([]);

      await closePackagedElectronApp(first);
      first = null;

      const proofDatabasePath = await materializeProtectedE2eDatabase(databasePath);
      const durableState = inspectOwnerBootstrapDatabase(proofDatabasePath, OWNER.email);
      expect(durableState.integrityCheck).toBe('ok');
      expect(durableState.migrationCount).toBeGreaterThan(0);
      expect(durableState.credentialEmail).toBe(OWNER.email);
      expect(durableState.bootstrapGuard).toMatchObject({
        starterMode: 'clean',
        status: 'provisioned',
      });
      expect(durableState.bootstrapGuard?.workspaceId).toBeTruthy();
      expect(durableState.missingRequiredNamespaces).toEqual([]);
      await writeFile(
        path.join(artifacts, '02-sqlite-durability-proof.json'),
        `${JSON.stringify(durableState, null, 2)}\n`,
        'utf8',
      );

      second = await launchPackagedElectronApp({ executable, profile });
      await waitForHeading(second, 'Sign in to Epic BOS');
      expect(await hasHeading(second, 'Create the owner account')).toBe(false);

      await fillInputByLabel(second, 'Work email', OWNER.email);
      await fillInputByLabel(second, 'Password', OWNER.password);
      await clickButtonByName(second, 'Enter command center');

      await waitForHeading(second, 'Build your operating foundation');
      await waitForTestId(second, 'clean-workspace-onboarding');
      await waitForExactText(second, 'Clean workspace');
      await captureScreenshot(second, path.join(artifacts, '03-restarted-and-signed-in.png'));
      expect(second.rendererErrors).toEqual([]);

      await closePackagedElectronApp(second);
      second = null;
      completed = true;
    } finally {
      if (first) await forceClosePackagedElectronApp(first);
      if (second) await forceClosePackagedElectronApp(second);
      // Successful runs leave no personal data or sample records behind. A
      // failed run preserves only its isolated test profile for diagnosis.
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  });
});
