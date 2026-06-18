import cron from "node-cron";
import type { SignStore } from "./db.js";
import type { ManualOverride, ResolvedStatus, StatusState, WeeklyHours } from "./types.js";
import { DAY_NAMES } from "./types.js";
import { timeToMinutes } from "./validation.js";

interface LocalDateParts {
  dayIndex: number;
  hour: number;
  minute: number;
}

export function resolveStatus(
  hours: WeeklyHours[],
  timezone: string,
  manualOverride: ManualOverride | null,
  now = new Date(),
): ResolvedStatus {
  if (manualOverride) {
    return {
      state: manualOverride.state,
      ...(manualOverride.message ? { message: manualOverride.message } : {}),
      source: "override",
    };
  }

  const state = getScheduledState(hours, timezone, now);
  const nextChangeDate = findNextScheduledChange(hours, timezone, now, state);

  return {
    state,
    message: buildScheduleMessage(state, nextChangeDate, timezone),
    source: "schedule",
    ...(nextChangeDate ? { nextChange: nextChangeDate.toISOString() } : {}),
  };
}

export function getResolvedStatus(store: SignStore, fallbackTimezone: string): ResolvedStatus {
  return resolveStatus(
    store.getWeeklyHours(),
    store.getTimezone(fallbackTimezone),
    store.getManualOverride(),
  );
}

export function startScheduler(store: SignStore, fallbackTimezone: string): void {
  cron.schedule("* * * * *", () => {
    // Status is resolved on demand; this periodic pass catches bad config early.
    getResolvedStatus(store, fallbackTimezone);
  });
}

export function getScheduledState(
  hours: WeeklyHours[],
  timezone: string,
  date: Date,
): StatusState {
  const parts = getLocalDateParts(date, timezone);
  const dayHours = hours.find((entry) => entry.day === parts.dayIndex);

  if (!dayHours?.isOpen) {
    return "closed";
  }

  const currentMinutes = parts.hour * 60 + parts.minute;
  return currentMinutes >= timeToMinutes(dayHours.openTime) &&
    currentMinutes < timeToMinutes(dayHours.closeTime)
    ? "open"
    : "closed";
}

export function findNextScheduledChange(
  hours: WeeklyHours[],
  timezone: string,
  now: Date,
  currentState = getScheduledState(hours, timezone, now),
): Date | null {
  const start = roundUpToNextMinute(now);
  const maxMinutesToScan = 8 * 24 * 60;

  for (let offset = 0; offset <= maxMinutesToScan; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 60_000);
    if (getScheduledState(hours, timezone, candidate) !== currentState) {
      return candidate;
    }
  }

  return null;
}

function getLocalDateParts(date: Date, timezone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayIndex = DAY_NAMES.indexOf(values.weekday?.toLowerCase() as (typeof DAY_NAMES)[number]);

  if (dayIndex === -1 || values.hour === undefined || values.minute === undefined) {
    throw new Error(`Unable to calculate local time in timezone "${timezone}".`);
  }

  return {
    dayIndex,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function roundUpToNextMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000 + 60_000);
}

function buildScheduleMessage(
  state: StatusState,
  nextChangeDate: Date | null,
  timezone: string,
): string | undefined {
  if (!nextChangeDate) {
    return undefined;
  }

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(nextChangeDate);

  return state === "open" ? `Open until ${formatted}` : `Opens ${formatted}`;
}
