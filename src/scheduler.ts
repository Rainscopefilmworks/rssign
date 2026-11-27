import cron from "node-cron";
import type { SignStore } from "./db.js";
import { formatBackAtLabel, getTimezoneOffsetMs } from "./back-in.js";
import type {
  DisplayStatus,
  ManualOverride,
  ResolvedStatus,
  StatusState,
  WeeklyHours,
} from "./types.js";
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
  let activeOverride = manualOverride;
  if (activeOverride?.backAt && new Date(activeOverride.backAt).getTime() <= now.getTime()) {
    activeOverride = null;
  }

  if (activeOverride) {
    return {
      state: activeOverride.state,
      ...(activeOverride.message ? { message: activeOverride.message } : {}),
      ...(activeOverride.backAt ? { backAt: activeOverride.backAt } : {}),
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

export function getResolvedStatus(store: SignStore, fallbackTimezone: string): DisplayStatus {
  const timezone = store.getTimezone(fallbackTimezone);
  const manualOverride = store.getManualOverride();
  const now = new Date();

  if (manualOverride?.backAt && new Date(manualOverride.backAt).getTime() <= now.getTime()) {
    store.clearManualOverride("schedule");
  }

  return withDisplayTime(
    resolveStatus(store.getWeeklyHours(), timezone, store.getManualOverride(), now),
    timezone,
    now,
  );
}

/**
 * Adds the studio's clock and preformatted labels so kiosk browsers never have
 * to work out the time zone themselves. Old Android tablets often have the
 * wrong device zone or no Intl time zone support at all.
 */
export function withDisplayTime(
  status: ResolvedStatus,
  timezone: string,
  now = new Date(),
): DisplayStatus {
  const transition = findNextOffsetChange(timezone, now);
  return {
    ...status,
    timezone,
    serverTime: now.toISOString(),
    utcOffsetMinutes: offsetMinutes(now, timezone),
    ...(transition
      ? {
          nextOffsetChange: transition.at.toISOString(),
          nextOffsetMinutes: transition.offsetMinutes,
        }
      : {}),
    ...(status.backAt ? { backAtLabel: formatBackAtLabel(status.backAt, timezone) } : {}),
    ...(status.nextChange
      ? { nextChangeLabel: formatWeekdayTime(new Date(status.nextChange), timezone) }
      : {}),
  };
}

function offsetMinutes(date: Date, timezone: string): number {
  return Math.round(getTimezoneOffsetMs(date, timezone) / 60_000);
}

interface OffsetChange {
  at: Date;
  offsetMinutes: number;
}

const DAY_MS = 86_400_000;
const offsetChangeCache = new Map<string, { checkedAt: number; change: OffsetChange | null }>();

/** Next UTC offset change within ~a year, to the minute. Cached for an hour per zone. */
export function findNextOffsetChange(timezone: string, now = new Date()): OffsetChange | null {
  const cached = offsetChangeCache.get(timezone);
  if (
    cached &&
    now.getTime() >= cached.checkedAt &&
    now.getTime() - cached.checkedAt < 3_600_000 &&
    (!cached.change || now.getTime() < cached.change.at.getTime())
  ) {
    return cached.change;
  }

  const current = offsetMinutes(now, timezone);
  let change: OffsetChange | null = null;
  let low = now.getTime();
  for (let day = 1; day <= 370; day += 1) {
    const high = now.getTime() + day * DAY_MS;
    if (offsetMinutes(new Date(high), timezone) !== current) {
      // Narrow (low, high] down to the first minute with the new offset.
      let lo = low;
      let hi = high;
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
        if (mid <= lo) {
          break;
        }
        if (offsetMinutes(new Date(mid), timezone) === current) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      change = { at: new Date(hi), offsetMinutes: offsetMinutes(new Date(hi), timezone) };
      break;
    }
    low = high;
  }

  offsetChangeCache.set(timezone, { checkedAt: now.getTime(), change });
  return change;
}

function formatWeekdayTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

  const formatted = formatWeekdayTime(nextChangeDate, timezone);

  return state === "open" ? `Open until ${formatted}` : `Opens ${formatted}`;
}
