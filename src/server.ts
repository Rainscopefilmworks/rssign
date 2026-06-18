import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { parseBackInTime } from "./back-in.js";
import { type SignStore } from "./db.js";
import { getResolvedStatus } from "./scheduler.js";
import { parseDayName } from "./types.js";

interface ServerOptions {
  adminPassword?: string;
  fallbackTimezone: string;
  publicDir?: string;
}

interface OverrideRequestBody {
  state?: unknown;
  message?: unknown;
}

interface HoursRequestBody {
  day?: unknown;
  isOpen?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
}

interface BackInRequestBody {
  time?: unknown;
}

export function createApp(store: SignStore, options: ServerOptions): express.Express {
  const app = express();
  const publicDir = options.publicDir ?? path.resolve("public");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use("/assets", express.static(path.join(publicDir, "assets")));
  app.use("/display", express.static(path.join(publicDir, "display")));
  app.use("/admin", express.static(path.join(publicDir, "admin")));

  app.get("/", (_req, res) => res.redirect("/display"));
  app.get("/api/status", (_req, res) => {
    res.json(getResolvedStatus(store, options.fallbackTimezone));
  });

  app.get("/api/hours", (_req, res) => {
    res.json({
      timezone: store.getTimezone(options.fallbackTimezone),
      hours: store.getWeeklyHours(),
    });
  });

  app.post("/api/override", requireAdmin(options.adminPassword), (req, res) => {
    const body = req.body as OverrideRequestBody;
    if (body.state !== "open" && body.state !== "closed") {
      res.status(400).json({ error: "state must be open or closed" });
      return;
    }

    const message =
      typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;
    store.setManualOverride(body.state, message, "admin");
    res.json(getResolvedStatus(store, options.fallbackTimezone));
  });

  app.post("/api/auto", requireAdmin(options.adminPassword), (_req, res) => {
    store.clearManualOverride("admin");
    res.json(getResolvedStatus(store, options.fallbackTimezone));
  });

  app.post("/api/back-in", requireAdmin(options.adminPassword), (req, res, next) => {
    try {
      const body = req.body as BackInRequestBody;
      if (typeof body.time !== "string" || !body.time.trim()) {
        res.status(400).json({ error: "time is required" });
        return;
      }

      const timezone = store.getTimezone(options.fallbackTimezone);
      const backAt = parseBackInTime(body.time, timezone);
      store.setBackInOverride(backAt.toISOString(), "admin");
      res.json(getResolvedStatus(store, options.fallbackTimezone));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/hours", requireAdmin(options.adminPassword), (req, res, next) => {
    try {
      const body = req.body as HoursRequestBody;
      if (typeof body.day !== "string") {
        res.status(400).json({ error: "day is required" });
        return;
      }

      if (typeof body.isOpen !== "boolean") {
        res.status(400).json({ error: "isOpen must be true or false" });
        return;
      }

      if (typeof body.openTime !== "string" || typeof body.closeTime !== "string") {
        res.status(400).json({ error: "openTime and closeTime are required" });
        return;
      }

      const hours = store.setDayHours(
        parseDayName(body.day),
        body.isOpen,
        body.openTime,
        body.closeTime,
      );
      store.addAuditLog({
        actor: "admin",
        action: "set_hours",
        details: { ...hours },
      });
      res.json({ hours });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(400).json({ error: message });
  });

  return app;
}

function requireAdmin(adminPassword: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!adminPassword) {
      res.status(503).json({ error: "ADMIN_PASSWORD is not configured" });
      return;
    }

    if (getRequestPassword(req) !== adminPassword) {
      res.status(401).json({ error: "Invalid admin password" });
      return;
    }

    next();
  };
}

function getRequestPassword(req: Request): string | null {
  const headerPassword = req.header("x-admin-password");
  if (headerPassword) {
    return headerPassword;
  }

  const authorization = req.header("authorization");
  if (!authorization) {
    return null;
  }

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  if (authorization.startsWith("Basic ")) {
    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    const [, password] = decoded.split(":", 2);
    return password ?? null;
  }

  return null;
}
