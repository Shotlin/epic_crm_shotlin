import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import type {
  AttachmentMetadata,
  AuditEntry,
  DomainEvent,
} from '../shared/kernel-contracts';
import type { ReleaseArtifactEvidence } from '../shared/release-artifact-contracts';
import type { ReleaseUpdateEvidence } from '../shared/release-update-contracts';
import type { UiAcceptanceEvidence } from '../domain/ui-acceptance-readiness';
import type { RestoreDrillRecord } from '../shared/storage-contracts';

interface Migration {
  id: string;
  sql: string;
}

export interface StoredState<T> {
  schemaVersion: number;
  revision: number;
  payload: T;
}

/**
 * A one-way guard around first-run workspace population.  `starterMode` is
 * intentionally null for legacy or otherwise unknown data: inferring a
 * "clean" or "sample" choice after the fact would make it too easy for a
 * later onboarding flow to overwrite a real workspace.
 */
export type WorkspaceBootstrapStatus =
  | 'pending'
  | 'provisioned'
  | 'protected-existing';

export type WorkspaceStarterMode = 'clean' | 'sample';

export interface WorkspaceBootstrapGuard {
  workspaceId: string;
  status: WorkspaceBootstrapStatus;
  starterMode: WorkspaceStarterMode | null;
  createdAt: string;
  updatedAt: string;
  provisionedAt: string | null;
}

export interface CredentialRecord {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  algorithm: 'scrypt-v1';
  parameters: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

/**
 * A complete state document to be written during first-run provisioning.
 * These records deliberately use the same durable shape as `saveState`, but
 * are supplied as data so the bootstrap transaction never has to know about
 * domain factories or application services.
 */
export interface WorkspaceBootstrapStateDocument {
  namespace: string;
  schemaVersion: number;
  revision: number;
  payload: unknown;
}

/**
 * Extra safeguards for a deliberately controlled state replacement.  Normal
 * state replacement preserves durable outbox history.  A verified starter
 * reset can opt in to retiring only the now-superseded events for the exact
 * namespaces being replaced, before the new documents contribute their own
 * events in the same transaction.
 */
export interface CoordinatedStateReplacementOptions {
  /** Remove retired audit evidence only for verified starter cleanup. */
  retireAuditForReplacedNamespaces?: boolean;
  /** Remove retired outbox evidence only for verified starter cleanup. */
  retireOutboxForReplacedNamespaces?: boolean;
}

/**
 * The minimum coherent set of records required for a usable new workspace.
 * The caller creates the documents, credential, and session beforehand; this
 * database boundary owns only their all-or-nothing persistence.
 */
export interface WorkspaceBootstrapManifest {
  starterMode: WorkspaceStarterMode;
  stateDocuments: readonly WorkspaceBootstrapStateDocument[];
  credential: CredentialRecord;
  session: SessionRecord;
}

export interface StoredAttachment extends AttachmentMetadata {
  encryptedPath: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export interface StoredAdapterSecret {
  adapterId: string;
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  checksum: string;
  updatedBy: string;
  updatedAt: string;
}

export interface StoredProviderSecret {
  connectorId: string;
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  checksum: string;
  updatedBy: string;
  updatedAt: string;
}

export interface StoredIntelligenceRecord {
  id: string;
  companyId: string;
  branchId: string;
  payloadJson: string;
  payloadChecksum: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredFinanceCompletionRecord {
  id: string;
  companyId: string;
  branchId: string;
  payloadJson: string;
  payloadChecksum: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAutomationRun {
  id: string;
  companyId: string;
  branchId: string;
  payloadJson: string;
  payloadChecksum: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAutomationSchedule {
  id: string;
  companyId: string;
  branchId: string;
  payloadJson: string;
  payloadChecksum: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAutomationTrigger {
  id: string;
  scheduleId: string;
  companyId: string;
  branchId: string;
  slotKey: string;
  payloadJson: string;
  payloadChecksum: string;
  createdAt: string;
}

export interface StoredAutomationFailure {
  id: string;
  scheduleId: string;
  companyId: string;
  branchId: string;
  slotKey: string;
  reason: string;
  attempts: number;
  status: 'open' | 'resolved';
  payloadJson: string;
  payloadChecksum: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionReference?: string;
}

export interface StoredAutomationSchedulerAction {
  id: string;
  failureId: string;
  companyId: string;
  branchId: string;
  action: 'retry' | 'escalate' | 'resolve';
  actorId: string;
  reason: string;
  payloadJson: string;
  payloadChecksum: string;
  createdAt: string;
}

export interface StoredApiKey {
  id: string;
  label: string;
  companyId: string;
  branchId: string;
  scopes: string[];
  keyPrefix: string;
  secretHash: string;
  createdBy: string;
  createdAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
}

export interface StoredLedgerBinding {
  profileId: string;
  companyId: string;
  branchId: string;
  currencyCode: string;
  boundBy: string;
  boundAt: string;
}

export interface StoredLedgerAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  normalBalance: 'debit' | 'credit';
  isPostable: boolean;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface StoredLedgerPeriod {
  id: string;
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'soft-closed' | 'closed';
}

export interface StoredLedgerLine {
  id: string;
  journalId: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitMinor: number;
  creditMinor: number;
  memo: string;
  costCenterId: string | null;
  profitCenterId: string | null;
  departmentId: string | null;
  projectId: string | null;
}

export interface StoredLedgerJournal {
  id: string;
  companyId: string;
  branchId: string;
  number: string;
  postingDate: string;
  periodId: string;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  sourceChecksum: string | null;
  kind: 'manual' | 'reversal' | 'source';
  currencyCode: string;
  totalDebitMinor: number;
  totalCreditMinor: number;
  memo: string;
  status: 'draft' | 'posted';
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  reversesJournalId: string | null;
  voided: boolean;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  previousHash: string | null;
  hash: string | null;
  chainSequence: number | null;
  hashVersion: 1 | 2;
  version: number;
  lines: StoredLedgerLine[];
}

export interface StoredLedgerTrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  normalBalance: 'debit' | 'credit';
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
}

export interface CreateStoredLedgerJournalInput {
  id: string;
  companyId: string;
  branchId: string;
  fiscalLabel: string;
  postingDate: string;
  periodId: string;
  sourceType: string;
  sourceId?: string | null;
  sourceNumber?: string | null;
  sourceChecksum?: string | null;
  kind: 'manual' | 'reversal' | 'source';
  currencyCode: string;
  memo: string;
  createdBy: string;
  createdAt: string;
  reversesJournalId?: string | null;
  lines: Array<{
    id: string;
    accountId: string;
    debitMinor: number;
    creditMinor: number;
    memo: string;
    costCenterId?: string | null;
    profitCenterId?: string | null;
    departmentId?: string | null;
    projectId?: string | null;
  }>;
}

const MIGRATIONS: Migration[] = [
  {
    id: '001-core-state-ledgers',
    sql: `
      CREATE TABLE state_documents (
        namespace TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL CHECK (schema_version > 0),
        revision INTEGER NOT NULL CHECK (revision > 0),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE audit_ledger (
        id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE
      ) STRICT;
      CREATE INDEX audit_ledger_resource_idx
        ON audit_ledger(namespace, resource, resource_id, occurred_at DESC);

      CREATE TABLE outbox_events (
        id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        published_at TEXT,
        last_error TEXT
      ) STRICT;
      CREATE INDEX outbox_status_idx
        ON outbox_events(status, occurred_at);
    `,
  },
  {
    id: '002-authentication-sessions',
    sql: `
      CREATE TABLE credentials (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        algorithm TEXT NOT NULL CHECK (algorithm = 'scrypt-v1'),
        parameters_json TEXT NOT NULL CHECK (json_valid(parameters_json)),
        must_change_password INTEGER NOT NULL CHECK (must_change_password IN (0, 1)),
        failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
        locked_until TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES credentials(user_id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT
      ) STRICT;
      CREATE INDEX sessions_token_idx ON sessions(token_hash);
      CREATE INDEX sessions_expiry_idx ON sessions(expires_at, revoked_at);
    `,
  },
  {
    id: '003-encrypted-attachments-backups',
    sql: `
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        resource TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size >= 0),
        sha256 TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        encrypted_path TEXT NOT NULL UNIQUE,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        key_version INTEGER NOT NULL CHECK (key_version > 0),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX attachments_resource_idx
        ON attachments(resource, resource_id, created_at DESC);

      CREATE TABLE backup_history (
        file_name TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size > 0),
        database_version INTEGER NOT NULL,
        verified_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    id: '004-statutory-adapter-secrets',
    sql: `
      CREATE TABLE statutory_adapter_secrets (
        adapter_id TEXT PRIMARY KEY,
        encrypted_payload TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        key_version INTEGER NOT NULL CHECK (key_version > 0),
        checksum TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    id: '005-provider-connector-secrets',
    sql: `
      CREATE TABLE provider_connector_secrets (
        connector_id TEXT PRIMARY KEY,
        encrypted_payload TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        key_version INTEGER NOT NULL CHECK (key_version > 0),
        checksum TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    id: '006-general-ledger-foundation',
    sql: `
      CREATE TABLE gl_company_bindings (
        profile_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL UNIQUE,
        branch_id TEXT NOT NULL,
        currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
        bound_by TEXT NOT NULL,
        bound_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE gl_accounts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
        normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
        is_postable INTEGER NOT NULL CHECK (is_postable IN (0, 1)),
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(company_id, code)
      ) STRICT;
      CREATE INDEX gl_accounts_company_idx ON gl_accounts(company_id, account_type, code);

      CREATE TABLE gl_periods (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'soft-closed', 'closed')),
        CHECK (start_date <= end_date),
        UNIQUE(company_id, start_date, end_date)
      ) STRICT;
      CREATE INDEX gl_periods_company_dates_idx ON gl_periods(company_id, start_date, end_date);

      CREATE TABLE gl_journal_sequences (
        company_id TEXT NOT NULL,
        fiscal_label TEXT NOT NULL,
        next_value INTEGER NOT NULL CHECK (next_value > 0),
        PRIMARY KEY(company_id, fiscal_label)
      ) STRICT;

      CREATE TABLE gl_journals (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        number TEXT NOT NULL,
        posting_date TEXT NOT NULL,
        period_id TEXT NOT NULL REFERENCES gl_periods(id) ON DELETE RESTRICT,
        source_type TEXT NOT NULL,
        source_id TEXT,
        source_number TEXT,
        source_checksum TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('manual', 'reversal', 'source')),
        currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
        total_debit_minor INTEGER NOT NULL CHECK (total_debit_minor > 0),
        total_credit_minor INTEGER NOT NULL CHECK (total_credit_minor > 0),
        memo TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'posted')),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        posted_by TEXT,
        posted_at TEXT,
        reverses_journal_id TEXT UNIQUE REFERENCES gl_journals(id) ON DELETE RESTRICT,
        previous_hash TEXT,
        hash TEXT UNIQUE,
        version INTEGER NOT NULL CHECK (version > 0),
        CHECK (total_debit_minor = total_credit_minor),
        CHECK (
          (status = 'draft' AND posted_by IS NULL AND posted_at IS NULL AND previous_hash IS NULL AND hash IS NULL)
          OR
          (status = 'posted' AND posted_by IS NOT NULL AND posted_at IS NOT NULL AND previous_hash IS NOT NULL AND hash IS NOT NULL)
        ),
        UNIQUE(company_id, number),
        UNIQUE(company_id, source_type, source_id)
      ) STRICT;
      CREATE INDEX gl_journals_company_posted_idx ON gl_journals(company_id, posting_date, posted_at);

      CREATE TABLE gl_journal_lines (
        id TEXT PRIMARY KEY,
        journal_id TEXT NOT NULL REFERENCES gl_journals(id) ON DELETE RESTRICT,
        line_no INTEGER NOT NULL CHECK (line_no > 0),
        account_id TEXT NOT NULL REFERENCES gl_accounts(id) ON DELETE RESTRICT,
        debit_minor INTEGER NOT NULL CHECK (debit_minor >= 0),
        credit_minor INTEGER NOT NULL CHECK (credit_minor >= 0),
        memo TEXT NOT NULL,
        party_id TEXT,
        project_id TEXT,
        CHECK ((debit_minor > 0 AND credit_minor = 0) OR (debit_minor = 0 AND credit_minor > 0)),
        UNIQUE(journal_id, line_no)
      ) STRICT;
      CREATE INDEX gl_journal_lines_account_idx ON gl_journal_lines(account_id, journal_id);

