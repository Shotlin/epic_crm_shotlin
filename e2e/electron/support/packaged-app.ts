import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CdpClient } from './cdp';

type DevtoolsTarget = {
  type?: string;
  webSocketDebuggerUrl?: string;
};

type CdpPoint = {
  x: number;
  y: number;
};

/**
 * Scope a human-facing form interaction to a visible application workbench.
 * A page can legitimately contain repeated generic labels (for example a
 * cash-tender field and an administrative reference field). E2E journeys
 * must never select an arbitrary matching DOM node merely because it appears
 * first in document order.
 */
export interface FormControlOptions {
  within?: string;
}

type WorkbenchViewportState = {
  count: number;
  visibleInViewport: number;
  interactiveInViewport: number;
  overlapsTarget: boolean;
  interceptsTarget: boolean;
};

export interface FormControlInteractionDiagnostics {
  label: string;
  scope: string | null;
  candidates: Array<{
    workbench: string | null;
    visible: boolean;
    inViewport: boolean;
    hitTest: {
      tag: string;
      className: string;
      isInput: boolean;
    } | null;
  }>;
  selected: {
    workbench: string | null;
    hitTestVisible: boolean;
  } | null;
  retailPos: WorkbenchViewportState;
  retailReturns: WorkbenchViewportState;
}

export interface ButtonInteractionDiagnostics {
  name: string;
  matches: Array<{
    disabled: boolean;
    visible: boolean;
    inViewport: boolean;
    hitTestVisible: boolean;
    workbench: string | null;
    form: {
      valid: boolean;
      invalidControls: Array<{
        name: string;
        type: string;
        value: string;
        validationMessage: string;
      }>;
    } | null;
  }>;
}

export interface PackagedElectronApp {
  child: ChildProcessWithoutNullStreams;
  cdp: CdpClient;
  rendererErrors: string[];
  output: {
    stdout: string;
    stderr: string;
  };
}

export function requireElectronE2eExecutable(): string {
  const configured = process.env.EPIC_BOS_E2E_EXECUTABLE?.trim();
  if (!configured) {
    throw new Error(
      'EPIC_BOS_E2E_EXECUTABLE is required. Run this scenario through pnpm test:e2e:electron.',
    );
  }
  const executable = path.resolve(configured);
  if (!existsSync(executable)) {
    throw new Error(`The packaged Electron executable is missing: ${executable}`);
  }
  return executable;
}

