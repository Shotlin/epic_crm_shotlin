import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clickButtonByAriaLabel,
  clickButtonByName,
  clickFormControlBySelector,
  captureScreenshot,
  closePackagedElectronApp,
  fillInputByLabel,
  forceClosePackagedElectronApp,
  inspectButtonInteraction,
  inspectFormControlInteraction,
  launchPackagedElectronApp,
  requireElectronE2eExecutable,
  type PackagedElectronApp,
  waitForExactText,
  waitForButtonByAriaLabel,
  waitForEnabledButtonByName,
  waitForHeading,
  waitForTestId,
} from './support/packaged-app';
import {
  POS_CHECKOUT_E2E_FIXTURE,
  provisionIsolatedCashReviewer,
  seedIsolatedRetailCheckoutFixture,
} from './support/retail-checkout-fixture';
import { inspectRetailCheckoutDatabase } from './support/sqlite-proof';
import { materializeProtectedE2eDatabase } from './support/protected-database-proof';

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

async function signInCashReviewer(
  app: PackagedElectronApp,
  reviewer: { email: string; temporaryPassword: string; newPassword: string },
): Promise<void> {
  await waitForHeading(app, 'Sign in to Epic BOS');
  await fillInputByLabel(app, 'Work email', reviewer.email);
  await fillInputByLabel(app, 'Password', reviewer.temporaryPassword);
  await clickButtonByName(app, 'Enter command center');
  await waitForHeading(app, 'Choose a permanent password');
  await fillInputByLabel(app, 'Temporary password', reviewer.temporaryPassword);
  await fillInputByLabel(app, 'New password', reviewer.newPassword);
  await fillInputByLabel(app, 'Confirm new password', reviewer.newPassword);
  await clickButtonByName(app, 'Replace password and continue');
  // Required-password rotation deliberately invalidates the temporary
  // session. Re-enter through the ordinary login boundary with the new
  // credential before opening any governed workbench.
  await waitForHeading(app, 'Sign in to Epic BOS');
  await fillInputByLabel(app, 'Work email', reviewer.email);
  await fillInputByLabel(app, 'Password', reviewer.newPassword);
  await clickButtonByName(app, 'Enter command center');
  try {
    await waitForButtonByAriaLabel(app, 'Sell');
  } catch (error) {
    const debugRoot = process.env.EPIC_BOS_E2E_ARTIFACTS_DIR ?? process.cwd();
    await writeFile(path.join(debugRoot, 'cash-reviewer-body.txt'), await app.cdp.evaluate<string>('document.body.innerText'), 'utf8');
    await captureScreenshot(app, path.join(debugRoot, 'cash-reviewer-timeout.png'), { fullPage: true });
    throw error;
  }
}

