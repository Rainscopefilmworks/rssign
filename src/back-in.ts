const TWELVE_HOUR_PATTERN = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
const TWENTY_FOUR_HOUR_PATTERN = /^(\d{1,2}):(\d{2})$/;
const COMPOUND_DURATION_PATTERN =
  /^(\d+)\s*(?:h(?:ours?|rs?)?)\s+(\d+)\s*(?:m(?:in(?:ute)?s?)?)$/i;
const HOUR_DURATION_PATTERN = /^(\d+)\s*(?:h(?:ours?|rs?)?)$/i;
const MINUTE_DURATION_PATTERN = /^(\d+)\s*(?:m(?:in(?:ute)?s?)?)$/i;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function parseBackInTime(input: string, timezone: string, now = new Date()): Date {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Time is required.");
  }

  const durationMinutes = parseDurationMinutes(trimmed);
  if (durationMinutes !== null) {
    return new Date(now.getTime() + durationMinutes * 60_000);
  }

  const parsed = parseClockTimeParts(trimmed);
  const today = getZonedDateParts(now, timezone);
  let candidate = zonedTimeToUtc(
    {
      year: today.year,
      month: today.month,
      day: today.day,
      hour: parsed.hour,
      minute: parsed.minute,
    },
    timezone,
  );

  if (candidate.getTime() <= now.getTime()) {
    const tomorrow = addLocalDays(today, 1, timezone);
    candidate = zonedTimeToUtc(
      {
        year: tomorrow.year,
        month: tomorrow.month,
        day: tomorrow.day,
        hour: parsed.hour,
        minute: parsed.minute,
      },
      timezone,
    );
  }

  return candidate;
}

export function formatBackAtLabel(isoDate: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(isoDate));
}

function parseDurationMinutes(input: string): number | null {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/^in\s+/, "");

  const compoundMatch = COMPOUND_DURATION_PATTERN.exec(normalized);
  if (compoundMatch) {
    return toDurationMinutes(Number(compoundMatch[1]), Number(compoundMatch[2]));
  }

  const hourMatch = HOUR_DURATION_PATTERN.exec(normalized);
  if (hourMatch) {
    return toDurationMinutes(Number(hourMatch[1]), 0);
  }

  const minuteMatch = MINUTE_DURATION_PATTERN.exec(normalized);
  if (minuteMatch) {
    return toDurationMinutes(0, Number(minuteMatch[1]));
  }

  return null;
}

function toDurationMinutes(hours: number, minutes: number): number {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0) {
    throw new Error('Invalid duration. Use formats like "30 minutes", "2 hours", or "1h 30m".');
  }

  if (hours === 0 && minutes === 0) {
    throw new Error("Duration must be at least 1 minute.");
  }

  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes > 7 * 24 * 60) {
    throw new Error("Duration cannot be longer than 7 days.");
  }

  return totalMinutes;
}

function parseClockTimeParts(input: string): { hour: number; minute: number } {
  const twelveHourMatch = TWELVE_HOUR_PATTERN.exec(input);
  if (twelveHourMatch) {
    const hour = Number(twelveHourMatch[1]);
    const minute = twelveHourMatch[2] ? Number(twelveHourMatch[2]) : 0;
    const meridiem = twelveHourMatch[3].toLowerCase();

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      throw new Error(
        'Invalid time. Use formats like "2:30 PM", "14:30", "30 minutes", or "2 hours".',
      );
    }

    return {
      hour: toTwentyFourHour(hour, meridiem),
      minute,
    };
  }

  const twentyFourHourMatch = TWENTY_FOUR_HOUR_PATTERN.exec(input);
  if (twentyFourHourMatch) {
    const hour = Number(twentyFourHourMatch[1]);
    const minute = Number(twentyFourHourMatch[2]);

    if (hour > 23 || minute > 59) {
      throw new Error(
        'Invalid time. Use formats like "2:30 PM", "14:30", "30 minutes", or "2 hours".',
      );
    }

    return { hour, minute };
  }

  throw new Error(
    'Invalid time. Use formats like "2:30 PM", "14:30", "30 minutes", or "2 hours".',
  );
}

function toTwentyFourHour(hour: number, meridiem: string): number {
  if (meridiem === "am") {
    return hour === 12 ? 0 : hour;
  }

  return hour === 12 ? 12 : hour + 12;
}

function getZonedDateParts(date: Date, timezone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function addLocalDays(parts: LocalDateTimeParts, days: number, timezone: string): LocalDateTimeParts {
  const noon = zonedTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 12,
      minute: 0,
    },
    timezone,
  );
  const shifted = new Date(noon.getTime() + days * 24 * 60 * 60 * 1000);
  return getZonedDateParts(shifted, timezone);
}

function zonedTimeToUtc(parts: LocalDateTimeParts, timezone: string): Date {
  const probe = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0),
  );
  const offset = getTimezoneOffsetMs(probe, timezone);
  return new Date(probe.getTime() - offset);
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - date.getTime();
}
