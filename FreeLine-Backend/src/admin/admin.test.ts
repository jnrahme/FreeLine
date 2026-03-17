import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryAbuseStore } from "../abuse/in-memory-store.js";
import { InMemoryRateLimiter } from "../abuse/rate-limiter.js";
import { buildApp } from "../server.js";
import { InMemoryAuthStore } from "../auth/in-memory-store.js";
import { InMemoryCallStore } from "../calls/in-memory-store.js";
import { InMemoryMessageStore } from "../messages/in-memory-store.js";
import { InMemoryNumberStore } from "../numbers/in-memory-store.js";
import type {
  CaptchaVerifier,
  OAuthVerifier,
  VerificationMailer
} from "../auth/types.js";
import { env } from "../config/env.js";
import { InMemoryAdminOpsStore } from "./ops-in-memory-store.js";
import { InMemoryAdminStore } from "./in-memory-store.js";

class PassCaptchaVerifier implements CaptchaVerifier {
  async verify(): Promise<void> {
    return;
  }
}

class PreviewMailer implements VerificationMailer {
  async sendEmailVerification(input: {
    email: string;
    verificationLink: string;
  }): Promise<{ delivery: "dev_mailbox"; previewLink: string }> {
    return {
      delivery: "dev_mailbox",
      previewLink: input.verificationLink
    };
  }
}

class StaticOAuthVerifier implements OAuthVerifier {
  constructor(
    private readonly providerIdPrefix: string,
    private readonly emailPrefix: string
  ) {}

  async verify(identityToken: string) {
    return {
      displayName: `${this.providerIdPrefix} user`,
      email: `${this.emailPrefix}+${identityToken}@example.com`,
      providerId: `${this.providerIdPrefix}-${identityToken}`
    };
  }
}

async function createAdminTestApp() {
  const adminStore = new InMemoryAdminStore();
  const authStore = new InMemoryAuthStore();
  const abuseStore = new InMemoryAbuseStore();
  const callStore = new InMemoryCallStore();
  const messageStore = new InMemoryMessageStore();
  const numberStore = new InMemoryNumberStore();
  const adminOpsStore = new InMemoryAdminOpsStore(
    authStore,
    abuseStore,
    messageStore,
    callStore,
    numberStore
  );
  const app = await buildApp({
    adminStore,
    adminOpsStore,
    appleVerifier: new StaticOAuthVerifier("apple", "apple"),
    abuseStore,
    authStore,
    captchaVerifier: new PassCaptchaVerifier(),
    callStore,
    checkPostgres: async () => true,
    checkRedis: async () => true,
    emailMailer: new PreviewMailer(),
    googleVerifier: new StaticOAuthVerifier("google", "google"),
    messageStore,
    numberStore,
    rateLimiter: new InMemoryRateLimiter()
  });

  return {
    adminStore,
    abuseStore,
    authStore,
    callStore,
    messageStore,
    numberStore,
    app
  };
}

async function loginAdmin(app: Awaited<ReturnType<typeof buildApp>>) {
  const loginResponse = await app.inject({
    method: "POST",
    payload: {
      email: env.ADMIN_BOOTSTRAP_EMAIL,
      password: env.ADMIN_BOOTSTRAP_PASSWORD
    },
    url: "/v1/admin/auth/login"
  });

  assert.equal(loginResponse.statusCode, 200);
  return (loginResponse.json() as { tokens: { accessToken: string } }).tokens.accessToken;
}

async function assignNumber(
  numberStore: InMemoryNumberStore,
  userId: string,
  phoneNumber: string,
  areaCode = "415"
) {
  return numberStore.assignNumber({
    areaCode,
    locality: "San Francisco",
    nationalFormat: "(415) 555-0100",
    phoneNumber,
    provisionedNumber: {
      externalId: `bandwidth-${phoneNumber}`,
      phoneNumber,
      provider: "bandwidth"
    },
    region: "CA",
    userId
  });
}