      CREATE TABLE gl_journal_events (
        id TEXT PRIMARY KEY,
        journal_id TEXT NOT NULL REFERENCES gl_journals(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL CHECK (event_type IN ('drafted', 'posted')),
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        detail_json TEXT NOT NULL CHECK (json_valid(detail_json))
      ) STRICT;
      CREATE INDEX gl_journal_events_journal_idx ON gl_journal_events(journal_id, occurred_at);

      CREATE TRIGGER gl_journal_immutable_after_post
      BEFORE UPDATE ON gl_journals
      FOR EACH ROW WHEN OLD.status = 'posted'
      BEGIN
        SELECT RAISE(ABORT, 'Posted journal is immutable; create a reversal instead.');
      END;

      CREATE TRIGGER gl_journal_no_delete_after_post
      BEFORE DELETE ON gl_journals
      FOR EACH ROW WHEN OLD.status = 'posted'
      BEGIN
        SELECT RAISE(ABORT, 'Posted journal cannot be deleted.');
      END;

      CREATE TRIGGER gl_journal_line_locked_insert
      BEFORE INSERT ON gl_journal_lines
      FOR EACH ROW WHEN EXISTS (
        SELECT 1 FROM gl_journals WHERE id = NEW.journal_id AND status = 'posted'
      )
      BEGIN
        SELECT RAISE(ABORT, 'Posted journal lines are immutable.');
      END;

      CREATE TRIGGER gl_journal_line_locked_update
      BEFORE UPDATE ON gl_journal_lines
      FOR EACH ROW WHEN EXISTS (
        SELECT 1 FROM gl_journals WHERE id = OLD.journal_id AND status = 'posted'
      )
      BEGIN
        SELECT RAISE(ABORT, 'Posted journal lines are immutable.');
      END;

      CREATE TRIGGER gl_journal_line_locked_delete
      BEFORE DELETE ON gl_journal_lines
      FOR EACH ROW WHEN EXISTS (
        SELECT 1 FROM gl_journals WHERE id = OLD.journal_id AND status = 'posted'
      )
      BEGIN
        SELECT RAISE(ABORT, 'Posted journal lines are immutable.');
      END;

      CREATE TRIGGER gl_journal_event_immutable_update
      BEFORE UPDATE ON gl_journal_events
      BEGIN
        SELECT RAISE(ABORT, 'Journal evidence is append-only.');
      END;

      CREATE TRIGGER gl_journal_event_immutable_delete
      BEFORE DELETE ON gl_journal_events
      BEGIN
        SELECT RAISE(ABORT, 'Journal evidence cannot be deleted.');
      END;
    `,
  },
  {
    id: '007-general-ledger-control-hardening',
    sql: `
      ALTER TABLE gl_journals ADD COLUMN voided INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0, 1));
      ALTER TABLE gl_journals ADD COLUMN voided_by TEXT;
      ALTER TABLE gl_journals ADD COLUMN voided_at TEXT;
      ALTER TABLE gl_journals ADD COLUMN void_reason TEXT;
      ALTER TABLE gl_journals ADD COLUMN chain_sequence INTEGER;
      ALTER TABLE gl_journals ADD COLUMN hash_version INTEGER NOT NULL DEFAULT 1 CHECK (hash_version IN (1, 2));

      CREATE UNIQUE INDEX gl_journals_company_chain_sequence_idx
        ON gl_journals(company_id, chain_sequence)
        WHERE chain_sequence IS NOT NULL;
      CREATE INDEX gl_journals_company_branch_idx
        ON gl_journals(company_id, branch_id, status, voided, posting_date);

      CREATE TABLE gl_journal_chain_sequences (
        company_id TEXT PRIMARY KEY,
        next_value INTEGER NOT NULL CHECK (next_value > 0)
      ) STRICT;

