import { describe, expect, it } from "vitest";
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
});

describe("validateHours", () => {
  it("rejects invalid or backwards time ranges", () => {
    expect(() => validateHours("9:00", "17:00")).toThrow(/HH:mm/);
    expect(() => validateHours("17:00", "09:00")).toThrow(/after open/);
  });
});
