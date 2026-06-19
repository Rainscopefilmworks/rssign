import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z, ZodError } from "zod";
import { loadConfig } from "./config.js";
import {
  createActivity,
  createCustomer,
  getCustomer,
  listCustomers,
  openDatabase,
  updateCustomer,
  type DatabaseConnection
} from "./db.js";
import { activityTypes, customerStatuses } from "./types.js";

interface AppOptions {
  db?: DatabaseConnection;
  databasePath?: string;
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../public");

const emptyStringToNull = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

const optionalText = z.preprocess(
  emptyStringToNull,
  z.string().trim().min(1).nullable().optional()
);

const optionalEmail = z.preprocess(
  emptyStringToNull,
  z.string().trim().email().nullable().optional()
);

const baseCustomerSchema = z.object({
  company: z.string().trim().min(1),
  contactName: optionalText,
  email: optionalEmail,
  phone: optionalText,
  status: z.enum(customerStatuses).optional(),
  dealValueCents: z.coerce.number().int().min(0).optional(),
  nextFollowUp: optionalText,
  notes: optionalText
});

const createCustomerSchema = baseCustomerSchema.extend({
  status: z.enum(customerStatuses).default("lead"),
  dealValueCents: z.coerce.number().int().min(0).default(0)
});

const updateCustomerSchema = baseCustomerSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one customer field is required"
  });

const createActivitySchema = z.object({
  type: z.enum(activityTypes),
  summary: z.string().trim().min(1),
  happenedAt: z.string().trim().min(1).optional()
});

const customerQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(customerStatuses).optional()
});

const idSchema = z.coerce.number().int().positive();

export function createApp(options: AppOptions = {}): express.Express {
  const config = loadConfig();
  const db = options.db ?? openDatabase(options.databasePath ?? config.databasePath);
  const app = express();

  app.locals.db = db;

  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "rainscope-crm" });
  });

  app.get("/api/customers", (req, res) => {
    const query = customerQuerySchema.parse({
      q: singleQueryValue(req.query.q),
      status: singleQueryValue(req.query.status) || undefined
    });

    res.json({ customers: listCustomers(db, query) });
  });

  app.post("/api/customers", (req, res) => {
    const input = createCustomerSchema.parse(req.body);
    const customer = createCustomer(db, input);

    res.status(201).json({ customer });
  });

  app.get("/api/customers/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    const customer = getCustomer(db, id);

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    res.json({ customer });
  });

  app.patch("/api/customers/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = updateCustomerSchema.parse(req.body);
    const customer = updateCustomer(db, id, input);

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    res.json({ customer });
  });

  app.post("/api/customers/:id/activities", (req, res) => {
    const customerId = idSchema.parse(req.params.id);
    const input = createActivitySchema.parse(req.body);
    const activity = createActivity(db, {
      customerId,
      ...input
    });

    if (!activity) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    res.status(201).json({ activity });
  });

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof ZodError) {
      res.status(400).json({
        error: "Validation failed",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
      return;
    }

    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

function singleQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}
