import type { OperatingRecordScope } from './revenue-ops-contracts';
import type {
  RetailDeviceAcknowledgementSource,
  RetailDeviceConnection,
  RetailDeviceTransportCommand,
  RetailPhysicalDeviceKind,
} from './retail-device-transport-contracts';

/**
 * Describes the boundary that has actually been implemented for a device
 * profile. It deliberately does not imply a native driver is installed.
 */
export type RetailDeviceDriverBoundary =
  | 'native-driver-required'
  | 'web-serial-diagnostic-only'
  | 'web-bluetooth-diagnostic-only'
  | 'network-tcp-boundary'
  | 'manual-evidence-only';

export type RetailDeviceCapability =
  | 'barcode-input'
  | 'receipt-print'
  | 'drawer-pulse'
  | 'weight-read'
  | 'status-read';

export type RetailDeviceAdapterProfileStatus =
  | 'draft'
  | 'approved'
  | 'acknowledged'
  | 'operational'
  | 'suspended';

export interface RetailDeviceDriverDescriptor {
  code: string;
  version: string;
  /**
   * The precise integration boundary. USB and Bluetooth remain driver-gated;
   * Web Serial and Web Bluetooth paths are bounded diagnostics, not native
   * drivers or production activation.
  */
  boundary: RetailDeviceDriverBoundary;
  /** SHA-256-verifiable Ed25519 public key used by a future native bridge. */
  attestationPublicKeyPem?: string;
}

export type RetailDeviceProfileConfiguration =
  | {
      connection: 'usb';
      vendorId: string;
      productId: string;
      serialNumber?: string;
      baudRate?: number;
    }
  | {
      connection: 'bluetooth';
      serviceUuid: string;
      characteristicUuid?: string;
      deviceAddress?: string;
    }
  | {
      connection: 'network';
      host: string;
      port: number;
    }
  | {
      connection: 'manual';
      procedureReference: string;
    };

export interface RetailDeviceAdapterProfile {
  id: string;
  code: string;
  name: string;
  kind: RetailPhysicalDeviceKind;
  deviceCode: string;
  connection: RetailDeviceConnection;
  driver: RetailDeviceDriverDescriptor;
  capabilities: RetailDeviceCapability[];
  configuration: RetailDeviceProfileConfiguration;
  configurationChecksum: string;
  status: RetailDeviceAdapterProfileStatus;
  createdBy: string;
  createdAt: string;
  approvalEvidenceReference?: string;
  approvedBy?: string;
  approvedAt?: string;
  acknowledgementEvidenceId?: string;
  acknowledgementEvidenceReference?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  activatedBy?: string;
  activatedAt?: string;
  suspendedBy?: string;
  suspendedAt?: string;
  suspensionReason?: string;
  scope?: OperatingRecordScope;
  version: number;
}

export interface CreateRetailDeviceAdapterProfileInput {
  code: string;
  name: string;
  kind: RetailPhysicalDeviceKind;
  deviceCode: string;
  connection: RetailDeviceConnection;
  driver: RetailDeviceDriverDescriptor;
  capabilities: readonly RetailDeviceCapability[];
  configuration: RetailDeviceProfileConfiguration;
}

export interface ApproveRetailDeviceAdapterProfileInput {
  id: string;
  evidenceReference: string;
  expectedVersion: number;
}

export interface RecordRetailDeviceAdapterAcknowledgementInput {
  id: string;
  deviceAcknowledgementId: string;
  evidenceReference: string;
  expectedVersion: number;
}

export interface ActivateRetailDeviceAdapterProfileInput {
  id: string;
  expectedVersion: number;
}

export interface SuspendRetailDeviceAdapterProfileInput {
  id: string;
  reason: string;
  expectedVersion: number;
}

export interface RetailDeviceAdapterReadiness {
  profileId: string;
  status:
    | 'awaiting-approval'
    | 'awaiting-device-acknowledgement'
    | 'acknowledged'
    | 'operational'
    | 'suspended';
  operational: boolean;
  driverBoundary: RetailDeviceDriverBoundary;
  acknowledgementSource?: RetailDeviceAcknowledgementSource;
  nextAction: string;
}

export const RETAIL_DEVICE_PRIMARY_CAPABILITY: Readonly<Record<RetailPhysicalDeviceKind, RetailDeviceCapability>> = {
  'barcode-scanner': 'barcode-input',
  'escpos-printer': 'receipt-print',
  'cash-drawer': 'drawer-pulse',
  'weighing-scale': 'weight-read',
};

export const RETAIL_DEVICE_COMMAND_BY_KIND: Readonly<Record<RetailPhysicalDeviceKind, RetailDeviceTransportCommand>> = {
  'barcode-scanner': 'scan',
  'escpos-printer': 'print',
  'cash-drawer': 'open-drawer',
  'weighing-scale': 'read-weight',
};