async function openPos(app: PackagedElectronApp): Promise<void> {
  // The retail rail progressively discloses Sell submodules. This follows the
  // same two clicks a cashier sees instead of addressing an unrendered
  // submodule control directly.
  await clickButtonByAriaLabel(app, 'Sell');
  // Clicking an already-expanded parent collapses it. This helper is also
  // used when returning from the returns desk, where Sell is already open.
  const posVisible = await app.cdp.evaluate<boolean>(`Boolean([...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Open Point of sale'))`);
  if (!posVisible) await clickButtonByAriaLabel(app, 'Sell');
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
    let reviewerApp: PackagedElectronApp | null = null;
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

      const runtimeDatabasePath = `${databasePath}.runtime`;
      const materializedRuntimePath = await materializeProtectedE2eDatabase(databasePath);
      await rename(materializedRuntimePath, runtimeDatabasePath);
      const seeded = await seedIsolatedRetailCheckoutFixture(runtimeDatabasePath);
      expect(seeded).toEqual(POS_CHECKOUT_E2E_FIXTURE);
      const reviewer = await provisionIsolatedCashReviewer(runtimeDatabasePath);
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

      // Exercise the next retail control boundary from the real UI: the
      // cashier selects the immutable receipt, records a return request, and
      // completes physical inspection before any independent approval.
      await clickButtonByAriaLabel(checkout, 'Sell');
      await clickButtonByAriaLabel(checkout, 'Returns and exchange');
      await waitForHeading(checkout, 'Return the receipt, inspect the goods, then let a different person decide.');
      await clickFormControlBySelector(checkout, '.retail-returns-workbench__line-toggle');
      await fillInputByLabel(checkout, 'Return reason', 'E2E packaged return inspection');
      await clickButtonByName(checkout, 'Record counter-return request');
      await waitForExactText(checkout, 'Counter-return request recorded from the immutable POS receipt. No stock, refund, settlement, or GST credit note was created.');
      await fillInputByLabel(checkout, 'Inspection reference', 'E2E-RETURN-INSPECTION-0001');
      await fillInputByLabel(checkout, 'Condition notes', 'Sealed pack, expiry and saleable condition checked.');
      await clickButtonByName(checkout, 'Record complete inspection');
      await waitForExactText(checkout, 'Inspection captured. Stock still has not moved; a separate independent decision is now required.');
      // Return inspection is a separate desk. Re-open the governed POS desk
      // before closing the cashier shift so the close action is exercised on
      // the same rendered route a store operator uses.
      await openPos(checkout);

      await waitForEnabledButtonByName(checkout, 'Request independent close');
      const closeFormScope = '.retail-pos-workbench__tender-close .retail-pos-workbench__close-form';
      const closeCashDiagnostics = await inspectFormControlInteraction(checkout, 'Declared drawer cash', { within: closeFormScope });
      await writeFile(path.join(artifacts, '02c-close-cash-control.json'), `${JSON.stringify(closeCashDiagnostics, null, 2)}\n`, 'utf8');
      await fillInputByLabel(checkout, 'Declared drawer cash', POS_CHECKOUT_E2E_FIXTURE.grandTotal.toFixed(2), { within: closeFormScope });
      for (const [label, value] of [
        ['Cash / drawer', POS_CHECKOUT_E2E_FIXTURE.grandTotal.toFixed(2)],
        ['UPI', '0.00'],
        ['Card', '0.00'],
        ['Cheque', '0.00'],
        ['Store credit', '0.00'],
        ['Customer credit', '0.00'],
        ['Other', '0.00'],
      ] as const) {
        await fillInputByLabel(checkout, label, value, { within: closeFormScope });
      }
      await fillInputByLabel(checkout, 'Count-sheet / close evidence', 'E2E-CASH-CLOSE-0001', { within: closeFormScope });
      await clickButtonByName(checkout, 'Request independent close');
      await waitForExactText(checkout, 'Shift close submitted for an independent review. A drawer variance cannot be auto-closed.');
      expect(checkout.rendererErrors).toEqual([]);
      await closePackagedElectronApp(checkout);
      checkout = null;

      reviewerApp = await launchPackagedElectronApp({ executable, profile });
      await signInCashReviewer(reviewerApp, reviewer);
      await clickButtonByAriaLabel(reviewerApp, 'Sell');
      await clickButtonByAriaLabel(reviewerApp, 'Returns and exchange');
      await waitForHeading(reviewerApp, 'Return the receipt, inspect the goods, then let a different person decide.');
      await waitForExactText(reviewerApp, 'Approve physical re-entry');
      await fillInputByLabel(reviewerApp, 'Independent decision evidence / rejection reason', 'E2E-RETURN-APPROVAL-0001');
      await waitForEnabledButtonByName(reviewerApp, 'Approve physical re-entry');
      await clickButtonByName(reviewerApp, 'Approve physical re-entry');
      await waitForExactText(reviewerApp, 'Counter return approved. Only the inspected physical stock and COGS-reversal draft were prepared; customer refund and GST credit note remain separate controls.');
      await openPos(reviewerApp);
      await waitForExactText(reviewerApp, 'Approve shift close');
      await fillInputByLabel(reviewerApp, 'Review evidence', 'E2E-CASH-CLOSE-REVIEW-0001', { within: '.retail-pos-workbench__review' });
      await writeFile(path.join(artifacts, 'reviewer-approve-button.json'), `${JSON.stringify(await inspectButtonInteraction(reviewerApp, 'Approve shift close'), null, 2)}\n`, 'utf8');
      try {
        await waitForEnabledButtonByName(reviewerApp, 'Approve shift close');
      } catch (error) {
        const reviewerState = await reviewerApp.cdp.evaluate<string>(`JSON.stringify({
          body: document.body.innerText,
          inputs: [...document.querySelectorAll('.retail-pos-workbench__review input')].map((input) => ({
            value: input.value,
            aria: input.getAttribute('aria-label'),
            placeholder: input.getAttribute('placeholder'),
          })),
        })`);
        await writeFile(path.join(artifacts, 'reviewer-state.json'), `${reviewerState}\n`, 'utf8');
        throw error;
      }
      await clickButtonByName(reviewerApp, 'Approve shift close');
      await waitForExactText(reviewerApp, 'Shift close approved. Cash evidence and any resulting state remain traceable.');
      expect(reviewerApp.rendererErrors).toEqual([]);
      await closePackagedElectronApp(reviewerApp);
      reviewerApp = null;

      const proofDatabasePath = await materializeProtectedE2eDatabase(databasePath);
      const durableState = inspectRetailCheckoutDatabase(proofDatabasePath, POS_CHECKOUT_E2E_FIXTURE);
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
        quantity: POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterApprovedReturn,
        available: POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterApprovedReturn,
      });
      expect(durableState.invoice.status).toBe('paid');
      expect(durableState.paymentReceipt).toMatchObject({ method: 'cash', status: 'reconciled' });
      expect(durableState.shift).toMatchObject({ status: 'closed', cashierId: 'user-avery', closedBy: 'user-priya', variance: 0 });
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
      await waitForExactText(restarted, `${POS_CHECKOUT_E2E_FIXTURE.stockQuantityAfterApprovedReturn} in stock`);
      expect(restarted.rendererErrors).toEqual([]);
      await closePackagedElectronApp(restarted);
      restarted = null;
      completed = true;
    } finally {
      if (bootstrap) await forceClosePackagedElectronApp(bootstrap);
      if (checkout) await forceClosePackagedElectronApp(checkout);
      if (reviewerApp) await forceClosePackagedElectronApp(reviewerApp);
      if (restarted) await forceClosePackagedElectronApp(restarted);
      // The fixture is created only after the owner has used the actual
      // bootstrap UI and only in this disposable profile. Successful runs
      // remove it; failures retain it solely for diagnosis.
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  });
});
