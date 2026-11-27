import "dotenv/config";
import { SignStore } from "./db.js";
import { createApp } from "./server.js";
import { startDiscordBot } from "./bot.js";
import { getTimezoneOffsetMs } from "./back-in.js";
import { startScheduler } from "./scheduler.js";

const port = Number(process.env.PORT ?? 3847);
const host = process.env.HOST ?? "0.0.0.0";
const databasePath = process.env.DATABASE_PATH ?? "./data/rssign.sqlite";
const timezone = process.env.TIMEZONE ?? "America/Vancouver";

const store = new SignStore(databasePath);
store.seedDefaultHours();

const app = createApp(store, {
  adminPassword: process.env.ADMIN_PASSWORD,
  fallbackTimezone: timezone,
});

startScheduler(store, timezone);

const server = app.listen(port, host, () => {
  console.log(`Rainscope Open Sign listening at http://${host}:${port}`);
  logTimezone(store.getTimezone(timezone));
});

void startDiscordBot(store, {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  allowedRoleId: process.env.DISCORD_ALLOWED_ROLE_ID,
  fallbackTimezone: timezone,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Discord bot failed to start: ${message}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}

// The sign trusts this process's time zone data (bundled with Node's ICU), so
// log it: a stale Node image can be an hour off after a rule change, such as
// BC moving to permanent UTC-7 in November 2026 (tzdata 2026e).
function logTimezone(zone: string): void {
  const now = new Date();
  const offsetMinutes = Math.round(getTimezoneOffsetMs(now, zone) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(now);
  console.log(`Sign time zone: ${zone} (${offset}, tzdata ${process.versions.tz ?? "unknown"}), local time ${local}`);
}
