export type UiAcceptancePersona = 'cashier' | 'store-manager' | 'hq-finance' | 'administrator';
export type UiAcceptanceSeverity = 'critical' | 'high' | 'standard';
export type UiAcceptanceResult = 'passed' | 'failed' | 'blocked';
export type UiAcceptanceEvidenceStatus = 'submitted' | 'verified' | 'rejected';
export type UiAcceptanceRowStatus = 'missing' | 'submitted' | 'verified' | 'failed' | 'rejected' | 'stale';

/** A real Electron workbench destination for a guided acceptance mission. */
export type UiAcceptanceRoute =
  | { kind: 'command'; surface: 'overview' | 'governance' | 'control'; controlTab?: 'organization' | 'access' | 'approvals' | 'storage' | 'release' | 'integration' }
  | { kind: 'retail-submodule'; key: string }
  | { kind: 'crm-surface'; surface: 'overview' | 'party' }
  | { kind: 'crm'; tab: 'signal' | 'pipeline' | 'audience' | 'data' | 'connections' }
  | { kind: 'bharat'; workspace: 'sales' | 'finance' | 'operations' | 'people' | 'service' | 'intelligence'; tab: string };

export interface UiAcceptanceScenario {
  id: string;
  module: string;
  screen: string;
  /** Stable screen/workbench identity used by the UAT route registry. */
  surfaceId: string;
  /** Exact workbench destination that the tester can open before starting. */
  route: UiAcceptanceRoute;
  persona: UiAcceptancePersona;
  title: string;
  setup: string;
  steps: readonly UiAcceptanceStep[];
  expectedOutcome: string;
  severity: UiAcceptanceSeverity;
}

export interface UiAcceptanceStep {
  order: number;
  instruction: string;
  expectedCheckpoint: string;
}

export interface UiAcceptanceEvidence {
  id: string;
  scenarioId: string;
  scenarioFingerprint: string;
  releaseIdentitySha256: string;
  result: UiAcceptanceResult;
  evidenceReference: string;
  notes?: string;
  submittedBy: string;
  submittedAt: string;
  status: UiAcceptanceEvidenceStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  reviewerNotes?: string;
  version: number;
}

export interface UiAcceptanceReadinessRow extends UiAcceptanceScenario {
  status: UiAcceptanceRowStatus;
  evidenceId?: string;
  nextAction: string;
}

export interface UiAcceptanceReadinessReport {
  status: 'ready' | 'blocked';
  releaseIdentitySha256: string;
  requiredCount: number;
  verifiedPassedCount: number;
  pendingReviewCount: number;
  failedOrRejectedCount: number;
  staleCount: number;
  rows: UiAcceptanceReadinessRow[];
  nextActions: string[];
}

