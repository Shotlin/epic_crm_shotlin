import type { ReleaseArtifactReadinessReport } from './cross-platform-artifact-readiness';
import type { ReleaseUpdateReadinessReport } from './release-update-readiness';
import type { UiAcceptanceReadinessReport } from './ui-acceptance-readiness';
import type { OperationalHealthSnapshot, RuntimeDatabaseEncryptionEvidence } from '../shared/kernel-contracts';
import type { ReleaseReadiness } from '../shared/release-control-contracts';

export type ReleaseDeploymentReadinessStatus = 'ready' | 'blocked' | 'external-certification';

export interface ReleaseDeploymentReadinessCheck {
  id: 'release-gates' | 'artifact-matrix' | 'update-channels' | 'ui-acceptance' | 'runtime-health' | 'runtime-encryption' | 'recovery-drain';
  label: string;
  status: ReleaseDeploymentReadinessStatus;
  summary: string;
  nextAction: string;
}

export interface ReleaseDeploymentReadinessReport {
  status: ReleaseDeploymentReadinessStatus;
  goNoGo: 'go' | 'hold';
  readyCheckCount: number;
  blockedCheckCount: number;
  externalCertificationCheckCount: number;
  actionRequired: boolean;
  nextActions: string[];
  checks: ReleaseDeploymentReadinessCheck[];
}

export interface ReleaseDeploymentReadinessInput {
  releaseReadiness: Pick<ReleaseReadiness, 'status' | 'passed' | 'failed' | 'deferred' | 'missingGateIds' | 'invalidGateIds'>;
  artifactReadiness: Pick<ReleaseArtifactReadinessReport, 'status' | 'readyPlatformCount' | 'blockedPlatformCount' | 'externalCertificationPlatformCount' | 'nextActions'>;
  updateReadiness: Pick<ReleaseUpdateReadinessReport, 'status' | 'readyCount' | 'blockedCount' | 'externalCertificationCount' | 'nextActions'>;
  uiAcceptanceReadiness: Pick<UiAcceptanceReadinessReport, 'status' | 'requiredCount' | 'verifiedPassedCount' | 'pendingReviewCount' | 'failedOrRejectedCount' | 'staleCount' | 'nextActions'> | null;
  operationalHealth: OperationalHealthSnapshot | null;
  runtimeDatabaseEncryption: RuntimeDatabaseEncryptionEvidence | null;
}

