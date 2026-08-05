/**
 * India business-calendar primitives shared by renderer and domain code.
 *
 * A date-only value (YYYY-MM-DD) is treated as an India business date, never
 * as a browser-local Date. Timestamp strings must carry an explicit UTC/Z or
 * numeric offset, so an ambiguous string cannot silently inherit the user's
 * computer timezone.
 */
export const INDIA_BUSINESS_TIME_ZONE = 'Asia/Kolkata' as const;
export const INDIA_BUSINESS_LOCALE = 'en-IN' as const;

export type IndiaBusinessDateInput = Date | number | string;

interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_LOCAL_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const OFFSET_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i;
const INDIA_STANDARD_OFFSET_MINUTES = 330;
const FORMAT_COMPONENT_KEYS: ReadonlyArray<keyof Intl.DateTimeFormatOptions> = [
  'weekday',
  'era',
  'year',
  'month',
  'day',
  'dayPeriod',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
  'timeZoneName',
];

function assertValidInstant(value: Date | number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('India date helpers require a valid instant.');
  }
  return date;
}

function parseIndiaBusinessDate(value: string): CalendarDateParts {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid India business date: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9_999) {
    throw new RangeError(`Invalid India business date: ${value}`);
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid India business date: ${value}`);
  }

  return { year, month, day };
}

function parseExplicitInstant(value: IndiaBusinessDateInput): Date {
  if (value instanceof Date || typeof value === 'number') {
    return assertValidInstant(value);
  }

  if (DATE_ONLY_PATTERN.test(value)) {
    throw new RangeError('A date-only India business date has no time of day. Use formatIndiaBusinessDate instead.');
  }
  if (!OFFSET_TIMESTAMP_PATTERN.test(value)) {
    throw new RangeError('Timestamp strings must include an explicit UTC or numeric offset.');
  }

  // Validate the written calendar date before Date.parse can normalise an
  // invalid value such as 2026-02-31 into a different calendar day.
  parseIndiaBusinessDate(value.slice(0, 10));
  return assertValidInstant(new Date(value));
}

function indiaDateParts(instant: Date): CalendarDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes): string | undefined => parts.find((candidate) => candidate.type === type)?.value;
  const year = Number(part('year'));
  const month = Number(part('month'));
  const day = Number(part('day'));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError('Unable to resolve the India business date for the supplied instant.');
  }
  return { year, month, day };
}

function dateOnly({ year, month, day }: CalendarDateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function indiaDateTimeParts(instant: Date): CalendarDateParts & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string | undefined => parts.find((candidate) => candidate.type === type)?.value;
  const year = Number(part('year'));
  const month = Number(part('month'));
  const day = Number(part('day'));
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  if (![year, month, day, hour, minute].every(Number.isInteger)) {
    throw new RangeError('Unable to resolve the India business time for the supplied instant.');
  }
  return { year, month, day, hour, minute };
}

function hasFormatComponents(options: Intl.DateTimeFormatOptions): boolean {
  return FORMAT_COMPONENT_KEYS.some((key) => options[key] !== undefined);
}

function indiaFormatOptions(
  options: Intl.DateTimeFormatOptions | undefined,
  defaults: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  const supplied = options ?? {};
  const hasStyle = supplied.dateStyle !== undefined || supplied.timeStyle !== undefined;
  return {
    ...(hasStyle || hasFormatComponents(supplied) ? {} : defaults),
    ...supplied,
    timeZone: INDIA_BUSINESS_TIME_ZONE,
  };
}

/**
 * Returns the current calendar date in Asia/Kolkata, independent of the host
 * computer's timezone. `now` is injectable for deterministic business rules
 * and tests.
 */
export function currentIndiaBusinessDate(now: Date | number = new Date()): string {
  return dateOnly(indiaDateParts(assertValidInstant(now)));
}

/**
 * Resolves either a date-only India business date or an explicit timestamp to
 * its Asia/Kolkata YYYY-MM-DD business date. Ambiguous timestamp strings are
 * rejected rather than interpreted in the browser's local timezone.
 */
export function toIndiaBusinessDate(value: IndiaBusinessDateInput): string {
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    parseIndiaBusinessDate(value);
    return value;
  }
  return dateOnly(indiaDateParts(parseExplicitInstant(value)));
}

/** Formats a YYYY-MM-DD India business date without creating a browser-local Date. */
export function formatIndiaBusinessDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const parts = parseIndiaBusinessDate(value);
  // Noon UTC is always the same business date in Asia/Kolkata. This preserves
  // a date-only value without accidentally crossing a local-time boundary.
  const instant = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  return new Intl.DateTimeFormat(
    INDIA_BUSINESS_LOCALE,
    indiaFormatOptions(options, { day: '2-digit', month: 'short', year: 'numeric' }),
  ).format(instant);
}

/**
 * Formats an instant in Asia/Kolkata. String inputs must include Z or a
 * numeric offset; pass a Date/epoch for an already-resolved instant.
 */
export function formatIndiaDateTime(
  value: IndiaBusinessDateInput,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(
    INDIA_BUSINESS_LOCALE,
    indiaFormatOptions(options, { dateStyle: 'medium', timeStyle: 'short' }),
  ).format(parseExplicitInstant(value));
}

/**
 * Produces the exact `datetime-local` value an India-first form should show.
 * It is deliberately independent of the computer's configured timezone.
 */
export function formatIndiaDateTimeLocal(value: Date | number | string): string {
  const { year, month, day, hour, minute } = indiaDateTimeParts(parseExplicitInstant(value));
  return `${dateOnly({ year, month, day })}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Converts an India wall-clock `datetime-local` value to an explicit UTC
 * instant for persistence. India has a single +05:30 civil offset and no DST,
 * so this conversion cannot inherit browser-local timezone behaviour.
 */
export function parseIndiaDateTimeLocal(value: string): string {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) {
    throw new RangeError('India datetime-local values must use YYYY-MM-DDTHH:mm.');
  }
  const { year, month, day } = parseIndiaBusinessDate(match[1]!);
  const hour = Number(match[2]!);
  const minute = Number(match[3]!);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new RangeError(`Invalid India business time: ${value}`);
  }
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute) - INDIA_STANDARD_OFFSET_MINUTES * 60_000);
  return assertValidInstant(instant).toISOString();
}
