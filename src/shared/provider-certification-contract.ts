export type CertificationProviderDomain = 'gsp-irp' | 'banking' | 'payroll' | 'messaging' | 'logistics';

export interface ProviderCertificationHandoff {
  domain: CertificationProviderDomain;
  providerName: string;
  contractReference: string;
  sandboxEvidenceReference: string;
  /** Monotonic vault credential generation used to produce this evidence. */
  credentialRevision: number;
  productionApprovalReference?: string;
  credentialOwner: string;
  independentApprover?: string;
  testCaseReferences: string[];
}

export interface ProviderCertificationValidation {
  readyForSandbox: boolean;
  readyForProduction: boolean;
  missing: string[];
}

export interface ProviderCertificationPackage extends ProviderCertificationHandoff {
  generatedAt: string;
  generatedBy: string;
  readyForSandbox: boolean;
  readyForProduction: boolean;
  missing: string[];
  checksum: string;
}

export interface ProviderCertificationExportReceipt {
  filePath: string;
  checksum: string;
  readyForSandbox: boolean;
  readyForProduction: boolean;
  exportedAt: string;
}

/** Safe result returned when a handoff package is checked without importing it. */
export interface ProviderCertificationPackageVerification {
  valid: boolean;
  declaredChecksum: string;
  computedChecksum?: string;
  credentialRevision?: number;
  readyForSandbox?: boolean;
  readyForProduction?: boolean;
  missing: string[];
  errors: string[];
}

export interface ProviderCertificationPackageVerificationReceipt extends ProviderCertificationPackageVerification {
  filePath: string;
  verifiedAt: string;
}
