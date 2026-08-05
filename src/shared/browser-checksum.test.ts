import { describe, expect, it } from 'vitest';
import { browserChecksum } from './browser-checksum';

describe('browser checksum', () => {
  it('is deterministic and browser-safe', () => {
    expect(browserChecksum('EPIC')).toBe(browserChecksum('EPIC'));
    expect(browserChecksum('EPIC')).not.toBe(browserChecksum('epic'));
  });

  it('returns a stable non-empty fingerprint for structured payloads', () => {
    const value = browserChecksum(JSON.stringify({ company: 'northstar', branch: 'blr' }));
    expect(value).toMatch(/^[0-9a-f]{16}$/);
  });
});
