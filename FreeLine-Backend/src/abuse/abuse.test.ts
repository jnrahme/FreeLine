import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryAuthStore } from "../auth/in-memory-store.js";
import { InMemoryCallStore } from "../calls/in-memory-store.js";
import { InMemoryMessageStore } from "../messages/in-memory-store.js";
import { InMemoryAbuseStore } from "./in-memory-store.js";
import { InMemoryRateLimiter } from "./rate-limiter.js";
import { AbuseService } from "./service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function createAbuseHarness(now: Date) {
  const authStore = new InMemoryAuthStore();
  const callStore = new InMemoryCallStore();
  const messageStore = new InMemoryMessageStore();
  const abuseStore = new InMemoryAbuseStore();
  const rateLimiter = new InMemoryRateLimiter();
  const abuseService = new AbuseService({
    authStore,
    callStore,
    clock: () => now,
    messageStore,
    rateLimiter,
    store: abuseStore
  });

  return {
    abuseService,
    abuseStore,
    authStore
  };
}

test("first-week accounts use starter caps", async () => {
  const now = new Date("2026-03-17T12:00:00.000Z");
  const { abuseService, authStore } = createAbuseHarness(now);
  const user = await authStore.createUser({
    email: "starter@example.com"
  });

  const status = await abuseService.getRewardsStatus(user.id);

  assert.equal(status.tier, "starter");
  assert.equal(status.messages.dailyCap, 10);
  assert.equal(status.messages.uniqueContactsDailyCap, 5);
  assert.equal(status.calls.dailyCapMinutes, 10);
  assert.equal(status.messages.monthlyCap, 40);
  assert.equal(status.calls.monthlyCapMinutes, 15);
});

test("trust activity upgrades an older account from standard to elevated limits", async () => {
  const now = new Date("2026-03-25T12:00:00.000Z");
  const { abuseService, abuseStore, authStore } = createAbuseHarness(now);
  const user = await authStore.createUser({
    email: "elevated@example.com"
  });

  const standardStatus = await abuseService.getRewardsStatus(user.id);
  assert.equal(standardStatus.tier, "standard");
  assert.equal(standardStatus.messages.monthlyCap, 40);
  assert.equal(standardStatus.calls.monthlyCapMinutes, 15);

  for (let index = 0; index < 10; index += 1) {
    await abuseStore.createAbuseEvent({
      createdAt: new Date(now.getTime() - index * DAY_MS).toISOString(),
      details: {
        kind: "message_outbound"
      },
      eventType: "activity",
      userId: user.id
    });
  }

  const elevatedStatus = await abuseService.getRewardsStatus(user.id);
  assert.equal(elevatedStatus.tier, "elevated");
  assert.equal(elevatedStatus.trustScore, 75);
  assert.equal(elevatedStatus.messages.dailyCap, 40);
  assert.equal(elevatedStatus.messages.monthlyCap, 80);
  assert.equal(elevatedStatus.calls.dailyCapMinutes, 35);
  assert.equal(elevatedStatus.calls.monthlyCapMinutes, 35);
});