const surfaceSlug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const UI_ACCEPTANCE_ROUTE_REGISTRY: Record<string, UiAcceptanceRoute> = {
  'retail-pos-open-shift': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-pos-cash-checkout': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-pos-loyalty-voucher': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-pos-receipt': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-pos-offline-queue': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-returns-request': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-pos-close-approval': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-pos-variance': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-returns-decision': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-catalog-merchandising': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-catalog-bulk': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-device-request': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-printer-evidence': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-offline-recovery': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-interbranch-transfer': { kind: 'bharat', workspace: 'operations', tab: 'fulfilment' },
  'retail-warehouse-control': { kind: 'bharat', workspace: 'operations', tab: 'warehouse' },
  'retail-procurement-operations': { kind: 'bharat', workspace: 'operations', tab: 'procurement' },
  'retail-fulfilment-cod': { kind: 'bharat', workspace: 'operations', tab: 'fulfilment' },
  'crm-lead-party': { kind: 'crm-surface', surface: 'party' },
  'crm-pipeline': { kind: 'crm', tab: 'pipeline' },
  'crm-campaign': { kind: 'crm', tab: 'audience' },
  'crm-import': { kind: 'crm', tab: 'data' },
  'sales-quote': { kind: 'bharat', workspace: 'sales', tab: 'quotes' },
  'sales-order-fulfilment': { kind: 'bharat', workspace: 'sales', tab: 'fulfilment' },
  'finance-cash-application': { kind: 'bharat', workspace: 'finance', tab: 'cash' },
  'finance-collections': { kind: 'bharat', workspace: 'finance', tab: 'collections' },
  'finance-treasury': { kind: 'bharat', workspace: 'finance', tab: 'treasury' },
  'finance-ledger': { kind: 'bharat', workspace: 'finance', tab: 'ledger' },
  'finance-close': { kind: 'bharat', workspace: 'finance', tab: 'close' },
  'people-payroll-posting': { kind: 'bharat', workspace: 'people', tab: 'people' },
  'statutory-provider-response': { kind: 'bharat', workspace: 'finance', tab: 'statutory' },
  'commerce-connector': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'commerce-order-conflict': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'commerce-settlement': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'commerce-ocr': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'retail-reports': { kind: 'bharat', workspace: 'sales', tab: 'commerce' },
  'intelligence-exceptions': { kind: 'bharat', workspace: 'intelligence', tab: 'intelligence' },
  'executive-dashboard': { kind: 'command', surface: 'overview' },
  'auth-bootstrap-login': { kind: 'command', surface: 'control', controlTab: 'organization' },
  'auth-password': { kind: 'command', surface: 'control', controlTab: 'access' },
  'app-navigation-accessibility': { kind: 'command', surface: 'overview' },
  'company-branch': { kind: 'command', surface: 'control', controlTab: 'organization' },
  'rbac-policy': { kind: 'command', surface: 'control', controlTab: 'access' },
  'backup-restore': { kind: 'command', surface: 'control', controlTab: 'storage' },
  'api-key-control': { kind: 'command', surface: 'control', controlTab: 'integration' },
  'release-artifact': { kind: 'command', surface: 'control', controlTab: 'release' },
  'release-update': { kind: 'command', surface: 'control', controlTab: 'release' },
  'go-live-checklist': { kind: 'command', surface: 'control', controlTab: 'release' },
  'retail-device-readiness': { kind: 'retail-submodule', key: 'setup:devices' },
  'retail-integration-readiness': { kind: 'retail-submodule', key: 'setup:integrations' },
  'retail-recovery-readiness': { kind: 'retail-submodule', key: 'setup:recovery' },
};

function routeForScenario(id: string): UiAcceptanceRoute {
  const route = UI_ACCEPTANCE_ROUTE_REGISTRY[id];
  if (!route) throw new Error(`Acceptance route is not registered for ${id}.`);
  return route;
}

const scenario = (id: string, module: string, screen: string, persona: UiAcceptancePersona, title: string, expectedOutcome: string, severity: UiAcceptanceSeverity = 'high'): UiAcceptanceScenario => {
  const surfaceId = `${surfaceSlug(module)}-${surfaceSlug(screen)}`;
  return {
    id,
    module,
    screen,
    surfaceId,
    route: routeForScenario(id),
    persona,
    title,
    setup: `Sign in as a ${persona.replaceAll('-', ' ')} in the active company and branch.`,
    steps: [
      { order: 1, instruction: `Open ${screen}.`, expectedCheckpoint: `${screen} is visible and the active company/branch is clear.` },
      { order: 2, instruction: title.endsWith('.') ? title : `${title}.`, expectedCheckpoint: 'The primary action completes without bypassing the visible approval or evidence boundary.' },
      { order: 3, instruction: `Check the result against: ${expectedOutcome}`, expectedCheckpoint: expectedOutcome },
      { order: 4, instruction: 'Capture a reference that another person can inspect.', expectedCheckpoint: 'The evidence reference is saved with the observed result and release identity.' },
    ],
    expectedOutcome,
    severity,
  };
};

/**
 * The 51 journeys are intentionally specific enough for a tester to execute,
 * while remaining independent of individual demo record IDs. They are an
 * acceptance catalog, not an assertion that a screen has been tested.
 */
