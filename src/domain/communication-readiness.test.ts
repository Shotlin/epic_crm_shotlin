import { describe, expect, it } from 'vitest';
import { COMMUNICATION_CHANNELS, recordCommunicationConsent, summarizeCommunicationReadiness } from './communication-readiness';

describe('communication readiness', () => {
  it('summarizes consent and provider gates', () => {
    expect(summarizeCommunicationReadiness()).toMatchObject({ total: 4, ready: 1, sandbox: 1, providerGate: 2, consentPending: 3 });
  });

  it('moves sandbox email to sandbox verification after consent', () => {
    const email = COMMUNICATION_CHANNELS.find(({ channel }) => channel === 'email')!;
    expect(recordCommunicationConsent(email)).toMatchObject({ consentRecorded: true, nextAction: 'verify-sandbox' });
    const inApp = COMMUNICATION_CHANNELS.find(({ channel }) => channel === 'in-app')!;
    expect(recordCommunicationConsent(inApp)).toEqual(inApp);
  });
});
