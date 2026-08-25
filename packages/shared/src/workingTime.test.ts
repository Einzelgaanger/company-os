import { describe, expect, it } from "vitest";
import {
  workingSecondsBetween,
  workingSecondsSince,
  workingSecondsPerDay,
  toWorkingDays,
  type TenantTimeSettings,
} from "./workingTime.js";

const HOUR = 3600;

/** tenant_settings defaults from 0001_init.sql. */
const nairobi: TenantTimeSettings = {
  timezone: "Africa/Nairobi",
  workDays: [1, 2, 3, 4, 5],
  quietHoursStart: "18:00",
  quietHoursEnd: "08:00",
};

/** The §4.4 example's tenant: a 09:00–17:00 day. */
const nineToFive: TenantTimeSettings = {
  ...nairobi,
  quietHoursStart: "17:00",
  quietHoursEnd: "09:00",
};

// 2026-08-21 is a Friday; 08-22/23 the weekend; 08-24 a Monday.
const friday1700 = "2026-08-21T17:00:00+03:00";
const monday0900 = "2026-08-24T09:00:00+03:00";

describe("workingSecondsBetween §4.4", () => {
  it("counts zero across a weekend outside working hours", () => {
    expect(workingSecondsBetween(friday1700, monday0900, nineToFive)).toBe(0);
  });

  it("counts only the open hours either side of the same weekend", () => {
    // Fri 17:00→18:00 plus Mon 08:00→09:00 under the default 08:00–18:00 day.
    expect(workingSecondsBetween(friday1700, monday0900, nairobi)).toBe(2 * HOUR);
  });

  it("measures a span inside one working day", () => {
    expect(
      workingSecondsBetween(
        "2026-08-25T09:00:00+03:00",
        "2026-08-25T11:30:00+03:00",
        nairobi,
      ),
    ).toBe(2.5 * HOUR);
  });

  it("excludes quiet hours in the middle of a span", () => {
    // Tue 16:00→18:00 = 2h, Wed 08:00→10:00 = 2h.
    expect(
      workingSecondsBetween(
        "2026-08-25T16:00:00+03:00",
        "2026-08-26T10:00:00+03:00",
        nairobi,
      ),
    ).toBe(4 * HOUR);
  });

  it("counts zero entirely inside quiet hours", () => {
    expect(
      workingSecondsBetween(
        "2026-08-25T06:00:00+03:00",
        "2026-08-25T07:00:00+03:00",
        nairobi,
      ),
    ).toBe(0);
  });

  it("returns zero when end is at or before start", () => {
    expect(workingSecondsBetween(monday0900, monday0900, nairobi)).toBe(0);
    expect(workingSecondsBetween(monday0900, friday1700, nairobi)).toBe(0);
  });

  it("skips public holidays", () => {
    const withHoliday: TenantTimeSettings = {
      ...nairobi,
      holidays: ["2026-08-25"],
    };
    const from = "2026-08-25T08:00:00+03:00";
    const to = "2026-08-25T18:00:00+03:00";
    expect(workingSecondsBetween(from, to, nairobi)).toBe(10 * HOUR);
    expect(workingSecondsBetween(from, to, withHoliday)).toBe(0);
  });

  it("honours the tenant's working days", () => {
    // Saturday 2026-08-22, 09:00→17:00.
    const from = "2026-08-22T09:00:00+03:00";
    const to = "2026-08-22T17:00:00+03:00";
    expect(workingSecondsBetween(from, to, nairobi)).toBe(0);
    expect(workingSecondsBetween(from, to, { ...nairobi, workDays: [1, 2, 3, 4, 5, 6] })).toBe(
      8 * HOUR,
    );
  });

  it("accepts 0 as Sunday alongside ISO 7", () => {
    const sunday = { from: "2026-08-23T09:00:00+03:00", to: "2026-08-23T12:00:00+03:00" };
    expect(workingSecondsBetween(sunday.from, sunday.to, { ...nairobi, workDays: [0] })).toBe(
      3 * HOUR,
    );
    expect(workingSecondsBetween(sunday.from, sunday.to, { ...nairobi, workDays: [7] })).toBe(
      3 * HOUR,
    );
  });

  it("reads the clock in the tenant's timezone, not the server's", () => {
    const from = "2026-08-24T06:00:00Z";
    const to = "2026-08-24T08:00:00Z";
    // 09:00–11:00 in Nairobi: both hours are working.
    expect(workingSecondsBetween(from, to, nairobi)).toBe(2 * HOUR);
    // 07:00–09:00 in London (BST): only the second hour is.
    expect(workingSecondsBetween(from, to, { ...nairobi, timezone: "Europe/London" })).toBe(HOUR);
  });

  it("does not drift across a DST transition", () => {
    // Mon 2026-03-23 00:00 → Sat 2026-04-04 00:00 London, spanning the
    // 2026-03-29 spring forward. Ten working days, no lost or gained hour.
    const london: TenantTimeSettings = { ...nairobi, timezone: "Europe/London" };
    expect(workingSecondsBetween("2026-03-23T00:00:00Z", "2026-04-03T23:00:00Z", london)).toBe(
      10 * 10 * HOUR,
    );
  });

  it("supports quiet hours that do not wrap midnight", () => {
    const lunchOnly: TenantTimeSettings = {
      ...nairobi,
      quietHoursStart: "12:00",
      quietHoursEnd: "13:00",
    };
    expect(
      workingSecondsBetween(
        "2026-08-25T11:00:00+03:00",
        "2026-08-25T14:00:00+03:00",
        lunchOnly,
      ),
    ).toBe(2 * HOUR);
  });

  it("treats equal quiet bounds as no quiet hours", () => {
    const alwaysOn: TenantTimeSettings = {
      ...nairobi,
      quietHoursStart: "00:00",
      quietHoursEnd: "00:00",
    };
    expect(workingSecondsPerDay(alwaysOn)).toBe(24 * HOUR);
  });

  it("returns zero when no day is a working day", () => {
    expect(workingSecondsBetween(friday1700, monday0900, { ...nairobi, workDays: [] })).toBe(0);
  });

  it("rejects malformed settings and dates", () => {
    expect(() => workingSecondsBetween(friday1700, monday0900, { ...nairobi, quietHoursStart: "6pm" })).toThrow(
      /quietHoursStart/,
    );
    expect(() => workingSecondsBetween("not-a-date", monday0900, nairobi)).toThrow(/valid date/);
  });

  it("rejects a span that cannot be a real duration", () => {
    expect(() => workingSecondsBetween("0001-01-01T00:00:00Z", monday0900, nairobi)).toThrow(
      RangeError,
    );
  });

  it("accepts Date, ISO string and epoch millis alike", () => {
    const from = new Date("2026-08-24T09:00:00+03:00");
    const to = new Date("2026-08-24T10:00:00+03:00");
    expect(workingSecondsBetween(from, to, nairobi)).toBe(HOUR);
    expect(workingSecondsBetween(from.toISOString(), to.getTime(), nairobi)).toBe(HOUR);
  });
});

describe("workingSecondsSince", () => {
  it("clocks a wait against an explicit now", () => {
    expect(workingSecondsSince("2026-08-24T09:00:00+03:00", nairobi, monday0900)).toBe(0);
    expect(workingSecondsSince("2026-08-24T08:00:00+03:00", nairobi, monday0900)).toBe(HOUR);
  });
});

describe("working day conversion", () => {
  it("derives day length from the quiet-hours window", () => {
    expect(workingSecondsPerDay(nairobi)).toBe(10 * HOUR);
    expect(workingSecondsPerDay(nineToFive)).toBe(8 * HOUR);
  });

  it("reports the §4.1 example as 4.2 working days", () => {
    expect(toWorkingDays(42 * HOUR, nairobi)).toBe(4.2);
  });

  it("is safe when there is no working window", () => {
    const noWindow: TenantTimeSettings = {
      ...nairobi,
      quietHoursStart: "00:00",
      quietHoursEnd: "24:00",
    };
    expect(workingSecondsPerDay(noWindow)).toBe(0);
    expect(toWorkingDays(HOUR, noWindow)).toBe(0);
  });
});
