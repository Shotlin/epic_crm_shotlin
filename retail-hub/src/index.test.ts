import { describe, expect, it } from 'vitest';

import { createRetailHubService } from './index';

describe('Retail Hub public module', () => {
  it('exports the safe HTTP boundary without requiring live credentials or a web server', () => {
    const service = createRetailHubService();

    expect(service.handle({ method: 'GET', url: '/health' })).toMatchObject({
      status: 200,
      body: {
        service: 'epic-bos-retail-hub',
        liveSourceConnected: false,
        writeBackAllowed: false,
      },
    });
  });
});
