import { describe, expect, it } from "vitest";
import { formatBackAtLabel, parseBackInTime } from "../src/back-in.js";
import { resolveStatus } from "../src/scheduler.js";
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
