import { z } from 'zod';

const recordIdSchema = z.string().trim().min(1).max(100);

const retailDeviceKindSchema = z.enum([
  'barcode-scanner',
  'escpos-printer',
  'cash-drawer',
  'weighing-scale',
]);

const retailDeviceConnectionSchema = z.enum([
  'usb',
  'network',
  'bluetooth',
  'manual',
]);

const retailDeviceCommandSchema = z.enum([
  'scan',
  'print',
  'open-drawer',
  'read-weight',
]);

const retailDeviceDriverSchema = z.object({
  code: z.string().trim().min(2).max(64),
  version: z.string().trim().min(1).max(40),
  boundary: z.enum([
    'native-driver-required',
    'web-serial-diagnostic-only',
    'web-bluetooth-diagnostic-only',
    'network-tcp-boundary',
    'manual-evidence-only',
  ]),
  attestationPublicKeyPem: z.string().trim().min(80).max(4096).optional(),
}).strict();

const retailDeviceProfileConfigurationSchema = z.discriminatedUnion('connection', [
  z.object({
    connection: z.literal('usb'),
    vendorId: z.string().trim().min(1).max(16),
    productId: z.string().trim().min(1).max(16),
    serialNumber: z.string().trim().min(1).max(80).optional(),
    baudRate: z.number().int().min(300).max(3_000_000).optional(),
  }).strict(),
  z.object({
    connection: z.literal('bluetooth'),
    serviceUuid: z.string().trim().min(4).max(36),
    characteristicUuid: z.string().trim().min(4).max(36).optional(),
    deviceAddress: z.string().trim().min(1).max(17).optional(),
  }).strict(),
  z.object({
    connection: z.literal('network'),
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65_535),
  }).strict(),
  z.object({
    connection: z.literal('manual'),
    procedureReference: z.string().trim().min(4).max(240),
  }).strict(),
]);

/**
 * Renderer input schemas for the adapter registry. They contain metadata and
 * evidence references only; they never accept native handles, raw device
 * credentials, pairing tokens, or driver binaries.
 */
export const createRetailDeviceAdapterProfileIpcSchema = z.object({
  code: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(180),
  kind: retailDeviceKindSchema,
  deviceCode: z.string().trim().min(2).max(64),
  connection: retailDeviceConnectionSchema,
  driver: retailDeviceDriverSchema,
  capabilities: z.array(z.enum([
    'barcode-input',
    'receipt-print',
    'drawer-pulse',
    'weight-read',
    'status-read',
  ])).min(1).max(2),
  configuration: retailDeviceProfileConfigurationSchema,
}).strict().superRefine((input, context) => {
  if (input.connection !== input.configuration.connection) {
    context.addIssue({
      code: 'custom',
      path: ['configuration', 'connection'],
      message: 'Device configuration connection must match the selected transport.',
    });
  }
});

export const approveRetailDeviceAdapterProfileIpcSchema = z.object({
  id: recordIdSchema,
  evidenceReference: z.string().trim().min(4).max(240),
  expectedVersion: z.number().int().positive(),
}).strict();

export const recordRetailDeviceAdapterAcknowledgementIpcSchema = z.object({
  id: recordIdSchema,
  deviceAcknowledgementId: recordIdSchema,
  evidenceReference: z.string().trim().min(4).max(240),
  expectedVersion: z.number().int().positive(),
}).strict();

export const activateRetailDeviceAdapterProfileIpcSchema = z.object({
  id: recordIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();

export const suspendRetailDeviceAdapterProfileIpcSchema = z.object({
  id: recordIdSchema,
  reason: z.string().trim().min(8).max(500),
  expectedVersion: z.number().int().positive(),
}).strict();

/**
 * Keeps the profile/version binding intact when a command is prepared. The
 * transport domain decides whether the referenced profile is approved and
 * compatible; the renderer cannot add any extra native-device fields.
 */
export const prepareRetailDeviceTransportIpcSchema = z.object({
  profileId: recordIdSchema.optional(),
  kind: retailDeviceKindSchema,
  deviceCode: z.string().trim().min(2).max(80),
  connection: retailDeviceConnectionSchema,
  command: retailDeviceCommandSchema,
  payload: z.string().trim().min(1).max(20_000),
}).strict().superRefine((input, context) => {
  if (input.connection === 'network' && !input.profileId) {
    context.addIssue({
      code: 'custom',
      path: ['profileId'],
      message: 'A network device command must name its approved device adapter profile.',
    });
  }
});