export async function launchPackagedElectronApp({
  executable,
  profile,
}: {
  executable: string;
  profile: string;
}): Promise<PackagedElectronApp> {
  await mkdir(profile, { recursive: true });
  const port = await reserveLoopbackPort();
  const parentEnvironment = { ...process.env };
  // A desktop certification run must not inherit a developer's smoke or
  // DevTools mode. The package is launched only in the purpose-built E2E mode.
  delete parentEnvironment.EPIC_BOS_DEVTOOLS;
  delete parentEnvironment.EPIC_BOS_SMOKE;
  delete parentEnvironment.EPIC_BOS_SMOKE_USER_DATA;
  const child = spawn(
    executable,
    [`--remote-debugging-port=${port}`],
    {
      cwd: path.dirname(executable),
      env: {
        ...parentEnvironment,
        EPIC_BOS_E2E: '1',
        EPIC_BOS_E2E_USER_DATA: profile,
        // Never allow a developer's ambient release feed to cause a test
        // process to contact an update provider.
        EPIC_BOS_UPDATE_FEED_URL: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk: Buffer) => {
    output.stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output.stderr += chunk.toString('utf8');
  });

  try {
    const endpoint = await waitForCdpEndpoint(port, child, output);
    const cdp = await CdpClient.connect(endpoint);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    const rendererErrors: string[] = [];
    cdp.on('Runtime.exceptionThrown', (params) => {
      rendererErrors.push(rendererExceptionMessage(params));
    });
    cdp.on('Runtime.consoleAPICalled', (params) => {
      const consoleMessage = rendererConsoleError(params);
      if (consoleMessage) rendererErrors.push(consoleMessage);
    });
    return { child, cdp, rendererErrors, output };
  } catch (error) {
    await forceCloseChild(child);
    throw enrichLaunchError(error, output);
  }
}

export async function fillInputByLabel(
  app: PackagedElectronApp,
  label: string,
): Promise<void>;
export async function fillInputByLabel(
  app: PackagedElectronApp,
  label: string,
  value: string,
): Promise<void>;
export async function fillInputByLabel(
  app: PackagedElectronApp,
  label: string,
  value: string,
  options: FormControlOptions,
): Promise<void>;
export async function fillInputByLabel(
  app: PackagedElectronApp,
  label: string,
  value = '',
  options: FormControlOptions = {},
): Promise<void> {
  const point = await formControlPoint(app, label, options);
  await clickAt(app, point);
  await assertInputFocus(app, label, options);
  await replaceFocusedInputWithKeyboard(app, value);
  // Controlled React inputs commit their state asynchronously. Poll the
  // visible form control instead of assuming the input event and render have
  // completed in the same CDP round trip.
  await waitForPredicate(
    app,
    `value ${value} in ${label}`,
    `(${inputValueExpression(label, options)}) === ${JSON.stringify(value)}`,
  );
}

/**
 * Record a DOM observation before a real pointer click. This changes neither
 * renderer state nor application data. It makes a repeated label or an
 * obscuring workbench diagnosable as a user-visible product issue rather than
 * a vague test-driver failure.
 */
export async function inspectFormControlInteraction(
  app: PackagedElectronApp,
  label: string,
  options: FormControlOptions = {},
): Promise<FormControlInteractionDiagnostics> {
  return app.cdp.evaluate<FormControlInteractionDiagnostics>(
    formControlDiagnosticsExpression(label, options),
  );
}

/** Read the public button/form state before attempting a real click. */
export async function inspectButtonInteraction(
  app: PackagedElectronApp,
  name: string,
): Promise<ButtonInteractionDiagnostics> {
  return app.cdp.evaluate<ButtonInteractionDiagnostics>(buttonDiagnosticsExpression(name));
}

/**
 * Wait for React's normal state propagation to enable a rendered control;
 * this does not make a disabled button clickable or invoke any app action.
 */
export async function waitForEnabledButtonByName(
  app: PackagedElectronApp,
  name: string,
): Promise<void> {
  await waitForPredicate(
    app,
    `enabled button ${name}`,
    `(() => [...document.querySelectorAll('button')]
      .some((element) => isVisible(element) && !element.disabled && element.textContent?.trim() === ${JSON.stringify(name)}))()`,
  );
}

export async function clickButtonByName(
  app: PackagedElectronApp,
  name: string,
): Promise<void> {
  const point = await app.cdp.evaluate<CdpPoint | null>(buttonPointExpression(name));
  if (!point) throw new Error(`Could not find an enabled visible button named ${name}.`);
  await clickAt(app, point);
}

/** Click a visible native form control selected from the rendered DOM. */
export async function clickFormControlBySelector(
  app: PackagedElectronApp,
  selector: string,
): Promise<void> {
  const point = await app.cdp.evaluate<CdpPoint | null>(withVisibilityHelper(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLElement) ||
        (control instanceof HTMLInputElement && control.disabled)) return null;
    // Checkbox/radio inputs are intentionally visually hidden by the retail
    // control styling; click their visible semantic label, exactly as a user
    // does, while retaining the native input as the selected control.
    const target = control instanceof HTMLInputElement && control.type !== 'text'
      ? control.closest('label') ?? control
      : control;
    if (!isVisible(target)) return null;
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = target.getBoundingClientRect();
    const candidate = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const hit = document.elementFromPoint(candidate.x, candidate.y);
    return hit === target || Boolean(hit && target.contains(hit)) ? candidate : null;
  })()`));
  if (!point) {
    const diagnostics = await app.cdp.evaluate<string>(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].map((element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { tag: element.tagName, display: style.display, visibility: style.visibility, opacity: style.opacity, rect: [rect.left, rect.top, rect.width, rect.height], text: element.textContent?.trim().slice(0, 160) }; }))`);
    throw new Error(`Could not find a visible, hit-testable form control matching ${selector}. Candidates: ${diagnostics}`);
  }
  await clickAt(app, point);
}

/**
 * Click a real renderer button by its accessible label. This is intentionally
 * limited to ordinary DOM semantics; it does not create a renderer-only test
 * seam or invoke an application action directly.
 */
export async function clickButtonByAriaLabel(
  app: PackagedElectronApp,
  label: string,
): Promise<void> {
  const point = await app.cdp.evaluate<CdpPoint | null>(buttonPointByAriaLabelExpression(label));
  if (!point) throw new Error(`Could not find an enabled visible button labelled ${label}.`);
  await clickAt(app, point);
}