async function seedAdminOpsData(
  harness: Awaited<ReturnType<typeof createAdminTestApp>>
) {
  const alice = await harness.authStore.createUser({
    displayName: "Alice",
    email: "alice@example.com"
  });
  const bob = await harness.authStore.createUser({
    displayName: "Bob",
    email: "bob@example.com"
  });
  const charlie = await harness.authStore.createUser({
    displayName: "Charlie",
    email: "charlie@example.com"
  });

  await harness.authStore.createOrUpdateDevice({
    fingerprint: "device-alice",
    platform: "ios",
    pushToken: "push-alice",
    userId: alice.id
  });
  await harness.authStore.createOrUpdateDevice({
    fingerprint: "device-bob",
    platform: "android",
    pushToken: "push-bob",
    userId: bob.id
  });

  await harness.abuseStore.logDeviceAccount({
    fingerprint: "device-alice",
    platform: "ios",
    userId: alice.id
  });
  await harness.abuseStore.logDeviceAccount({
    fingerprint: "device-bob",
    platform: "android",
    userId: bob.id
  });

  const aliceNumber = await assignNumber(harness.numberStore, alice.id, "+14155550101");
  const bobNumber = await assignNumber(harness.numberStore, bob.id, "+14155550102");

  await harness.messageStore.createOutboundMessage({
    body: "Alice outbound",
    participantNumber: "+14155559999",
    phoneNumberId: aliceNumber.phoneNumberId,
    userId: alice.id
  });
  await harness.messageStore.createInboundMessage({
    body: "Alice inbound",
    participantNumber: "+14155559999",
    phoneNumberId: aliceNumber.phoneNumberId,
    userId: alice.id
  });

  for (let index = 0; index < 160; index += 1) {
    await harness.messageStore.createOutboundMessage({
      body: `Bob cost message ${index}`,
      participantNumber: `+14155557${String(index).padStart(4, "0")}`,
      phoneNumberId: bobNumber.phoneNumberId,
      userId: bob.id
    });
  }

  await harness.callStore.upsertCallFromWebhook({
    direction: "outbound",
    durationSeconds: 180,
    endedAt: new Date().toISOString(),
    phoneNumberId: aliceNumber.phoneNumberId,
    providerCallId: "call-alice-1",
    remoteNumber: "+14155559999",
    startedAt: new Date().toISOString(),
    status: "completed",
    userId: alice.id
  });
  await harness.callStore.upsertCallFromWebhook({
    direction: "outbound",
    durationSeconds: 600,
    endedAt: new Date().toISOString(),
    phoneNumberId: bobNumber.phoneNumberId,
    providerCallId: "call-bob-1",
    remoteNumber: "+14155558888",
    startedAt: new Date().toISOString(),
    status: "completed",
    userId: bob.id
  });

  const aliceReport = await harness.abuseStore.createAbuseEvent({
    details: {
      reason: "user_report"
    },
    eventType: "report",
    userId: alice.id
  });
  const bobSpamFlag = await harness.abuseStore.createAbuseEvent({
    details: {
      heuristic: "url_first_message"
    },
    eventType: "spam_flag",
    userId: bob.id
  });

  await harness.numberStore.releaseCurrentNumber({
    quarantineUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    releaseReason: "user_release",
    userId: alice.id
  });

  return {
    alice,
    aliceNumber,
    aliceReport,
    bob,
    bobNumber,
    bobSpamFlag,
    charlie
  };
}

test("admin login issues a token and /v1/admin/me returns the bootstrap admin", async () => {
  const { app } = await createAdminTestApp();

  const loginResponse = await app.inject({
    method: "POST",
    payload: {
      email: env.ADMIN_BOOTSTRAP_EMAIL,
      password: env.ADMIN_BOOTSTRAP_PASSWORD
    },
    url: "/v1/admin/auth/login"
  });

  assert.equal(loginResponse.statusCode, 200);
  const loginBody = loginResponse.json() as {
    admin: { email: string; id: string; role: string; status: string };
    tokens: { accessToken: string };
  };
  assert.equal(loginBody.admin.email, env.ADMIN_BOOTSTRAP_EMAIL);
  assert.equal(loginBody.admin.role, "admin");
  assert.ok(loginBody.tokens.accessToken.length > 20);

  const meResponse = await app.inject({
    method: "GET",
    url: "/v1/admin/me",
    headers: {
      authorization: `Bearer ${loginBody.tokens.accessToken}`
    }
  });

  assert.equal(meResponse.statusCode, 200);
  assert.equal(
    (meResponse.json() as { admin: { email: string } }).admin.email,
    env.ADMIN_BOOTSTRAP_EMAIL
  );

  await app.close();
});

