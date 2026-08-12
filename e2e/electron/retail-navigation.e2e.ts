import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
  displayName: 'Epic Navigation E2E Owner',
  email: 'e2e.navigation.owner@epic-bos.invalid',
  password: 'EpicE2E#2026!Navigation',
};

const ROUTES = [
  ['Home', 'Open Overview'],
  ['Sell', 'Open Point of sale'],
  ['Stock', 'Open Products & variants'],
  ['Deliver', 'Open Order queue'],
  ['Customers', 'Open Customer 360'],
  ['Money', 'Open Cash register'],
  ['Insights', 'Open Executive dashboard'],
  ['Setup', 'Open Stores & users'],
] as const;

// Shortcut labels are deliberately plain-language, so keep the expected
// primary rail route explicit for cross-workspace handoffs. Same-route cards
// do not need a route wait; cross-route cards must settle before the source
// workspace is selected again.
const SHORTCUT_DESTINATION_ROUTES: Readonly<Record<string, string>> = {
  'Store setup': 'Setup',
  'Store team': 'Setup',
  'Retail insights': 'Insights',
  'Workforce capacity': 'Deliver',
  'Billing handoff': 'Money',
  'Branch transfers': 'Deliver',
};

async function waitForActiveRoute(app: PackagedElectronApp, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const active = await app.cdp.evaluate<string | null>(
      `document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-current="page"]')?.getAttribute('aria-label') ?? null`,
    );
    if (active === label) {
      await delay(150);
      const stable = await app.cdp.evaluate<string | null>(
        `document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-current="page"]')?.getAttribute('aria-label') ?? null`,
      );
      if (stable === label) return;
    }
    await delay(100);
  }
  const state = await app.cdp.evaluate<string>(`JSON.stringify({
    routes: [...document.querySelectorAll('[data-testid="retail-workspace-navigation"] button.retail-workspace-navigation__item')].map((button) => ({ label: button.getAttribute('aria-label'), current: button.getAttribute('aria-current'), expanded: button.getAttribute('aria-expanded'), disabled: button.disabled })),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map((dialog) => ({ label: dialog.getAttribute('aria-label'), visible: getComputedStyle(dialog).display !== 'none' })),
    activeElement: document.activeElement?.outerHTML?.slice(0, 160) ?? '',
  })`);
  throw new Error(`Retail workspace did not select ${label}. State: ${state}`);
}

async function ensureRouteExpanded(app: PackagedElectronApp, label: string): Promise<void> {
  // The sidebar owns its own vertical overflow when every route is expanded;
  // reset that rail before a route click so the pointer lands on the actual
  // primary item rather than a stale scrolled coordinate.
  await app.cdp.evaluate(`document.querySelector('.sidebar')?.scrollTo({ top: 0, left: 0, behavior: 'instant' })`);
  const state = await app.cdp.evaluate<{ active: boolean; expanded: boolean }>(
    `(() => {
      const button = document.querySelector(
        '[data-testid="retail-workspace-navigation"] button[aria-label="${label}"]',
      );
      return { active: button?.getAttribute('aria-current') === 'page', expanded: button?.getAttribute('aria-expanded') === 'true' };
    })()`,
  );
  if (!state.active || !state.expanded) {
    await clickButtonByAriaLabel(app, label);
    await waitForActiveRoute(app, label);
  }
}

async function forceRouteExpanded(app: PackagedElectronApp, label: string): Promise<void> {
  await app.cdp.evaluate(`document.querySelector('.sidebar')?.scrollTo({ top: 0, left: 0, behavior: 'instant' })`);
  await clickButtonByAriaLabel(app, label);
  await waitForActiveRoute(app, label);
  const expanded = await app.cdp.evaluate<boolean>(
    `document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-label="${label}"]')?.getAttribute('aria-expanded') === 'true'`,
  );
  if (!expanded) {
    await clickButtonByAriaLabel(app, label);
    await waitForActiveRoute(app, label);
  }
}

