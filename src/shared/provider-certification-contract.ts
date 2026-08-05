export type CertificationProviderDomain = 'gsp-irp' | 'banking' | 'payroll' | 'messaging' | 'logistics';

export interface ProviderCertificationHandoff {
  domain: CertificationProviderDomain;
  providerName: string;
  contractReference: string;
  sandboxEvidenceReference: string;
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