test("admin can create and list invite codes via protected routes", async () => {
  const { app } = await createAdminTestApp();

  const loginResponse = await app.inject({
    method: "POST",
    payload: {
      email: env.ADMIN_BOOTSTRAP_EMAIL,
      password: env.ADMIN_BOOTSTRAP_PASSWORD
    },
    url: "/v1/admin/auth/login"
  });

  const accessToken = (
    loginResponse.json() as {
      tokens: { accessToken: string };
    }
  ).tokens.accessToken;

  const createResponse = await app.inject({
    method: "POST",
    payload: {
      code: "BETA2026",
      maxUses: 3
    },
    url: "/v1/admin/invite-codes",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  assert.equal(createResponse.statusCode, 200);
  assert.equal(
    (
      createResponse.json() as {
        inviteCode: { code: string; currentUses: number; maxUses: number };
      }
    ).inviteCode.code,
    "BETA2026"
  );

  const listResponse = await app.inject({
    method: "GET",
    url: "/v1/admin/invite-codes",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  assert.equal(listResponse.statusCode, 200);
  const listBody = listResponse.json() as {
    inviteCodes: Array<{ code: string; maxUses: number }>;
  };
  assert.equal(listBody.inviteCodes.length, 1);
  assert.equal(listBody.inviteCodes[0]?.code, "BETA2026");
  assert.equal(listBody.inviteCodes[0]?.maxUses, 3);

  await app.close();
});

test("admin can search users and load user detail by phone number or user id", async () => {
  const harness = await createAdminTestApp();
  const seeded = await seedAdminOpsData(harness);
  const accessToken = await loginAdmin(harness.app);

  const searchResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "GET",
    query: {
      q: seeded.bobNumber.phoneNumber
    },
    url: "/v1/admin/users"
  });

  assert.equal(searchResponse.statusCode, 200);
  const searchBody = searchResponse.json() as {
    users: Array<{ activeNumber: string | null; email: string; id: string }>;
  };
  assert.equal(searchBody.users.length, 1);
  assert.equal(searchBody.users[0]?.email, seeded.bob.email);
  assert.equal(searchBody.users[0]?.activeNumber, seeded.bobNumber.phoneNumber);

  const detailResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "GET",
    url: `/v1/admin/users/${seeded.bob.id}`
  });

  assert.equal(detailResponse.statusCode, 200);
  const detailBody = detailResponse.json() as {
    user: {
      assignedNumber: { phoneNumber: string } | null;
      devices: Array<{ fingerprint: string }>;
      totalTextEventsThisMonth: number;
      usage: {
        callAllowance: { monthlyUsedMinutes: number };
        messageAllowance: { monthlyUsed: number };
      };
    };
  };
  assert.equal(detailBody.user.assignedNumber?.phoneNumber, seeded.bobNumber.phoneNumber);
  assert.equal(detailBody.user.devices[0]?.fingerprint, "device-bob");
  assert.equal(detailBody.user.totalTextEventsThisMonth, 160);
  assert.equal(detailBody.user.usage.messageAllowance.monthlyUsed, 160);
  assert.equal(detailBody.user.usage.callAllowance.monthlyUsedMinutes, 10);

  await harness.app.close();
});

