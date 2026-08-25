/**
 * Working time — 04_FLOW_ENGINE.md §4.4.
 *
 * Every duration in Loop is working seconds, computed against the tenant's
 * timezone, working days, quiet hours and public holidays. An item blocked at
 * 17:00 Friday and unblocked at 09:00 Monday waited zero working time; calling
 * that 64 hours destroys the metric's credibility on first read.
 *
 * This is the only implementation. No consumer computes a duration by
 * subtracting two timestamps.
 */

export type TenantTimeSettings = {
  /** IANA zone, e.g. 'Africa/Nairobi'. */
  timezone: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. 0 is accepted as Sunday. */
  workDays: number[];
  /** Local 'HH:MM' (or 'HH:MM:SS'). Work stops here. */
  quietHoursStart: string;
  /** Local 'HH:MM'. Work resumes here. Wraps midnight when end < start. */
  quietHoursEnd: string;
  /** Local 'YYYY-MM-DD' dates from tenant_holidays. Never inferred. */
  holidays?: readonly string[];
};

export type TimeInput = Date | string | number;

const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1440;

/** A span this long is bad data, not a real wait. */
const MAX_DAYS_SPANNED = 40_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

type WallClock = { y: number; m: number; d: number; h: number; mi: number; s: number };

function wallClockIn(ts: number, timeZone: string): WallClock {
  const parts = zoneFormatter(timeZone).formatToParts(new Date(ts));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  return {
    y: read("year"),
    m: read("month"),
    d: read("day"),
    h: read("hour"),
    mi: read("minute"),
    s: read("second"),
  };
}

/** Offset of `timeZone` from UTC at this instant, in ms. */
function zoneOffsetMs(ts: number, timeZone: string): number {
  const w = wallClockIn(ts, timeZone);
  const asIfUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  return asIfUtc - Math.floor(ts / 1000) * 1000;
}

/**
 * Instant at which the tenant's wall clock reads `y-m-d 00:00` plus `minutes`.
 * `minutes` may be 1440 to mean midnight at the end of the day. Two passes so
 * the offset is read at the resulting instant, not the naive guess — matters on
 * DST boundaries.
 */
function wallClockToInstant(
  y: number,
  m: number,
  d: number,
  minutes: number,
  timeZone: string,
): number {
  const naive = Date.UTC(y, m - 1, d) + minutes * 60_000;
  const firstPass = naive - zoneOffsetMs(naive, timeZone);
  return naive - zoneOffsetMs(firstPass, timeZone);
}

function parseMinuteOfDay(value: string, field: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) throw new TypeError(`workingTime: ${field} must be 'HH:MM', got '${value}'`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) throw new TypeError(`workingTime: ${field} out of range: '${value}'`);
  return h * 60 + min;
}

function toInstant(value: TimeInput, field: string): number {
  const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ts)) throw new TypeError(`workingTime: ${field} is not a valid date`);
  return ts;
}

/** Minute-of-day ranges that count as work, given quiet hours. */
function workingWindows(settings: TenantTimeSettings): Array<[number, number]> {
  const start = parseMinuteOfDay(settings.quietHoursStart, "quietHoursStart");
  const end = parseMinuteOfDay(settings.quietHoursEnd, "quietHoursEnd");
  // Equal bounds mean no quiet hours rather than a 24-hour blackout.
  if (start === end) return [[0, MINUTES_PER_DAY]];
  // Typical case: quiet 18:00 → 08:00 wraps midnight, so work is the gap.
  if (start > end) return [[end, start]];
  // Quiet window sits inside the day; work is what is left either side.
  const windows: Array<[number, number]> = [];
  if (start > 0) windows.push([0, start]);
  if (end < MINUTES_PER_DAY) windows.push([end, MINUTES_PER_DAY]);
  return windows;
}

function workDaySet(workDays: number[]): Set<number> {
  const s = new Set<number>();
  for (const d of workDays) s.add(d === 0 ? 7 : d);
  return s;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Working seconds between two instants. Zero when `to` is at or before `from`.
 *
 * @example blocked 17:00 Fri, unblocked 09:00 Mon → 3600 (one hour of Monday)
 */
export function workingSecondsBetween(
  from: TimeInput,
  to: TimeInput,
  settings: TenantTimeSettings,
): number {
  const fromTs = toInstant(from, "from");
  const toTs = toInstant(to, "to");
  if (toTs <= fromTs) return 0;

  const windows = workingWindows(settings);
  const days = workDaySet(settings.workDays);
  if (windows.length === 0 || days.size === 0) return 0;

  const holidays = new Set(settings.holidays ?? []);
  const tz = settings.timezone;

  const fromWall = wallClockIn(fromTs, tz);
  const toWall = wallClockIn(toTs, tz);
  let dayKey = Date.UTC(fromWall.y, fromWall.m - 1, fromWall.d);
  const lastDayKey = Date.UTC(toWall.y, toWall.m - 1, toWall.d);

  if ((lastDayKey - dayKey) / MS_PER_DAY > MAX_DAYS_SPANNED) {
    throw new RangeError(
      `workingTime: span of ${Math.round((lastDayKey - dayKey) / MS_PER_DAY)} days is not a real duration`,
    );
  }

  let totalMs = 0;
  while (dayKey <= lastDayKey) {
    const day = new Date(dayKey);
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();

    if (days.has(isoWeekday) && !holidays.has(`${y}-${pad2(m)}-${pad2(d)}`)) {
      for (const [openMin, closeMin] of windows) {
        const open = wallClockToInstant(y, m, d, openMin, tz);
        const close = wallClockToInstant(y, m, d, closeMin, tz);
        const overlap = Math.min(close, toTs) - Math.max(open, fromTs);
        if (overlap > 0) totalMs += overlap;
      }
    }
    dayKey += MS_PER_DAY;
  }

  return Math.round(totalMs / 1000);
}

/** Working seconds from an instant until now. The waiting register's clock. */
export function workingSecondsSince(
  from: TimeInput,
  settings: TenantTimeSettings,
  now: TimeInput = Date.now(),
): number {
  return workingSecondsBetween(from, now, settings);
}

/** Length of one working day under these settings. */
export function workingSecondsPerDay(settings: TenantTimeSettings): number {
  let minutes = 0;
  for (const [open, close] of workingWindows(settings)) minutes += close - open;
  return minutes * 60;
}

/**
 * Working seconds as working days, for display ("aged 4.2 working days").
 * Rounded to one decimal because a second-precision figure implies a precision
 * the underlying self-reported data does not have.
 */
export function toWorkingDays(workingSeconds: number, settings: TenantTimeSettings): number {
  const perDay = workingSecondsPerDay(settings);
  if (perDay <= 0) return 0;
  return Math.round((workingSeconds / perDay) * 10) / 10;
}
