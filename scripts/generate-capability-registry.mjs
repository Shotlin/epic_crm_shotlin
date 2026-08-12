import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const contractsPath = path.join(root, 'src', 'shared', 'contracts.ts');
const policyPath = path.join(root, 'src', 'main', 'ipc-authorization-policy.ts');
const outputPath = path.join(root, 'docs', 'phase-0', 'CAPABILITY_REGISTRY.json');

const [contracts, policy, generator] = await Promise.all([
  readFile(contractsPath, 'utf8'),
  readFile(policyPath, 'utf8'),
  readFile(scriptPath, 'utf8'),
]);

const channels = parseChannels(contracts);
const policies = applyEffectivePolicyScopes(parseExplicitPolicies(policy), channels);
const revision = readRevision();

const ipcCapabilities = channels.map(({ key, channel }) => {
  const posture = policies.get(key);
  const explicitlyClassified = posture !== undefined;
  const module = moduleForChannel(channel);
  const genericDelegation = posture?.mode === 'delegated'
    && posture.reason === 'The handler resolves a validated self or record scope before the mutation.';
  const status = posture?.mode === 'permission'
    ? 'LOCAL_ONLY'
    : posture?.mode === 'trusted' || posture?.mode === 'delegated'
      ? 'PARTIAL'
      : 'BLOCKED';

  return {
    capability_id: `epic-bos.ipc.${key}`,
    module,
    capability_name: key,
    business_owner: 'Unassigned — Phase 0 owner required',
    data_owner: dataOwnerForModule(module),
    current_repository: 'Shotlin/epic_crm_shotlin',
    current_status: status,
    status_reason: explicitlyClassified
      ? `${posture.mode} posture: ${policyDescription(posture)}`
      : 'No authorization posture is declared. This capability is blocked until it is explicitly classified.',
    production_evidence: 'Source-level only; release-specific automated, packaged and human evidence required.',
    permissions: posture?.mode === 'permission'
      ? { resource: posture.resource, action: posture.action, scope: posture.scope }
      : posture?.mode === 'delegated'
        ? { posture: 'delegated-record-bound', reason: posture.reason }
        : { posture: posture?.mode ?? 'unclassified' },
    approvals: 'Determine per high-risk workflow during domain certification.',
    external_dependencies: [],
    test_coverage: 'Registry generator does not infer test sufficiency; inspect linked domain/main/renderer test suites.',
    human_uat_status: 'Not yet recorded for the current build.',
    provider_certification_status: 'Not applicable unless this channel reaches an external provider boundary.',
    device_certification_status: 'Not applicable unless this channel reaches a device boundary.',
    known_risks: !explicitlyClassified || genericDelegation
      ? ['P0-01: delegated handler posture still needs domain-specific resource/action/record-scope certification.']
      : [],
    next_action: !explicitlyClassified || genericDelegation
      ? 'Promote to an exact permission or named delegated-record resolver; add a regression test.'
      : 'Link the capability to domain, packaged and role-UAT evidence during certification.',
  };
});

