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
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
