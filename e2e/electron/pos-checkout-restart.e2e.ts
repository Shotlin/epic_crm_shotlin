import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clickButtonByAriaLabel,
  clickButtonByName,
  closePackagedElectronApp,
  fillInputByLabel,
  forceClosePackagedElectronApp,
  inspectButtonInteraction,
  inspectFormControlInteraction,
  launchPackagedElectronApp,
  requireElectronE2eExecutable,
  type PackagedElectronApp,
  waitForExactText,
  waitForEnabledButtonByName,
  waitForHeading,
  waitForTestId,
} from './support/packaged-app';
import {
  POS_CHECKOUT_E2E_FIXTURE,
  seedIsolatedRetailCheckoutFixture,
} from './support/retail-checkout-fixture';
import { inspectRetailCheckoutDatabase } from './support/sqlite-proof';

const SCENARIO = 'pos-checkout-restart';
const OWNER = {
  displayName: 'Epic POS E2E Owner',
  email: 'e2e.pos.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Pos',
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

async function signIn(app: PackagedElectronApp): Promise<void> {
  await waitForHeading(app, 'Sign in to Epic BOS');
  await fillInputByLabel(app, 'Work email', OWNER.email);
  await fillInputByLabel(app, 'Password', OWNER.password);
  await clickButtonByName(app, 'Enter command center');
  await waitForHeading(app, 'Build your operating foundation');
}

async function openPos(app: PackagedElectronApp): Promise<void> {
  // The retail rail progressively discloses Sell submodules. This follows the
  // same two clicks a cashier sees instead of addressing an unrendered
  // submodule control directly.
  await clickButtonByAriaLabel(app, 'Sell');
  await clickButtonByAriaLabel(app, 'Open Point of sale');
  await waitForHeading(app, 'A disciplined counter, not a pretend payment terminal.');
}

describe('packaged Electron POS checkout and restart', () => {
  it('issues a real cash sale through the rendered POS, persists it to SQLite, and shows its receipt after restart', async () => {
    const executable = requireElectronE2eExecutable();
    const artifacts = artifactDirectory();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-pos-'));
    const databasePath = path.join(profile, 'data', 'epic-bos.sqlite3');
    await mkdir(artifacts, { recursive: true });

    let bootstrap: PackagedElectronApp | null = null;
    let checkout: PackagedElectronApp | null = null;
    let restarted: PackagedElectronApp | null = null;
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
      // Enrollment resolves before the clean-workspace initializer finishes.
      // Wait for the same stable onboarding surface proven by the owner E2E
      // before closing the real app and opening its isolated SQLite file.
      await waitForTestId(bootstrap, 'clean-workspace-onboarding');
      await waitForExactText(bootstrap, 'Clean workspace');
      await closePackagedElectronApp(bootstrap);
      bootstrap = null;

      const seeded = await seedIsolatedRetailCheckoutFixture(databasePath);
      expect(seeded).toEqual(POS_CHECKOUT_E2E_FIXTURE);
      await writeFile(
        path.join(artifacts, '01-isolated-fixture-manifest.json'),
        `${JSON.stringify(seeded, null, 2)}\n`,
        'utf8',
      );

      checkout = await launchPackagedElectronApp({ executable, profile });
      await signIn(checkout);
      await openPos(checkout);
      await clickButtonByName(checkout, `Open shift at ${POS_CHECKOUT_E2E_FIXTURE.counterCode}`);
      await waitForExactText(checkout, 'Your cashier shift');
      await clickButtonByName(checkout, '+ Add');
      await waitForExactText(checkout, 'Cart (1 line)');
      await fillInputByLabel(
        checkout,
        'INR',
        POS_CHECKOUT_E2E_FIXTURE.grandTotal.toFixed(2),
        { within: '.retail-pos-workbench' },
      );
      const drawerReferenceDiagnostics = await inspectFormControlInteraction(
        checkout,
        'Drawer reference',
        { within: '.retail-pos-workbench' },
      );
      await writeFile(
        path.join(artifacts, '02-drawer-reference-visible-control.json'),
        `${JSON.stringify(drawerReferenceDiagnostics, null, 2)}\n`,
        'utf8',
      );
      // The visible POS control must own the pointer target. If an adjacent
      // returns workbench intercepts it, that is a human-facing product
      // overlay defect and the packaged certification must stop here.
      expect(drawerReferenceDiagnostics.retailReturns.interceptsTarget).toBe(false);
      expect(drawerReferenceDiagnostics.selected).toMatchObject({
        workbench: 'retail-pos-workbench',
        hitTestVisible: true,
      });
      await fillInputByLabel(
        checkout,
        'Drawer reference',
        POS_CHECKOUT_E2E_FIXTURE.cashTenderReference,
        { within: '.retail-pos-workbench' },
      );
      const checkoutButtonDiagnostics = await inspectButtonInteraction(checkout, 'Complete governed checkout');
      await writeFile(
        path.join(artifacts, '02b-governed-checkout-button.json'),
        `${JSON.stringify(checkoutButtonDiagnostics, null, 2)}\n`,
        'utf8',
      );
      expect(checkoutButtonDiagnostics.matches).toHaveLength(1);
      expect(checkoutButtonDiagnostics.matches[0]).toMatchObject({
        disabled: false,
        visible: true,
        workbench: 'retail-pos-workbench',
        form: { valid: true, invalidControls: [] },
      });
      await waitForEnabledButtonByName(checkout, 'Complete governed checkout');
      await clickButtonByName(checkout, 'Complete governed checkout');
      await waitForExactText(checkout, 'Retail sale submitted to the atomic checkout boundary. A completed receipt appears only after invoice, tender, stock, and cost evidence all commit.');
      expect(checkout.rendererErrors).toEqual([]);
      await closePackagedElectronApp(checkout);
      checkout = null;

      const durableState = inspectRetailCheckoutDatabase(databasePath, POS_CHECKOUT_E2E_FIXTURE);
      expect(durableState.integrityCheck).toBe('ok');
      expect(durableState.sale).toMatchObject({
        cashierId: 'user-avery',
        status: 'completed',
        subtotal: POS_CHECKOUT_E2E_FIXTURE.unitPrice,
        grandTotal: POS_CHECKOUT_E2E_FIXTURE.grandTotal,
        cashTenderAmount: POS_CHECKOUT_E2E_FIXTURE.grandTotal,
        costTotal: POS_CHECKOUT_E2E_FIXTURE.unitCost,
      });
      expect(durableState.stock).toMatchObject({
        quantity: POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterCheckout,
        available: POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterCheckout,
      });
      expect(durableState.invoice.status).toBe('paid');
      expect(durableState.paymentReceipt).toMatchObject({ method: 'cash', status: 'recorded' });
      expect(durableState.retailLedger).toMatchObject({ quantity: -1, value: -POS_CHECKOUT_E2E_FIXTURE.unitCost });
      expect(durableState.costJournal).toMatchObject({ balanced: true, totalDebit: POS_CHECKOUT_E2E_FIXTURE.unitCost });
      await writeFile(
        path.join(artifacts, '03-pos-sqlite-durability-proof.json'),
        `${JSON.stringify(durableState, null, 2)}\n`,
        'utf8',
      );

      restarted = await launchPackagedElectronApp({ executable, profile });
      await signIn(restarted);
      await openPos(restarted);
      await waitForExactText(restarted, durableState.sale.number);
      await waitForExactText(restarted, `${POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterCheckout} in stock`);
      expect(restarted.rendererErrors).toEqual([]);
      await closePackagedElectronApp(restarted);
      restarted = null;
      completed = true;
    } finally {
      if (bootstrap) await forceClosePackagedElectronApp(bootstrap);
      if (checkout) await forceClosePackagedElectronApp(checkout);
      if (restarted) await forceClosePackagedElectronApp(restarted);
      // The fixture is created only after the owner has used the actual
      // bootstrap UI and only in this disposable profile. Successful runs
      // remove it; failures retain it solely for diagnosis.
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  });
});