export async function waitForButtonByAriaLabel(
  app: PackagedElectronApp,
  label: string,
): Promise<void> {
  await waitForPredicate(
    app,
    `button labelled ${label}`,
    `Boolean(${buttonPointByAriaLabelExpression(label)})`,
  );
}

export async function getBridgeSurface(app: PackagedElectronApp): Promise<{
  bootstrapOwner: string;
  rawIpcRenderer: string;
  rawRequire: string;
}> {
  return app.cdp.evaluate(`(() => ({
    bootstrapOwner: typeof window.epicBos?.auth?.bootstrapOwner,
    rawIpcRenderer: typeof window.ipcRenderer,
    rawRequire: typeof window.require,
  }))()`);
}

export async function waitForHeading(
  app: PackagedElectronApp,
  heading: string,
): Promise<void> {
  await waitForPredicate(
    app,
    `heading ${heading}`,
    `(() => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .some((element) => isVisible(element) && element.textContent?.trim() === ${JSON.stringify(heading)}))()`,
  );
}

export async function hasHeading(
  app: PackagedElectronApp,
  heading: string,
): Promise<boolean> {
  return app.cdp.evaluate<boolean>(withVisibilityHelper(`(() => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .some((element) => isVisible(element) && element.textContent?.trim() === ${JSON.stringify(heading)}))()`));
}

export async function waitForTestId(
  app: PackagedElectronApp,
  testId: string,
): Promise<void> {
  await waitForPredicate(
    app,
    `test id ${testId}`,
    `(() => {
      const element = document.querySelector(${JSON.stringify(`[data-testid="${testId}"]`)});
      return Boolean(element && isVisible(element));
    })()`,
  );
}

export async function waitForExactText(
  app: PackagedElectronApp,
  text: string,
): Promise<void> {
  await waitForPredicate(
    app,
    `text ${text}`,
    `(() => [...document.querySelectorAll('body *')]
      .some((element) => isVisible(element) && element.children.length === 0 && element.textContent?.trim() === ${JSON.stringify(text)}))()`,
  );
}

export async function captureScreenshot(
  app: PackagedElectronApp,
  destination: string,
  options: { fullPage?: boolean } = {},
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const screenshot = await app.cdp.send<{ data: string }>('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: options.fullPage ?? true,
  });
  await writeFile(destination, Buffer.from(screenshot.data, 'base64'));
}

export async function closePackagedElectronApp(app: PackagedElectronApp): Promise<void> {
  let closeRequestError: Error | null = null;
  try {
    // Close the real BrowserWindow through its ordinary renderer-owned close
    // path. Electron's window-all-closed handler then calls app.quit(), which
    // lets the main process close SQLite before a restart.
    await Promise.race([
      app.cdp.evaluate('window.close()'),
      delay(5_000).then(() => { throw new Error('Timed out requesting the packaged Electron window to close.'); }),
    ]);
  } catch (error) {
    closeRequestError = error instanceof Error ? error : new Error(String(error));
  }
  let exit: number;
  try {
    exit = await waitForChildExit(app.child, 15_000);
  } catch (error) {
    // A renderer CDP close request can outlive the BrowserWindow on Windows.
    // Do not leave a packaged process (or its database lock) behind when the
    // ordinary close path did not complete; this fallback is test cleanup,
    // never an application shutdown path.
    await forceCloseChild(app.child);
    await app.cdp.close();
    throw error instanceof Error ? error : new Error(String(error));
  }
  await app.cdp.close();
  if (closeRequestError && exit !== 0) throw closeRequestError;
  if (exit !== 0) {
    throw new Error(`Packaged Electron app did not close cleanly (exit ${exit}).${outputTail(app.output)}`);
  }
}

export async function forceClosePackagedElectronApp(app: PackagedElectronApp): Promise<void> {
  await forceCloseChild(app.child);
  await app.cdp.close();
}

async function formControlPoint(
  app: PackagedElectronApp,
  label: string,
  options: FormControlOptions,
): Promise<CdpPoint> {
  const point = await app.cdp.evaluate<CdpPoint | null>(formControlPointExpression(label, options));
  if (!point) throw new Error(`Could not find a visible, hit-testable input labelled ${label}.`);
  return point;
}

