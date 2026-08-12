import { ACTIVE_ARTIFACT_KEY_VERSION } from './artifact-key';
import type { AttachmentVault } from './attachment-vault';
import type { AuthService } from './auth-service';
import type { BusinessDatabase } from './database';
import type { ProviderGatewayService } from './provider-gateway-service';
import type { StatutoryGatewayService } from './statutory-gateway-service';
import type { ArtifactKeyRotationReport } from '../shared/security-contracts';

/**
 * Coordinates the resumable v1-to-v2 envelope migration. Every individual
 * service verifies its plaintext checksum before replacing a record; this
 * coordinator only reports success after re-reading all key-version columns.
 */
export class ArtifactKeyRotationService {
  public constructor(
    private readonly database: BusinessDatabase,
    private readonly providerGateway: ProviderGatewayService,
    private readonly statutoryGateway: StatutoryGatewayService,
    private readonly authService: AuthService,
    private readonly attachmentVault: AttachmentVault,
  ) {}

  public async rotate(actorId: string, now = new Date().toISOString()): Promise<ArtifactKeyRotationReport> {
    const migrated = {
      providerCredentials: this.providerGateway.rewrapCredentialEnvelopes(actorId, ACTIVE_ARTIFACT_KEY_VERSION, now),
      statutoryCredentials: this.statutoryGateway.rewrapCredentialEnvelopes(actorId, ACTIVE_ARTIFACT_KEY_VERSION, now),
      mfaFactors: this.authService.rewrapMfaEnvelopes(actorId, ACTIVE_ARTIFACT_KEY_VERSION, now),
      attachments: await this.attachmentVault.rewrapEnvelopes(ACTIVE_ARTIFACT_KEY_VERSION),
    };
    const remainingLegacy = [
      ...this.database.listProviderSecrets(),
      ...this.database.listStatutoryAdapterSecrets(),
      ...this.database.listMfaFactors(),
      ...this.database.listAllAttachments(),
    ].filter((record) => record.keyVersion !== ACTIVE_ARTIFACT_KEY_VERSION).length;
    return {
      targetVersion: ACTIVE_ARTIFACT_KEY_VERSION,
      migrated,
      remainingLegacy,
      verified: remainingLegacy === 0,
      completedAt: new Date().toISOString(),
    };
  }
}