async function waitForSubmodule(app: PackagedElectronApp, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const visible = await app.cdp.evaluate<boolean>(
      `(() => {
        const button = document.querySelector(
          '[data-testid="retail-workspace-navigation"] button[aria-label="${label}"]',
        );
        if (!button) return false;
        const rect = button.getBoundingClientRect();
        return !button.disabled && rect.width > 0 && rect.height > 0;
      })()`,
    );
    if (visible) return;
    await delay(100);
  }
  throw new Error(`Retail workspace did not reveal ${label}.`);
}

async function waitForVisibleButton(app: PackagedElectronApp, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const visible = await app.cdp.evaluate<boolean>(
      `(() => [...document.querySelectorAll('button')].some((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return button.getAttribute('aria-label') === ${JSON.stringify(label)} && !button.disabled && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }))()`,
    );
    if (visible) return;
    await delay(100);
  }
  const state = await app.cdp.evaluate<string>(`JSON.stringify({
    activeRoute: document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-current="page"]')?.getAttribute('aria-label') ?? null,
    shortcuts: [...document.querySelectorAll('.workspace-rail__items > button')].map((button) => ({ label: button.getAttribute('aria-label'), disabled: button.disabled, display: getComputedStyle(button).display, rect: (() => { const r = button.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })() })),
  })`);
  throw new Error(`Retail workspace did not reveal shortcut ${label}. State: ${state}`);
}

async function waitForWorkspaceTransition(app: PackagedElectronApp): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const focused = await app.cdp.evaluate<boolean>('document.activeElement?.id === "workspace-canvas"');
    if (focused) {
      await delay(250);
      return;
    }
    await delay(100);
  }
  await delay(500);
}

async function waitForSourceRouteToSettle(app: PackagedElectronApp, sourceRoute: string): Promise<void> {
  const deadline = Date.now() + 1_200;
  while (Date.now() < deadline) {
    const active = await app.cdp.evaluate<string | null>(
      `document.querySelector('[data-testid="retail-workspace-navigation"] button[aria-current="page"]')?.getAttribute('aria-label') ?? null`,
    );
    // A shortcut that opens another workbench will eventually move the rail
    // away from its source route. Same-route shortcuts are allowed to remain.
    if (active !== sourceRoute) {
      await delay(250);
      return;
    }
    await delay(100);
  }
}

async function waitForShortcutDestination(app: PackagedElectronApp, shortcut: string, sourceRoute: string): Promise<void> {
  const destination = SHORTCUT_DESTINATION_ROUTES[shortcut];
  if (!destination || destination === sourceRoute) return;
  await waitForActiveRoute(app, destination);
}

async function waitForNavigationMessage(app: PackagedElectronApp, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const message = await app.cdp.evaluate<string>(
      `document.querySelector('[role="status"]')?.textContent?.trim() ?? ''`,
    );
    if (message.startsWith(`${label} is open.`) || message.startsWith(`${label} needs`)) return;
    await delay(100);
  }
  throw new Error(`Retail workspace did not acknowledge ${label}.`);
}

async function pressControlK(app: PackagedElectronApp): Promise<void> {
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'k', code: 'KeyK',
    windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75, modifiers: 2,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'k', code: 'KeyK',
    windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75, modifiers: 2,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Control', code: 'ControlLeft',
    windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17,
  });
}

async function waitForCommandPalette(app: PackagedElectronApp, open: boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const visible = await app.cdp.evaluate<boolean>(
      `Boolean(document.querySelector('[role="dialog"][aria-label="Command palette"]'))`,
    );
    if (visible === open) return;
    await delay(100);
  }
  throw new Error(`Command palette did not become ${open ? 'visible' : 'hidden'}.`);
}

