export interface SessionInfo {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  mustChangePassword: boolean;
}

export interface AuthStatus {
  configured: boolean;
  session: SessionInfo | null;
  /** Whether the current signed-in identity has an active second factor. */
  mfaEnabled?: boolean;
  /** Present only for a workspace intentionally provisioned as clean/sample. */
  workspaceStarterMode?: 'clean' | 'sample';
}

export interface BootstrapOwnerInput {
  email: string;
  displayName: string;
  password: string;
  /**
   * Fresh production workspaces are always clean. Existing workspaces are
   * never converted in place; legacy sample recognition is read-only and is
   * handled by the guarded cleanup flow instead.
   */
  starterMode?: 'clean';
}

export interface LoginInput {
  email: string;
  password: string;
  /** Six-digit TOTP or a one-time recovery code when MFA is enabled. */
  mfaCode?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface MfaStatus {
  enabled: boolean;
  pending: boolean;
}

export interface MfaEnrollment {
  /** Manual-entry secret. It is returned only during the enrollment flow. */
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

export interface DisableMfaInput {
  currentPassword: string;
}