      CREATE TABLE gl_journal_void_events (
        id TEXT PRIMARY KEY,
        journal_id TEXT NOT NULL REFERENCES gl_journals(id) ON DELETE RESTRICT,
        actor_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        reason TEXT NOT NULL
      ) STRICT;
      CREATE INDEX gl_journal_void_events_journal_idx
        ON gl_journal_void_events(journal_id, occurred_at);

      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY company_id
          ORDER BY posted_at ASC, id ASC
        ) AS sequence
        FROM gl_journals
        WHERE status = 'posted'
      )
      UPDATE gl_journals
      SET chain_sequence = (
        SELECT sequence FROM ranked WHERE ranked.id = gl_journals.id
      )
      WHERE id IN (SELECT id FROM ranked);

      INSERT INTO gl_journal_chain_sequences(company_id, next_value)
      SELECT company_id, MAX(chain_sequence) + 1
      FROM gl_journals
      WHERE chain_sequence IS NOT NULL
      GROUP BY company_id;

      CREATE TRIGGER gl_journal_post_requires_chain
      BEFORE UPDATE OF status ON gl_journals
      FOR EACH ROW WHEN OLD.status = 'draft' AND NEW.status = 'posted' AND (
        NEW.voided <> 0 OR
        NEW.chain_sequence IS NULL OR
        NEW.hash_version <> 2
      )
      BEGIN
        SELECT RAISE(ABORT, 'Posted journals require an ordered ledger chain sequence.');
      END;

      CREATE TRIGGER gl_journal_void_constraints
      BEFORE UPDATE OF voided ON gl_journals
      FOR EACH ROW WHEN NEW.voided = 1 AND (
        OLD.status <> 'draft' OR
        OLD.kind <> 'reversal' OR
        OLD.voided <> 0 OR
        NEW.reverses_journal_id IS NOT NULL OR
        NEW.source_id IS NOT NULL OR
        NEW.voided_by IS NULL OR
        NEW.voided_at IS NULL OR
        NEW.void_reason IS NULL
      )
      BEGIN
        SELECT RAISE(ABORT, 'Only a draft reversal can be voided with complete evidence.');
      END;
    `,
  },
  {
    id: '008-public-api-key-administration',
    sql: `
      CREATE TABLE public_api_keys (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
        key_prefix TEXT NOT NULL UNIQUE,
        secret_hash TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_by TEXT,
        revoked_at TEXT
      ) STRICT;
      CREATE INDEX public_api_keys_scope_idx
        ON public_api_keys(company_id, branch_id, revoked_at, created_at DESC);
    `,
  },
  {
    id: '009-release-gate-evidence',
    sql: `
      CREATE TABLE release_gate_evidence (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'deferred')),
        evidence_reference TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        notes TEXT
      ) STRICT;
      CREATE INDEX release_gate_evidence_checked_idx ON release_gate_evidence(checked_at DESC, id);
    `,
  },
  {
    id: '010-restore-drill-evidence',
    sql: `ALTER TABLE release_gate_evidence ADD COLUMN evidence_checksum TEXT;`,
  },
  {
    id: '011-intelligence-evidence',
    sql: `
      CREATE TABLE intelligence_anomalies (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'dismissed', 'snoozed')),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX intelligence_anomalies_scope_idx
        ON intelligence_anomalies(company_id, branch_id, status, updated_at DESC);

      CREATE TABLE intelligence_report_executions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'partial', 'blocked')),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX intelligence_report_executions_scope_idx
        ON intelligence_report_executions(company_id, branch_id, created_at DESC);
    `,
  },
  {
    id: '012-automation-run-ledger',
    sql: `
      CREATE TABLE automation_runs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'running', 'succeeded', 'failed', 'cancelled')),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX automation_runs_idempotency_scope_idx
        ON automation_runs(company_id, branch_id, json_extract(payload_json, '$.idempotencyKey'));
      CREATE INDEX automation_runs_scope_idx
        ON automation_runs(company_id, branch_id, status, updated_at DESC);
    `,
  },
  {
    id: '013-automation-schedules',
    sql: `
      CREATE TABLE automation_schedules (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX automation_schedules_scope_idx
        ON automation_schedules(company_id, branch_id, updated_at DESC);

      CREATE TABLE automation_trigger_history (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES automation_schedules(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        slot_key TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(schedule_id, slot_key)
      ) STRICT;
      CREATE INDEX automation_trigger_history_scope_idx
        ON automation_trigger_history(company_id, branch_id, created_at DESC);
    `,
  },
  {
    id: '014-automation-scheduler-failures',
    sql: `
      CREATE TABLE automation_scheduler_failures (
        id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES automation_schedules(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        slot_key TEXT NOT NULL,
        reason TEXT NOT NULL,
        attempts INTEGER NOT NULL CHECK (attempts > 0),
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_reference TEXT,
        UNIQUE(schedule_id, slot_key)
      ) STRICT;
      CREATE INDEX automation_scheduler_failures_scope_idx
        ON automation_scheduler_failures(company_id, branch_id, status, updated_at DESC);
    `,
  },
  {
    id: '015-automation-scheduler-action-ledger',
    sql: `
      CREATE TABLE automation_scheduler_action_ledger (
        id TEXT PRIMARY KEY,
        failure_id TEXT NOT NULL REFERENCES automation_scheduler_failures(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('retry', 'escalate', 'resolve')),
        actor_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX automation_scheduler_action_scope_idx
        ON automation_scheduler_action_ledger(company_id, branch_id, created_at DESC);
    `,
  },
  {
    id: '016-finance-completion-workpapers',
    sql: `
      CREATE TABLE finance_completion_workpapers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'reviewed', 'approved')),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX finance_completion_scope_idx
        ON finance_completion_workpapers(company_id, branch_id, status, updated_at DESC);
    `,
  },
  {
    id: '017-finance-journal-dimensions',
    sql: `
      ALTER TABLE gl_journal_lines ADD COLUMN cost_center_id TEXT;
      ALTER TABLE gl_journal_lines ADD COLUMN profit_center_id TEXT;
      ALTER TABLE gl_journal_lines ADD COLUMN department_id TEXT;
    `,
  },
  {
    id: '018-workspace-bootstrap-guard',
    sql: `
      CREATE TABLE workspace_bootstrap_guards (
        workspace_id TEXT PRIMARY KEY CHECK (length(trim(workspace_id)) > 0),
        status TEXT NOT NULL CHECK (status IN ('pending', 'provisioned', 'protected-existing')),
        starter_mode TEXT CHECK (starter_mode IN ('clean', 'sample')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        provisioned_at TEXT,
        CHECK (status = 'protected-existing' OR starter_mode IS NOT NULL),
        CHECK (status = 'provisioned' OR provisioned_at IS NULL),
        CHECK (status <> 'provisioned' OR provisioned_at IS NOT NULL)
      ) STRICT;

      /* A selected starter mode can never be changed, including from a
         protected legacy record.  Future onboarding must create a new
         workspace rather than repurpose existing data. */
      CREATE TRIGGER workspace_bootstrap_guard_mode_immutable
      BEFORE UPDATE OF starter_mode ON workspace_bootstrap_guards
      WHEN OLD.starter_mode IS NOT NEW.starter_mode
      BEGIN
        SELECT RAISE(ABORT, 'Workspace starter mode is immutable.');
      END;

      /* Bootstrap can only move forward.  Pending may be protected when
         onboarding is abandoned; nothing may turn a protected/existing
         workspace back into a population target. */
      CREATE TRIGGER workspace_bootstrap_guard_status_forward_only
      BEFORE UPDATE OF status ON workspace_bootstrap_guards
      WHEN NOT (
        (OLD.status = 'pending' AND NEW.status IN ('pending', 'provisioned', 'protected-existing'))
        OR (OLD.status = 'provisioned' AND NEW.status = 'provisioned')
        OR (OLD.status = 'protected-existing' AND NEW.status = 'protected-existing')
      )
      BEGIN
        SELECT RAISE(ABORT, 'Workspace bootstrap status cannot move backwards.');
      END;

      /* Existing kernel state predates the explicit onboarding decision.  It
         is therefore protected rather than guessed to be clean or sample. */
      INSERT INTO workspace_bootstrap_guards(
        workspace_id, status, starter_mode, created_at, updated_at, provisioned_at
      )
      SELECT
        COALESCE(
          NULLIF(trim(CAST(json_extract(payload_json, '$.tenant.id') AS TEXT)), ''),
          'legacy-kernel-workspace'
        ),
        'protected-existing',
        NULL,
        updated_at,
        updated_at,
        NULL
      FROM state_documents
      WHERE namespace = 'kernel'
      ON CONFLICT(workspace_id) DO NOTHING;
    `,
  },
  {
    id: '019-intelligence-report-delivery',
    sql: `
      CREATE TABLE intelligence_report_delivery_plans (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'paused')),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX intelligence_report_delivery_plans_scope_idx
        ON intelligence_report_delivery_plans(company_id, branch_id, status, updated_at DESC);

      CREATE TABLE intelligence_report_delivery_attempts (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        payload_checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('prepared', 'handed-off', 'acknowledged', 'failed')),
        version INTEGER NOT NULL CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX intelligence_report_delivery_attempts_idempotency_idx
        ON intelligence_report_delivery_attempts(company_id, branch_id, json_extract(payload_json, '$.idempotencyKey'));
      CREATE INDEX intelligence_report_delivery_attempts_scope_idx
      ON intelligence_report_delivery_attempts(company_id, branch_id, created_at DESC);
    `,
  },
  {
    id: '020-release-artifact-evidence',
    sql: `
      CREATE TABLE release_artifact_evidence (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL CHECK (platform IN ('win32', 'darwin', 'linux')),
        version TEXT NOT NULL,
        artifact_reference TEXT NOT NULL,
        artifact_sha256 TEXT NOT NULL,
        smoke_test_reference TEXT NOT NULL,
        signing_reference TEXT NOT NULL,
        notarisation_reference TEXT,
        status TEXT NOT NULL CHECK (status IN ('submitted', 'verified', 'rejected')),
        submitted_by TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        verified_by TEXT,
        verified_at TEXT,
        notes TEXT
      ) STRICT;
      CREATE UNIQUE INDEX release_artifact_evidence_platform_version_idx
        ON release_artifact_evidence(platform, version);
      CREATE INDEX release_artifact_evidence_status_idx
        ON release_artifact_evidence(status, submitted_at DESC);
    `,
  },
  {
    id: '021-release-update-evidence',
    sql: `
      CREATE TABLE release_update_evidence (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL CHECK (channel IN ('stable', 'beta')),
        platform TEXT NOT NULL CHECK (platform IN ('win32', 'darwin', 'linux')),
        current_version TEXT NOT NULL,
        target_version TEXT NOT NULL,
        rollback_version TEXT NOT NULL,
        manifest_reference TEXT NOT NULL,
        manifest_sha256 TEXT NOT NULL,
        signature_reference TEXT NOT NULL,
        rollback_test_reference TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('submitted', 'verified', 'rejected')),
        submitted_by TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        verified_by TEXT,
        verified_at TEXT,
        notes TEXT
      ) STRICT;
      CREATE UNIQUE INDEX release_update_evidence_channel_platform_target_idx
        ON release_update_evidence(channel, platform, target_version);
      CREATE INDEX release_update_evidence_status_idx
        ON release_update_evidence(status, submitted_at DESC);
    `,
  },
  {
    id: '022-release-build-identity-binding',
    sql: `
      ALTER TABLE release_artifact_evidence ADD COLUMN release_identity_sha256 TEXT;
      ALTER TABLE release_update_evidence ADD COLUMN source_release_identity_sha256 TEXT;
      CREATE INDEX release_artifact_evidence_release_identity_idx
        ON release_artifact_evidence(release_identity_sha256, submitted_at DESC);
      CREATE INDEX release_update_evidence_source_release_identity_idx
        ON release_update_evidence(source_release_identity_sha256, submitted_at DESC);
    `,
  },
  {
    id: '023-ui-acceptance-evidence',
    sql: `
      CREATE TABLE ui_acceptance_evidence (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL,
        scenario_fingerprint TEXT NOT NULL,
        release_identity_sha256 TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'blocked')),
        evidence_reference TEXT NOT NULL,
        notes TEXT,
        submitted_by TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('submitted', 'verified', 'rejected')),
        verified_by TEXT,
        verified_at TEXT,
        reviewer_notes TEXT,
        version INTEGER NOT NULL CHECK (version > 0)
      ) STRICT;
      CREATE INDEX ui_acceptance_evidence_release_idx
        ON ui_acceptance_evidence(release_identity_sha256, scenario_id, submitted_at DESC);
      CREATE INDEX ui_acceptance_evidence_status_idx
        ON ui_acceptance_evidence(status, submitted_at DESC);
    `,
  },
  {
    id: '024-restore-drill-history',
    sql: `
      CREATE TABLE restore_drill_history (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        started_at TEXT NOT NULL,
        verified_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX restore_drill_history_verified_idx
        ON restore_drill_history(verified_at DESC, id);
    `,
  },
];

export function getCurrentSchemaRevision(): number {
  return MIGRATIONS.length;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toBoolean(value: unknown): boolean {
  return Number(value) === 1;
}

export class BusinessDatabase {
  private database: DatabaseSync;

  public constructor(private readonly databasePath: string) {
    if (databasePath !== ':memory:') {
      mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.database = this.openDatabase();
  }

  public static applyStagedRestore(databasePath: string): string | null {
    const resolvedDatabase = path.resolve(databasePath);
    const stagedPath = path.resolve(databasePath + '.restore-next');
    if (stagedPath !== resolvedDatabase + '.restore-next' || !existsSync(stagedPath)) {
      return null;
    }
    const archivedPath = resolvedDatabase + '.before-restore-' + String(Date.now());
    if (existsSync(resolvedDatabase)) renameSync(resolvedDatabase, archivedPath);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = resolvedDatabase + suffix;
      if (existsSync(sidecar)) unlinkSync(sidecar);
    }
    renameSync(stagedPath, resolvedDatabase);
    return existsSync(archivedPath) ? archivedPath : null;
  }

  public async initialize(): Promise<void> {
    this.configure();
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    const findMigration = this.database.prepare(
      'SELECT checksum FROM schema_migrations WHERE id = ?',
    );
    const recordMigration = this.database.prepare(
      'INSERT INTO schema_migrations(id, checksum, applied_at) VALUES (?, ?, ?)',
    );

    for (const migration of MIGRATIONS) {
      const checksum = digest(migration.sql);
      const existing = findMigration.get(migration.id) as
        | { checksum: string }
        | undefined;
      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(`Database migration ${migration.id} checksum changed.`);
        }
        continue;
      }

      this.transaction(() => {
        this.database.exec(migration.sql);
        recordMigration.run(
          migration.id,
          checksum,
          new Date().toISOString(),
        );
      });
    }
  }

  public loadState<T>(namespace: string): StoredState<T> | null {
    const row = this.database
      .prepare(
        `SELECT schema_version, revision, payload_json
         FROM state_documents WHERE namespace = ?`,
      )
      .get(namespace) as
      | { schema_version: number; revision: number; payload_json: string }
      | undefined;
    if (!row) return null;
    return {
      schemaVersion: row.schema_version,
      revision: row.revision,
      payload: JSON.parse(row.payload_json) as T,
    };
  }

  public saveState(
    namespace: string,
    schemaVersion: number,
    revision: number,
    payload: unknown,
  ): void {
    this.transaction(() => {
      this.persistStateDocument(
        namespace,
        schemaVersion,
        revision,
        payload,
        new Date().toISOString(),
      );
    });
  }

  /**
   * Replaces a coherent set of state documents as one SQLite transaction.
   *
   * This is deliberately stricter than `saveState`: each supplied document
   * must advance its existing revision. That prevents a caller from partly
   * applying a reset or silently overwriting newer business evidence.
   */
  public replaceStateDocumentsAtomically(
    stateDocuments: readonly WorkspaceBootstrapStateDocument[],
    now = new Date().toISOString(),
    options: CoordinatedStateReplacementOptions = {},
  ): void {
    this.requireStateDocuments(stateDocuments, 'State replacement');
    this.requireTimestamp(now);
    if (!options || typeof options !== 'object') {
      throw new Error('State replacement options must be an object.');
    }
    const retireAudit = options.retireAuditForReplacedNamespaces === true;
    const retireOutbox = options.retireOutboxForReplacedNamespaces === true;

    this.transaction(() => {
      for (const document of stateDocuments) {
        const existing = this.loadState<unknown>(document.namespace);
        if (existing && document.revision <= existing.revision) {
          throw new Error(
            `State replacement for ${document.namespace} requires a newer revision.`,
          );
        }
      }

      if (retireAudit || retireOutbox) {
        const namespaces = stateDocuments.map(({ namespace }) => namespace);
        const placeholders = namespaces.map(() => '?').join(', ');
        if (retireAudit) {
          this.database
            .prepare(`DELETE FROM audit_ledger WHERE namespace IN (${placeholders})`)
            .run(...namespaces);
        }
        if (retireOutbox) {
          this.database
            .prepare(`DELETE FROM outbox_events WHERE namespace IN (${placeholders})`)
            .run(...namespaces);
        }
      }

      for (const document of stateDocuments) {
        this.persistStateDocument(
          document.namespace,
          document.schemaVersion,
          document.revision,
          document.payload,
          now,
        );
      }
    });
  }

  /**
   * Claims an entirely fresh database-backed workspace and persists its first
   * usable state in one SQLite transaction.  This deliberately bypasses the
   * public `saveState` wrapper: calling that method here would try to start a
   * nested transaction and could leave a guard decision separate from its
   * credentials or documents.
   *
   * Any existing durable business evidence, credentials, session, or guard
   * decision blocks the operation.  Callers therefore cannot repurpose an
   * existing or ambiguously-provisioned workspace as a starter workspace.
   */
  public bootstrapFreshWorkspace(
    workspaceId: string,
    manifest: WorkspaceBootstrapManifest,
    now = new Date().toISOString(),
  ): WorkspaceBootstrapGuard {
    const normalizedWorkspaceId = this.requireWorkspaceId(workspaceId);
    this.requireTimestamp(now);
    this.requireWorkspaceBootstrapManifest(manifest);

    return this.transaction(() => {
      this.assertFreshWorkspaceBootstrapTarget(normalizedWorkspaceId);

      this.database
        .prepare(`
          INSERT INTO workspace_bootstrap_guards(
            workspace_id, status, starter_mode, created_at, updated_at, provisioned_at
          ) VALUES (?, 'pending', ?, ?, ?, NULL)
        `)
        .run(normalizedWorkspaceId, manifest.starterMode, now, now);

      for (const document of manifest.stateDocuments) {
        this.persistStateDocument(
          document.namespace,
          document.schemaVersion,
          document.revision,
          document.payload,
          now,
        );
      }
      this.insertFreshBootstrapCredential(manifest.credential);
      this.insertFreshBootstrapSession(manifest.session);

      this.database
        .prepare(`
          UPDATE workspace_bootstrap_guards
          SET status = 'provisioned', updated_at = ?, provisioned_at = ?
          WHERE workspace_id = ? AND status = 'pending'
        `)
        .run(now, now, normalizedWorkspaceId);

      const guard = this.readWorkspaceBootstrapGuard(normalizedWorkspaceId);
      if (!guard || guard.status !== 'provisioned') {
        throw new Error('Workspace bootstrap could not be marked as provisioned.');
      }
      return guard;
    });
  }

  /**
   * Read-only preflight for main-process startup. The transactional bootstrap
   * method repeats this exact check before it writes, so a positive result is
   * never treated as a reservation and cannot weaken the fail-closed boundary.
   */
  public canBootstrapFreshWorkspace(workspaceId: string): boolean {
    const normalizedWorkspaceId = this.requireWorkspaceId(workspaceId);
    try {
      this.assertFreshWorkspaceBootstrapTarget(normalizedWorkspaceId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads an existing bootstrap decision without creating one. Authentication
   * status uses this so merely opening a brand-new app can never turn an empty
   * database into a protected legacy workspace.
   */
  public findWorkspaceBootstrapGuard(
    workspaceId: string,
  ): WorkspaceBootstrapGuard | null {
    return this.readWorkspaceBootstrapGuard(this.requireWorkspaceId(workspaceId));
  }

  public getAppliedMigrations(): Array<{
    id: string;
    checksum: string;
    appliedAt: string;
  }> {
    const rows = this.database
      .prepare(
        'SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id',
      )
      .all() as Array<{ id: string; checksum: string; applied_at: string }>;
    return rows.map((row) => ({
      id: row.id,
      checksum: row.checksum,
      appliedAt: row.applied_at,
    }));
  }

  /**
   * Returns the durable bootstrap guard for a workspace.  An unknown row is
   * persisted as protected rather than being exposed as an ambiguous null.
   * Fresh onboarding must call `beginWorkspaceBootstrap` directly after it
   * has independently proven the workspace is empty.
   */
  public getWorkspaceBootstrapGuard(
    workspaceId: string,
  ): WorkspaceBootstrapGuard {
    return this.getOrProtectWorkspaceBootstrapGuard(workspaceId);
  }

  /**
   * Persist the fail-closed default for a workspace whose provenance is
   * unknown.  This never changes an existing pending or provisioned decision.
   */
  public getOrProtectWorkspaceBootstrapGuard(
    workspaceId: string,
    now = new Date().toISOString(),
  ): WorkspaceBootstrapGuard {
    const normalizedWorkspaceId = this.requireWorkspaceId(workspaceId);
    this.requireTimestamp(now);
    return this.transaction(() => {
      const existing = this.readWorkspaceBootstrapGuard(normalizedWorkspaceId);
      if (existing) return existing;
      this.database
        .prepare(`
          INSERT INTO workspace_bootstrap_guards(
            workspace_id, status, starter_mode, created_at, updated_at, provisioned_at
          ) VALUES (?, 'protected-existing', NULL, ?, ?, NULL)
        `)
        .run(normalizedWorkspaceId, now, now);
      return this.readWorkspaceBootstrapGuard(normalizedWorkspaceId)!;
    });
  }

  /**
   * Reserves a demonstrably fresh workspace for exactly one starter mode.
   * Calling code must first establish that there is no legacy/user data; this
   * persistence layer deliberately cannot infer freshness from a missing row.
   */
  public beginWorkspaceBootstrap(
    workspaceId: string,
    starterMode: WorkspaceStarterMode,
    now = new Date().toISOString(),
  ): WorkspaceBootstrapGuard {
    const normalizedWorkspaceId = this.requireWorkspaceId(workspaceId);
    this.requireStarterMode(starterMode);
    this.requireTimestamp(now);
    return this.transaction(() => {
      const existing = this.readWorkspaceBootstrapGuard(normalizedWorkspaceId);
      if (existing) {
        if (existing.status === 'pending' && existing.starterMode === starterMode) {
          return existing;
        }
        if (existing.status === 'pending') {
          throw new Error('Workspace starter mode is immutable once bootstrap is pending.');
        }
        if (existing.status === 'provisioned') {
          throw new Error('Workspace bootstrap has already been provisioned.');
        }
        throw new Error('Workspace is protected because existing data has no trusted bootstrap decision.');
      }

      this.database
        .prepare(`
          INSERT INTO workspace_bootstrap_guards(
            workspace_id, status, starter_mode, created_at, updated_at, provisioned_at
          ) VALUES (?, 'pending', ?, ?, ?, NULL)
        `)
        .run(normalizedWorkspaceId, starterMode, now, now);
      return this.readWorkspaceBootstrapGuard(normalizedWorkspaceId)!;
    });
  }

  /**
   * Marks a previously reserved workspace as populated.  It is idempotent for
   * a completed run, while a protected workspace can never be populated by
   * this helper.
   */
  public markWorkspaceBootstrapProvisioned(
    workspaceId: string,
    now = new Date().toISOString(),
  ): WorkspaceBootstrapGuard {
    const normalizedWorkspaceId = this.requireWorkspaceId(workspaceId);
    this.requireTimestamp(now);
    return this.transaction(() => {
      const existing = this.readWorkspaceBootstrapGuard(normalizedWorkspaceId);
      if (!existing) {
        throw new Error('Workspace bootstrap has not been reserved.');
      }
      if (existing.status === 'provisioned') return existing;
      if (existing.status !== 'pending') {
        throw new Error('A protected workspace cannot be marked as provisioned.');
      }
      this.database
        .prepare(`
          UPDATE workspace_bootstrap_guards
          SET status = 'provisioned', updated_at = ?, provisioned_at = ?
          WHERE workspace_id = ? AND status = 'pending'
        `)
        .run(now, now, normalizedWorkspaceId);
      return this.readWorkspaceBootstrapGuard(normalizedWorkspaceId)!;
    });
  }

  /**
   * Records that this workspace must never receive automatic starter data.
   * This is safe to call for missing and pending rows; a completed workspace
   * remains completed rather than being rewritten.
   */
  public protectWorkspaceBootstrap(
    workspaceId: string,
    now = new Date().toISOString(),
  ): WorkspaceBootstrapGuard {
    const normalizedWorkspaceId = this.requireWorkspaceId(workspaceId);
    this.requireTimestamp(now);
    return this.transaction(() => {
      const existing = this.readWorkspaceBootstrapGuard(normalizedWorkspaceId);
      if (!existing) {
        this.database
          .prepare(`
            INSERT INTO workspace_bootstrap_guards(
              workspace_id, status, starter_mode, created_at, updated_at, provisioned_at
            ) VALUES (?, 'protected-existing', NULL, ?, ?, NULL)
          `)
          .run(normalizedWorkspaceId, now, now);
      } else if (existing.status === 'pending') {
        this.database
          .prepare(`
            UPDATE workspace_bootstrap_guards
            SET status = 'protected-existing', updated_at = ?, provisioned_at = NULL
            WHERE workspace_id = ? AND status = 'pending'
          `)
          .run(now, normalizedWorkspaceId);
      }
      return this.readWorkspaceBootstrapGuard(normalizedWorkspaceId)!;
    });
  }

  public countCredentials(): number {
    const row = this.database
      .prepare('SELECT COUNT(*) AS count FROM credentials')
      .get() as { count: number };
    return Number(row.count);
  }

  public getCredentialByEmail(email: string): CredentialRecord | null {
    const row = this.database
      .prepare('SELECT * FROM credentials WHERE email = ? COLLATE NOCASE')
      .get(email) as Record<string, unknown> | undefined;
    return row ? this.mapCredential(row) : null;
  }

  public getCredentialByUserId(userId: string): CredentialRecord | null {
    const row = this.database
      .prepare('SELECT * FROM credentials WHERE user_id = ?')
      .get(userId) as Record<string, unknown> | undefined;
    return row ? this.mapCredential(row) : null;
  }

  public upsertCredential(record: CredentialRecord): void {
    this.database
      .prepare(`
        INSERT INTO credentials(
          user_id, email, display_name, password_hash, salt, algorithm,
          parameters_json, must_change_password, failed_attempts,
          locked_until, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          email = excluded.email,
          display_name = excluded.display_name,
          password_hash = excluded.password_hash,
          salt = excluded.salt,
          algorithm = excluded.algorithm,
          parameters_json = excluded.parameters_json,
          must_change_password = excluded.must_change_password,
          failed_attempts = excluded.failed_attempts,
          locked_until = excluded.locked_until,
          updated_at = excluded.updated_at
      `)
      .run(
        record.userId,
        record.email,
        record.displayName,
        record.passwordHash,
        record.salt,
        record.algorithm,
        record.parameters,
        record.mustChangePassword ? 1 : 0,
        record.failedAttempts,
        record.lockedUntil,
        record.updatedAt,
      );
  }

  public recordAuthenticationFailure(
    userId: string,
    failedAttempts: number,
    lockedUntil: string | null,
    now: string,
  ): void {
    this.database
      .prepare(`
        UPDATE credentials
        SET failed_attempts = ?, locked_until = ?, updated_at = ?
        WHERE user_id = ?
      `)
      .run(failedAttempts, lockedUntil, now, userId);
  }

  public clearAuthenticationFailures(userId: string, now: string): void {
    this.database
      .prepare(`
        UPDATE credentials
        SET failed_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE user_id = ?
      `)
      .run(now, userId);
  }

  public insertSession(record: SessionRecord): void {
    this.database
      .prepare(`
        INSERT INTO sessions(
          id, user_id, token_hash, created_at, expires_at, last_seen_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.expiresAt,
        record.lastSeenAt,
        record.revokedAt,
      );
  }

  public getSessionByTokenHash(tokenHash: string): SessionRecord | null {
    const row = this.database
      .prepare('SELECT * FROM sessions WHERE token_hash = ?')
      .get(tokenHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      tokenHash: String(row.token_hash),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      lastSeenAt: String(row.last_seen_at),
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    };
  }

  public touchSession(id: string, now: string): void {
    this.database
      .prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
      .run(now, id);
  }

  public revokeSession(id: string, now: string): void {
    this.database
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
      .run(now, id);
  }

  /** Revoke every device session after a credential-security event. */
  public revokeSessionsForUser(userId: string, now: string): void {
    this.database
      .prepare(
        'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      )
      .run(now, userId);
  }

  public deleteExpiredSessions(now: string): void {
    this.database
      .prepare('DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL')
      .run(now);
  }

  public insertAttachment(record: StoredAttachment): void {
    this.database
      .prepare(`
        INSERT INTO attachments(
          id, resource, resource_id, file_name, mime_type, size, sha256,
          storage_key, encrypted_path, iv, auth_tag, key_version,
          created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.id,
        record.resource,
        record.resourceId,
        record.fileName,
        record.mimeType,
        record.size,
        record.sha256,
        record.storageKey,
        record.encryptedPath,
        record.iv,
        record.authTag,
        record.keyVersion,
        record.createdBy,
        record.createdAt,
      );
  }

  public upsertStatutoryAdapterSecret(record: StoredAdapterSecret): void {
    this.database.prepare(`
      INSERT INTO statutory_adapter_secrets(
        adapter_id, encrypted_payload, iv, auth_tag, key_version, checksum,
        updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(adapter_id) DO UPDATE SET
        encrypted_payload = excluded.encrypted_payload,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        key_version = excluded.key_version,
        checksum = excluded.checksum,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(record.adapterId, record.encryptedPayload, record.iv, record.authTag, record.keyVersion, record.checksum, record.updatedBy, record.updatedAt);
  }

  public getStatutoryAdapterSecret(adapterId: string): StoredAdapterSecret | null {
    const row = this.database.prepare('SELECT * FROM statutory_adapter_secrets WHERE adapter_id = ?').get(adapterId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { adapterId: String(row.adapter_id), encryptedPayload: String(row.encrypted_payload), iv: String(row.iv), authTag: String(row.auth_tag), keyVersion: Number(row.key_version), checksum: String(row.checksum), updatedBy: String(row.updated_by), updatedAt: String(row.updated_at) };
  }

  public upsertProviderSecret(record: StoredProviderSecret): void {
    this.database.prepare(`
      INSERT INTO provider_connector_secrets(
        connector_id, encrypted_payload, iv, auth_tag, key_version, checksum,
        updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connector_id) DO UPDATE SET
        encrypted_payload = excluded.encrypted_payload,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        key_version = excluded.key_version,
        checksum = excluded.checksum,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(record.connectorId, record.encryptedPayload, record.iv, record.authTag, record.keyVersion, record.checksum, record.updatedBy, record.updatedAt);
  }

  public getProviderSecret(connectorId: string): StoredProviderSecret | null {
    const row = this.database.prepare('SELECT * FROM provider_connector_secrets WHERE connector_id = ?').get(connectorId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { connectorId: String(row.connector_id), encryptedPayload: String(row.encrypted_payload), iv: String(row.iv), authTag: String(row.auth_tag), keyVersion: Number(row.key_version), checksum: String(row.checksum), updatedBy: String(row.updated_by), updatedAt: String(row.updated_at) };
  }

  public createApiKey(record: StoredApiKey): void {
    this.database.prepare(`
      INSERT INTO public_api_keys(
        id, label, company_id, branch_id, scopes_json, key_prefix, secret_hash,
        created_by, created_at, revoked_by, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.label, record.companyId, record.branchId, JSON.stringify(record.scopes), record.keyPrefix, record.secretHash, record.createdBy, record.createdAt, record.revokedBy, record.revokedAt);
  }

  public listApiKeys(companyId: string, branchId: string): StoredApiKey[] {
    const rows = this.database.prepare(`
      SELECT * FROM public_api_keys
      WHERE company_id = ? AND branch_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), label: String(row.label), companyId: String(row.company_id), branchId: String(row.branch_id),
      scopes: JSON.parse(String(row.scopes_json)) as string[], keyPrefix: String(row.key_prefix), secretHash: String(row.secret_hash),
      createdBy: String(row.created_by), createdAt: String(row.created_at), revokedBy: row.revoked_by === null ? null : String(row.revoked_by), revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
    }));
  }

  public getApiKey(id: string): StoredApiKey | null {
    const row = this.database.prepare('SELECT * FROM public_api_keys WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id), label: String(row.label), companyId: String(row.company_id), branchId: String(row.branch_id),
      scopes: JSON.parse(String(row.scopes_json)) as string[], keyPrefix: String(row.key_prefix), secretHash: String(row.secret_hash),
      createdBy: String(row.created_by), createdAt: String(row.created_at), revokedBy: row.revoked_by === null ? null : String(row.revoked_by), revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
    };
  }

  public revokeApiKey(id: string, revokedBy: string, revokedAt: string): boolean {
    const result = this.database.prepare(`
      UPDATE public_api_keys SET revoked_by = ?, revoked_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(revokedBy, revokedAt, id);
    return Number(result.changes) === 1;
  }

  public upsertReleaseGateEvidence(record: { id: string; label: string; status: string; evidenceReference: string; checkedAt: string; notes?: string; evidenceChecksum?: string }): void {
    this.database.prepare(`
      INSERT INTO release_gate_evidence(id, label, status, evidence_reference, checked_at, notes, evidence_checksum)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, status = excluded.status,
        evidence_reference = excluded.evidence_reference, checked_at = excluded.checked_at, notes = excluded.notes, evidence_checksum = excluded.evidence_checksum
    `).run(record.id, record.label, record.status, record.evidenceReference, record.checkedAt, record.notes ?? null, record.evidenceChecksum ?? null);
  }

  public listReleaseGateEvidence(): Array<{ id: string; label: string; status: 'passed' | 'failed' | 'deferred'; evidenceReference: string; checkedAt: string; notes?: string; evidenceChecksum?: string }> {
    const rows = this.database.prepare('SELECT * FROM release_gate_evidence ORDER BY checked_at DESC, id').all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), label: String(row.label), status: String(row.status) as 'passed' | 'failed' | 'deferred', evidenceReference: String(row.evidence_reference), checkedAt: String(row.checked_at), notes: row.notes === null ? undefined : String(row.notes), evidenceChecksum: row.evidence_checksum === null || row.evidence_checksum === undefined ? undefined : String(row.evidence_checksum) }));
  }

  public insertReleaseArtifactEvidence(record: ReleaseArtifactEvidence): void {
    this.database.prepare(`
      INSERT INTO release_artifact_evidence(
        id, platform, version, artifact_reference, artifact_sha256,
        smoke_test_reference, signing_reference, notarisation_reference,
        release_identity_sha256, status, submitted_by, submitted_at, verified_by, verified_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.platform,
      record.version,
      record.artifactReference,
      record.artifactSha256,
      record.smokeTestReference,
      record.signingReference,
      record.notarisationReference ?? null,
      record.releaseIdentitySha256 ?? null,
      record.status,
      record.submittedBy,
      record.submittedAt,
      record.verifiedBy ?? null,
      record.verifiedAt ?? null,
      record.notes ?? null,
    );
  }

  public listReleaseArtifactEvidence(): ReleaseArtifactEvidence[] {
    const rows = this.database.prepare(`
      SELECT * FROM release_artifact_evidence
      ORDER BY submitted_at DESC, id DESC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      platform: String(row.platform) as ReleaseArtifactEvidence['platform'],
      version: String(row.version),
      artifactReference: String(row.artifact_reference),
      artifactSha256: String(row.artifact_sha256),
      smokeTestReference: String(row.smoke_test_reference),
      signingReference: String(row.signing_reference),
      notarisationReference: row.notarisation_reference === null ? undefined : String(row.notarisation_reference),
      releaseIdentitySha256: row.release_identity_sha256 === null || row.release_identity_sha256 === undefined ? undefined : String(row.release_identity_sha256),
      status: String(row.status) as ReleaseArtifactEvidence['status'],
      submittedBy: String(row.submitted_by),
      submittedAt: String(row.submitted_at),
      verifiedBy: row.verified_by === null ? undefined : String(row.verified_by),
      verifiedAt: row.verified_at === null ? undefined : String(row.verified_at),
      notes: row.notes === null ? undefined : String(row.notes),
    }));
  }

  public decideReleaseArtifactEvidence(id: string, decision: 'verified' | 'rejected', verifiedBy: string, verifiedAt: string, notes?: string): ReleaseArtifactEvidence | null {
    const result = this.database.prepare(`
      UPDATE release_artifact_evidence
      SET status = ?, verified_by = ?, verified_at = ?, notes = COALESCE(?, notes)
      WHERE id = ? AND status = 'submitted'
    `).run(decision, verifiedBy, verifiedAt, notes ?? null, id);
    if (Number(result.changes) !== 1) return null;
    return this.listReleaseArtifactEvidence().find((record) => record.id === id) ?? null;
  }

  public insertReleaseUpdateEvidence(record: ReleaseUpdateEvidence): void {
    this.database.prepare(`
      INSERT INTO release_update_evidence(
        id, channel, platform, current_version, target_version, rollback_version,
        manifest_reference, manifest_sha256, signature_reference, rollback_test_reference,
        source_release_identity_sha256, status, submitted_by, submitted_at, verified_by, verified_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.channel,
      record.platform,
      record.currentVersion,
      record.targetVersion,
      record.rollbackVersion,
      record.manifestReference,
      record.manifestSha256,
      record.signatureReference,
      record.rollbackTestReference,
      record.sourceReleaseIdentitySha256 ?? null,
      record.status,
      record.submittedBy,
      record.submittedAt,
      record.verifiedBy ?? null,
      record.verifiedAt ?? null,
      record.notes ?? null,
    );
  }

  public listReleaseUpdateEvidence(): ReleaseUpdateEvidence[] {
    const rows = this.database.prepare(`
      SELECT * FROM release_update_evidence
      ORDER BY submitted_at DESC, id DESC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      channel: String(row.channel) as ReleaseUpdateEvidence['channel'],
      platform: String(row.platform) as ReleaseUpdateEvidence['platform'],
      currentVersion: String(row.current_version),
      targetVersion: String(row.target_version),
      rollbackVersion: String(row.rollback_version),
      manifestReference: String(row.manifest_reference),
      manifestSha256: String(row.manifest_sha256),
      signatureReference: String(row.signature_reference),
      rollbackTestReference: String(row.rollback_test_reference),
      sourceReleaseIdentitySha256: row.source_release_identity_sha256 === null || row.source_release_identity_sha256 === undefined ? undefined : String(row.source_release_identity_sha256),
      status: String(row.status) as ReleaseUpdateEvidence['status'],
      submittedBy: String(row.submitted_by),
      submittedAt: String(row.submitted_at),
      verifiedBy: row.verified_by === null ? undefined : String(row.verified_by),
      verifiedAt: row.verified_at === null ? undefined : String(row.verified_at),
      notes: row.notes === null ? undefined : String(row.notes),
    }));
  }

  public decideReleaseUpdateEvidence(id: string, decision: 'verified' | 'rejected', verifiedBy: string, verifiedAt: string, notes?: string): ReleaseUpdateEvidence | null {
    const result = this.database.prepare(`
      UPDATE release_update_evidence
      SET status = ?, verified_by = ?, verified_at = ?, notes = COALESCE(?, notes)
      WHERE id = ? AND status = 'submitted'
    `).run(decision, verifiedBy, verifiedAt, notes ?? null, id);
    if (Number(result.changes) !== 1) return null;
    return this.listReleaseUpdateEvidence().find((record) => record.id === id) ?? null;
  }

  public insertUiAcceptanceEvidence(record: UiAcceptanceEvidence): void {
    this.database.prepare(`
      INSERT INTO ui_acceptance_evidence(
        id, scenario_id, scenario_fingerprint, release_identity_sha256, result,
        evidence_reference, notes, submitted_by, submitted_at, status,
        verified_by, verified_at, reviewer_notes, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.scenarioId,
      record.scenarioFingerprint,
      record.releaseIdentitySha256,
      record.result,
      record.evidenceReference,
      record.notes ?? null,
      record.submittedBy,
      record.submittedAt,
      record.status,
      record.verifiedBy ?? null,
      record.verifiedAt ?? null,
      record.reviewerNotes ?? null,
      record.version,
    );
  }

  public listUiAcceptanceEvidence(): UiAcceptanceEvidence[] {
    const rows = this.database.prepare('SELECT * FROM ui_acceptance_evidence ORDER BY submitted_at DESC, id DESC').all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      scenarioId: String(row.scenario_id),
      scenarioFingerprint: String(row.scenario_fingerprint),
      releaseIdentitySha256: String(row.release_identity_sha256),
      result: String(row.result) as UiAcceptanceEvidence['result'],
      evidenceReference: String(row.evidence_reference),
      notes: row.notes === null ? undefined : String(row.notes),
      submittedBy: String(row.submitted_by),
      submittedAt: String(row.submitted_at),
      status: String(row.status) as UiAcceptanceEvidence['status'],
      verifiedBy: row.verified_by === null ? undefined : String(row.verified_by),
      verifiedAt: row.verified_at === null ? undefined : String(row.verified_at),
      reviewerNotes: row.reviewer_notes === null ? undefined : String(row.reviewer_notes),
      version: Number(row.version),
    }));
  }

  public decideUiAcceptanceEvidence(id: string, decision: 'verified' | 'rejected', verifiedBy: string, verifiedAt: string, reviewerNotes?: string): UiAcceptanceEvidence | null {
    const result = this.database.prepare(`
      UPDATE ui_acceptance_evidence
      SET status = ?, verified_by = ?, verified_at = ?, reviewer_notes = ?, version = version + 1
      WHERE id = ? AND status = 'submitted'
    `).run(decision, verifiedBy, verifiedAt, reviewerNotes ?? null, id);
    if (Number(result.changes) !== 1) return null;
    return this.listUiAcceptanceEvidence().find((record) => record.id === id) ?? null;
  }

  public upsertIntelligenceAnomaly(record: StoredIntelligenceRecord): void {
    this.database.prepare(`
      INSERT INTO intelligence_anomalies(id, company_id, branch_id, payload_json, payload_checksum, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id, branch_id = excluded.branch_id,
        payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum,
        status = excluded.status, version = excluded.version, updated_at = excluded.updated_at
    `).run(record.id, record.companyId, record.branchId, record.payloadJson, record.payloadChecksum, record.status, record.version, record.createdAt, record.updatedAt);
  }

  public getIntelligenceAnomaly(id: string): StoredIntelligenceRecord | null {
    const row = this.database.prepare('SELECT * FROM intelligence_anomalies WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  public listIntelligenceAnomalies(companyId: string, branchId: string): StoredIntelligenceRecord[] {
    const rows = this.database.prepare('SELECT * FROM intelligence_anomalies WHERE company_id = ? AND branch_id = ? ORDER BY updated_at DESC, id').all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }

  public upsertIntelligenceReportExecution(record: StoredIntelligenceRecord): void {
    this.database.prepare(`
      INSERT INTO intelligence_report_executions(id, company_id, branch_id, payload_json, payload_checksum, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id, branch_id = excluded.branch_id,
        payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum,
        status = excluded.status, created_at = excluded.created_at
    `).run(record.id, record.companyId, record.branchId, record.payloadJson, record.payloadChecksum, record.status, record.createdAt);
  }

  public listIntelligenceReportExecutions(companyId: string, branchId: string): StoredIntelligenceRecord[] {
    const rows = this.database.prepare('SELECT * FROM intelligence_report_executions WHERE company_id = ? AND branch_id = ? ORDER BY created_at DESC, id').all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: 1, createdAt: String(row.created_at), updatedAt: String(row.created_at) }));
  }

  public upsertIntelligenceReportDeliveryPlan(record: StoredIntelligenceRecord): void {
    this.database.prepare(`
      INSERT INTO intelligence_report_delivery_plans(id, company_id, branch_id, payload_json, payload_checksum, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id, branch_id = excluded.branch_id,
        payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum,
        status = excluded.status, version = excluded.version, updated_at = excluded.updated_at
    `).run(record.id, record.companyId, record.branchId, record.payloadJson, record.payloadChecksum, record.status, record.version, record.createdAt, record.updatedAt);
  }

  public listIntelligenceReportDeliveryPlans(companyId: string, branchId: string): StoredIntelligenceRecord[] {
    const rows = this.database.prepare('SELECT * FROM intelligence_report_delivery_plans WHERE company_id = ? AND branch_id = ? ORDER BY updated_at DESC, id').all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }

  public upsertIntelligenceReportDeliveryAttempt(record: StoredIntelligenceRecord): void {
    this.database.prepare(`
      INSERT INTO intelligence_report_delivery_attempts(id, company_id, branch_id, payload_json, payload_checksum, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id, branch_id = excluded.branch_id,
        payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum,
        status = excluded.status, version = excluded.version, updated_at = excluded.updated_at
    `).run(record.id, record.companyId, record.branchId, record.payloadJson, record.payloadChecksum, record.status, record.version, record.createdAt, record.updatedAt);
  }

  public listIntelligenceReportDeliveryAttempts(companyId: string, branchId: string): StoredIntelligenceRecord[] {
    const rows = this.database.prepare('SELECT * FROM intelligence_report_delivery_attempts WHERE company_id = ? AND branch_id = ? ORDER BY updated_at DESC, id').all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }

  public upsertFinanceCompletionWorkpaper(record: StoredFinanceCompletionRecord): void {
    this.database.prepare(`
      INSERT INTO finance_completion_workpapers(id, company_id, branch_id, payload_json, payload_checksum, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum,
        status = excluded.status, version = excluded.version, updated_at = excluded.updated_at
    `).run(record.id, record.companyId, record.branchId, record.payloadJson, record.payloadChecksum, record.status, record.version, record.createdAt, record.updatedAt);
  }

  public getFinanceCompletionWorkpaper(id: string): StoredFinanceCompletionRecord | null {
    const row = this.database.prepare('SELECT * FROM finance_completion_workpapers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  public listFinanceCompletionWorkpapers(companyId: string, branchId: string): StoredFinanceCompletionRecord[] {
    const rows = this.database.prepare('SELECT * FROM finance_completion_workpapers WHERE company_id = ? AND branch_id = ? ORDER BY updated_at DESC, id').all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }

  public upsertAutomationRun(record: StoredAutomationRun): void {
    this.database.prepare(`
      INSERT INTO automation_runs(id, company_id, branch_id, payload_json, payload_checksum, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum,
        status = excluded.status, version = excluded.version, updated_at = excluded.updated_at
    `).run(record.id, record.companyId, record.branchId, record.payloadJson, record.payloadChecksum, record.status, record.version, record.createdAt, record.updatedAt);
  }

  public getAutomationRun(id: string): StoredAutomationRun | null {
    const row = this.database.prepare('SELECT * FROM automation_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  public getAutomationRunByIdempotency(companyId: string, branchId: string, idempotencyKey: string): StoredAutomationRun | null {
    const row = this.database.prepare("SELECT * FROM automation_runs WHERE company_id = ? AND branch_id = ? AND json_extract(payload_json, '$.idempotencyKey') = ?").get(companyId, branchId, idempotencyKey) as Record<string, unknown> | undefined;
    return row ? { id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : null;
  }

  public listAutomationRuns(companyId: string, branchId: string): StoredAutomationRun[] {
    const rows = this.database.prepare('SELECT * FROM automation_runs WHERE company_id = ? AND branch_id = ? ORDER BY updated_at DESC, id').all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), status: String(row.status), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }

  public upsertAutomationSchedule(record: StoredAutomationSchedule): void {
    this.database.prepare(`INSERT INTO automation_schedules(id, company_id, branch_id, payload_json, payload_checksum, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum, version = excluded.version, updated_at = excluded.updated_at`).run(record.id, record.companyId, record.branchId, record.payloadJson, record.payloadChecksum, record.version, record.createdAt, record.updatedAt);
  }

  public listAutomationSchedules(companyId: string, branchId: string): StoredAutomationSchedule[] {
    const rows = this.database.prepare('SELECT * FROM automation_schedules WHERE company_id = ? AND branch_id = ? ORDER BY updated_at DESC, id').all(companyId, branchId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ id: String(row.id), companyId: String(row.company_id), branchId: String(row.branch_id), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
  }

  public recordAutomationTrigger(record: StoredAutomationTrigger): boolean {
    const result = this.database.prepare(`INSERT OR IGNORE INTO automation_trigger_history(id, schedule_id, company_id, branch_id, slot_key, payload_json, payload_checksum, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(record.id, record.scheduleId, record.companyId, record.branchId, record.slotKey, record.payloadJson, record.payloadChecksum, record.createdAt);
    return Number(result.changes) === 1;
  }

  public listAutomationTriggerSlots(companyId: string, branchId: string, scheduleId: string): string[] {
    const rows = this.database.prepare('SELECT slot_key FROM automation_trigger_history WHERE company_id = ? AND branch_id = ? AND schedule_id = ? ORDER BY created_at DESC').all(companyId, branchId, scheduleId) as Array<Record<string, unknown>>;
    return rows.map((row) => String(row.slot_key));
  }

  public listAutomationTriggers(companyId: string, branchId: string, scheduleId?: string): StoredAutomationTrigger[] {
    const rows = scheduleId
      ? this.database.prepare('SELECT * FROM automation_trigger_history WHERE company_id = ? AND branch_id = ? AND schedule_id = ? ORDER BY created_at DESC, id').all(companyId, branchId, scheduleId)
      : this.database.prepare('SELECT * FROM automation_trigger_history WHERE company_id = ? AND branch_id = ? ORDER BY created_at DESC, id').all(companyId, branchId);
    return (rows as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), scheduleId: String(row.schedule_id), companyId: String(row.company_id), branchId: String(row.branch_id), slotKey: String(row.slot_key), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), createdAt: String(row.created_at) }));
  }

  public upsertAutomationFailure(record: StoredAutomationFailure): void {
    this.database.prepare(`INSERT INTO automation_scheduler_failures(id, schedule_id, company_id, branch_id, slot_key, reason, attempts, status, payload_json, payload_checksum, created_at, updated_at, resolved_at, resolution_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(schedule_id, slot_key) DO UPDATE SET reason = excluded.reason, attempts = automation_scheduler_failures.attempts + 1, status = 'open', payload_json = excluded.payload_json, payload_checksum = excluded.payload_checksum, updated_at = excluded.updated_at, resolved_at = NULL, resolution_reference = NULL`).run(record.id, record.scheduleId, record.companyId, record.branchId, record.slotKey, record.reason, record.attempts, record.status, record.payloadJson, record.payloadChecksum, record.createdAt, record.updatedAt, record.resolvedAt ?? null, record.resolutionReference ?? null);
  }

  public listAutomationFailures(companyId: string, branchId: string, status?: StoredAutomationFailure['status']): StoredAutomationFailure[] {
    const rows = status ? this.database.prepare('SELECT * FROM automation_scheduler_failures WHERE company_id = ? AND branch_id = ? AND status = ? ORDER BY updated_at DESC, id').all(companyId, branchId, status) : this.database.prepare('SELECT * FROM automation_scheduler_failures WHERE company_id = ? AND branch_id = ? ORDER BY updated_at DESC, id').all(companyId, branchId);
    return (rows as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), scheduleId: String(row.schedule_id), companyId: String(row.company_id), branchId: String(row.branch_id), slotKey: String(row.slot_key), reason: String(row.reason), attempts: Number(row.attempts), status: String(row.status) as StoredAutomationFailure['status'], payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), createdAt: String(row.created_at), updatedAt: String(row.updated_at), resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined, resolutionReference: row.resolution_reference ? String(row.resolution_reference) : undefined }));
  }

  public resolveAutomationFailure(companyId: string, branchId: string, id: string, resolvedAt: string, resolutionReference: string): void {
    const result = this.database.prepare("UPDATE automation_scheduler_failures SET status = 'resolved', resolved_at = ?, resolution_reference = ?, updated_at = ? WHERE id = ? AND company_id = ? AND branch_id = ? AND status = 'open'").run(resolvedAt, resolutionReference, resolvedAt, id, companyId, branchId);
    if (Number(result.changes) !== 1) throw new Error('Automation scheduler failure is outside the active scope or already resolved.');
  }

  public recordAutomationSchedulerAction(record: StoredAutomationSchedulerAction): void {
    this.database.prepare('INSERT INTO automation_scheduler_action_ledger(id, failure_id, company_id, branch_id, action, actor_id, reason, payload_json, payload_checksum, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(record.id, record.failureId, record.companyId, record.branchId, record.action, record.actorId, record.reason, record.payloadJson, record.payloadChecksum, record.createdAt);
  }

  public listAutomationSchedulerActions(companyId: string, branchId: string, failureId?: string): StoredAutomationSchedulerAction[] {
    const rows = failureId ? this.database.prepare('SELECT * FROM automation_scheduler_action_ledger WHERE company_id = ? AND branch_id = ? AND failure_id = ? ORDER BY created_at DESC, id').all(companyId, branchId, failureId) : this.database.prepare('SELECT * FROM automation_scheduler_action_ledger WHERE company_id = ? AND branch_id = ? ORDER BY created_at DESC, id').all(companyId, branchId);
    return (rows as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), failureId: String(row.failure_id), companyId: String(row.company_id), branchId: String(row.branch_id), action: String(row.action) as StoredAutomationSchedulerAction['action'], actorId: String(row.actor_id), reason: String(row.reason), payloadJson: String(row.payload_json), payloadChecksum: String(row.payload_checksum), createdAt: String(row.created_at) }));
  }

  public getLedgerBinding(profileId: string): StoredLedgerBinding | null {
    const row = this.database
      .prepare('SELECT * FROM gl_company_bindings WHERE profile_id = ?')
      .get(profileId) as Record<string, unknown> | undefined;
    return row ? this.mapLedgerBinding(row) : null;
  }

  public upsertLedgerBinding(record: StoredLedgerBinding): void {
    this.transaction(() => {
      const existing = this.getLedgerBinding(record.profileId);
      if (
        existing &&
        (existing.companyId !== record.companyId || existing.branchId !== record.branchId)
      ) {
        const journals = this.database
          .prepare(
            'SELECT COUNT(*) AS count FROM gl_journals WHERE company_id = ?',
          )
          .get(existing.companyId) as { count: number };
        if (Number(journals.count) > 0) {
          throw new Error('A finance binding with journals cannot be reassigned. Complete a governed ledger migration instead.');
        }
      }
      this.database
        .prepare(`
          INSERT INTO gl_company_bindings(
            profile_id, company_id, branch_id, currency_code, bound_by, bound_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(profile_id) DO UPDATE SET
            company_id = excluded.company_id,
            branch_id = excluded.branch_id,
            currency_code = excluded.currency_code,
            bound_by = excluded.bound_by,
            bound_at = excluded.bound_at
        `)
        .run(
          record.profileId,
          record.companyId,
          record.branchId,
          record.currencyCode,
          record.boundBy,
          record.boundAt,
        );
    });
  }

  public ensureLedgerAccounts(records: StoredLedgerAccount[]): void {
    if (!records.length) return;
    const insert = this.database.prepare(`
      INSERT INTO gl_accounts(
        id, company_id, code, name, account_type, normal_balance,
        is_postable, active, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, code) DO NOTHING
    `);
    this.transaction(() => {
      for (const record of records) {
        insert.run(
          record.id,
          record.companyId,
          record.code,
          record.name,
          record.accountType,
          record.normalBalance,
          record.isPostable ? 1 : 0,
          record.active ? 1 : 0,
          record.createdBy,
          record.createdAt,
        );
      }
    });
  }

  public listLedgerAccounts(companyId: string): StoredLedgerAccount[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM gl_accounts WHERE company_id = ? ORDER BY code ASC',
      )
      .all(companyId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapLedgerAccount(row));
  }

  public ensureLedgerPeriod(record: StoredLedgerPeriod): void {
    this.database
      .prepare(`
        INSERT INTO gl_periods(id, company_id, name, start_date, end_date, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, start_date, end_date) DO NOTHING
      `)
      .run(
        record.id,
        record.companyId,
        record.name,
        record.startDate,
        record.endDate,
        record.status,
      );
  }

  public listLedgerPeriods(companyId: string): StoredLedgerPeriod[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM gl_periods WHERE company_id = ? ORDER BY start_date DESC',
      )
      .all(companyId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapLedgerPeriod(row));
  }

  public getOpenLedgerPeriod(
    companyId: string,
    postingDate: string,
  ): StoredLedgerPeriod | null {
    const row = this.database
      .prepare(`
        SELECT * FROM gl_periods
        WHERE company_id = ?
          AND start_date <= ?
          AND end_date >= ?
          AND status = 'open'
        ORDER BY start_date DESC
        LIMIT 1
      `)
      .get(companyId, postingDate, postingDate) as Record<string, unknown> | undefined;
    return row ? this.mapLedgerPeriod(row) : null;
  }

  public getLedgerJournal(id: string): StoredLedgerJournal | null {
    const row = this.database
      .prepare('SELECT * FROM gl_journals WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const lines = this.database
      .prepare(`
        SELECT
          line.id, line.journal_id, line.line_no, line.account_id,
          account.code AS account_code, account.name AS account_name,
          line.debit_minor, line.credit_minor, line.memo,
          line.cost_center_id, line.profit_center_id, line.department_id, line.project_id
        FROM gl_journal_lines line
        INNER JOIN gl_accounts account ON account.id = line.account_id
        WHERE line.journal_id = ?
        ORDER BY line.line_no ASC
      `)
      .all(id) as Array<Record<string, unknown>>;
    return this.mapLedgerJournal(row, lines.map((line) => this.mapLedgerLine(line)));
  }

  /**
   * Source uniqueness is the replay boundary for certified subledger adapters.
   * A retry must discover the exact canonical journal it originally prepared.
   */
  public getLedgerJournalBySource(
    companyId: string,
    sourceType: string,
    sourceId: string,
  ): StoredLedgerJournal | null {
    const row = this.database
      .prepare(`
        SELECT id FROM gl_journals
        WHERE company_id = ? AND source_type = ? AND source_id = ?
        LIMIT 1
      `)
      .get(companyId, sourceType, sourceId) as { id: string } | undefined;
    return row ? this.getLedgerJournal(String(row.id)) : null;
  }

  /**
   * Source documents use globally generated ids. This lightweight existence
   * check lets an originating module prevent a second, legacy export once a
   * canonical journal has claimed the same business event.
   */
  public hasLedgerJournalSource(sourceType: string, sourceId: string): boolean {
    return Boolean(
      this.database
        .prepare(`
          SELECT 1 FROM gl_journals
          WHERE source_type = ? AND source_id = ?
          LIMIT 1
        `)
        .get(sourceType, sourceId),
    );
  }

  public listLedgerJournals(
    companyId: string,
    branchId?: string,
  ): StoredLedgerJournal[] {
    const rows = branchId
      ? this.database
          .prepare(`
            SELECT id FROM gl_journals
            WHERE company_id = ? AND branch_id = ? AND voided = 0
            ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, posting_date DESC, created_at DESC
          `)
          .all(companyId, branchId) as Array<{ id: string }>
      : this.database
          .prepare(`
            SELECT id FROM gl_journals
            WHERE company_id = ? AND voided = 0
            ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, posting_date DESC, created_at DESC
          `)
          .all(companyId) as Array<{ id: string }>;
    return rows
      .map((row) => this.getLedgerJournal(String(row.id)))
      .filter((journal): journal is StoredLedgerJournal => journal !== null);
  }

  public createLedgerJournal(
    input: CreateStoredLedgerJournalInput,
  ): StoredLedgerJournal {
    return this.transaction(() => {
      const period = this.getOpenLedgerPeriod(input.companyId, input.postingDate);
      if (!period || period.id !== input.periodId) {
        throw new Error('The selected posting date is not in an open general-ledger period.');
      }
      if (input.lines.length < 2) {
        throw new Error('A journal requires at least two lines.');
      }
      const debit = input.lines.reduce((total, line) => total + line.debitMinor, 0);
      const credit = input.lines.reduce((total, line) => total + line.creditMinor, 0);
      if (debit <= 0 || debit !== credit) {
        throw new Error('Journal debits and credits must balance to a positive amount.');
      }
      const accountLookup = this.database.prepare(
        'SELECT company_id, is_postable, active FROM gl_accounts WHERE id = ?',
      );
      for (const line of input.lines) {
        const account = accountLookup.get(line.accountId) as
          | { company_id: string; is_postable: number; active: number }
          | undefined;
        if (
          !account ||
          account.company_id !== input.companyId ||
          !toBoolean(account.is_postable) ||
          !toBoolean(account.active)
        ) {
          throw new Error('Every journal line must use an active postable account in the bound company.');
        }
        if (
          line.debitMinor < 0 ||
          line.creditMinor < 0 ||
          (line.debitMinor > 0 && line.creditMinor > 0) ||
          (line.debitMinor === 0 && line.creditMinor === 0)
        ) {
          throw new Error('Each journal line must carry either a debit or a credit.');
        }
      }

      const sequence = this.database
        .prepare(
          'SELECT next_value FROM gl_journal_sequences WHERE company_id = ? AND fiscal_label = ?',
        )
        .get(input.companyId, input.fiscalLabel) as { next_value: number } | undefined;
      const sequenceValue = sequence ? Number(sequence.next_value) : 1;
      if (sequence) {
        this.database
          .prepare(
            'UPDATE gl_journal_sequences SET next_value = ? WHERE company_id = ? AND fiscal_label = ?',
          )
          .run(sequenceValue + 1, input.companyId, input.fiscalLabel);
      } else {
        this.database
          .prepare(
            'INSERT INTO gl_journal_sequences(company_id, fiscal_label, next_value) VALUES (?, ?, ?)',
          )
          .run(input.companyId, input.fiscalLabel, sequenceValue + 1);
      }

      const number = `GL-${input.fiscalLabel}-${String(sequenceValue).padStart(5, '0')}`;
      this.database
        .prepare(`
          INSERT INTO gl_journals(
            id, company_id, branch_id, number, posting_date, period_id,
            source_type, source_id, source_number, source_checksum, kind,
            currency_code, total_debit_minor, total_credit_minor, memo, status,
            created_by, created_at, posted_by, posted_at, reverses_journal_id,
            previous_hash, hash, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, NULL, ?, NULL, NULL, 1)
        `)
        .run(
          input.id,
          input.companyId,
          input.branchId,
          number,
          input.postingDate,
          input.periodId,
          input.sourceType,
          input.sourceId ?? null,
          input.sourceNumber ?? null,
          input.sourceChecksum ?? null,
          input.kind,
          input.currencyCode,
          debit,
          credit,
          input.memo,
          input.createdBy,
          input.createdAt,
          input.reversesJournalId ?? null,
        );
      const insertLine = this.database.prepare(`
        INSERT INTO gl_journal_lines(
          id, journal_id, line_no, account_id, debit_minor, credit_minor, memo,
          cost_center_id, profit_center_id, department_id, project_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      input.lines.forEach((line, index) =>
        insertLine.run(
          line.id,
          input.id,
          index + 1,
          line.accountId,
          line.debitMinor,
          line.creditMinor,
          line.memo,
          line.costCenterId ?? null,
          line.profitCenterId ?? null,
          line.departmentId ?? null,
          line.projectId ?? null,
        ),
      );
      this.database
        .prepare(`
          INSERT INTO gl_journal_events(
            id, journal_id, event_type, actor_id, occurred_at, detail_json
          ) VALUES (?, ?, 'drafted', ?, ?, ?)
        `)
        .run(
          `${input.id}:drafted`,
          input.id,
          input.createdBy,
          input.createdAt,
          JSON.stringify({ kind: input.kind, sourceType: input.sourceType }),
        );
      const journal = this.getLedgerJournal(input.id);
      if (!journal) throw new Error('General-ledger journal creation did not persist.');
      return journal;
    });
  }

  public voidLedgerJournal(
    id: string,
    expectedVersion: number,
    actorId: string,
    reason: string,
    voidedAt: string,
  ): StoredLedgerJournal {
    return this.transaction(() => {
      const journal = this.getLedgerJournal(id);
      if (
        !journal ||
        journal.status !== 'draft' ||
        journal.kind !== 'reversal' ||
        journal.voided ||
        journal.version !== expectedVersion
      ) {
        throw new Error('The reversal draft is stale or is not available to cancel.');
      }
      if (journal.createdBy !== actorId) {
        throw new Error('Only the reversal draft maker can cancel it.');
      }
      this.database
        .prepare(`
          UPDATE gl_journals
          SET voided = 1, voided_by = ?, voided_at = ?, void_reason = ?,
              reverses_journal_id = NULL, source_id = NULL, version = version + 1
          WHERE id = ? AND status = 'draft' AND voided = 0 AND version = ?
        `)
        .run(actorId, voidedAt, reason, id, expectedVersion);
      this.database
        .prepare(`
          INSERT INTO gl_journal_void_events(
            id, journal_id, actor_id, occurred_at, reason
          ) VALUES (?, ?, ?, ?, ?)
        `)
        .run(`${id}:voided`, id, actorId, voidedAt, reason);
      const voided = this.getLedgerJournal(id);
      if (!voided?.voided) {
        throw new Error('The reversal draft cancellation did not persist.');
      }
      return voided;
    });
  }

  public postLedgerJournal(
    id: string,
    expectedVersion: number,
    actorId: string,
    postedAt: string,
  ): StoredLedgerJournal {
    return this.transaction(() => {
      const journal = this.getLedgerJournal(id);
      if (
        !journal ||
        journal.status !== 'draft' ||
        journal.voided ||
        journal.version !== expectedVersion
      ) {
        throw new Error('The journal is stale or no longer awaiting posting.');
      }
      if (journal.createdBy === actorId) {
        throw new Error('Journal maker cannot post the same journal.');
      }
      const period = this.getOpenLedgerPeriod(journal.companyId, journal.postingDate);
      if (!period || period.id !== journal.periodId) {
        throw new Error('The general-ledger period is closed or no longer available for posting.');
      }
      const debit = journal.lines.reduce((total, line) => total + line.debitMinor, 0);
      const credit = journal.lines.reduce((total, line) => total + line.creditMinor, 0);
      if (
        journal.lines.length < 2 ||
        debit !== credit ||
        debit !== journal.totalDebitMinor ||
        credit !== journal.totalCreditMinor
      ) {
        throw new Error('The journal no longer balances and cannot be posted.');
      }
      const sequence = this.database
        .prepare(
          'SELECT next_value FROM gl_journal_chain_sequences WHERE company_id = ?',
        )
        .get(journal.companyId) as { next_value: number } | undefined;
      const chainSequence = sequence ? Number(sequence.next_value) : 1;
      if (sequence) {
        this.database
          .prepare(
            'UPDATE gl_journal_chain_sequences SET next_value = ? WHERE company_id = ?',
          )
          .run(chainSequence + 1, journal.companyId);
      } else {
        this.database
          .prepare(
            'INSERT INTO gl_journal_chain_sequences(company_id, next_value) VALUES (?, ?)',
          )
          .run(journal.companyId, chainSequence + 1);
      }
      const previous = this.database
        .prepare(`
          SELECT hash FROM gl_journals
          WHERE company_id = ? AND status = 'posted'
          ORDER BY chain_sequence DESC
          LIMIT 1
        `)
        .get(journal.companyId) as { hash: string } | undefined;
      const previousHash = previous?.hash ?? '0'.repeat(64);
      const hash = this.computeLedgerJournalHash(
        { ...journal, chainSequence, hashVersion: 2 },
        previousHash,
        actorId,
        postedAt,
      );
      this.database
        .prepare(`
          UPDATE gl_journals
          SET status = 'posted', posted_by = ?, posted_at = ?,
              previous_hash = ?, hash = ?, chain_sequence = ?, hash_version = 2,
              version = version + 1
          WHERE id = ? AND status = 'draft' AND version = ?
        `)
        .run(
          actorId,
          postedAt,
          previousHash,
          hash,
          chainSequence,
          id,
          expectedVersion,
        );
      this.database
        .prepare(`
          INSERT INTO gl_journal_events(
            id, journal_id, event_type, actor_id, occurred_at, detail_json
          ) VALUES (?, ?, 'posted', ?, ?, ?)
        `)
        .run(
          `${id}:posted`,
          id,
          actorId,
          postedAt,
          JSON.stringify({ previousHash, hash, chainSequence, hashVersion: 2 }),
        );
      const posted = this.getLedgerJournal(id);
      if (!posted || posted.status !== 'posted') {
        throw new Error('General-ledger journal posting did not persist.');
      }
      return posted;
    });
  }

  public listLedgerTrialBalance(
    companyId: string,
    branchId?: string,
  ): StoredLedgerTrialBalanceRow[] {
    const rows = branchId
      ? this.database
          .prepare(`
            SELECT
              account.id AS account_id,
              account.code AS account_code,
              account.name AS account_name,
              account.account_type,
              account.normal_balance,
              COALESCE(SUM(CASE WHEN journal.id IS NOT NULL THEN line.debit_minor ELSE 0 END), 0) AS debit_minor,
              COALESCE(SUM(CASE WHEN journal.id IS NOT NULL THEN line.credit_minor ELSE 0 END), 0) AS credit_minor
            FROM gl_accounts account
            LEFT JOIN gl_journal_lines line ON line.account_id = account.id
            LEFT JOIN gl_journals journal
              ON journal.id = line.journal_id
              AND journal.status = 'posted'
              AND journal.branch_id = ?
            WHERE account.company_id = ?
            GROUP BY account.id
            ORDER BY account.code ASC
          `)
          .all(branchId, companyId) as Array<Record<string, unknown>>
      : this.database
          .prepare(`
            SELECT
              account.id AS account_id,
              account.code AS account_code,
              account.name AS account_name,
              account.account_type,
              account.normal_balance,
              COALESCE(SUM(CASE WHEN journal.id IS NOT NULL THEN line.debit_minor ELSE 0 END), 0) AS debit_minor,
              COALESCE(SUM(CASE WHEN journal.id IS NOT NULL THEN line.credit_minor ELSE 0 END), 0) AS credit_minor
            FROM gl_accounts account
            LEFT JOIN gl_journal_lines line ON line.account_id = account.id
            LEFT JOIN gl_journals journal
              ON journal.id = line.journal_id AND journal.status = 'posted'
            WHERE account.company_id = ?
            GROUP BY account.id
            ORDER BY account.code ASC
          `)
          .all(companyId) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const debitMinor = Number(row.debit_minor);
      const creditMinor = Number(row.credit_minor);
      return {
        accountId: String(row.account_id),
        accountCode: String(row.account_code),
        accountName: String(row.account_name),
        accountType: String(row.account_type) as StoredLedgerTrialBalanceRow['accountType'],
        normalBalance: String(row.normal_balance) as StoredLedgerTrialBalanceRow['normalBalance'],
        debitMinor,
        creditMinor,
        balanceMinor: debitMinor - creditMinor,
      };
    });
  }

  public verifyLedgerChain(companyId: string): boolean {
    const rows = this.database
      .prepare(`
        SELECT id FROM gl_journals
        WHERE company_id = ? AND status = 'posted'
        ORDER BY chain_sequence ASC
      `)
      .all(companyId) as Array<{ id: string }>;
    let previousHash = '0'.repeat(64);
    for (const row of rows) {
      const journal = this.getLedgerJournal(String(row.id));
      if (
        !journal ||
        !journal.hash ||
        !journal.postedBy ||
        !journal.postedAt ||
        journal.chainSequence === null ||
        journal.previousHash !== previousHash
      ) {
        return false;
      }
      const expectedHash =
        journal.hashVersion === 1
          ? this.computeLegacyLedgerJournalHash(
              journal,
              previousHash,
              journal.postedBy,
              journal.postedAt,
            )
          : journal.hashVersion === 2
            ? this.computeLedgerJournalHash(
                journal,
                previousHash,
                journal.postedBy,
                journal.postedAt,
              )
            : null;
      if (journal.hash !== expectedHash) return false;
      previousHash = journal.hash;
    }
    return true;
  }

  public getAttachment(id: string): StoredAttachment | null {
    const row = this.database
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      resource: String(row.resource),
      resourceId: String(row.resource_id),
      fileName: String(row.file_name),
      mimeType: String(row.mime_type),
      size: Number(row.size),
      sha256: String(row.sha256),
      storageKey: String(row.storage_key),
      encryptedPath: String(row.encrypted_path),
      iv: String(row.iv),
      authTag: String(row.auth_tag),
      keyVersion: Number(row.key_version),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
    };
  }

  public listAttachments(resource: string, resourceId: string): StoredAttachment[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM attachments
        WHERE resource = ? AND resource_id = ?
        ORDER BY created_at DESC
      `)
      .all(resource, resourceId) as Array<Record<string, unknown>>;
    return rows
      .map((row) => this.getAttachment(String(row.id)))
      .filter((record): record is StoredAttachment => record !== null);
  }

  public async createOnlineBackup(targetPath: string): Promise<number> {
    return backup(this.database, targetPath, { rate: 100 });
  }

  public recordBackup(
    fileName: string,
    createdAt: string,
    sha256: string,
    size: number,
    verifiedAt: string,
  ): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO backup_history(
          file_name, created_at, sha256, size, database_version, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        fileName,
        createdAt,
        sha256,
        size,
        MIGRATIONS.length,
        verifiedAt,
      );
  }

  public recordRestoreDrill(record: RestoreDrillRecord): void {
    this.database
      .prepare(`
        INSERT OR REPLACE INTO restore_drill_history(
          id, actor_id, status, payload_json, started_at, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.id,
        record.actorId,
        record.status,
        JSON.stringify(record),
        record.startedAt,
        record.verifiedAt,
      );
  }

  public listRestoreDrills(): RestoreDrillRecord[] {
    const rows = this.database
      .prepare(`
        SELECT payload_json
        FROM restore_drill_history
        ORDER BY verified_at DESC, id DESC
      `)
      .all() as Array<{ payload_json: string }>;
    return rows.flatMap(({ payload_json }) => {
      try {
        const parsed = JSON.parse(payload_json) as RestoreDrillRecord;
        return parsed && typeof parsed.id === 'string' && typeof parsed.actorId === 'string' ? [parsed] : [];
      } catch {
        return [];
      }
    });
  }

  public verifyIntegrity(): boolean {
    const row = this.database.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string;
    };
    return row.integrity_check === 'ok';
  }

  public close(): void {
    if (this.database.isOpen) this.database.close();
  }

  public get path(): string {
    return this.databasePath;
  }

  private openDatabase(): DatabaseSync {
    return new DatabaseSync(this.databasePath, {
      allowExtension: false,
      timeout: 5_000,
    });
  }

  private configure(): void {
    this.database.enableDefensive(true);
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA trusted_schema = OFF;
      PRAGMA temp_store = MEMORY;
    `);
  }

  /**
   * Writes a state document and its denormalized evidence without opening a
   * transaction.  `saveState` and the bootstrap transaction each provide the
   * transaction boundary appropriate to their caller.
   */
  private persistStateDocument(
    namespace: string,
    schemaVersion: number,
    revision: number,
    payload: unknown,
    updatedAt: string,
  ): void {
    const serialized = JSON.stringify(payload);
    if (typeof serialized !== 'string') {
      throw new Error('State document payload must be JSON serializable.');
    }
    const audit = this.readArrayProperty<AuditEntry>(payload, 'audit');
    const outbox = this.readArrayProperty<DomainEvent>(payload, 'outbox');
    const upsert = this.database.prepare(`
      INSERT INTO state_documents(
        namespace, schema_version, revision, payload_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(namespace) DO UPDATE SET
        schema_version = excluded.schema_version,
        revision = excluded.revision,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
      WHERE excluded.revision >= state_documents.revision
    `);
    const insertAudit = this.database.prepare(`
      INSERT OR IGNORE INTO audit_ledger(
        id, namespace, occurred_at, actor_id, action, resource, resource_id,
        reason, before_json, after_json, previous_hash, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEvent = this.database.prepare(`
      INSERT OR IGNORE INTO outbox_events(
        id, namespace, event_type, aggregate_type, aggregate_id, occurred_at,
        payload_json, status, attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    upsert.run(namespace, schemaVersion, revision, serialized, updatedAt);
    for (const entry of audit) {
      insertAudit.run(
        entry.id,
        namespace,
        entry.occurredAt,
        entry.actorId,
        entry.action,
        entry.resource,
        entry.resourceId,
        entry.reason,
        JSON.stringify(entry.before ?? null),
        JSON.stringify(entry.after ?? null),
        entry.previousHash,
        entry.hash,
      );
    }
    for (const event of outbox) {
      insertEvent.run(
        event.id,
        namespace,
        event.type,
        event.aggregateType,
        event.aggregateId,
        event.occurredAt,
        JSON.stringify(event.payload),
        event.status,
        event.attempts,
      );
    }
  }

  private assertFreshWorkspaceBootstrapTarget(workspaceId: string): void {
    const guard = this.readWorkspaceBootstrapGuard(workspaceId);
    if (guard?.status === 'protected-existing') {
      throw new Error(
        'Workspace is protected because existing data has no trusted bootstrap decision.',
      );
    }
    if (guard?.status === 'provisioned') {
      throw new Error('Workspace bootstrap has already been provisioned.');
    }
    if (guard) {
      throw new Error('Workspace bootstrap has already been claimed.');
    }

    if (this.countTableRows('credentials') > 0) {
      throw new Error('Workspace bootstrap is blocked because credentials already exist.');
    }
    if (this.countTableRows('sessions') > 0) {
      throw new Error('Workspace bootstrap is blocked because sessions already exist.');
    }
    if (this.countTableRows('state_documents') > 0) {
      throw new Error('Workspace bootstrap is blocked because state documents already exist.');
    }
    if (
      this.countTableRows('audit_ledger') > 0 ||
      this.countTableRows('outbox_events') > 0
    ) {
      throw new Error(
        'Workspace bootstrap is blocked because durable audit or event evidence already exists.',
      );
    }
  }

  private countTableRows(
    table:
      | 'credentials'
      | 'sessions'
      | 'state_documents'
      | 'audit_ledger'
      | 'outbox_events',
  ): number {
    const row = this.database
      .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
      .get() as { count: number };
    return Number(row.count);
  }

  private requireWorkspaceBootstrapManifest(
    manifest: WorkspaceBootstrapManifest,
  ): void {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('A workspace bootstrap manifest is required.');
    }
    this.requireStarterMode(manifest.starterMode);
    this.requireStateDocuments(
      manifest.stateDocuments,
      'Workspace bootstrap',
    );

    this.requireBootstrapCredential(manifest.credential);
    this.requireBootstrapSession(manifest.session, manifest.credential.userId);
  }

  private requireStateDocuments(
    stateDocuments: readonly WorkspaceBootstrapStateDocument[],
    label: string,
  ): void {
    if (!Array.isArray(stateDocuments) || stateDocuments.length === 0) {
      throw new Error(`${label} requires at least one state document.`);
    }

    const namespaces = new Set<string>();
    for (const document of stateDocuments) {
      if (!document || typeof document !== 'object') {
        throw new Error(`${label} state documents are required.`);
      }
      if (
        typeof document.namespace !== 'string' ||
        !document.namespace.trim() ||
        document.namespace.length > 200 ||
        document.namespace !== document.namespace.trim()
      ) {
        throw new Error(`${label} state document namespaces must be non-empty.`);
      }
      if (namespaces.has(document.namespace)) {
        throw new Error(`${label} state document namespaces must be unique.`);
      }
      namespaces.add(document.namespace);
      if (
        !Number.isInteger(document.schemaVersion) ||
        document.schemaVersion <= 0 ||
        !Number.isInteger(document.revision) ||
        document.revision <= 0
      ) {
        throw new Error(
          `${label} state document schema versions and revisions must be positive integers.`,
        );
      }
      if (document.payload === undefined) {
        throw new Error(`${label} state document payloads are required.`);
      }
    }
  }

  private requireBootstrapCredential(record: CredentialRecord): void {
    if (!record || typeof record !== 'object') {
      throw new Error('A workspace bootstrap credential is required.');
    }
    for (const [label, value] of Object.entries({
      userId: record.userId,
      email: record.email,
      displayName: record.displayName,
      passwordHash: record.passwordHash,
      salt: record.salt,
      parameters: record.parameters,
      updatedAt: record.updatedAt,
    })) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Workspace bootstrap credential ${label} is required.`);
      }
    }
    if (record.algorithm !== 'scrypt-v1') {
      throw new Error('Workspace bootstrap credentials must use scrypt-v1.');
    }
    if (typeof record.mustChangePassword !== 'boolean') {
      throw new Error('Workspace bootstrap credential password-change policy is required.');
    }
    if (!Number.isInteger(record.failedAttempts) || record.failedAttempts !== 0) {
      throw new Error('Workspace bootstrap credentials must start with no failed attempts.');
    }
    if (record.lockedUntil !== null) {
      throw new Error('Workspace bootstrap credentials must not start locked.');
    }
    try {
      JSON.parse(record.parameters);
    } catch {
      throw new Error('Workspace bootstrap credential parameters must be valid JSON.');
    }
  }

  private requireBootstrapSession(
    record: SessionRecord,
    credentialUserId: string,
  ): void {
    if (!record || typeof record !== 'object') {
      throw new Error('A workspace bootstrap session is required.');
    }
    for (const [label, value] of Object.entries({
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastSeenAt: record.lastSeenAt,
    })) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Workspace bootstrap session ${label} is required.`);
      }
    }
    if (record.userId !== credentialUserId) {
      throw new Error('Workspace bootstrap session must belong to its supplied credential.');
    }
    if (record.revokedAt !== null) {
      throw new Error('Workspace bootstrap session must start active.');
    }
  }

  private insertFreshBootstrapCredential(record: CredentialRecord): void {
    this.database
      .prepare(`
        INSERT INTO credentials(
          user_id, email, display_name, password_hash, salt, algorithm,
          parameters_json, must_change_password, failed_attempts,
          locked_until, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.userId,
        record.email,
        record.displayName,
        record.passwordHash,
        record.salt,
        record.algorithm,
        record.parameters,
        record.mustChangePassword ? 1 : 0,
        record.failedAttempts,
        record.lockedUntil,
        record.updatedAt,
      );
  }

  private insertFreshBootstrapSession(record: SessionRecord): void {
    this.database
      .prepare(`
        INSERT INTO sessions(
          id, user_id, token_hash, created_at, expires_at, last_seen_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.id,
        record.userId,
        record.tokenHash,
        record.createdAt,
        record.expiresAt,
        record.lastSeenAt,
        record.revokedAt,
      );
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private readWorkspaceBootstrapGuard(
    workspaceId: string,
  ): WorkspaceBootstrapGuard | null {
    const row = this.database
      .prepare(`
        SELECT workspace_id, status, starter_mode, created_at, updated_at, provisioned_at
        FROM workspace_bootstrap_guards
        WHERE workspace_id = ?
      `)
      .get(workspaceId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      workspaceId: String(row.workspace_id),
      status: String(row.status) as WorkspaceBootstrapStatus,
      starterMode:
        row.starter_mode === null || row.starter_mode === undefined
          ? null
          : (String(row.starter_mode) as WorkspaceStarterMode),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      provisionedAt:
        row.provisioned_at === null || row.provisioned_at === undefined
          ? null
          : String(row.provisioned_at),
    };
  }

  private requireWorkspaceId(workspaceId: string): string {
    if (
      typeof workspaceId !== 'string' ||
      !workspaceId.trim() ||
      workspaceId.length > 200
    ) {
      throw new Error('A non-empty workspace id is required for bootstrap protection.');
    }
    return workspaceId;
  }

  private requireStarterMode(starterMode: WorkspaceStarterMode): void {
    if (starterMode !== 'clean' && starterMode !== 'sample') {
      throw new Error('Workspace starter mode must be clean or sample.');
    }
  }

  private requireTimestamp(value: string): void {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('A bootstrap guard timestamp is required.');
    }
  }

  private readArrayProperty<T>(value: unknown, property: string): T[] {
    if (!value || typeof value !== 'object') return [];
    const candidate = (value as Record<string, unknown>)[property];
    return Array.isArray(candidate) ? (candidate as T[]) : [];
  }

  private computeLedgerJournalHash(
    journal: StoredLedgerJournal,
    previousHash: string,
    postedBy: string,
    postedAt: string,
  ): string {
    return digest(
      JSON.stringify({
        hashVersion: 2,
        chainSequence: journal.chainSequence,
        id: journal.id,
        companyId: journal.companyId,
        branchId: journal.branchId,
        number: journal.number,
        postingDate: journal.postingDate,
        periodId: journal.periodId,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        sourceNumber: journal.sourceNumber,
        sourceChecksum: journal.sourceChecksum,
        kind: journal.kind,
        currencyCode: journal.currencyCode,
        totalDebitMinor: journal.totalDebitMinor,
        totalCreditMinor: journal.totalCreditMinor,
        memo: journal.memo,
        createdBy: journal.createdBy,
        createdAt: journal.createdAt,
        postedBy,
        postedAt,
        reversesJournalId: journal.reversesJournalId,
        previousHash,
        lines: journal.lines.map((line) => ({
          lineNumber: line.lineNumber,
          accountId: line.accountId,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
          memo: line.memo,
        })),
      }),
    );
  }

  private computeLegacyLedgerJournalHash(
    journal: StoredLedgerJournal,
    previousHash: string,
    postedBy: string,
    postedAt: string,
  ): string {
    return digest(
      JSON.stringify({
        id: journal.id,
        companyId: journal.companyId,
        branchId: journal.branchId,
        number: journal.number,
        postingDate: journal.postingDate,
        periodId: journal.periodId,
        sourceType: journal.sourceType,
        sourceId: journal.sourceId,
        sourceNumber: journal.sourceNumber,
        sourceChecksum: journal.sourceChecksum,
        kind: journal.kind,
        currencyCode: journal.currencyCode,
        totalDebitMinor: journal.totalDebitMinor,
        totalCreditMinor: journal.totalCreditMinor,
        memo: journal.memo,
        createdBy: journal.createdBy,
        createdAt: journal.createdAt,
        postedBy,
        postedAt,
        reversesJournalId: journal.reversesJournalId,
        previousHash,
        lines: journal.lines.map((line) => ({
          lineNumber: line.lineNumber,
          accountId: line.accountId,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
          memo: line.memo,
        })),
      }),
    );
  }

  private mapLedgerBinding(row: Record<string, unknown>): StoredLedgerBinding {
    return {
      profileId: String(row.profile_id),
      companyId: String(row.company_id),
      branchId: String(row.branch_id),
      currencyCode: String(row.currency_code),
      boundBy: String(row.bound_by),
      boundAt: String(row.bound_at),
    };
  }

  private mapLedgerAccount(row: Record<string, unknown>): StoredLedgerAccount {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      code: String(row.code),
      name: String(row.name),
      accountType: String(row.account_type) as StoredLedgerAccount['accountType'],
      normalBalance: String(row.normal_balance) as StoredLedgerAccount['normalBalance'],
      isPostable: toBoolean(row.is_postable),
      active: toBoolean(row.active),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
    };
  }

  private mapLedgerPeriod(row: Record<string, unknown>): StoredLedgerPeriod {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      name: String(row.name),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      status: String(row.status) as StoredLedgerPeriod['status'],
    };
  }

  private mapLedgerLine(row: Record<string, unknown>): StoredLedgerLine {
    return {
      id: String(row.id),
      journalId: String(row.journal_id),
      lineNumber: Number(row.line_no),
      accountId: String(row.account_id),
      accountCode: String(row.account_code),
      accountName: String(row.account_name),
      debitMinor: Number(row.debit_minor),
      creditMinor: Number(row.credit_minor),
      memo: String(row.memo),
      costCenterId: row.cost_center_id ? String(row.cost_center_id) : null,
      profitCenterId: row.profit_center_id ? String(row.profit_center_id) : null,
      departmentId: row.department_id ? String(row.department_id) : null,
      projectId: row.project_id ? String(row.project_id) : null,
    };
  }

  private mapLedgerJournal(
    row: Record<string, unknown>,
    lines: StoredLedgerLine[],
  ): StoredLedgerJournal {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      branchId: String(row.branch_id),
      number: String(row.number),
      postingDate: String(row.posting_date),
      periodId: String(row.period_id),
      sourceType: String(row.source_type),
      sourceId: row.source_id ? String(row.source_id) : null,
      sourceNumber: row.source_number ? String(row.source_number) : null,
      sourceChecksum: row.source_checksum ? String(row.source_checksum) : null,
      kind: String(row.kind) as StoredLedgerJournal['kind'],
      currencyCode: String(row.currency_code),
      totalDebitMinor: Number(row.total_debit_minor),
      totalCreditMinor: Number(row.total_credit_minor),
      memo: String(row.memo),
      status: String(row.status) as StoredLedgerJournal['status'],
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      postedBy: row.posted_by ? String(row.posted_by) : null,
      postedAt: row.posted_at ? String(row.posted_at) : null,
      reversesJournalId: row.reverses_journal_id
        ? String(row.reverses_journal_id)
        : null,
      voided: toBoolean(row.voided),
      voidedBy: row.voided_by ? String(row.voided_by) : null,
      voidedAt: row.voided_at ? String(row.voided_at) : null,
      voidReason: row.void_reason ? String(row.void_reason) : null,
      previousHash: row.previous_hash ? String(row.previous_hash) : null,
      hash: row.hash ? String(row.hash) : null,
      chainSequence:
        row.chain_sequence === null || row.chain_sequence === undefined
          ? null
          : Number(row.chain_sequence),
      hashVersion: Number(row.hash_version) === 2 ? 2 : 1,
      version: Number(row.version),
      lines,
    };
  }

  private mapCredential(row: Record<string, unknown>): CredentialRecord {
    return {
      userId: String(row.user_id),
      email: String(row.email),
      displayName: String(row.display_name),
      passwordHash: String(row.password_hash),
      salt: String(row.salt),
      algorithm: 'scrypt-v1',
      parameters: String(row.parameters_json),
      mustChangePassword: toBoolean(row.must_change_password),
      failedAttempts: Number(row.failed_attempts),
      lockedUntil: row.locked_until ? String(row.locked_until) : null,
      updatedAt: String(row.updated_at),
    };
  }
}
