import { describe, expect, it } from 'vitest';
import { buildDemoHandoffPacket } from './demo-handoff-packet';

describe('demo handoff packet', () => {
  it('contains the complete client-demo map', () => {
    const packet = buildDemoHandoffPacket(new Date('2026-01-01T00:00:00.000Z'));
    expect(packet.product).toContain('EPIC');
    expect(packet.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(packet.modules.length).toBeGreaterThan(10);
    expect(packet.workflows.length).toBeGreaterThan(5);
    expect(packet.providers.length).toBeGreaterThan(4);
  });
});
