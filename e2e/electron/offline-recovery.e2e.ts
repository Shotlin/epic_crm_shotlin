import { mkdir, rename, rm, writeFile, mkdtemp } from 'node:fs/promises';
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
  waitForEnabledButtonByName,
  waitForExactText,
  waitForHeading,
  waitForTestId,
} from './support/packaged-app';
import { materializeProtectedE2eDatabase } from './support/protected-database-proof';
import {
  POS_CHECKOUT_E2E_FIXTURE,
  seedIsolatedRetailCheckoutFixture,
} from './support/retail-checkout-fixture';
import { inspectRetailOfflineRecoveryDatabase } from './support/sqlite-proof';

const SCENARIO = 'offline-recovery';
const OWNER = {
  displayName: 'Epic Offline E2E Owner',
  email: 'e2e.offline.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Offline',
};

function artifactDirectory(): string {
  const root = process.env.EPIC_BOS_E2E_ARTIFACTS_DIR?.trim();
  if (!root) throw new Error('EPIC_BOS_E2E_ARTIFACTS_DIR is required for packaged E2E.');
  return path.join(path.resolve(root), SCENARIO);
}

async function signIn(app: PackagedElectronApp): Promise<void> {
  await waitForHeading(app, 'Sign in to Epic BOS');
  await fillInputByLabel(app, 'Work email', OWNER.email);
  await fillInputByLabel(app, 'Password', OWNER.password);
  await clickButtonByName(app, 'Enter command center');
  await waitForHeading(app, 'Build your operating foundation');
}

async function openPos(app: PackagedElectronApp): Promise<void> {
  await clickButtonByAriaLabel(app, 'Sell');
  const posVisible = await app.cdp.evaluate<boolean>(`Boolean([...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Open Point of sale'))`);
  if (!posVisible) await clickButtonByAriaLabel(app, 'Sell');
  await clickButtonByAriaLabel(app, 'Open Point of sale');
  await waitForHeading(app, 'A disciplined counter, not a pretend payment terminal.');
}