export const UI_ACCEPTANCE_CATALOG: readonly UiAcceptanceScenario[] = [
  // Cashier (6)
  scenario('retail-pos-open-shift', 'Retail POS', 'Counter & shift', 'cashier', 'Open the assigned cashier shift', 'The cashier can open only their assigned counter shift and the opening cash is recorded.', 'critical'),
  scenario('retail-pos-cash-checkout', 'Retail POS', 'Checkout', 'cashier', 'Sell one price-backed barcode SKU for cash', 'A GST-safe sale, tender, stock movement, and receipt are created exactly once.', 'critical'),
  scenario('retail-pos-loyalty-voucher', 'Retail POS', 'Checkout', 'cashier', 'Apply a valid loyalty redemption or voucher', 'Only eligible benefits change the payable amount and the redemption remains auditable.'),
  scenario('retail-pos-receipt', 'Retail POS', 'Receipt history', 'cashier', 'View and reprint an immutable receipt', 'The displayed receipt matches the saved sale and has no editable transaction values.'),
  scenario('retail-pos-offline-queue', 'Retail POS', 'Offline store recovery', 'cashier', 'Save a sale for offline synchronization and resume it', 'The sale stays queued until a checksum-validated governed sync succeeds.', 'critical'),
  scenario('retail-returns-request', 'Retail returns', 'Returns and exchanges', 'cashier', 'Request a return or exchange from an eligible receipt', 'The request is created without directly issuing a refund or changing stock.', 'critical'),

  // Store manager (13)
  scenario('retail-pos-close-approval', 'Retail POS', 'Shift close', 'store-manager', 'Approve or reject another cashier’s shift close', 'The manager sees an independent decision and cannot approve their own request.', 'critical'),
  scenario('retail-pos-variance', 'Retail POS', 'Shift variance', 'store-manager', 'Resolve a documented drawer variance', 'The exception keeps the tender evidence and maker-checker history.'),
  scenario('retail-returns-decision', 'Retail returns', 'Returns and exchanges', 'store-manager', 'Approve or reject another cashier’s return or exchange', 'Refund, credit note, and stock effects occur only after the governed decision.', 'critical'),
  scenario('retail-catalog-merchandising', 'Retail catalog', 'Categories and merchandising', 'store-manager', 'Maintain an approved category, barcode, brand, or combo', 'The catalog change is validated, searchable, and visible to POS only when active.'),
  scenario('retail-catalog-bulk', 'Retail catalog', 'Bulk merchandising', 'store-manager', 'Prepare or independently apply a bulk catalog edit', 'The change set has a checksum and requires the correct independent actor.'),
  scenario('retail-device-request', 'Retail devices', 'Device transport', 'store-manager', 'Prepare a scanner, printer, drawer, or scale command', 'The command remains pending until a real bounded device response is recorded.'),
  scenario('retail-printer-evidence', 'Retail catalog operations', 'Printer adapter', 'store-manager', 'Record actual printer test evidence', 'The screen asks for a real reference and never labels operator evidence as driver certification.'),
  scenario('retail-offline-recovery', 'Retail POS', 'Supervisor recovery', 'store-manager', 'Recover another cashier’s queued sale with incident evidence', 'Recovery requires a reference and still enforces stock, GST, payment, and approval controls.', 'critical'),
  scenario('retail-device-readiness', 'Retail devices', 'Device readiness desk', 'store-manager', 'Review device readiness before opening a counter', 'The desk distinguishes local transport evidence from native driver certification and never claims an untested device is live.'),
  scenario('retail-interbranch-transfer', 'Inventory', 'Inter-branch transfer', 'store-manager', 'Create, approve, dispatch, and receive an inter-branch transfer', 'Each custody stage stays visible and inventory moves only at the correct stage.', 'critical'),
  scenario('retail-warehouse-control', 'Warehouse', 'Receiving, pick, and count', 'store-manager', 'Receive, put away, pick, or cycle-count controlled stock', 'Bin, batch, serial, and variance rules are shown before stock changes.'),
  scenario('retail-procurement-operations', 'Procurement', 'PO to receipt', 'store-manager', 'Run a purchase order, receipt, and three-way match journey', 'Supplier, quantity, price, and receiving evidence are reconciled.'),
  scenario('retail-fulfilment-cod', 'Fulfilment', 'Serviceability and COD', 'store-manager', 'Run a pincode, fulfilment, or COD custody journey', 'Serviceability and custody exceptions are explicit and never silently settled.'),

  // HQ / finance (22)
  scenario('crm-lead-party', 'CRM', 'Lead to party', 'hq-finance', 'Convert a qualified lead into a governed party record', 'Account, contact, consent, and deduplication outcomes are visible.'),
  scenario('crm-pipeline', 'CRM', 'Pipeline policy', 'hq-finance', 'Move an opportunity through a configured pipeline', 'Stage policy, score, forecast, and next action update together.'),
  scenario('crm-campaign', 'CRM', 'Campaigns', 'hq-finance', 'Create a consent-safe campaign and communication record', 'Only eligible consented audiences can receive a governed communication.'),
  scenario('crm-import', 'CRM', 'Data quality', 'hq-finance', 'Preview and commit a governed import', 'Duplicate and field-quality decisions are visible before records are written.'),
  scenario('sales-quote', 'Sales', 'Quotation and order', 'hq-finance', 'Create and approve a GST-aware quotation', 'Price, discount, GST, approval, and PDF evidence reconcile.'),
  scenario('sales-order-fulfilment', 'Sales', 'Sales order', 'hq-finance', 'Convert an approved quotation into a sales order and fulfilment handoff', 'The order preserves commercial evidence and creates the correct next work.'),
  scenario('finance-cash-application', 'Finance', 'Cash application', 'hq-finance', 'Match a receipt or bank line to open receivables', 'A match is explainable, reversible through governed work, and does not over-apply cash.', 'critical'),
  scenario('finance-collections', 'Finance', 'Collections command', 'hq-finance', 'Run dunning and handle a credit, dispute, or write-off exception', 'Policy, evidence, and independent approvals remain visible.'),
  scenario('finance-treasury', 'Finance', 'Treasury and settlement', 'hq-finance', 'Review bank, UPI, card, or marketplace settlement exceptions', 'Unmatched and withheld amounts remain held until evidence is accepted.', 'critical'),
  scenario('finance-ledger', 'Finance', 'General ledger', 'hq-finance', 'Prepare and post a balanced accounting journal', 'The journal is balanced, period-checked, and immutable after posting.', 'critical'),
  scenario('finance-close', 'Finance', 'Close and workpapers', 'hq-finance', 'Review close readiness and a statutory workpaper', 'Missing GST, FX, payroll, or reconciliation evidence blocks the close.'),
  scenario('people-payroll-posting', 'People', 'Payroll', 'hq-finance', 'Review a payroll or expense posting', 'The posting needs approved source data and keeps employee evidence protected.'),
  scenario('statutory-provider-response', 'Statutory', 'GST and provider response', 'hq-finance', 'Prepare and reconcile a GST or provider response', 'Government/provider response evidence is retained as authoritative and stale credentials block reuse.', 'critical'),
  scenario('commerce-connector', 'Omnichannel', 'Marketplace and ONDC', 'hq-finance', 'Configure a connector and record a pull or push result', 'Credentials, mappings, payload checksum, and provider response are explicit.'),
  scenario('commerce-order-conflict', 'Omnichannel', 'Unified orders', 'hq-finance', 'Resolve an order, SKU, cancellation, return, or RTO conflict', 'No inventory or settlement decision bypasses evidence and approval.'),
  scenario('commerce-settlement', 'Omnichannel', 'Marketplace settlement', 'hq-finance', 'Approve a marketplace settlement allocation or commission payout', 'Fees, taxes, payout, and ledger posting are independently reviewable.'),
  scenario('commerce-ocr', 'Procurement', 'Purchase OCR', 'hq-finance', 'Review and convert a purchase OCR document', 'Source checksum, provider revision, and mapping approval stay traceable.'),
  scenario('retail-reports', 'Retail analytics', 'Reports workbench', 'hq-finance', 'Read X/Z, GST, margin, tender, and sell-through reports', 'Filters and totals are understandable and reflect the selected scope.'),
  scenario('intelligence-exceptions', 'Intelligence', 'Command centre and anomalies', 'hq-finance', 'Review a business exception or recommendation', 'The recommendation shows source evidence and does not mutate data without a governed action.'),
  scenario('executive-dashboard', 'Command', 'Executive dashboard', 'hq-finance', 'Use a dashboard drill-down to find an operational exception', 'The dashboard provides an understandable next action rather than a decorative metric.'),
  scenario('retail-integration-readiness', 'Setup', 'Integration readiness', 'hq-finance', 'Review Retail Hub and provider readiness without exposing secrets', 'Workspace mode, provider evidence, and external-write boundaries are visible without accepting credentials in the renderer.'),
  scenario('retail-recovery-readiness', 'Setup', 'Recovery and release readiness', 'administrator', 'Review backup, restore-drill, migration, and release evidence', 'Recovery evidence is source-backed, stale or missing gates remain blocked, and mutation stays in the protected control room.'),

  // Administrator (10)
  scenario('auth-bootstrap-login', 'Security', 'Onboarding and sign-in', 'administrator', 'Bootstrap an owner, sign in, lock, and sign out', 'Credentials are never exposed and session transitions are clear.', 'critical'),
  scenario('auth-password', 'Security', 'Password controls', 'administrator', 'Change a password or handle a forced password change', 'The user receives clear validation and old credentials cannot continue a session.', 'critical'),
  scenario('app-navigation-accessibility', 'Workspace', 'Navigation and command palette', 'administrator', 'Navigate every primary workspace with mouse and keyboard', 'The rail, command palette, focus order, and scrolling are usable at desktop and narrow widths.', 'critical'),
  scenario('company-branch', 'Settings', 'Company and branch administration', 'administrator', 'Create or switch company and branch scope', 'Scope is explicit and protected data does not leak between companies or branches.', 'critical'),
  scenario('rbac-policy', 'Settings', 'Users, roles, and policies', 'administrator', 'Create a role and validate a permitted and denied action', 'The UI is understandable and the main-process authorization boundary fails closed.', 'critical'),
  scenario('backup-restore', 'Settings', 'Backup and restore', 'administrator', 'Create a backup and stage a restore drill', 'The app reports real backup metadata and requires a separate recovery runbook for restoration.', 'critical'),
  scenario('api-key-control', 'Settings', 'API keys', 'administrator', 'Issue, inventory, and revoke an API key', 'A secret is shown only at creation and revocation is auditable.'),
  scenario('release-artifact', 'Release control', 'Cross-platform artifacts', 'administrator', 'Submit and independently verify release artifact evidence', 'Evidence is tied to the active release identity and cannot be reused after a build change.', 'critical'),
  scenario('release-update', 'Release control', 'Update channels', 'administrator', 'Submit and independently verify update and rollback evidence', 'The source build identity, signature, and rollback reference remain visible.', 'critical'),
  scenario('go-live-checklist', 'Release control', 'Go-live checklist', 'administrator', 'Review and copy the go-live checklist', 'The screen clearly separates local readiness from external provider and hardware gates.', 'critical'),
];

