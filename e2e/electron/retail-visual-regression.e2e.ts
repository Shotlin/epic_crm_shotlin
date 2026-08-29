import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import {
  captureScreenshot,
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
  displayName: 'Epic Visual Evidence Owner',
  email: 'e2e.visual.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Visual',
};

const VIEWPORT = { width: 1600, height: 1000 } as const;

const WORKSPACES = [
  { route: 'Home', testId: 'bakaloo-retail-command-center', screenshot: '01-home-command-centre.png', reference: '01_home_command_centre.png' },
  { route: 'Sell', testId: 'retail-sell-overview', screenshot: '02-sell-pos.png', reference: '02_sell_pos.png' },
  { route: 'Stock', testId: 'retail-stock-overview', screenshot: '03-stock-purchase.png', reference: '03_stock_purchase.png' },
  { route: 'Deliver', testId: 'retail-delivery-overview', screenshot: '04-delivery-control.png', reference: '04_delivery_control.png' },
  { route: 'Customers', testId: 'retail-customer-360', screenshot: '05-customer-360.png', reference: '05_customer_360.png' },
  { route: 'Money', testId: 'retail-cash-overview', screenshot: '06-money-close.png', reference: '06_money_close.png' },
  { route: 'Insights', testId: 'retail-insights-overview', screenshot: '07-insights-executive.png', reference: '07_insights_executive.png' },
  { route: 'Setup', testId: 'retail-setup-overview', screenshot: '08-setup-admin.png', reference: '08_setup_admin.png' },
] as const;

type WorkspaceEvidence = {
  route: string;
  testId: string;
  screenshot: string;
  reference: string;
  routeActive: string | null;
  navigation: {
    primaryRouteCount: number;
    left: number;
    width: number;
  };
  canvas: {
    left: number;
    width: number;
    headingCount: number;
    textLength: number;
  };
  viewport: {
    width: number;
    height: number;
    documentScrollWidth: number;
    mainOverflowY: string;
    mainScrollHeight: number;
    mainClientHeight: number;
  };
};

function evidenceRevision(): string {
  const value = process.env.EPIC_BOS_BUILD_REVISION?.trim()
    ?? process.env.GITHUB_SHA?.trim().slice(0, 12)
    ?? `local-${process.env.npm_package_version ?? 'unknown'}`;
  const safeValue = value.replace(/[^a-zA-Z0-9._-]/gu, '_');
  return safeValue || 'local';
}

function visualEvidenceDirectory(): string {
  const configured = process.env.EPIC_BOS_VISUAL_EVIDENCE_DIR?.trim();
  if (configured) return path.resolve(process.cwd(), configured);
  return path.resolve(process.cwd(), 'test-evidence', 'visual', evidenceRevision());
}

async function waitForActiveRoute(app: PackagedElectronApp, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const active = await app.cdp.evaluate<string | null>(
      `document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-current="page"]')?.getAttribute('aria-label') ?? null`,
    );
    if (active === label) return;
    await delay(100);
  }
  const current = await app.cdp.evaluate<string>(
    `JSON.stringify([...document.querySelectorAll('[data-testid="retail-workspace-navigation"] button.retail-workspace-navigation__item')].map((button) => ({ label: button.getAttribute('aria-label'), active: button.getAttribute('aria-current') })))`,
  );
  throw new Error(`Retail workspace did not select ${label}. Current rail: ${current}`);
}

async function selectWorkspace(app: PackagedElectronApp, label: string): Promise<void> {
  // A full workspace rail can be taller than a laptop viewport. Scroll the
  // actual primary button into view before issuing a normal pointer click.
  await app.cdp.evaluate(`(() => {
    const button = document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-label=${JSON.stringify(label)}]');
    button?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  })()`);
  await delay(50);
  await clickButtonByAriaLabel(app, label);
  await waitForActiveRoute(app, label);
  await app.cdp.evaluate(`document.querySelector('.main-content')?.scrollTo({ top: 0, left: 0, behavior: 'instant' })`);
}

