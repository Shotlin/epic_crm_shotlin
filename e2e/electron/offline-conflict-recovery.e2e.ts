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
  waitForEnabledButtonByName,
  waitForButtonByAriaLabel,
  waitForExactText,
  waitForHeading,
  waitForTestId,
  type PackagedElectronApp,
} from './support/packaged-app';
import { materializeProtectedE2eDatabase, rewrapProtectedE2eDatabase } from './support/protected-database-proof';
import {
  POS_CHECKOUT_E2E_FIXTURE,
  provisionIsolatedCashReviewer,
  seedIsolatedRetailCheckoutFixture,
} from './support/retail-checkout-fixture';
import { BusinessDatabase } from '../../src/main/database';
import type { RevenueOpsState } from '../../src/shared/revenue-ops-contracts';
import { inspectRetailOfflineConflictDatabase } from './support/sqlite-proof';

const SCENARIO = 'offline-conflict-recovery';
const OWNER = {
  displayName: 'Epic Offline Conflict E2E Owner',
  email: 'e2e.offline.conflict.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Conflict',
};

function artifactDirectory(): string {
  const root = process.env.EPIC_BOS_E2E_ARTIFACTS_DIR?.trim();
  if (!root) throw new Error('EPIC_BOS_E2E_ARTIFACTS_DIR is required for packaged E2E.');
  return path.join(path.resolve(root), SCENARIO);
}

async function signIn(app: PackagedElectronApp, credentials: { email: string; password: string }): Promise<void> {
  await waitForHeading(app, 'Sign in to Epic BOS');
  await fillInputByLabel(app, 'Work email', credentials.email);
  await fillInputByLabel(app, 'Password', credentials.password);
  await clickButtonByName(app, 'Enter command center');
  await waitForButtonByAriaLabel(app, 'Sell');
}

async function signInReviewer(app: PackagedElectronApp, reviewer: { email: string; temporaryPassword: string; newPassword: string }): Promise<void> {
  await waitForHeading(app, 'Sign in to Epic BOS');
  await fillInputByLabel(app, 'Work email', reviewer.email);
  await fillInputByLabel(app, 'Password', reviewer.temporaryPassword);
  await clickButtonByName(app, 'Enter command center');
  await waitForHeading(app, 'Choose a permanent password');
  await fillInputByLabel(app, 'Temporary password', reviewer.temporaryPassword);
  await fillInputByLabel(app, 'New password', reviewer.newPassword);
  await fillInputByLabel(app, 'Confirm new password', reviewer.newPassword);
  await clickButtonByName(app, 'Replace password and continue');
  await waitForHeading(app, 'Sign in to Epic BOS');
  await fillInputByLabel(app, 'Work email', reviewer.email);
  await fillInputByLabel(app, 'Password', reviewer.newPassword);
  await clickButtonByName(app, 'Enter command center');
  await waitForButtonByAriaLabel(app, 'Sell');
}

async function openPos(app: PackagedElectronApp): Promise<void> {
  await clickButtonByAriaLabel(app, 'Sell');
  const posVisible = await app.cdp.evaluate<boolean>(`Boolean([...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Open Point of sale'))`);
  if (!posVisible) await clickButtonByAriaLabel(app, 'Sell');
  await clickButtonByAriaLabel(app, 'Open Point of sale');
  await waitForHeading(app, 'A disciplined counter, not a pretend payment terminal.');
}

async function tamperQueueEvidence(plaintextPath: string): Promise<{ reviewerEmail: string; reviewerTemporaryPassword: string; reviewerPassword: string }> {
  const reviewer = await provisionIsolatedCashReviewer(plaintextPath);
  const database = new BusinessDatabase(plaintextPath);
  await database.initialize();
  try {
    const stored = database.loadState<RevenueOpsState>('revenue-ops-india');
    if (!stored) throw new Error('Revenue operations state is missing from the isolated conflict fixture.');
    const queueItem = stored.payload.retailOfflineSaleQueue[0];
    if (!queueItem) throw new Error('Offline queue item is missing from the isolated conflict fixture.');
    const tampered = structuredClone(stored.payload);
    const target = tampered.retailOfflineSaleQueue.find((item) => item.id === queueItem.id);
    if (!target) throw new Error('Offline queue item disappeared during conflict mutation.');
    target.input = {
      ...target.input,
      tenders: [{ method: 'cash', amount: POS_CHECKOUT_E2E_FIXTURE.grandTotal + 1, reference: POS_CHECKOUT_E2E_FIXTURE.cashTenderReference }],
    };
    tampered.revision += 1;
    database.saveState('revenue-ops-india', stored.schemaVersion, stored.revision + 1, tampered);
    return { reviewerEmail: reviewer.email, reviewerTemporaryPassword: reviewer.temporaryPassword, reviewerPassword: reviewer.newPassword };
  } finally {
    database.close();
  }
}