export function computeReleaseDeploymentReadiness({ releaseReadiness, artifactReadiness, updateReadiness, uiAcceptanceReadiness, operationalHealth, runtimeDatabaseEncryption }: ReleaseDeploymentReadinessInput): ReleaseDeploymentReadinessReport {
  const healthUnavailable = !operationalHealth;
  const checks: ReleaseDeploymentReadinessCheck[] = [
    {
      id: 'release-gates',
      label: 'Core release gates',
      status: releaseReadiness.failed > 0 || releaseReadiness.invalidGateIds.length > 0 || releaseReadiness.missingGateIds.length > 0 || releaseReadiness.deferred > 0 ? 'blocked' : 'ready',
      summary: `${releaseReadiness.passed} passed, ${releaseReadiness.failed} failed, ${releaseReadiness.deferred} deferred; ${releaseReadiness.missingGateIds.length} missing.`,
      nextAction: releaseReadiness.status === 'ready' ? 'Core release gates are complete.' : 'Resolve failed, deferred, missing, or invalid core release evidence.',
    },
    {
      id: 'artifact-matrix',
      label: 'Platform artifact matrix',
      status: artifactReadiness.status,
      summary: `${artifactReadiness.readyPlatformCount} ready, ${artifactReadiness.blockedPlatformCount} blocked, ${artifactReadiness.externalCertificationPlatformCount} awaiting certification.`,
      nextAction: artifactReadiness.nextActions[0] ?? 'Platform artifacts are ready.',
    },
    {
      id: 'update-channels',
      label: 'Automatic update and rollback channels',
      status: updateReadiness.status,
      summary: `${updateReadiness.readyCount} ready, ${updateReadiness.blockedCount} blocked, ${updateReadiness.externalCertificationCount} awaiting independent verification or signing.`,
      nextAction: updateReadiness.nextActions[0] ?? 'Update channels are ready.',
    },
    {
      id: 'ui-acceptance',
      label: 'Role and screen acceptance',
      status: uiAcceptanceReadiness?.status === 'ready' ? 'ready' : 'blocked',
      summary: uiAcceptanceReadiness ? `${uiAcceptanceReadiness.verifiedPassedCount} of ${uiAcceptanceReadiness.requiredCount} journeys independently verified; ${uiAcceptanceReadiness.pendingReviewCount} awaiting review, ${uiAcceptanceReadiness.failedOrRejectedCount} failed or rejected, ${uiAcceptanceReadiness.staleCount} stale.` : 'No active-release screen acceptance evidence is available.',
      nextAction: uiAcceptanceReadiness?.status === 'ready' ? 'All configured role and screen journeys are independently verified.' : uiAcceptanceReadiness?.nextActions[0] ?? 'Record and independently verify every active-release role and screen journey.',
    },
    {
      id: 'runtime-health',
      label: 'Runtime health and observability',
      status: healthUnavailable ? 'blocked' : operationalHealth.status === 'healthy' ? 'ready' : 'blocked',
      summary: healthUnavailable ? 'No main-process health snapshot is available.' : `Main process is ${operationalHealth.status}; database ${operationalHealth.databaseIntegrity ? 'integrity OK' : 'integrity failed'}, audit ${operationalHealth.auditChainValid ? 'valid' : 'invalid'}, migrations ${operationalHealth.migrationsValid ? 'valid' : 'invalid'}.`,
      nextAction: healthUnavailable ? 'Run the health check before promotion.' : operationalHealth.status === 'healthy' && operationalHealth.databaseIntegrity && operationalHealth.auditChainValid && operationalHealth.migrationsValid ? 'Runtime health is clear.' : 'Resolve runtime health, database, audit, or migration issues.',
    },
    {
      id: 'runtime-encryption',
      label: 'Native runtime database encryption',
      status: runtimeDatabaseEncryption?.status === 'native-encrypted' ? 'ready' : 'blocked',
      summary: runtimeDatabaseEncryption?.statement ?? 'No runtime database encryption evidence is available.',
      nextAction: runtimeDatabaseEncryption?.status === 'native-encrypted' ? 'Native encrypted SQLite runtime is certified.' : 'Certify SQLCipher or an equivalent native encrypted SQLite runtime before production promotion.',
    },
    {
      id: 'recovery-drain',
      label: 'Recovery and event drain',
      status: healthUnavailable || !operationalHealth ? 'blocked' : operationalHealth.pendingOutboxEvents > 0 || operationalHealth.failedOutboxEvents > 0 ? 'blocked' : 'ready',
      summary: healthUnavailable ? 'Outbox and recovery evidence is unavailable.' : `${operationalHealth.pendingOutboxEvents} pending and ${operationalHealth.failedOutboxEvents} failed outbox event(s).`,
      nextAction: healthUnavailable ? 'Restore health telemetry before promotion.' : operationalHealth.failedOutboxEvents > 0 ? 'Resolve failed outbox events before promotion.' : operationalHealth.pendingOutboxEvents > 0 ? 'Drain pending outbox events before promotion.' : 'Recovery queue is clear.',
    },
  ];
  const nextActions = checks.filter((check) => check.status !== 'ready').map((check) => check.nextAction).filter((action, index, values) => values.indexOf(action) === index);
  const status: ReleaseDeploymentReadinessStatus = checks.some((check) => check.status === 'blocked') ? 'blocked' : checks.some((check) => check.status === 'external-certification') ? 'external-certification' : 'ready';
  return { status, goNoGo: status === 'ready' ? 'go' : 'hold', readyCheckCount: checks.filter((check) => check.status === 'ready').length, blockedCheckCount: checks.filter((check) => check.status === 'blocked').length, externalCertificationCheckCount: checks.filter((check) => check.status === 'external-certification').length, actionRequired: status !== 'ready', nextActions, checks };
}