async function captureWorkspaceEvidence(
  app: PackagedElectronApp,
  workspace: (typeof WORKSPACES)[number],
  destination: string,
): Promise<WorkspaceEvidence> {
  await selectWorkspace(app, workspace.route);
  await waitForTestId(app, workspace.testId);
  // Let the route's derived local projection and normal browser layout settle
  // before recording the visual evidence. This is not an artificial data or
  // rendering seam; the application remains in its clean local workspace.
  await delay(250);

  const evidence = await app.cdp.evaluate<WorkspaceEvidence>(`(() => {
    const navigation = document.querySelector('[data-testid="retail-workspace-navigation"]');
    const canvas = document.getElementById('workspace-canvas');
    const main = document.querySelector('.main-content');
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value ? { left: Math.round(value.left), width: Math.round(value.width) } : { left: -1, width: 0 };
    };
    const active = document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-current="page"]');
    const canvasRect = rect(canvas);
    const navigationRect = rect(navigation);
    return {
      route: ${JSON.stringify(workspace.route)},
      testId: ${JSON.stringify(workspace.testId)},
      screenshot: ${JSON.stringify(workspace.screenshot)},
      reference: ${JSON.stringify(workspace.reference)},
      routeActive: active?.getAttribute('aria-label') ?? null,
      navigation: {
        primaryRouteCount: document.querySelectorAll('[data-testid="retail-workspace-navigation"] > ul > li > button').length,
        left: navigationRect.left,
        width: navigationRect.width,
      },
      canvas: {
        left: canvasRect.left,
        width: canvasRect.width,
        headingCount: canvas?.querySelectorAll('h1, h2, h3').length ?? 0,
        textLength: canvas?.textContent?.trim().length ?? 0,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        mainOverflowY: main ? getComputedStyle(main).overflowY : 'missing',
        mainScrollHeight: main?.scrollHeight ?? 0,
        mainClientHeight: main?.clientHeight ?? 0,
      },
    };
  })()`);

  // These are durable structural assertions. They verify an operator can
  // reach the intended retail surface and keep the rail to the left of the
  // working canvas, without claiming that an image is pixel-identical to a
  // static design reference.
  expect(evidence.routeActive).toBe(workspace.route);
  expect(evidence.navigation.primaryRouteCount).toBe(WORKSPACES.length);
  expect(evidence.navigation.width).toBeGreaterThan(0);
  expect(evidence.canvas.width).toBeGreaterThan(480);
  expect(evidence.navigation.left).toBeLessThan(evidence.canvas.left);
  expect(evidence.canvas.headingCount).toBeGreaterThan(0);
  expect(evidence.canvas.textLength).toBeGreaterThan(40);
  expect(evidence.viewport.width).toBe(VIEWPORT.width);
  expect(evidence.viewport.height).toBe(VIEWPORT.height);
  expect(evidence.viewport.documentScrollWidth).toBeLessThanOrEqual(VIEWPORT.width + 1);
  expect(evidence.viewport.mainOverflowY).not.toBe('hidden');
  expect(evidence.viewport.mainScrollHeight).toBeGreaterThanOrEqual(evidence.viewport.mainClientHeight);

  await captureScreenshot(app, destination, { fullPage: false });
  const screenshot = await stat(destination);
  expect(screenshot.size).toBeGreaterThan(1_024);
  return evidence;
}

describe('packaged Electron retail visual evidence', () => {
  it('captures all eight retailer workspaces at the approved desktop viewport', async () => {
    const executable = requireElectronE2eExecutable();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-visual-'));
    const evidenceDirectory = visualEvidenceDirectory();
    let app: PackagedElectronApp | null = null;
    let completed = false;

    try {
      await mkdir(evidenceDirectory, { recursive: true });
      app = await launchPackagedElectronApp({ executable, profile, showWindow: true });
      await app.cdp.send('Emulation.setDeviceMetricsOverride', {
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForHeading(app, 'Create the owner account');
      await fillInputByLabel(app, 'Owner name', OWNER.displayName);
      await fillInputByLabel(app, 'Work email', OWNER.email);
      await fillInputByLabel(app, 'Password', OWNER.password);
      await fillInputByLabel(app, 'Confirm password', OWNER.password);
      await clickButtonByName(app, 'Enroll owner and continue');
      await waitForHeading(app, 'Build your operating foundation');
      await waitForTestId(app, 'retail-workspace-navigation');

      const snapshots: WorkspaceEvidence[] = [];
      for (const workspace of WORKSPACES) {
        snapshots.push(await captureWorkspaceEvidence(
          app,
          workspace,
          path.join(evidenceDirectory, workspace.screenshot),
        ));
      }

      expect(app.rendererErrors).toEqual([]);
      await writeFile(
        path.join(evidenceDirectory, 'retail-visual-evidence.json'),
        `${JSON.stringify({
          schema: 1,
          generatedAt: new Date().toISOString(),
          buildRevision: evidenceRevision(),
          executable: path.basename(executable),
          viewport: VIEWPORT,
          sourceState: 'fresh local workspace after owner enrollment; no demo or imported records were injected',
          referenceDirectory: 'design-system/reference/retail-workspaces',
          references: WORKSPACES.map(({ route, reference }) => ({ route, reference })),
          comparison: {
            kind: 'semantic-and-layout-evidence-only',
            pixelParity: 'not-run',
            note: 'Static visual references require human review. This test never fabricates a similarity or approval result.',
          },
          snapshots,
          rendererErrors: app.rendererErrors,
        }, null, 2)}\n`,
        'utf8',
      );
      completed = true;
    } finally {
      if (app) {
        await app.cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
        if (completed) await closePackagedElectronApp(app);
        else await forceClosePackagedElectronApp(app);
      }
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  }, 300_000);
});