describe('packaged Electron offline conflict recovery', () => {
  it('blocks cashier self-resolution and records independent supervisor discard evidence', async () => {
    const executable = requireElectronE2eExecutable();
    const artifacts = artifactDirectory();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-offline-conflict-'));
    const databasePath = path.join(profile, 'data', 'epic-bos.sqlite3');
    await mkdir(artifacts, { recursive: true });

    let bootstrap: PackagedElectronApp | null = null;
    let cashier: PackagedElectronApp | null = null;
    let cashierRecovery: PackagedElectronApp | null = null;
    let supervisor: PackagedElectronApp | null = null;
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
      await signIn(cashier, OWNER);
      await openPos(cashier);
      await clickButtonByName(cashier, `Open shift at ${POS_CHECKOUT_E2E_FIXTURE.counterCode}`);
      await waitForExactText(cashier, 'Your cashier shift');
      await clickButtonByName(cashier, '+ Add');
      await waitForExactText(cashier, 'Cart (1 line)');
      await fillInputByLabel(cashier, 'INR', POS_CHECKOUT_E2E_FIXTURE.grandTotal.toFixed(2), { within: '.retail-pos-workbench' });
      await fillInputByLabel(cashier, 'Drawer reference', POS_CHECKOUT_E2E_FIXTURE.cashTenderReference, { within: '.retail-pos-workbench' });
      await clickButtonByName(cashier, 'Save securely for offline sync');
      await waitForEnabledButtonByName(cashier, 'Synchronize');
      await writeFile(path.join(artifacts, '02-queued-before-tamper.txt'), await cashier.cdp.evaluate<string>('document.body.innerText'), 'utf8');
      await closePackagedElectronApp(cashier);
      cashier = null;

      const tamperedPath = await materializeProtectedE2eDatabase(databasePath);
      const reviewer = await tamperQueueEvidence(tamperedPath);
      await rewrapProtectedE2eDatabase(databasePath, tamperedPath);

      cashierRecovery = await launchPackagedElectronApp({ executable, profile });
      await signIn(cashierRecovery, OWNER);
      await openPos(cashierRecovery);
      await waitForEnabledButtonByName(cashierRecovery, 'Synchronize');
      await clickButtonByName(cashierRecovery, 'Synchronize');
      await waitForExactText(cashierRecovery, 'Offline sale synchronized through the governed checkout boundary.');
      await waitForExactText(cashierRecovery, 'An independent supervisor must resolve this conflict with recovery evidence.');
      await writeFile(path.join(artifacts, '03-cashier-conflict-visible.txt'), await cashierRecovery.cdp.evaluate<string>('document.body.innerText'), 'utf8');
      await closePackagedElectronApp(cashierRecovery);
      cashierRecovery = null;

      supervisor = await launchPackagedElectronApp({ executable, profile });
      await signInReviewer(supervisor, {
        email: reviewer.reviewerEmail,
        temporaryPassword: reviewer.reviewerTemporaryPassword,
        newPassword: reviewer.reviewerPassword,
      });
      await openPos(supervisor);
      await waitForExactText(supervisor, 'Offline payload checksum does not match persisted queue evidence.');
      await fillInputByLabel(supervisor, 'Recovery evidence reference', 'POWER-FAIL-STORE-001');
      await clickButtonByName(supervisor, 'Discard');
      await waitForExactText(supervisor, 'Offline sale discarded with supervisor evidence.');
      await writeFile(path.join(artifacts, '04-supervisor-discarded.txt'), await supervisor.cdp.evaluate<string>('document.body.innerText'), 'utf8');
      expect(supervisor.rendererErrors).toEqual([]);
      await closePackagedElectronApp(supervisor);
      supervisor = null;

      const proofDatabasePath = await materializeProtectedE2eDatabase(databasePath);
      const durableState = inspectRetailOfflineConflictDatabase(proofDatabasePath);
      expect(durableState.integrityCheck).toBe('ok');
      expect(durableState.queue).toMatchObject({ status: 'discarded', attempts: 1, queuedBy: 'user-avery', resolvedBy: 'user-priya', resolutionEvidenceReference: 'POWER-FAIL-STORE-001' });
      expect(durableState.journalStatuses).toEqual(expect.arrayContaining(['queued', 'syncing', 'conflict', 'discarded']));
      expect(durableState.saleCount).toBe(0);
      await writeFile(path.join(artifacts, '05-offline-conflict-sqlite-durability-proof.json'), `${JSON.stringify(durableState, null, 2)}\n`, 'utf8');
      completed = true;
    } finally {
      if (bootstrap) await forceClosePackagedElectronApp(bootstrap);
      if (cashier) await forceClosePackagedElectronApp(cashier);
      if (cashierRecovery) await forceClosePackagedElectronApp(cashierRecovery);
      if (supervisor) await forceClosePackagedElectronApp(supervisor);
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  });
});
