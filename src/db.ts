import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  type AuditLogEntry,
  type DayName,
  type ManualOverride,
  parseDayName,
  toDayName,
  type WeeklyHours,
} from "./types.js";
import { validateHours } from "./validation.js";

interface HoursRow {
  day: number;
  is_open: number;
  open_time: string;
  close_time: string;
}

interface SettingRow {
  value: string;
}

interface DefaultHoursFile {
  timezone?: string;
  hours: Array<{
    day: DayName;
    isOpen: boolean;
    open: string;
    close: string;
  }>;
}

export class SignStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
    }

    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  seedDefaultHours(defaultHoursPath = path.resolve("config/hours.default.json")): void {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM weekly_hours").get() as {
      count: number;
    };
    if (count.count > 0) {
      return;
    }

    const defaults = JSON.parse(readFileSync(defaultHoursPath, "utf8")) as DefaultHoursFile;
    const insert = this.db.prepare(`
      INSERT INTO weekly_hours (day, is_open, open_time, close_time)
      VALUES (@day, @isOpen, @openTime, @closeTime)
    `);

    const transaction = this.db.transaction(() => {
      for (const hours of defaults.hours) {
        validateHours(hours.open, hours.close);
        insert.run({
          day: parseDayName(hours.day),
          isOpen: hours.isOpen ? 1 : 0,
          openTime: hours.open,
          closeTime: hours.close,
        });
      }

      if (defaults.timezone) {
        this.setSetting("timezone", defaults.timezone);
      }
    });

    transaction();
  }

  getTimezone(fallback: string): string {
    return this.getSetting("timezone") ?? fallback;
  }

  getWeeklyHours(): WeeklyHours[] {
    const rows = this.db
      .prepare("SELECT day, is_open, open_time, close_time FROM weekly_hours ORDER BY day")
      .all() as HoursRow[];

    return rows.map((row) => ({
      day: row.day,
      dayName: toDayName(row.day),
      isOpen: row.is_open === 1,
      openTime: row.open_time,
      closeTime: row.close_time,
    }));
  }

  setDayHours(day: number, isOpen: boolean, openTime: string, closeTime: string): WeeklyHours {
    if (day < 0 || day > 6) {
      throw new Error("Day must be between 0 and 6.");
    }

    validateHours(openTime, closeTime);
    this.db
      .prepare(
        `
        INSERT INTO weekly_hours (day, is_open, open_time, close_time)
        VALUES (@day, @isOpen, @openTime, @closeTime)
        ON CONFLICT(day) DO UPDATE SET
          is_open = excluded.is_open,
          open_time = excluded.open_time,
          close_time = excluded.close_time,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run({ day, isOpen: isOpen ? 1 : 0, openTime, closeTime });

    return {
      day,
      dayName: toDayName(day),
      isOpen,
      openTime,
      closeTime,
    };
  }

  getManualOverride(): ManualOverride | null {
    const state = this.getSetting("override_state");
    if (state !== "open" && state !== "closed") {
      return null;
    }

    return {
      state,
      message: this.getSetting("override_message"),
      updatedAt: this.getSetting("override_updated_at") ?? new Date().toISOString(),
      updatedBy: this.getSetting("override_updated_by"),
    };
  }

  setManualOverride(state: "open" | "closed", message: string | null, actor: string): void {
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.setSetting("override_state", state);
      this.setSetting("override_message", message ?? "");
      this.setSetting("override_updated_at", now);
      this.setSetting("override_updated_by", actor);
      this.addAuditLog({
        actor,
        action: "set_override",
        details: { state, message },
      });
    });

    transaction();
  }

  clearManualOverride(actor: string): void {
    const transaction = this.db.transaction(() => {
      this.deleteSetting("override_state");
      this.deleteSetting("override_message");
      this.deleteSetting("override_updated_at");
      this.deleteSetting("override_updated_by");
      this.addAuditLog({ actor, action: "clear_override" });
    });

    transaction();
  }

  addAuditLog(entry: AuditLogEntry): void {
    this.db
      .prepare(
        `
        INSERT INTO audit_log (actor, action, details)
        VALUES (@actor, @action, @details)
      `,
      )
      .run({
        actor: entry.actor,
        action: entry.action,
        details: entry.details ? JSON.stringify(entry.details) : null,
      });
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS weekly_hours (
        day INTEGER PRIMARY KEY CHECK (day >= 0 AND day <= 6),
        is_open INTEGER NOT NULL CHECK (is_open IN (0, 1)),
        open_time TEXT NOT NULL,
        close_time TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  private getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | SettingRow
      | undefined;

    if (!row) {
      return null;
    }

    return row.value === "" ? null : row.value;
  }

  private setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `,
      )
      .run(key, value);
  }

  private deleteSetting(key: string): void {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}