async function assertInputFocus(
  app: PackagedElectronApp,
  label: string,
  options: FormControlOptions,
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (await app.cdp.evaluate<boolean>(inputFocusExpression(label, options))) return;
    await delay(50);
  }
  const activeElement = await app.cdp.evaluate<string>(activeElementDescriptionExpression());
  const interaction = await app.cdp.evaluate<string>(inputInteractionDescriptionExpression(label, options));
  throw new Error(`Could not focus the ${label} field with a real pointer click (active element: ${activeElement}; interaction: ${interaction}).`);
}

/**
 * Produce the same DOM keyboard/input sequence a cashier produces. This is
 * deliberately not a direct value assignment or a renderer-only test hook:
 * React receives normal select, delete and text-input events through Chromium.
 */
async function replaceFocusedInputWithKeyboard(
  app: PackagedElectronApp,
  value: string,
): Promise<void> {
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  await app.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  for (const character of value) {
    await app.cdp.send('Input.dispatchKeyEvent', {
      type: 'char',
      text: character,
      unmodifiedText: character,
    });
  }
}

async function clickAt(app: PackagedElectronApp, point: CdpPoint): Promise<void> {
  await app.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
  });
  await app.cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
  await app.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
}

async function waitForPredicate(
  app: PackagedElectronApp,
  description: string,
  expression: string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (app.child.exitCode !== null || app.child.signalCode !== null) {
      throw new Error(`Electron closed while waiting for ${description}.${outputTail(app.output)}`);
    }
    try {
      if (await app.cdp.evaluate<boolean>(withVisibilityHelper(expression))) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.${lastError ? ` Last renderer error: ${errorMessage(lastError)}` : ''}${outputTail(app.output)}`);
}

function formControlPointExpression(label: string, options: FormControlOptions): string {
  return withVisibilityHelper(`(() => {
    const input = findHitTestVisibleFormControl(${JSON.stringify(label)}, ${JSON.stringify(options.within ?? null)});
    if (!input) return null;
    const point = pointForInteraction(input);
    const hit = document.elementFromPoint(point.x, point.y);
    return hit === input ? point : null;
  })()`);
}

function inputValueExpression(label: string, options: FormControlOptions): string {
  return withVisibilityHelper(`(() => {
    const active = document.activeElement;
    if (isMatchingFormControl(active, ${JSON.stringify(label)}, ${JSON.stringify(options.within ?? null)})) {
      return 'value' in active ? String(active.value) : '';
    }
    const input = findHitTestVisibleFormControl(${JSON.stringify(label)}, ${JSON.stringify(options.within ?? null)});
    return input && 'value' in input ? String(input.value) : '';
  })()`);
}

function inputFocusExpression(label: string, options: FormControlOptions): string {
  return withVisibilityHelper(`(() => isMatchingFormControl(
    document.activeElement,
    ${JSON.stringify(label)},
    ${JSON.stringify(options.within ?? null)},
  ))()`);
}

function activeElementDescriptionExpression(): string {
  return `(() => {
    const active = document.activeElement;
    if (!active) return 'none';
    const element = active;
    return [element.tagName.toLowerCase(), element.getAttribute('name'), element.getAttribute('aria-label'), element.getAttribute('type')]
      .filter(Boolean)
      .join(':');
  })()`;
}

function inputInteractionDescriptionExpression(label: string, options: FormControlOptions): string {
  return withVisibilityHelper(`(() => {
    const candidates = labelledFormControls(${JSON.stringify(label)}, ${JSON.stringify(options.within ?? null)});
    if (!candidates.length) return 'input not found';
    return JSON.stringify(candidates.map((input) => describeFormControl(input)));
  })()`);
}

function formControlDiagnosticsExpression(label: string, options: FormControlOptions): string {
  return withVisibilityHelper(`(() => {
    const scope = ${JSON.stringify(options.within ?? null)};
    const candidates = labelledFormControls(${JSON.stringify(label)}, scope);
    const selected = findHitTestVisibleFormControl(${JSON.stringify(label)}, scope);
    const target = selected ?? candidates[0] ?? null;
    return {
      label: ${JSON.stringify(label)},
      scope,
      candidates: candidates.map((input) => describeFormControl(input)),
      selected: selected ? {
        workbench: workbenchClass(selected),
        hitTestVisible: hitTestVisible(selected),
      } : null,
      retailPos: describeWorkbench('.retail-pos-workbench', target),
      retailReturns: describeWorkbench('.retail-returns-workbench', target),
    };
  })()`);
}

function buttonDiagnosticsExpression(name: string): string {
  return withVisibilityHelper(`(() => ({
    name: ${JSON.stringify(name)},
    matches: [...document.querySelectorAll('button')]
      .filter((button) => button.textContent?.trim() === ${JSON.stringify(name)})
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const inViewport = isInViewport(rect);
        const hit = inViewport ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
        const form = button.closest('form');
        const invalidControls = form ? [...form.elements]
          .filter((element) => 'validity' in element && !element.validity.valid)
          .map((element) => ({
            name: element.getAttribute('name') ?? '',
            type: element.getAttribute('type') ?? element.tagName.toLowerCase(),
            value: 'value' in element ? String(element.value) : '',
            validationMessage: element.validationMessage ?? '',
          })) : [];
        return {
          disabled: button.disabled,
          visible: isVisible(button),
          inViewport,
          hitTestVisible: hit === button,
          workbench: workbenchClass(button),
          form: form ? { valid: form.checkValidity(), invalidControls } : null,
        };
      }),
  }))()`);
}

function buttonPointExpression(name: string): string {
  return withVisibilityHelper(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((element) => isVisible(element) && !element.disabled && element.textContent?.trim() === ${JSON.stringify(name)});
    if (!button) return null;
    return pointForInteraction(button);
  })()`);
}

