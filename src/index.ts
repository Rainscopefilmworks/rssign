import "dotenv/config";
import { SignStore } from "./db.js";
import { createApp } from "./server.js";
import { startDiscordBot } from "./bot.js";
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
});

void startDiscordBot(store, {
  token: process.env.DISCORD_TOKEN,
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
