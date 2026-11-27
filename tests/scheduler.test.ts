import { describe, expect, it } from "vitest";
import { formatBackAtLabel, parseBackInTime } from "../src/back-in.js";
import { findNextOffsetChange, resolveStatus, withDisplayTime } from "../src/scheduler.js";
import type { ManualOverride, WeeklyHours } from "../src/types.js";
import { validateHours } from "../src/validation.js";

const defaultHours: WeeklyHours[] = [
  { day: 0, dayName: "sunday", isOpen: false, openTime: "09:00", closeTime: "17:00" },
  { day: 1, dayName: "monday", isOpen: true, openTime: "09:00", closeTime: "17:00" },
  { day: 2, dayName: "tuesday", isOpen: true, openTime: "09:00", closeTime: "17:00" },
  { day: 3, dayName: "wednesday", isOpen: true, openTime: "09:00", closeTime: "17:00" },
  { day: 4, dayName: "thursday", isOpen: true, openTime: "09:00", closeTime: "17:00" },
  { day: 5, dayName: "friday", isOpen: true, openTime: "09:00", closeTime: "17:00" },
  { day: 6, dayName: "saturday", isOpen: false, openTime: "09:00", closeTime: "17:00" },
];

describe("parseBackInTime", () => {
  it("parses 12-hour and 24-hour return times in the studio timezone", () => {
    const now = new Date("2026-06-17T17:00:00.000Z");

    expect(parseBackInTime("2:30 PM", "America/Vancouver", now).toISOString()).toBe(
      "2026-06-17T21:30:00.000Z",
    );
    expect(parseBackInTime("14:30", "America/Vancouver", now).toISOString()).toBe(
      "2026-06-17T21:30:00.000Z",
    );
  });

  it("rolls to the next day when the return time has already passed", () => {
    const now = new Date("2026-06-17T23:30:00.000Z");

    expect(parseBackInTime("2:30 PM", "America/Vancouver", now).toISOString()).toBe(
      "2026-06-18T21:30:00.000Z",
    );
  });

  it("parses minute and hour durations from now", () => {
    const now = new Date("2026-06-17T17:00:00.000Z");

    expect(parseBackInTime("30 minutes", "America/Vancouver", now).toISOString()).toBe(
      "2026-06-17T17:30:00.000Z",
    );
    expect(parseBackInTime("2 hours", "America/Vancouver", now).toISOString()).toBe(
      "2026-06-17T19:00:00.000Z",
    );
    expect(parseBackInTime("in 45 min", "America/Vancouver", now).toISOString()).toBe(
      "2026-06-17T17:45:00.000Z",
    );
    expect(parseBackInTime("1h 30m", "America/Vancouver", now).toISOString()).toBe(
      "2026-06-17T18:30:00.000Z",
    );
  });
});

describe("formatBackAtLabel", () => {
  it("formats a return time for display", () => {
    expect(formatBackAtLabel("2026-06-17T21:30:00.000Z", "America/Vancouver")).toMatch(
      /2:30\s*p\.?m\.?/i,
    );
  });
});

describe("resolveStatus", () => {
  it("uses the Vancouver weekly schedule during open hours", () => {
    const status = resolveStatus(
      defaultHours,
      "America/Vancouver",
      null,
      new Date("2026-06-17T17:00:00.000Z"),
    );

    expect(status.state).toBe("open");
    expect(status.source).toBe("schedule");
    expect(status.nextChange).toBe("2026-06-18T00:00:00.000Z");
  });

  it("returns closed outside hours with the next open time", () => {
    const status = resolveStatus(
      defaultHours,
      "America/Vancouver",
      null,
      new Date("2026-06-18T01:00:00.000Z"),
    );

    expect(status.state).toBe("closed");
    expect(status.nextChange).toBe("2026-06-18T16:00:00.000Z");
  });

  it("keeps Friday closing through the closed weekend", () => {
    const status = resolveStatus(
      defaultHours,
      "America/Vancouver",
      null,
      new Date("2026-06-20T00:30:00.000Z"),
    );

    expect(status.state).toBe("closed");
    expect(status.nextChange).toBe("2026-06-22T16:00:00.000Z");
  });

  it("lets a manual override win over the schedule", () => {
    const override: ManualOverride = {
      state: "closed",
      message: "Back at 2pm",
      backAt: null,
      updatedAt: "2026-06-17T16:30:00.000Z",
      updatedBy: "tester",
    };
    const status = resolveStatus(
      defaultHours,
      "America/Vancouver",
      override,
      new Date("2026-06-17T17:00:00.000Z"),
    );

    expect(status).toEqual({
      state: "closed",
      message: "Back at 2pm",
      source: "override",
    });
  });

  it("returns a back-in override with a prominent return time", () => {
    const override: ManualOverride = {
      state: "closed",
      message: null,
      backAt: "2026-06-17T21:30:00.000Z",
      updatedAt: "2026-06-17T16:30:00.000Z",
      updatedBy: "tester",
    };
    const status = resolveStatus(
      defaultHours,
      "America/Vancouver",
      override,
      new Date("2026-06-17T17:00:00.000Z"),
    );

    expect(status).toEqual({
      state: "closed",
      backAt: "2026-06-17T21:30:00.000Z",
      source: "override",
    });
  });

  it("expires a back-in override after the return time passes", () => {
    const override: ManualOverride = {
      state: "closed",
      message: null,
      backAt: "2026-06-17T21:30:00.000Z",
      updatedAt: "2026-06-17T16:30:00.000Z",
      updatedBy: "tester",
    };
    const status = resolveStatus(
      defaultHours,
      "America/Vancouver",
      override,
      new Date("2026-06-17T22:00:00.000Z"),
    );

    expect(status.state).toBe("open");
    expect(status.source).toBe("schedule");
  });
});