test("admin can suspend and unsuspend a user", async () => {
  const harness = await createAdminTestApp();
  const seeded = await seedAdminOpsData(harness);
  const accessToken = await loginAdmin(harness.app);

  const suspendResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST",
    payload: {
      reason: "manual_review"
    },
    url: `/v1/admin/users/${seeded.charlie.id}/suspend`
  });

  assert.equal(suspendResponse.statusCode, 200);
  assert.equal((await harness.authStore.findUserById(seeded.charlie.id))?.status, "suspended");

  const unsuspendResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST",
    url: `/v1/admin/users/${seeded.charlie.id}/unsuspend`
  });

  assert.equal(unsuspendResponse.statusCode, 200);
  assert.equal((await harness.authStore.findUserById(seeded.charlie.id))?.status, "active");

  await harness.app.close();
});

test("admin abuse queue actions update review state and confirmation suspends the user", async () => {
  const harness = await createAdminTestApp();
  const seeded = await seedAdminOpsData(harness);
  const accessToken = await loginAdmin(harness.app);

  const queueResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "GET",
    query: {
      status: "open"
    },
    url: "/v1/admin/abuse-queue"
  });

  assert.equal(queueResponse.statusCode, 200);
  const queueBody = queueResponse.json() as {
    items: Array<{ id: string; reviewAction: string | null }>;
  };
  assert.equal(queueBody.items.length, 2);

  const dismissResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST",
    url: `/v1/admin/abuse-queue/${seeded.aliceReport.id}/dismiss`
  });

  assert.equal(dismissResponse.statusCode, 200);
  assert.equal(
    (dismissResponse.json() as { item: { reviewAction: string | null } }).item.reviewAction,
    "dismissed"
  );

  const confirmResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST",
    url: `/v1/admin/abuse-queue/${seeded.bobSpamFlag.id}/confirm`
  });

  assert.equal(confirmResponse.statusCode, 200);
  assert.equal(
    (confirmResponse.json() as { item: { reviewAction: string | null } }).item.reviewAction,
    "confirmed"
  );
  assert.equal((await harness.authStore.findUserById(seeded.bob.id))?.status, "suspended");

  await harness.app.close();
});

test("admin can view number inventory, force release a number, restore a quarantined number, and read cost data", async () => {
  const harness = await createAdminTestApp();
  const seeded = await seedAdminOpsData(harness);
  const accessToken = await loginAdmin(harness.app);

  const numbersResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "GET",
    query: {
      status: "quarantined"
    },
    url: "/v1/admin/numbers"
  });

  assert.equal(numbersResponse.statusCode, 200);
  const numbersBody = numbersResponse.json() as {
    numbers: Array<{ phoneNumber: string; status: string }>;
  };
  assert.equal(numbersBody.numbers[0]?.phoneNumber, seeded.aliceNumber.phoneNumber);
  assert.equal(numbersBody.numbers[0]?.status, "quarantined");

  const forceReleaseResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST",
    url: `/v1/admin/users/${seeded.bob.id}/force-release-number`
  });

  assert.equal(forceReleaseResponse.statusCode, 200);
  assert.equal(
    (forceReleaseResponse.json() as { number: { status: string } }).number.status,
    "quarantined"
  );

  const restoreResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST",
    payload: {
      phoneNumber: seeded.aliceNumber.phoneNumber,
      userId: seeded.charlie.id
    },
    url: "/v1/admin/numbers/restore"
  });

  assert.equal(restoreResponse.statusCode, 200);
  assert.equal(
    (restoreResponse.json() as { number: { userId: string } }).number.userId,
    seeded.charlie.id
  );

  const costResponse = await harness.app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "GET",
    url: "/v1/admin/cost"
  });

  assert.equal(costResponse.statusCode, 200);
  const costBody = costResponse.json() as {
    cost: {
      activeNumbers: number;
      isAlertTriggered: boolean;
      textEventsThisMonth: number;
      totalEstimatedSpendUsd: number;
    };
  };
  assert.equal(costBody.cost.activeNumbers, 1);
  assert.equal(costBody.cost.textEventsThisMonth, 162);
  assert.equal(costBody.cost.isAlertTriggered, true);
  assert.ok(costBody.cost.totalEstimatedSpendUsd > 1.5);

  await harness.app.close();
});