const programmeCapabilities = [
  programmeCapability('store-edge.encrypted-backups', 'Store Edge', 'Protected backup and restore envelope', 'PARTIAL',
    'Electron backup and restore artifacts use an AES-256-GCM envelope backed by the OS-protected key store; active SQLite runtime encryption is not yet implemented.',
    ['P0-02: the live SQLite file remains plaintext while the process is running or after an unclean shutdown.'],
    'Choose and certify a SQLCipher/native encrypted runtime or an encrypted-memory persistence migration before production rollout.'),
  programmeCapability('retail-hub.runtime', 'Retail Hub', 'Retail Hub cloud runtime', 'PLANNED',
    'Read-only TypeScript shadow-import contracts exist; no deployed Fastify/PostgreSQL/Redis/worker runtime is present.',
    ['P0-03: cannot coordinate live systems until deployed and authenticated.'],
    'Implement after Phase 0 authority/contract decisions; begin only with GET-only shadow import.'),
  programmeCapability('retail-hub.shadow-import', 'Migration', 'Bakaloo read-only shadow import', 'PARTIAL',
    'HTTPS GET-only source adapter, external-ID maps, cursor/checksum/conflict and review contracts are source-tested.',
    ['No approved live credential vault/source export/reconciliation evidence yet.'],
    'Run a real approved snapshot import and independently review variance results.'),
  programmeCapability('store-edge.offline-sync', 'Store Edge', 'Store Edge to Hub durable sync', 'PARTIAL',
    'Local offline replay now has an atomic scoped inbox/outbox boundary, durable worker metrics, lease fencing, idempotency and recovery telemetry; no deployed Hub or hardware recovery drill is claimed.',
    ['No deployed cross-runtime outbox/inbox/recovery proof or physical-store drill.'],
    'Deploy the Hub, run a real outage/duplicate/restart drill, and certify store hardware recovery.'),
  programmeCapability('bakaloo-backend.socket-scope', 'Bakaloo source', 'Realtime outlet isolation', 'PARTIAL',
    'Socket.IO handshake and room/event handlers now resolve active DB assignments, session versions and canonical platform roles; cross-shop negative tests pass.',
    ['P0-04: live Socket.IO + PostgreSQL + Redis deployment and load/reconnect evidence are still open.'],
    'Run the real multi-shop deployment drill and attach room-join, disconnect, reconnect and Redis evidence.'),
  programmeCapability('bakaloo-backend.payment-webhook', 'Bakaloo source', 'Payment webhook verification', 'PARTIAL',
    'Razorpay callbacks now verify the received raw request bytes with constant-time HMAC comparison, replay claims and out-of-order guards.',
    ['P0-06: applied migration, sandbox replay, provider credentials and settlement reconciliation are not certified.'],
    'Run provider sandbox replay and reconcile accepted, duplicate, failed and late events against the ledger.'),
  programmeCapability('bakaloo-backend.finance-ledger', 'Bakaloo source', 'Immutable finance/stock evidence', 'PARTIAL',
    'Backend has transaction/audit tables but source audit found post-insert updates and unprovisioned restricted-role grants.',
    ['P0-07: append-only claim is unproven.'],
    'Use reversal/adjustment facts and enforce database grants/triggers with migration tests.'),
  programmeCapability('bakaloo-dashboard.identity', 'Bakaloo dashboard', 'Browser identity and MFA', 'PARTIAL',
    'Browser identity uses HttpOnly cookies and now calls server-enforced encrypted-TOTP setup, one-use challenges, replay protection and recovery-code endpoints; no client-side simulated factor remains.',
    ['P0-08: live migration/deployment, browser UAT, CSRF policy and MFA encryption-key rotation evidence remain open.'],
    'Apply migration 094, run role-by-role browser UAT and recovery drills, then certify key rotation and session revocation.'),
  programmeCapability('bakaloo-dashboard.map-truth', 'Bakaloo dashboard', 'Rider map and freshness', 'PARTIAL',
    'Dashboard map now removes the fixed Kolkata fallback, validates coordinates and timestamps, and shows unavailable unless the Socket.IO signal is connected and fresh within two minutes.',
    ['P0-08: real provider-neutral map/GPS consent, source provenance and live deployment evidence remain open.'],
    'Run a real rider-location drill with consent, reconnect, stale and cross-shop cases; attach map-provider and production evidence.'),
  programmeCapability('bakaloo.refund-contract', 'Commerce', 'Canonical refund and reversal contract', 'PARTIAL',
    'Audit found conflicting legacy and store-order refund UI paths.',
    ['P0-09: amount/approval/ledger rules differ between routes.'],
    'Choose one backend-enforced state machine; reject unauthorised/overpaid refunds and record reversals.'),
];

