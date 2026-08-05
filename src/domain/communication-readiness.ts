export type CommunicationChannel = 'email' | 'sms' | 'whatsapp' | 'in-app';
export type CommunicationReadiness = 'ready' | 'sandbox' | 'provider-gate';

export interface CommunicationChannelAssessment {
  channel: CommunicationChannel;
  label: string;
  readiness: CommunicationReadiness;
  consentRequired: boolean;
  consentRecorded: boolean;
  provider: string;
  nextAction: 'record-consent' | 'verify-sandbox' | 'certify-provider' | 'ready';
}

export const COMMUNICATION_CHANNELS: readonly CommunicationChannelAssessment[] = [
  { channel: 'email', label: 'Email', readiness: 'sandbox', consentRequired: true, consentRecorded: false, provider: 'SMTP / transactional provider', nextAction: 'record-consent' },
  { channel: 'sms', label: 'SMS / DLT', readiness: 'provider-gate', consentRequired: true, consentRecorded: false, provider: 'DLT-registered sender', nextAction: 'certify-provider' },
  { channel: 'whatsapp', label: 'WhatsApp Business', readiness: 'provider-gate', consentRequired: true, consentRecorded: false, provider: 'WhatsApp Business API', nextAction: 'certify-provider' },
  { channel: 'in-app', label: 'In-app notifications', readiness: 'ready', consentRequired: false, consentRecorded: true, provider: 'Local Electron shell', nextAction: 'ready' },
];

export function summarizeCommunicationReadiness(channels: readonly CommunicationChannelAssessment[] = COMMUNICATION_CHANNELS): { total: number; ready: number; sandbox: number; providerGate: number; consentPending: number } {
  return { total: channels.length, ready: channels.filter(({ readiness }) => readiness === 'ready').length, sandbox: channels.filter(({ readiness }) => readiness === 'sandbox').length, providerGate: channels.filter(({ readiness }) => readiness === 'provider-gate').length, consentPending: channels.filter(({ consentRequired, consentRecorded }) => consentRequired && !consentRecorded).length };
}

export function recordCommunicationConsent(channel: CommunicationChannelAssessment): CommunicationChannelAssessment {
  if (!channel.consentRequired || channel.consentRecorded) return channel;
  return { ...channel, consentRecorded: true, nextAction: channel.readiness === 'sandbox' ? 'verify-sandbox' : channel.nextAction };
}