/**
 * This catalog is rendered in the browser as well as evaluated in the main
 * process. A compact synchronous SHA-256 implementation keeps the scenario
 * revision fingerprint identical in both runtimes without importing Node's
 * `crypto` into the renderer bundle. It fingerprints an immutable catalog
 * definition; it is not used for credential or message cryptography.
 */
const SHA_256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const rotateRight = (value: number, places: number): number => (value >>> places) | (value << (32 - places));

function digest(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const message = new Uint8Array(paddedLength);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index += 1) message[paddedLength - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);

  const hash: [number, number, number, number, number, number, number, number] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  for (let block = 0; block < message.length; block += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      const offset = block + index * 4;
      words[index] = ((message[offset]! << 24) | (message[offset + 1]! << 16) | (message[offset + 2]! << 8) | message[offset + 3]!) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15]!;
      const word2 = words[index - 2]!;
      const smallSigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const smallSigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] = (words[index - 16]! + smallSigma0 + words[index - 7]! + smallSigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + bigSigma1 + choose + SHA_256_K[index]! + words[index]!) >>> 0;
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function createUiAcceptanceScenarioFingerprint(value: UiAcceptanceScenario): string {
  return digest(JSON.stringify({ id: value.id, module: value.module, screen: value.screen, surfaceId: value.surfaceId, route: value.route, persona: value.persona, title: value.title, setup: value.setup, steps: value.steps, expectedOutcome: value.expectedOutcome, severity: value.severity }));
}