const registry = {
  schema_version: 1,
  source_revision: revision,
  source_input_sha256: {
    ipc_channels: checksum(contracts),
    ipc_authorization_policy: checksum(policy),
    registry_generator: checksum(generator),
  },
  purpose: 'Phase 0 evidence register. Statuses are deliberately conservative and do not constitute production certification.',
  status_definitions: {
    READY: 'All required current evidence, including independent review, is available.',
    PARTIAL: 'Some implementation/evidence exists but a material control or certification gap remains.',
    LOCAL_ONLY: 'Works within a local/source boundary only; no live integration claim.',
    CERTIFICATION_REQUIRED: 'Implementation boundary exists but an external/provider/device or human certification is needed.',
    PLANNED: 'Approved target without sufficient implementation.',
    BLOCKED: 'Cannot safely progress without a P0 fix, external authority or required evidence.',
    DEPRECATED: 'Must not be used for a new workflow.',
  },
  generated_inventory: {
    declared_ipc_channels: channels.length,
    explicitly_classified_ipc_channels: policies.size,
    unclassified_ipc_channels: channels.length - policies.size,
  },
  capabilities: [...ipcCapabilities, ...programmeCapabilities],
};

const rendered = `${JSON.stringify(registry, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8').catch(() => undefined);
  if (existing !== rendered) {
    console.error(`Capability registry is stale. Run: pnpm run generate:capability-registry`);
    process.exitCode = 1;
  } else {
    console.log(`Capability registry is current: ${path.relative(root, outputPath)}.`);
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered, 'utf8');
  console.log(`Wrote ${path.relative(root, outputPath)} with ${registry.capabilities.length} capability records.`);
}

function parseChannels(source) {
  const blockStart = source.indexOf('export const IPC_CHANNELS = {');
  if (blockStart < 0) throw new Error('IPC channel declaration was not found.');
  const blockEnd = source.indexOf('} as const;', blockStart);
  if (blockEnd < 0) throw new Error('IPC channel declaration end was not found.');
  const block = source.slice(blockStart, blockEnd);
  return [...block.matchAll(/^\s*([A-Za-z0-9_]+):\s*'([^']+)'/gm)]
    .map((match) => ({ key: match[1], channel: match[2] }));
}

function parseExplicitPolicies(source) {
  const start = source.indexOf('const BASE_IPC_AUTHORIZATION_POLICY');
  const end = source.indexOf('const REVENUE_OPERATIONS_BOUND_PREFIXES', start);
  if (start < 0 || end < 0) throw new Error('IPC authorization policy declaration was not found.');
  const block = source.slice(start, end);
  const lines = block.split(/\r?\n/);
  const policies = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const inline = /^\s{2}([A-Za-z0-9_]+):\s*\{([^}]+)\},?\s*$/.exec(lines[index]);
    if (inline) {
      const parsed = parsePolicyValue(inline[2]);
      if (parsed) policies.set(inline[1], parsed);
      continue;
    }
    const header = /^\s{2}([A-Za-z0-9_]+):\s*\{\s*$/.exec(lines[index]);
    if (!header) continue;
    const parts = [];
    while (index + 1 < lines.length) {
      index += 1;
      if (/^\s{2}\},?$/.test(lines[index])) break;
      parts.push(lines[index]);
    }
    const parsed = parsePolicyValue(parts.join('\n'));
    if (parsed) policies.set(header[1], parsed);
  }
  const delegatedList = /const EXPLICIT_DELEGATED_SCOPE_CHANNEL_KEYS = \[([\s\S]*?)\] as const/.exec(source)?.[1] ?? '';
  for (const key of delegatedList.matchAll(/'([A-Za-z0-9_]+)'/g)) {
    if (!policies.has(key[1])) {
      policies.set(key[1], {
        mode: 'delegated',
        reason: 'The handler resolves a validated self or record scope before the mutation.',
      });
    }
  }
  return policies;
}

function applyEffectivePolicyScopes(policies, channels) {
  const revenueOperationsBoundPrefixes = [
    'epic-bos:revenue-ops:',
    'epic-bos:statutory:',
    'epic-bos:provider:',
    'epic-bos:collections:',
    'epic-bos:finance:',
    'epic-bos:procurement:',
    'epic-bos:treasury:',
    'epic-bos:manufacturing:',
    'epic-bos:asset:',
    'epic-bos:maintenance:',
    'epic-bos:delivery:',
    'epic-bos:workforce:',
    'epic-bos:payroll:',
    'epic-bos:financial:',
    'epic-bos:commercial:',
    'epic-bos:inventory:',
    'epic-bos:retail:',
  ];
  const channelByKey = new Map(channels.map(({ key, channel }) => [key, channel]));
  return new Map([...policies].map(([key, posture]) => {
    const channel = channelByKey.get(key) ?? '';
    const isRevenueOperationsRoute = revenueOperationsBoundPrefixes.some(
      (prefix) => channel.startsWith(prefix),
    );
    if (
      posture.mode === 'permission'
      && posture.scope === 'active'
      && isRevenueOperationsRoute
    ) {
      return [key, { ...posture, scope: 'revenue-operations-bound' }];
    }
    return [key, posture];
  }));
}

function parsePolicyValue(value) {
  const mode = /mode:\s*'([^']+)'/.exec(value)?.[1];
  if (!mode) return undefined;
  if (mode === 'permission') {
    return {
      mode,
      resource: /resource:\s*'([^']+)'/.exec(value)?.[1] ?? 'unparsed',
      action: /action:\s*'([^']+)'/.exec(value)?.[1] ?? 'unparsed',
      scope: /scope:\s*'([^']+)'/.exec(value)?.[1] ?? 'unparsed',
    };
  }
  if (mode === 'delegated') {
    return {
      mode,
      reason: /reason:\s*'([^']+)'/.exec(value)?.[1] ?? 'Delegated handler scope.',
    };
  }
  return { mode };
}

function moduleForChannel(channel) {
  const namespace = channel.split(':')[1] ?? 'kernel';
  const map = {
    retail: 'Retail Core',
    inventory: 'Inventory',
    procurement: 'Purchase',
    finance: 'Finance',
    statutory: 'Statutory',
    provider: 'Integrations',
    delivery: 'Delivery',
    payroll: 'People',
    workforce: 'People',
    crm: 'Customers',
    party: 'Customers',
    commercial: 'Orders',
    treasury: 'Finance',
    collections: 'Finance',
    kernel: 'Administration',
    storage: 'Administration',
    release: 'Administration',
    integration: 'Integrations',
  };
  return map[namespace] ?? namespace;
}

function dataOwnerForModule(module) {
  const owner = {
    'Retail Core': 'Store Edge until reconciled into Retail Hub',
    Inventory: 'Store Edge physical movement / Retail Hub reconciled stock',
    Purchase: 'Retail Hub purchase records after accepted sync',
    Finance: 'Retail Hub financial ledger after reconciliation',
    Customers: 'Retail Hub customer and consent service',
    Orders: 'Retail Hub unified order service',
    Delivery: 'Retail Hub delivery service',
    Integrations: 'Retail Hub integration gateway',
    People: 'Retail Hub workforce service',
    Administration: 'Retail Hub organisation and policy service',
    Statutory: 'Retail Hub statutory evidence service',
  };
  return owner[module] ?? 'Unassigned — Phase 0 ownership decision required';
}

function policyDescription(policy) {
  if (policy.mode === 'permission') return `${policy.resource}:${policy.action} at ${policy.scope} scope`;
  if (policy.mode === 'delegated') return policy.reason;
  return 'trusted bootstrap route';
}

function programmeCapability(id, module, name, status, reason, risks, nextAction) {
  return {
    capability_id: id,
    module,
    capability_name: name,
    business_owner: 'Unassigned — Phase 0 owner required',
    data_owner: dataOwnerForModule(module),
    current_repository: id.startsWith('bakaloo-backend')
      ? 'Shotlin/bakaloo-backend'
      : id.startsWith('bakaloo-dashboard')
        ? 'shotlin085/bakaloo-dashboard'
        : 'Shotlin/epic_crm_shotlin',
    current_status: status,
    status_reason: reason,
    production_evidence: 'Source audit only; no production certification asserted.',
    permissions: 'See canonical permission manifest; implementation evidence required.',
    approvals: 'Defined per controlled workflow.',
    external_dependencies: [],
    test_coverage: 'See repository-specific tests; live/provider evidence is not implied.',
    human_uat_status: 'Not yet recorded for the current build.',
    provider_certification_status: 'Not yet certified unless independently evidenced.',
    device_certification_status: 'Not yet certified unless independently evidenced.',
    known_risks: risks,
    next_action: nextAction,
  };
}

function readRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
  }
}

function checksum(value) {
  return createHash('sha256').update(value).digest('hex');
}
