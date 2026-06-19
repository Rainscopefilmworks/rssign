import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Activity,
  ActivityType,
  Customer,
  CustomerStatus,
  CustomerWithActivities
} from "./types.js";

export type DatabaseConnection = Database.Database;

interface CustomerRow {
  id: number;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: CustomerStatus;
  deal_value_cents: number;
  next_follow_up: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityRow {
  id: number;
  customer_id: number;
  type: ActivityType;
  summary: string;
  happened_at: string;
  created_at: string;
}

export interface CustomerFilters {
  q?: string;
  status?: CustomerStatus;
}

export interface CustomerInput {
  company: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: CustomerStatus;
  dealValueCents?: number;
  nextFollowUp?: string | null;
  notes?: string | null;
}

export interface ActivityInput {
  customerId: number;
  type: ActivityType;
  summary: string;
  happenedAt?: string;
}

export function openDatabase(databasePath: string): DatabaseConnection {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  setupDatabase(db);
  return db;
}

export function setupDatabase(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'lead'
        CHECK (status IN ('lead', 'prospect', 'active', 'paused', 'archived')),
      deal_value_cents INTEGER NOT NULL DEFAULT 0 CHECK (deal_value_cents >= 0),
      next_follow_up TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('note', 'call', 'email', 'meeting', 'task')),
      summary TEXT NOT NULL,
      happened_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
    CREATE INDEX IF NOT EXISTS idx_customers_next_follow_up ON customers(next_follow_up);
    CREATE INDEX IF NOT EXISTS idx_activities_customer_id ON activities(customer_id);
  `);
}

export function listCustomers(
  db: DatabaseConnection,
  filters: CustomerFilters = {}
): Customer[] {
  const search = filters.q ? `%${filters.q.trim()}%` : null;
  const rows = db
    .prepare(
      `
        SELECT *
        FROM customers
        WHERE (@status IS NULL OR status = @status)
          AND (
            @search IS NULL
            OR company LIKE @search
            OR contact_name LIKE @search
            OR email LIKE @search
            OR notes LIKE @search
          )
        ORDER BY
          next_follow_up IS NULL,
          next_follow_up ASC,
          updated_at DESC
      `
    )
    .all({
      status: filters.status ?? null,
      search
    }) as CustomerRow[];

  return rows.map(toCustomer);
}

export function getCustomer(
  db: DatabaseConnection,
  id: number
): CustomerWithActivities | null {
  const row = db
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(id) as CustomerRow | undefined;

  if (!row) {
    return null;
  }

  const activities = db
    .prepare(
      `
        SELECT *
        FROM activities
        WHERE customer_id = ?
        ORDER BY happened_at DESC, id DESC
      `
    )
    .all(id) as ActivityRow[];

  return {
    ...toCustomer(row),
    activities: activities.map(toActivity)
  };
}

export function createCustomer(
  db: DatabaseConnection,
  input: CustomerInput
): Customer {
  const timestamp = new Date().toISOString();
  const result = db
    .prepare(
      `
        INSERT INTO customers (
          company,
          contact_name,
          email,
          phone,
          status,
          deal_value_cents,
          next_follow_up,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          @company,
          @contactName,
          @email,
          @phone,
          @status,
          @dealValueCents,
          @nextFollowUp,
          @notes,
          @createdAt,
          @updatedAt
        )
      `
    )
    .run({
      company: input.company,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      status: input.status ?? "lead",
      dealValueCents: input.dealValueCents ?? 0,
      nextFollowUp: input.nextFollowUp ?? null,
      notes: input.notes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    });

  const customer = getCustomer(db, Number(result.lastInsertRowid));

  if (!customer) {
    throw new Error("Customer was not created");
  }

  return customer;
}

export function updateCustomer(
  db: DatabaseConnection,
  id: number,
  input: Partial<CustomerInput>
): Customer | null {
  const current = getCustomer(db, id);

  if (!current) {
    return null;
  }

  const next = {
    company: input.company ?? current.company,
    contactName: input.contactName ?? current.contactName,
    email: input.email ?? current.email,
    phone: input.phone ?? current.phone,
    status: input.status ?? current.status,
    dealValueCents: input.dealValueCents ?? current.dealValueCents,
    nextFollowUp: input.nextFollowUp ?? current.nextFollowUp,
    notes: input.notes ?? current.notes,
    updatedAt: new Date().toISOString()
  };

  db.prepare(
    `
      UPDATE customers
      SET
        company = @company,
        contact_name = @contactName,
        email = @email,
        phone = @phone,
        status = @status,
        deal_value_cents = @dealValueCents,
        next_follow_up = @nextFollowUp,
        notes = @notes,
        updated_at = @updatedAt
      WHERE id = @id
    `
  ).run({
    id,
    ...next
  });

  return getCustomer(db, id);
}

export function createActivity(
  db: DatabaseConnection,
  input: ActivityInput
): Activity | null {
  if (!getCustomer(db, input.customerId)) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const result = db
    .prepare(
      `
        INSERT INTO activities (
          customer_id,
          type,
          summary,
          happened_at,
          created_at
        )
        VALUES (
          @customerId,
          @type,
          @summary,
          @happenedAt,
          @createdAt
        )
      `
    )
    .run({
      customerId: input.customerId,
      type: input.type,
      summary: input.summary,
      happenedAt: input.happenedAt ?? timestamp,
      createdAt: timestamp
    });

  db.prepare("UPDATE customers SET updated_at = ? WHERE id = ?").run(
    timestamp,
    input.customerId
  );

  const row = db
    .prepare("SELECT * FROM activities WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as ActivityRow | undefined;

  if (!row) {
    throw new Error("Activity was not created");
  }

  return toActivity(row);
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    company: row.company,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    dealValueCents: row.deal_value_cents,
    nextFollowUp: row.next_follow_up,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    summary: row.summary,
    happenedAt: row.happened_at,
    createdAt: row.created_at
  };
}
