import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "./server.js";

test("health route returns ok when dependencies are healthy", async () => {
  const app = await buildApp({
    checkPostgres: async () => true,
    checkRedis: async () => true
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    services: {
      postgres: "up",
      redis: "up"
    }
  });

  await app.close();
});

test("numbers search returns seeded dev numbers", async () => {
  const app = await buildApp({
    checkPostgres: async () => true,
    checkRedis: async () => true
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/numbers/search?areaCode=415"
  });

  const body = response.json() as {
    areaCode: string;
    numbers: Array<{ phoneNumber: string }>;
  };

  assert.equal(response.statusCode, 200);
  assert.equal(body.areaCode, "415");
  assert.ok(body.numbers.length >= 2);
  assert.equal(body.numbers[0]?.phoneNumber, "+14155550101");

  await app.close();
});
