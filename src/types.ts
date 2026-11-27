export const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DayName = (typeof DAY_NAMES)[number];
export type StatusState = "open" | "closed";
export type StatusSource = "schedule" | "override";

export interface WeeklyHours {
  day: number;
  dayName: DayName;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface ManualOverride {
  state: StatusState;
  message: string | null;
  backAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ResolvedStatus {
  state: StatusState;
  message?: string;
  backAt?: string;
  source: StatusSource;
  nextChange?: string;
}

/**
 * Status plus everything a display needs to show studio-local times without
 * trusting the device's own clock, time zone, or Intl support.
 */
export interface DisplayStatus extends ResolvedStatus {
  timezone: string;
  serverTime: string;
  /** Current offset of the studio time zone from UTC, in minutes (DST-aware). */
  utcOffsetMinutes: number;
  /** Next time the zone's UTC offset changes (within a year), so an offline kiosk can follow it. */
  nextOffsetChange?: string;
  nextOffsetMinutes?: number;
  backAtLabel?: string;
  nextChangeLabel?: string;
}

export interface AuditLogEntry {
  actor: string;
  action: string;
  details?: Record<string, unknown>;
}

export function toDayName(day: number): DayName {
  const dayName = DAY_NAMES[day];
  if (!dayName) {
    throw new Error(`Invalid day index: ${day}`);
  }

  return dayName;
}

export function parseDayName(day: string): number {
  const normalized = day.trim().toLowerCase();
  const dayIndex = DAY_NAMES.indexOf(normalized as DayName);
  if (dayIndex === -1) {
    throw new Error(`Invalid day: ${day}`);
  }

  return dayIndex;
}

export function formatHours(hours: WeeklyHours): string {
  if (!hours.isOpen) {
    return `${hours.dayName}: closed`;
  }

  return `${hours.dayName}: ${hours.openTime}-${hours.closeTime}`;
}
