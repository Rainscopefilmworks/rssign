import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type DatabaseConnection } from "../src/db.js";
import { createApp } from "../src/server.js";

let db: DatabaseConnection | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
});

function testApp() {
  db = openDatabase(":memory:");
  return createApp({ db });
}

describe("Rainscope CRM API", () => {
  it("creates and lists customers", async () => {
    const app = testApp();

    const created = await request(app)
      .post("/api/customers")
      .send({
        company: "Rain City Studios",
        contactName: "Alex Lee",
        email: "alex@example.com",
        status: "prospect",
        dealValueCents: 125000,
        nextFollowUp: "2026-07-01",
        notes: "Interested in post-production support."
      })
      .expect(201);

    expect(created.body.customer).toMatchObject({
      company: "Rain City Studios",
      contactName: "Alex Lee",
      status: "prospect",
      dealValueCents: 125000
    });

    const listed = await request(app).get("/api/customers?q=Rain").expect(200);

    expect(listed.body.customers).toHaveLength(1);
    expect(listed.body.customers[0].company).toBe("Rain City Studios");
  });

  it("adds activities to a customer timeline", async () => {
    const app = testApp();
    const created = await request(app)
      .post("/api/customers")
      .send({ company: "North Shore Rentals" })
      .expect(201);

    const customerId = created.body.customer.id;

    await request(app)
      .post(`/api/customers/${customerId}/activities`)
      .send({
        type: "call",
        summary: "Booked discovery call for next Tuesday.",
        happenedAt: "2026-06-19T12:00:00.000Z"
      })
      .expect(201);

    const details = await request(app)
      .get(`/api/customers/${customerId}`)
      .expect(200);

    expect(details.body.customer.activities).toEqual([
      expect.objectContaining({
        type: "call",
        summary: "Booked discovery call for next Tuesday."
      })
    ]);
  });

  it("returns validation errors for incomplete customers", async () => {
    const app = testApp();

    const response = await request(app)
      .post("/api/customers")
      .send({ company: "" })
      .expect(400);

    expect(response.body.error).toBe("Validation failed");
    expect(response.body.details[0].path).toBe("company");
  });
});
