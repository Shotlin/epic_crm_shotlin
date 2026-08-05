import {
  app,
  autoUpdater,
  BrowserWindow,
  Menu,
  session,
  type WebContents,
} from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { CrmStore } from './main/crm-store';
import { registerIpcHandlers } from './main/ipc';
import { KernelStore } from './main/kernel-store';
import { BusinessDatabase } from './main/database';
import { AuthService } from './main/auth-service';
import { ProtectedKeyStore } from './main/key-store';
import { AttachmentVault } from './main/attachment-vault';
import { BackupService } from './main/backup-service';
import { PartyStore } from './main/party-store';
import { CrmDepthStore } from './main/crm-depth-store';
import { RevenueOpsStore } from './main/revenue-ops-store';
import { StatutoryGatewayService } from './main/statutory-gateway-service';
import { ProviderGatewayService } from './main/provider-gateway-service';
import { GeneralLedgerStore } from './main/general-ledger-store';
import { ApiKeyStore } from './main/api-key-store';
import { ReleaseGateStore } from './main/release-gate-store';
import { ReleaseArtifactStore } from './main/release-artifact-store';
import { ReleaseUpdateStore } from './main/release-update-store';
import { AutoUpdateService } from './main/auto-update-service';
import { UiAcceptanceStore } from './main/ui-acceptance-store';
import { IntelligenceStore } from './main/intelligence-store';
import { AutomationRunStore } from './main/automation-run-store';
import { AutomationScheduleStore } from './main/automation-schedule-store';
import { FinanceCompletionStore } from './main/finance-completion-store';
import { RetailWorkspaceModeStore } from './main/retail-workspace-mode-store';
import { WorkspaceProvisioner } from './main/workspace-provisioner';

process.env.ELECTRON_ENABLE_SECURITY_WARNINGS = 'true';
app.enableSandbox();

if (started) {
  app.quit();
}

// Epic BOS owns one desktop workspace at a time.  Without this lock, a second
// launch can leave an older renderer window open beside the current package,
// which makes it look as though UI fixes have not taken effect.
// The smoke and E2E processes use disposable user-data directories and must run
// alongside the owner's desktop session. Production launches retain the
// single-workspace guarantee. E2E mode changes only process isolation and
// window presentation; it does not add renderer APIs or relax security.
const isSmokeProcess = process.env.EPIC_BOS_SMOKE === '1';
const e2eUserData = process.env.EPIC_BOS_E2E_USER_DATA?.trim();
const isE2eProcess = process.env.EPIC_BOS_E2E === '1' && Boolean(e2eUserData);
const isIsolatedAutomationProcess = isSmokeProcess || isE2eProcess;
// Packaged smoke is a headless launch probe, not a graphics certification.
// Disable Chromium hardware acceleration only for the disposable smoke
// profile so a missing/unstable GPU driver cannot hide renderer regressions.
if (isSmokeProcess) app.disableHardwareAcceleration();
// Packaged automation runs must never open the operator's real profile. The
// launcher supplies a disposable absolute directory and this override is
// applied before Electron creates its session or resolves app.getPath().
const isolatedUserData = isSmokeProcess
  ? process.env.EPIC_BOS_SMOKE_USER_DATA?.trim()
  : isE2eProcess
    ? e2eUserData
    : undefined;
if (isolatedUserData) {
  app.setPath('userData', path.resolve(isolatedUserData));
}
const hasSingleInstanceLock = isIsolatedAutomationProcess || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

if (!isIsolatedAutomationProcess) {
  app.on('second-instance', () => {
    const [activeWindow] = BrowserWindow.getAllWindows();
    if (!activeWindow) return;
    if (activeWindow.isMinimized()) activeWindow.restore();
    activeWindow.focus();
  });
}

