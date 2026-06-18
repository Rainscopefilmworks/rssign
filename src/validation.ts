const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function timeToMinutes(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid time "${value}". Use HH:mm in 24-hour format.`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateHours(openTime: string, closeTime: string): void {
  if (!isValidTime(openTime)) {
    throw new Error("Open time must use HH:mm in 24-hour format.");
  }

  if (!isValidTime(closeTime)) {
    throw new Error("Close time must use HH:mm in 24-hour format.");
  }

  if (timeToMinutes(closeTime) <= timeToMinutes(openTime)) {
    throw new Error("Close time must be after open time.");
  }
}