function buttonPointByAriaLabelExpression(label: string): string {
  return withVisibilityHelper(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((element) => isVisible(element) && !element.disabled && element.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!button) return null;
    return pointForInteraction(button);
  })()`);
}

function withVisibilityHelper(expression: string): string {
  return `(() => {
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      let ancestor = element;
      while (ancestor) {
        const ancestorStyle = window.getComputedStyle(ancestor);
        if (ancestorStyle.display === 'none' || ancestorStyle.visibility === 'hidden' || Number(ancestorStyle.opacity) === 0) return false;
        ancestor = ancestor.parentElement;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const isEditableControl = (element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
    const scopeRoot = (scope) => {
      if (!scope) return document;
      try {
        return document.querySelector(scope);
      } catch {
        return null;
      }
    };
    const labelledFormControls = (label, scope) => {
      const root = scopeRoot(scope);
      if (!root) return [];
      const labelCaption = (element) => [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      const nested = [...root.querySelectorAll('label')]
        // Read only the label's own caption. A textarea's current value is
        // exposed through textContent, so matching the whole label would
        // stop working immediately after a user enters a value.
        .filter((element) => labelCaption(element) === label || element.textContent?.trim() === label)
        .map((element) => element.querySelector('input, textarea, select'))
        .filter((element) => isEditableControl(element) && isVisible(element) && !element.disabled && !element.readOnly);
      const explicitlyNamed = [...root.querySelectorAll('input, textarea, select')]
        .filter((element) => element.getAttribute('aria-label')?.trim() === label)
        .filter((element) => isEditableControl(element) && isVisible(element) && !element.disabled && !element.readOnly);
      return [...new Set([...nested, ...explicitlyNamed])];
    };
    const pointForInteraction = (element, offsetX, offsetY) => {
      // CDP mouse coordinates are viewport-relative. A long retail workspace
      // may render a valid control below the fold, so make the ordinary DOM
      // control visible before calculating its click point. This is not an app
      // test hook: it is the same scroll a person performs before interaction.
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + (offsetX ?? rect.width / 2),
        y: rect.top + (offsetY ?? rect.height / 2),
      };
    };
    const hitTestVisible = (element) => {
      if (!isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return document.elementFromPoint(x, y) === element;
    };
    const findHitTestVisibleFormControl = (label, scope) => {
      const controls = labelledFormControls(label, scope);
      const active = document.activeElement;
      if (controls.includes(active) && hitTestVisible(active)) return active;
      for (const control of controls) {
        const point = pointForInteraction(control);
        if (document.elementFromPoint(point.x, point.y) === control) return control;
      }
      return null;
    };
    const isMatchingFormControl = (element, label, scope) => isEditableControl(element) && labelledFormControls(label, scope).includes(element);
    const workbenchClass = (element) => {
      // Prefer a root desk over an inner visual subcomponent such as the
      // POS tender block. The diagnostic is about which task
      // surface the user can actually interact with, not its local CSS block.
      const workbench = element?.closest?.('.retail-pos-workbench, .retail-returns-workbench')
        ?? element?.closest?.('[class*="workbench"]');
      if (!workbench) return null;
      const className = [...workbench.classList].find((candidate) => candidate.includes('workbench'));
      return className || workbench.className || null;
    };
    const isInViewport = (rect) => rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
    const descriptionForHit = (hit, input) => hit ? {
      tag: hit.tagName.toLowerCase(),
      className: typeof hit.className === 'string' ? hit.className : '',
      isInput: hit === input,
    } : null;
    const describeFormControl = (input) => {
      const rect = input.getBoundingClientRect();
      const inViewport = isInViewport(rect);
      const hit = inViewport ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
      return {
        workbench: workbenchClass(input),
        visible: isVisible(input),
        inViewport,
        hitTest: descriptionForHit(hit, input),
      };
    };
    const rectsOverlap = (left, right) => left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    const describeWorkbench = (selector, target) => {
      const targetRect = target?.getBoundingClientRect?.() ?? null;
      const states = [...document.querySelectorAll(selector)].map((root) => {
        const rect = root.getBoundingClientRect();
        const inViewport = isVisible(root) && isInViewport(rect);
        const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + Math.max(1, Math.min(rect.width / 2, window.innerWidth / 2))));
        const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + Math.max(1, Math.min(rect.height / 2, window.innerHeight / 2))));
        const hit = inViewport ? document.elementFromPoint(x, y) : null;
        const overlapsTarget = Boolean(targetRect && rectsOverlap(rect, targetRect));
        const targetX = targetRect ? targetRect.left + targetRect.width / 2 : 0;
        const targetY = targetRect ? targetRect.top + targetRect.height / 2 : 0;
        const targetHit = targetRect && isInViewport(targetRect) ? document.elementFromPoint(targetX, targetY) : null;
        return {
          inViewport,
          interactiveInViewport: Boolean(hit && root.contains(hit)),
          overlapsTarget,
          interceptsTarget: Boolean(target && !root.contains(target) && overlapsTarget && targetHit && root.contains(targetHit)),
        };
      });
      return {
        count: states.length,
        visibleInViewport: states.filter((state) => state.inViewport).length,
        interactiveInViewport: states.filter((state) => state.interactiveInViewport).length,
        overlapsTarget: states.some((state) => state.overlapsTarget),
        interceptsTarget: states.some((state) => state.interceptsTarget),
      };
    };
    return ${expression};
  })()`;
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  server.listen({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not reserve a local CDP port.');
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForCdpEndpoint(
  port: number,
  child: ChildProcessWithoutNullStreams,
  output: PackagedElectronApp['output'],
): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Electron closed before its CDP endpoint was ready.${outputTail(output)}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json() as DevtoolsTarget[];
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Electron has not opened its remote debugging endpoint yet.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for Electron CDP on port ${port}.${outputTail(output)}`);
}

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<number> {
  if (child.exitCode !== null) return child.exitCode;
  if (child.signalCode !== null) return 1;
  return new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for the packaged Electron process to close.'));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function forceCloseChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    try {
      await waitForChildExit(child, 5_000);
    } catch {
      // The process is already a failed test artifact; no user data profile is
      // shared with it, so cleanup must not block the original failure.
    }
  }
}

function rendererExceptionMessage(params: unknown): string {
  if (!params || typeof params !== 'object') return 'Renderer exception without details.';
  const details = params as { exceptionDetails?: { text?: string; exception?: { description?: string } } };
  return details.exceptionDetails?.exception?.description
    ?? details.exceptionDetails?.text
    ?? 'Renderer exception without details.';
}

function rendererConsoleError(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  const event = params as {
    type?: string;
    args?: Array<{ value?: unknown; description?: string }>;
  };
  if (event.type !== 'error') return null;
  const detail = event.args?.map((argument) =>
    typeof argument.value === 'string' ? argument.value : argument.description ?? String(argument.value),
  ).join(' ') ?? 'Renderer console error.';
  return detail;
}

function enrichLaunchError(error: unknown, output: PackagedElectronApp['output']): Error {
  return new Error(`${errorMessage(error)}${outputTail(output)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function outputTail(output: PackagedElectronApp['output']): string {
  const text = `${output.stdout}\n${output.stderr}`.trim();
  return text ? `\nElectron output:\n${text.slice(-4_000)}` : '';
}