describe("validateHours", () => {
  it("rejects invalid or backwards time ranges", () => {
    expect(() => validateHours("9:00", "17:00")).toThrow(/HH:mm/);
    expect(() => validateHours("17:00", "09:00")).toThrow(/after open/);
  });
});

describe("withDisplayTime", () => {
  it("reports the studio offset from the IANA zone, including DST", () => {
    const winter = withDisplayTime(
      { state: "open", source: "schedule" },
      "America/Vancouver",
      new Date("2025-12-01T21:50:00.000Z"),
    );
    expect(winter.utcOffsetMinutes).toBe(-480);
    expect(winter.timezone).toBe("America/Vancouver");
    expect(winter.serverTime).toBe("2025-12-01T21:50:00.000Z");

    const summer = withDisplayTime(
      { state: "open", source: "schedule" },
      "America/Vancouver",
      new Date("2026-06-17T17:00:00.000Z"),
    );
    expect(summer.utcOffsetMinutes).toBe(-420);
  });

  it("switches offset at the DST boundary", () => {
    // 2026-03-08 02:00 PST -> 03:00 PDT (10:00 UTC).
    const before = withDisplayTime(
      { state: "closed", source: "schedule" },
      "America/Vancouver",
      new Date("2026-03-08T09:59:00.000Z"),
    );
    const after = withDisplayTime(
      { state: "closed", source: "schedule" },
      "America/Vancouver",
      new Date("2026-03-08T10:00:00.000Z"),
    );
    expect(before.utcOffsetMinutes).toBe(-480);
    expect(after.utcOffsetMinutes).toBe(-420);
  });

  it("keeps BC on UTC-7 after the November 2026 switch to permanent daylight time", () => {
    // tzdata 2026e: America/Vancouver stays at UTC-7 from 2026-11-01 instead of
    // falling back to UTC-8. America/Los_Angeles still falls back.
    const now = new Date("2026-11-27T21:50:00.000Z");
    expect(withDisplayTime({ state: "open", source: "schedule" }, "America/Vancouver", now).utcOffsetMinutes).toBe(-420);
    expect(withDisplayTime({ state: "open", source: "schedule" }, "America/Los_Angeles", now).utcOffsetMinutes).toBe(-480);
  });

  it("adds studio-local labels for back-at and next-change times", () => {
    const status = withDisplayTime(
      {
        state: "closed",
        source: "schedule",
        backAt: "2026-12-01T22:30:00.000Z",
        nextChange: "2026-12-07T16:00:00.000Z",
      },
      "America/Vancouver",
      new Date("2026-12-01T21:50:00.000Z"),
    );
    expect(status.backAtLabel).toBe(formatBackAtLabel("2026-12-01T22:30:00.000Z", "America/Vancouver"));
    expect(status.backAtLabel).toMatch(/^3:30\s?p\.m\.$/);
    expect(status.nextChangeLabel).toMatch(/^Monday 9:00\s?AM$/);
  });
});

describe("findNextOffsetChange", () => {
  it("finds the next DST switch to the minute", () => {
    const change = findNextOffsetChange("America/Los_Angeles", new Date("2027-02-01T00:00:00.000Z"));
    expect(change?.at.toISOString()).toBe("2027-03-14T10:00:00.000Z");
    expect(change?.offsetMinutes).toBe(-420);
  });

  it("returns null once BC is on permanent UTC-7", () => {
    // Nov 1 2026 changes the abbreviation (PDT -> MST) but not the offset.
    expect(findNextOffsetChange("America/Vancouver", new Date("2026-10-01T00:00:00.000Z"))).toBeNull();
    expect(findNextOffsetChange("America/Vancouver", new Date("2027-01-01T00:00:00.000Z"))).toBeNull();
  });
});