function denyNavigation(contents: WebContents): void {
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function configureSessionSecurity(): void {
  const trustedOrigin = (origin: string): boolean => {
    if (origin === 'file://') return true;
    const developmentUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : '';
    return Boolean(developmentUrl && origin === new URL(developmentUrl).origin);
  };
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => permission === 'serial' && trustedOrigin(requestingOrigin));
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setDevicePermissionHandler((details) => details.deviceType === 'serial' && trustedOrigin(details.origin));
  session.defaultSession.on('select-serial-port', (event, ports, webContents, callback) => {
    event.preventDefault();
    // Never guess between multiple store devices. The renderer action is
    // user-initiated, but a single-port rule prevents an accidental drawer or
    // scale from being opened by an unattended selection.
    const selectedPort = ports[0];
    if (!trustedOrigin(webContents.getURL()) || ports.length !== 1 || !selectedPort) {
      callback('');
      return;
    }
    callback(selectedPort.portId);
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const developmentUrl =
      typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string'
        ? MAIN_WINDOW_VITE_DEV_SERVER_URL
        : '';
    const developmentOrigin = developmentUrl
      ? new URL(developmentUrl).origin
      : '';
    const scriptSource = developmentOrigin
      ? "'self' " + developmentOrigin
      : "'self'";
    const connectSource = developmentOrigin
      ? "'self' " + developmentOrigin + ' ws:'
      : "'self'";
    const policy = [
      "default-src 'self'",
      'script-src ' + scriptSource,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data:",
      'connect-src ' + connectSource,
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

function createWindow(): BrowserWindow {
  const isSmokeTest = isSmokeProcess;
  const mainWindow = new BrowserWindow({
    width: 1512,
    height: 944,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: '#eef1f3',
    autoHideMenuBar: true,
    title: 'Epic BOS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: true,
    },
  });

  denyNavigation(mainWindow.webContents);
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`EPIC_BOS_PRELOAD_ERROR ${preloadPath} ${error.message}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`EPIC_BOS_RENDERER_GONE ${details.reason} ${details.exitCode}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (isSmokeTest && level >= 2) {
      console.error(`EPIC_BOS_RENDERER_CONSOLE ${sourceId}:${line} ${message}`);
    }
  });
  if (isSmokeTest) {
    // Do not use app.exit() for the renderer smoke path. It abruptly tears
    // down Chromium child processes on Windows, which can leave a misleading
    // breakpoint dialog even after the smoke command reports a zero exit
    // status. Closing the hidden window lets Electron unwind normally.
    let smokeFinished = false;
    const finishSmoke = (exitCode: number): void => {
      if (smokeFinished) return;
      smokeFinished = true;
      process.exitCode = exitCode;
      if (mainWindow.isDestroyed()) {
        app.quit();
        return;
      }
      mainWindow.once('closed', () => app.quit());
      mainWindow.close();
    };
    const timeout = setTimeout(() => {
      console.error('EPIC_BOS_SMOKE_TIMEOUT');
      finishSmoke(1);
    }, 20_000);

    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const bridgeReady = await mainWindow.webContents.executeJavaScript(
          "Boolean(window.epicBos?.auth?.getStatus && window.epicBos?.retailWorkspace?.getStatus && window.epicBos?.revenueOps?.receiveInventory && window.epicBos?.revenueOps?.runPortalReconciliation && window.epicBos?.revenueOps?.configureProviderConnector && window.epicBos?.revenueOps?.runProviderReconciliation && window.epicBos?.revenueOps?.confirmBankMatch && window.epicBos?.revenueOps?.applyUnappliedReceipt && window.epicBos?.revenueOps?.createSupplier && window.epicBos?.revenueOps?.releasePaymentProposal && window.epicBos?.revenueOps?.createWorkOrder && window.epicBos?.revenueOps?.createProject && window.epicBos?.revenueOps?.createWorkforceProfile && window.epicBos?.revenueOps?.createWorkforceAllocation && window.epicBos?.revenueOps?.createPayrollRun && window.epicBos?.revenueOps?.finalizePayrollRun && window.epicBos?.revenueOps?.recordAttendance && window.epicBos?.revenueOps?.createLeaveApplication && window.epicBos?.revenueOps?.publishPayslip && window.epicBos?.revenueOps?.createExpenseClaim && window.epicBos?.revenueOps?.createProjectBillingPlan && window.epicBos?.revenueOps?.decideProjectBillingClaim && window.epicBos?.revenueOps?.createAccountingClosePeriod && window.epicBos?.revenueOps?.preflightRetailDeviceTransport && window.epicBos?.revenueOps?.recordRetailDevicePreflightEvidence)",
        );
        if (!bridgeReady) throw new Error('secure preload bridge is unavailable');
        const rendererState: { ready: boolean; reason?: string } = await mainWindow.webContents.executeJavaScript(
          `new Promise((resolve) => {
            const deadline = Date.now() + 8_000;
            const check = () => {
              // A fresh, isolated profile deliberately lands on the enrollment
              // gate rather than the authenticated workspace. Both are valid
              // renderer surfaces; the smoke check is about successful boot,
              // not about bypassing authentication.
              if (document.querySelector('.app-shell, .auth-gate')) {
                resolve({ ready: true });
                return;
              }
              const failure = document.querySelector('.fatal-state');
              if (failure) {
                resolve({
                  ready: false,
                  reason: (failure.textContent || 'renderer failure screen').replace(/\\s+/g, ' ').trim().slice(0, 500),
                });
                return;
              }
              if (Date.now() >= deadline) {
                const root = document.getElementById('root');
                resolve({
                  ready: false,
                  reason: 'renderer did not mount .app-shell or .auth-gate; root children: ' + (root ? root.childElementCount : 0),
                });
                return;
              }
              setTimeout(check, 50);
            };
            check();
          })`,
        );
        if (!rendererState.ready) {
          throw new Error(rendererState.reason || 'renderer did not mount its application shell');
        }
        clearTimeout(timeout);
        console.log('EPIC_BOS_SMOKE_OK');
        finishSmoke(0);
      } catch (error) {
        clearTimeout(timeout);
        console.error(`EPIC_BOS_SMOKE_FAILED ${error instanceof Error ? error.message : String(error)}`);
        finishSmoke(1);
      }
    });
    mainWindow.webContents.once(
      'did-fail-load',
      (_event, errorCode, errorDescription) => {
        clearTimeout(timeout);
        console.error(
          `EPIC_BOS_SMOKE_FAILED ${errorCode} ${errorDescription}`,
        );
        finishSmoke(1);
      },
    );
  } else if (!isE2eProcess) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.maximize();
      mainWindow.show();
    });
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(
        __dirname,
        '../renderer/' + MAIN_WINDOW_VITE_NAME + '/index.html',
      ),
    );
  }

  if (!app.isPackaged && process.env.EPIC_BOS_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  Menu.setApplicationMenu(null);
  configureSessionSecurity();

  const dataDirectory = path.join(app.getPath('userData'), 'data');
  const databasePath = path.join(dataDirectory, 'epic-bos.sqlite3');
  BusinessDatabase.applyStagedRestore(databasePath);
  const database = new BusinessDatabase(databasePath);
  await database.initialize();
  const crmStore = new CrmStore(database, dataDirectory);
  const kernelStore = new KernelStore(database, dataDirectory);
  const partyStore = new PartyStore(database);
  const crmDepthStore = new CrmDepthStore(database, crmStore, partyStore);
  const authService = new AuthService(database);
  const keyStore = new ProtectedKeyStore(dataDirectory);
  const masterKey = await keyStore.getOrCreateKey();
  const attachmentVault = new AttachmentVault(
    database,
    path.join(dataDirectory, 'attachments'),
    masterKey,
  );
  const statutoryGateway = new StatutoryGatewayService(database, masterKey);
  const providerGateway = new ProviderGatewayService(database, masterKey);
  const revenueOpsStore = new RevenueOpsStore(database, crmStore, partyStore, kernelStore, crmDepthStore, statutoryGateway, providerGateway);
  const generalLedgerStore = new GeneralLedgerStore(
    database,
    kernelStore,
    revenueOpsStore,
  );
  const apiKeyStore = new ApiKeyStore(database);
  const releaseGateStore = new ReleaseGateStore(database);
  const releaseArtifactStore = new ReleaseArtifactStore(database);
  const releaseUpdateStore = new ReleaseUpdateStore(database);
  const autoUpdateService = new AutoUpdateService(
    {
      isPackaged: app.isPackaged,
      platform: process.platform,
      version: app.getVersion(),
      feedUrl: process.env.EPIC_BOS_UPDATE_FEED_URL,
    },
    autoUpdater,
  );
  autoUpdateService.start();
  const uiAcceptanceStore = new UiAcceptanceStore(database);
  const intelligenceStore = new IntelligenceStore(database);
  const automationRunStore = new AutomationRunStore(database);
  const automationScheduleStore = new AutomationScheduleStore(database);
  const financeCompletionStore = new FinanceCompletionStore(database);
  const retailWorkspaceModeStore = new RetailWorkspaceModeStore(database);
  const workspaceProvisioner = new WorkspaceProvisioner(database, authService, {
    crmStore,
    kernelStore,
    partyStore,
    crmDepthStore,
    revenueOpsStore,
    generalLedgerStore,
  });
  revenueOpsStore.setCanonicalHandoffPostingResolver((draft) =>
    generalLedgerStore.isCanonicalHandoffPosted(draft),
  );
  revenueOpsStore.setAccountingCloseReadinessResolver((periodFrom, periodTo) =>
    generalLedgerStore.getCloseReadiness(periodFrom, periodTo),
  );
  revenueOpsStore.setAssetBookValueResolver((capitalizationId) =>
    generalLedgerStore.getAssetCapitalizationBookValue(capitalizationId),
  );
  const backupService = new BackupService(
    database,
    path.join(dataDirectory, 'backups'),
  );
  authService.pruneSessions();
  // On a truly empty database, do not let store initialization manufacture a
  // demo workspace before the owner has intentionally selected clean/sample
  // onboarding. The provisioner atomically writes the selection and then
  // hydrates these same stores after the owner enrollment succeeds.
  const deferFirstRunState = workspaceProvisioner.canProvisionFreshWorkspace();
  if (!deferFirstRunState) {
    await retailWorkspaceModeStore.initialize();
    await Promise.all([
      crmStore.initialize(),
      kernelStore.initialize(),
      partyStore.initialize(),
    ]);
    await crmDepthStore.initialize();
    await revenueOpsStore.initialize();
    await generalLedgerStore.initialize();
  }
  registerIpcHandlers(
    crmStore,
    kernelStore,
    authService,
    attachmentVault,
    backupService,
    partyStore,
    crmDepthStore,
    revenueOpsStore,
    generalLedgerStore,
    apiKeyStore,
    releaseGateStore,
    releaseArtifactStore,
    releaseUpdateStore,
    autoUpdateService,
    uiAcceptanceStore,
    intelligenceStore,
    automationRunStore,
    automationScheduleStore,
    financeCompletionStore,
    retailWorkspaceModeStore,
    database,
    deferFirstRunState ? workspaceProvisioner : undefined,
  );
  app.once('before-quit', () => database.close());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
