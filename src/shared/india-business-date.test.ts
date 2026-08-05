import { describe, expect, it } from 'vitest';
import {
  INDIA_BUSINESS_TIME_ZONE,
  currentIndiaBusinessDate,
  formatIndiaBusinessDate,
  formatIndiaDateTime,
  formatIndiaDateTimeLocal,
  parseIndiaDateTimeLocal,
  toIndiaBusinessDate,
} from './india-business-date';

describe('India business date helpers', () => {
  it('uses Asia/Kolkata rather than the host timezone at the UTC-to-IST midnight boundary', () => {
    expect(INDIA_BUSINESS_TIME_ZONE).toBe('Asia/Kolkata');
    expect(currentIndiaBusinessDate(new Date('2026-07-20T18:29:59.999Z'))).toBe('2026-07-20');
    expect(currentIndiaBusinessDate(new Date('2026-07-20T18:30:00.000Z'))).toBe('2026-07-21');
    expect(toIndiaBusinessDate('2026-07-20T18:30:00.000Z')).toBe('2026-07-21');
    expect(toIndiaBusinessDate('2026-07-21T00:00:00+05:30')).toBe('2026-07-21');
  });

  it('keeps valid date-only India business dates stable and validates their calendar values', () => {
    expect(toIndiaBusinessDate('2028-02-29')).toBe('2028-02-29');
    expect(formatIndiaBusinessDate('2026-07-21')).toContain('21 Jul 2026');
    expect(() => toIndiaBusinessDate('2026-02-29')).toThrow('Invalid India business date');
    expect(() => formatIndiaBusinessDate('2026-13-01')).toThrow('Invalid India business date');
  });

  it('formats instants in India and refuses ambiguous browser-local timestamp strings', () => {
    const formatted = formatIndiaDateTime('2026-07-20T18:30:00.000Z', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false,
    });

    expect(formatted).toContain('21 Jul 2026');
    expect(formatted).toContain('00:00');
    expect(() => formatIndiaDateTime('2026-07-20T18:30:00')).toThrow('explicit UTC or numeric offset');
    expect(() => formatIndiaDateTime('2026-07-21')).toThrow('date-only India business date has no time of day');
    expect(() => toIndiaBusinessDate('2026-02-31T18:30:00.000Z')).toThrow('Invalid India business date');
  });

  it('round-trips India wall-clock form values without borrowing the host timezone', () => {
    expect(formatIndiaDateTimeLocal('2026-07-20T18:30:00.000Z')).toBe('2026-07-21T00:00');
    expect(parseIndiaDateTimeLocal('2026-07-21T00:00')).toBe('2026-07-20T18:30:00.000Z');
    expect(() => parseIndiaDateTimeLocal('2026-02-29T09:00')).toThrow('Invalid India business date');
    expect(() => parseIndiaDateTimeLocal('2026-07-21T24:00')).toThrow('Invalid India business time');
    expect(() => parseIndiaDateTimeLocal('2026-07-21 09:00')).toThrow('datetime-local');
  });
});