describe('packaged Electron retailer navigation', () => {
  it('opens every primary workspace and representative submodule without renderer errors or scroll traps', async () => {
    const executable = requireElectronE2eExecutable();
    const profile = await mkdtemp(path.join(os.tmpdir(), 'epic-bos-e2e-navigation-'));
    const progressPath = path.join(profile, 'navigation-progress.log');
    const evidenceRoot = process.env.EPIC_BOS_E2E_ARTIFACTS_DIR?.trim();
    const mark = async (message: string): Promise<void> => {
      await appendFile(progressPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
    };
    let app: PackagedElectronApp | null = null;
    let completed = false;
    let observedSubmoduleCount = 0;
    let observedShortcutCount = 0;

    try {
      await mark('launch');
      app = await launchPackagedElectronApp({ executable, profile });
      await mark('cdp-ready');
      await waitForHeading(app, 'Create the owner account');
      await fillInputByLabel(app, 'Owner name', OWNER.displayName);
      await fillInputByLabel(app, 'Work email', OWNER.email);
      await fillInputByLabel(app, 'Password', OWNER.password);
      await fillInputByLabel(app, 'Confirm password', OWNER.password);
      await clickButtonByName(app, 'Enroll owner and continue');
      await waitForHeading(app, 'Build your operating foundation');
      await waitForTestId(app, 'retail-workspace-navigation');
      await mark('owner-enrolled');

      // A clean first-run workspace is a hard product boundary, not a visual
      // preference. Catch the old Northstar/USD fixture if a stale seed,
      // migration, or packaged cache ever leaks it into the operator UI.
      const retiredDemoStrings = await app.cdp.evaluate<string[]>(`(() => {
        const body = document.body.textContent ?? '';
        const forbidden = [
          'Northstar',
          'Northbank Foods',
          'Valence Energy',
          'Atlas Biotech',
          'Kestrel Fabrication',
          'Luma Hotels',
          'Orchard Capital',
          'Solace Consumer',
          'Global back-office transformation',
        ];
        return forbidden.filter((value) => body.includes(value));
      })()`);
      expect(retiredDemoStrings).toEqual([]);

      const shell = await app.cdp.evaluate<{
        primaryRouteCount: number;
        scrollHeight: number;
        viewportHeight: number;
        mainScrollHeight: number;
        mainClientHeight: number;
        mainOverflowY: string;
      }>(`(() => {
        const root = document.documentElement;
        const body = document.body;
        // This expression executes in Chromium, not through the TypeScript
        // compiler; keep the selector plain JavaScript so scroll evidence is
        // measured instead of silently evaluating as a comparison expression.
        const main = document.querySelector('.main-content');
        return {
          primaryRouteCount: document.querySelectorAll('[data-testid="retail-workspace-navigation"] > ul > li > button').length,
          scrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
          viewportHeight: root.clientHeight,
          mainScrollHeight: main?.scrollHeight ?? 0,
          mainClientHeight: main?.clientHeight ?? 0,
          mainOverflowY: main ? getComputedStyle(main).overflowY : 'missing',
        };
      })()`);
      expect(shell.primaryRouteCount).toBe(8);
      expect(shell.mainScrollHeight).toBeGreaterThanOrEqual(shell.mainClientHeight);
      expect(shell.mainOverflowY).not.toBe('hidden');
      await mark(`shell-checked routes=${shell.primaryRouteCount}`);

      for (const [route, submodule] of ROUTES) {
        await mark(`route-start ${route}`);
        await ensureRouteExpanded(app, route);
        await waitForSubmodule(app, submodule);
        await clickButtonByAriaLabel(app, submodule);
        await waitForTestId(app, 'retail-workspace-navigation');
        await waitForNavigationMessage(app, submodule.replace(/^Open /, ''));
        await mark(`route-complete ${route}`);
      }

      // Every visible submodule is a real task entry, not decorative copy.
      // The eight representative clicks above prove each owning handoff; this
      // sweep verifies the complete 31-item retail rail action surface.
      const submoduleLabels = await app.cdp.evaluate<string[]>(
        `([...document.querySelectorAll('[data-testid="retail-workspace-navigation"] .retail-workspace-navigation__subitem')]
          .map((button) => button.getAttribute('aria-label'))
          .filter((label) => typeof label === 'string'))`,
      );
      expect(submoduleLabels).toHaveLength(31);
      observedSubmoduleCount = submoduleLabels.length;
      for (const submodule of submoduleLabels) {
        await mark(`submodule-start ${submodule}`);
        await clickButtonByAriaLabel(app, submodule);
        await waitForNavigationMessage(app, submodule.replace(/^Open /, ''));
      }
      await mark('submodules-complete');
      // The attention submodule intentionally opens a persistent drawer. Close
      // it before sweeping the page-level shortcuts so the drawer cannot cover
      // a subsequent navigation click.
      if (await app.cdp.evaluate<boolean>('Boolean(document.querySelector("#attention-queue"))')) {
        await clickButtonByAriaLabel(app, 'Notifications');
      }

      // The retail rail is the simple front door, but each of its primary
      // workspaces also exposes governed shortcut cards into the deeper CRM,
      // sales, finance, operations, people, service, intelligence and setup
      // workbenches. Exercise every visible shortcut as a real user click and
      // prove that it renders a non-empty destination instead of a dead end.
      let shortcutCount = 0;
      for (const [route] of ROUTES) {
        await ensureRouteExpanded(app, route);
        const shortcutLabels = await app.cdp.evaluate<string[]>(
          `([...document.querySelectorAll('.workspace-rail__items > button')]
            .map((button) => button.getAttribute('aria-label'))
            .filter((label) => typeof label === 'string' && label.trim().length > 0))`,
        );
        expect(shortcutLabels.length).toBeGreaterThan(0);
        for (const shortcut of shortcutLabels) {
          await mark(`shortcut-start ${route}/${shortcut}`);
          await waitForVisibleButton(app, shortcut);
          await clickButtonByAriaLabel(app, shortcut);
          await waitForTestId(app, 'retail-workspace-navigation');
          await waitForWorkspaceTransition(app);
          await waitForShortcutDestination(app, shortcut, route);
          await waitForSourceRouteToSettle(app, route);
          let destination: { heading: string; canvasText: string };
          try {
            destination = await app.cdp.evaluate<{ heading: string; canvasText: string }>(
              `(() => ({
                heading: document.querySelector('.page-heading h1')?.textContent?.trim() ?? '',
                canvasText: document.querySelector('#workspace-canvas')?.textContent?.trim() ?? '',
              }))()`,
            );
          } catch (error) {
            throw new Error(`${error instanceof Error ? error.message : String(error)} Electron exit=${String(app.child.exitCode)} signal=${String(app.child.signalCode)} stdout=${app.output.stdout.slice(-1200)} stderr=${app.output.stderr.slice(-1200)}`);
          }
          expect(destination.heading.length).toBeGreaterThan(0);
          expect(destination.canvasText.length).toBeGreaterThan(0);
          const destinationAccessibility = await app.cdp.evaluate<{ unlabeled: string[]; scrollOwner: string; scrollHeight: number; clientHeight: number }>(`(() => {
            const visible = (element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            };
            const main = document.querySelector('.main-content');
            return {
              unlabeled: [...document.querySelectorAll('button, input, select, textarea')]
                .filter(visible)
                .filter((element) => element instanceof HTMLButtonElement
                  ? !(element.getAttribute('aria-label')?.trim() || element.textContent?.trim())
                  : !(element.getAttribute('aria-label')?.trim() || element.getAttribute('placeholder')?.trim() || element.closest('label')?.textContent?.trim()))
                .map((element) => element.outerHTML.slice(0, 240)),
              scrollOwner: main ? getComputedStyle(main).overflowY : 'missing',
              scrollHeight: main?.scrollHeight ?? 0,
              clientHeight: main?.clientHeight ?? 0,
            };
          })()`);
          expect(destinationAccessibility.unlabeled).toEqual([]);
          expect(destinationAccessibility.scrollOwner).not.toBe('hidden');
          expect(destinationAccessibility.scrollHeight).toBeGreaterThanOrEqual(destinationAccessibility.clientHeight);
          shortcutCount += 1;
          // Allow the destination's batched React state (including workspace
          // and active-route derivation) to settle before returning to the
          // source rail for the next shortcut.
          await delay(250);
          await forceRouteExpanded(app, route);
          await mark(`shortcut-complete ${route}/${shortcut}`);
        }
      }
      await mark(`shortcuts-complete count=${shortcutCount}`);
      // The command and setup routes intentionally share the Home command
      // surface, and the active role can expose a few additional setup cards;
      // require the complete baseline while recording the observed count.
      expect(shortcutCount).toBeGreaterThanOrEqual(42);
      observedShortcutCount = shortcutCount;

      const unlabeledVisibleButtons = await app.cdp.evaluate<string[]>(`(() => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        return [...document.querySelectorAll('button')]
          .filter(visible)
          .filter((button) => !(button.getAttribute('aria-label')?.trim() || button.textContent?.trim()))
          .map((button) => button.outerHTML.slice(0, 240));
      })()`);
      expect(unlabeledVisibleButtons).toEqual([]);

      // Exercise the real keyboard shortcut and focusable command surface.
      await pressControlK(app);
      await waitForCommandPalette(app, true);
      await delay(100);
      expect(await app.cdp.evaluate<string>('document.activeElement?.getAttribute("aria-label") ?? ""')).toBe('Search commands');
      await app.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await waitForCommandPalette(app, false);

      // Verify the responsive/mobile navigation seam and the single horizontal
      // canvas boundary at a narrow desktop viewport.
      await app.cdp.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 800, deviceScaleFactor: 1, mobile: false });
      const narrow = await app.cdp.evaluate<{ width: number; scrollWidth: number; scrollHeight: number; clientHeight: number }>(`(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.querySelector('.main-content')?.scrollHeight ?? 0,
        clientHeight: document.querySelector('.main-content')?.clientHeight ?? 0,
      }))()`);
      expect(narrow.width).toBe(700);
      expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.width + 1);
      expect(narrow.scrollHeight).toBeGreaterThanOrEqual(narrow.clientHeight);
      await clickButtonByAriaLabel(app, 'Open workspace navigation');
      expect(await app.cdp.evaluate<string>('document.querySelector("#primary-navigation")?.getAttribute("aria-modal") ?? ""')).toBe('true');
      await clickButtonByAriaLabel(app, 'Close workspace navigation');
      await app.cdp.send('Emulation.clearDeviceMetricsOverride');
      await mark('responsive-complete');

      expect(app.rendererErrors).toEqual([]);
      if (evidenceRoot) {
        // The runner intentionally accepts a caller-supplied evidence path.
        // Create it here so a clean certification workspace records its
        // result instead of failing after all UI assertions have passed.
        await mkdir(evidenceRoot, { recursive: true });
        await writeFile(
          path.join(evidenceRoot, 'retail-navigation-certification.json'),
          `${JSON.stringify({
            schema: 1,
            status: 'passed',
            generatedAt: new Date().toISOString(),
            buildRevision: process.env.EPIC_BOS_BUILD_REVISION ?? null,
            executable: path.basename(executable),
            primaryRouteCount: ROUTES.length,
            submoduleCount: observedSubmoduleCount,
            shortcutCount: observedShortcutCount,
            rendererErrors: app.rendererErrors,
            shell: {
              scrollHeight: shell.scrollHeight,
              viewportHeight: shell.viewportHeight,
              mainScrollHeight: shell.mainScrollHeight,
              mainClientHeight: shell.mainClientHeight,
              mainOverflowY: shell.mainOverflowY,
            },
            narrowViewport: narrow,
            guarantees: [
              'No retired demo workspace strings were rendered',
              'Every primary retail workspace opened',
              'Every visible submodule action opened a destination',
              'Every workspace shortcut opened a non-empty destination',
              'Visible controls were labelled',
              'Desktop and narrow viewport scroll boundaries remained usable',
            ],
          }, null, 2)}\n`,
          'utf8',
        );
      }
      completed = true;
    } finally {
      if (app) {
        if (completed) await closePackagedElectronApp(app);
        else await forceClosePackagedElectronApp(app);
      }
      if (completed) await rm(profile, { recursive: true, force: true });
    }
  }, 300_000);
});