function latestEvidence(records: UiAcceptanceEvidence[]): UiAcceptanceEvidence | undefined {
  return [...records].sort((left, right) => `${right.submittedAt}:${right.id}`.localeCompare(`${left.submittedAt}:${left.id}`))[0];
}

function describeNextAction(scenario: UiAcceptanceScenario, status: UiAcceptanceRowStatus, staleForCurrentJourney = false): string {
  if (status === 'missing') return `Have a ${scenario.persona.replaceAll('-', ' ')} complete and record this journey.`;
  if (status === 'submitted') return 'An independent reviewer must verify the submitted result.';
  if (status === 'failed') return 'Fix the observed problem, then repeat this journey with fresh evidence.';
  if (status === 'rejected') return 'Address the reviewer feedback, then resubmit this journey.';
  if (status === 'stale') return staleForCurrentJourney ? 'Repeat the current journey revision and record fresh evidence.' : 'Repeat this journey on the active release and record fresh evidence.';
  return 'Verified for the active release and current journey revision.';
}

export function evaluateUiAcceptanceReadiness({ releaseIdentitySha256, evidence, catalog = UI_ACCEPTANCE_CATALOG }: { releaseIdentitySha256: string; evidence: readonly UiAcceptanceEvidence[]; catalog?: readonly UiAcceptanceScenario[] }): UiAcceptanceReadinessReport {
  const rows = catalog.map((scenario): UiAcceptanceReadinessRow => {
    const allForScenario = evidence.filter((record) => record.scenarioId === scenario.id);
    const expectedFingerprint = createUiAcceptanceScenarioFingerprint(scenario);
    const current = latestEvidence(allForScenario.filter((record) => record.releaseIdentitySha256 === releaseIdentitySha256 && record.scenarioFingerprint === expectedFingerprint));
    let status: UiAcceptanceRowStatus;
    const staleForCurrentJourney = !current && allForScenario.some((record) => record.releaseIdentitySha256 === releaseIdentitySha256);
    if (!current) status = allForScenario.length ? 'stale' : 'missing';
    else if (current.result === 'failed' || current.result === 'blocked') status = 'failed';
    else if (current.status === 'verified') status = 'verified';
    else if (current.status === 'rejected') status = 'rejected';
    else status = 'submitted';
    return { ...scenario, status, evidenceId: current?.id, nextAction: describeNextAction(scenario, status, staleForCurrentJourney) };
  });
  const verifiedPassedCount = rows.filter((row) => row.status === 'verified').length;
  const pendingReviewCount = rows.filter((row) => row.status === 'submitted').length;
  const failedOrRejectedCount = rows.filter((row) => row.status === 'failed' || row.status === 'rejected').length;
  const staleCount = rows.filter((row) => row.status === 'stale').length;
  return {
    status: verifiedPassedCount === rows.length && rows.length > 0 ? 'ready' : 'blocked',
    releaseIdentitySha256,
    requiredCount: rows.length,
    verifiedPassedCount,
    pendingReviewCount,
    failedOrRejectedCount,
    staleCount,
    rows,
    nextActions: rows.filter((row) => row.status !== 'verified').slice(0, 6).map((row) => `${row.module}: ${row.title} — ${row.nextAction}`),
  };
}
