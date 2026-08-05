export type ReleaseGateId = 'typecheck' | 'lint' | 'tests' | 'package' | 'backup-restore' | 'provider-certification';

export interface ReleaseGateEvidence {
  id: ReleaseGateId;
  label: string;
  status: 'passed' | 'failed' | 'deferred';
  evidenceReference: string;
  checkedAt: string;
  notes?: string;
  evidenceChecksum?: string;
}

export interface ReleaseReadiness {
  status: 'ready' | 'blocked';
  passed: number;
  failed: number;
  deferred: number;
  missingGateIds: ReleaseGateId[];
  invalidGateIds: ReleaseGateId[];
  gates: ReleaseGateEvidence[];
}

export interface ReleaseReadinessReport extends ReleaseReadiness {
  generatedAt: string;
  canonicalJson: string;
  sha256: string;
  buildProvenanceSha256: string;
}

export interface BuildProvenance {
  productName: string;
  version: string;
  platform: NodeJS.Platform;
  buildRevision: string;
  schemaRevision: number;
  /** Stable across support-packet timestamps; changes when the release line changes. */
  releaseIdentitySha256: string;
  generatedAt: string;
  canonicalJson: string;
  sha256: string;
}

export interface SupportDiagnostics {
  generatedAt: string;
  health: import('./kernel-contracts').OperationalHealthSnapshot;
  readiness: ReleaseReadiness;
  provenance: Pick<BuildProvenance, 'productName' | 'version' | 'platform' | 'buildRevision' | 'schemaRevision' | 'releaseIdentitySha256' | 'generatedAt' | 'sha256'>;
  redactionVersion: 1;
  canonicalJson: string;
  sha256: string;
}
