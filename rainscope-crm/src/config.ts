import "dotenv/config";

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number.parseInt(env.PORT ?? "3850", 10);

  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number.isFinite(port) ? port : 3850,
    databasePath: env.DATABASE_PATH ?? "./data/rainscope-crm.sqlite"
  };
}