describe('packaged Electron offline recovery', () => {
  it('persists a queued sale across restart and synchronizes it through the governed boundary', async () => {
    const executable = requireElectronE2eExecutable();
    const artifacts = artifactDirectory();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-offline-'));
    const databasePath = path.join(profile, 'data', 'epic-bos.sqlite3');
    await mkdir(artifacts, { recursive: true });

    let bootstrap: PackagedElectronApp | null = null;
    let cashier: PackagedElectronApp | null = null;
    let afterQueueRestart: PackagedElectronApp | null = null;
    let afterSyncRestart: PackagedElectronApp | null = null;
    let completed = false;

    try {
      bootstrap = await launchPackagedElectronApp({ executable, profile });
      await waitForHeading(bootstrap, 'Create the owner account');
      await fillInputByLabel(bootstrap, 'Owner name', OWNER.displayName);
      await fillInputByLabel(bootstrap, 'Work email', OWNER.email);
      await fillInputByLabel(bootstrap, 'Password', OWNER.password);
      await fillInputByLabel(bootstrap, 'Confirm password', OWNER.password);
      await clickButtonByName(bootstrap, 'Enroll owner and continue');
      await waitForHeading(bootstrap, 'Build your operating foundation');
      await waitForTestId(bootstrap, 'clean-workspace-onboarding');
      await closePackagedElectronApp(bootstrap);
      bootstrap = null;

      const runtimeDatabasePath = `${databasePath}.runtime`;
      const materializedRuntimePath = await materializeProtectedE2eDatabase(databasePath);
      await rename(materializedRuntimePath, runtimeDatabasePath);
      const seeded = await seedIsolatedRetailCheckoutFixture(runtimeDatabasePath);
      expect(seeded).toEqual(POS_CHECKOUT_E2E_FIXTURE);
      await writeFile(path.join(artifacts, '01-isolated-fixture-manifest.json'), `${JSON.stringify(seeded, null, 2)}\n`, 'utf8');

      cashier = await launchPackagedElectronApp({ executable, profile });
      await signIn(cashier);
      await openPos(cashier);
      await clickButtonByName(cashier, `Open shift at ${POS_CHECKOUT_E2E_FIXTURE.counterCode}`);
      await waitForExactText(cashier, 'Your cashier shift');
      await clickButtonByName(cashier, '+ Add');
      await waitForExactText(cashier, 'Cart (1 line)');
      await fillInputByLabel(cashier, 'INR', POS_CHECKOUT_E2E_FIXTURE.grandTotal.toFixed(2), { within: '.retail-pos-workbench' });
      await fillInputByLabel(cashier, 'Drawer reference', POS_CHECKOUT_E2E_FIXTURE.cashTenderReference, { within: '.retail-pos-workbench' });
      await clickButtonByName(cashier, 'Save securely for offline sync');
      await waitForEnabledButtonByName(cashier, 'Synchronize');
      await writeFile(path.join(artifacts, '02-queued-before-restart.txt'), await cashier.cdp.evaluate<string>('document.body.innerText'), 'utf8');
      await closePackagedElectronApp(cashier);
      cashier = null;

      afterQueueRestart = await launchPackagedElectronApp({ executable, profile });
      await signIn(afterQueueRestart);
      await openPos(afterQueueRestart);
      await waitForEnabledButtonByName(afterQueueRestart, 'Synchronize');
      await writeFile(path.join(artifacts, '03-queued-after-restart.txt'), await afterQueueRestart.cdp.evaluate<string>('document.body.innerText'), 'utf8');
      await clickButtonByName(afterQueueRestart, 'Synchronize');
      await waitForExactText(afterQueueRestart, 'Offline sale synchronized through the governed checkout boundary.');
      await waitForEnabledButtonByName(afterQueueRestart, 'View Receipt');
      await writeFile(path.join(artifacts, '04-synced-before-final-restart.txt'), await afterQueueRestart.cdp.evaluate<string>('document.body.innerText'), 'utf8');
      await closePackagedElectronApp(afterQueueRestart);
      afterQueueRestart = null;

      const proofDatabasePath = await materializeProtectedE2eDatabase(databasePath);
      const durableState = inspectRetailOfflineRecoveryDatabase(proofDatabasePath, POS_CHECKOUT_E2E_FIXTURE);
      expect(durableState.integrityCheck).toBe('ok');
      expect(durableState.queue).toMatchObject({ status: 'synced', attempts: 1, queuedBy: 'user-avery' });
      expect(durableState.journalStatuses).toEqual(expect.arrayContaining(['queued', 'syncing', 'synced']));
      expect(durableState.sale).toMatchObject({ status: 'completed', cashierId: 'user-avery', grandTotal: POS_CHECKOUT_E2E_FIXTURE.grandTotal });
      expect(durableState.stock).toMatchObject({ quantity: POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterCheckout, available: POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterCheckout });
      await writeFile(path.join(artifacts, '05-offline-sqlite-durability-proof.json'), `${JSON.stringify(durableState, null, 2)}\n`, 'utf8');

      afterSyncRestart = await launchPackagedElectronApp({ executable, profile });
      await signIn(afterSyncRestart);
      await openPos(afterSyncRestart);
      await waitForEnabledButtonByName(afterSyncRestart, 'View Receipt');
      expect(afterSyncRestart.rendererErrors).toEqual([]);
      await closePackagedElectronApp(afterSyncRestart);
      afterSyncRestart = null;
      completed = true;
    } finally {
      if (bootstrap) await forceClosePackagedElectronApp(bootstrap);
      if (cashier) await forceClosePackagedElectronApp(cashier);
      if (afterQueueRestart) await forceClosePackagedElectronApp(afterQueueRestart);
      if (afterSyncRestart) await forceClosePackagedElectronApp(afterSyncRestart);
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  });
});
