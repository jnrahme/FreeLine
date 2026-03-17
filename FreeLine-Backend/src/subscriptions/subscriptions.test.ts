import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { AnalyticsService } from "../analytics/service.js";
import { InMemoryAbuseStore } from "../abuse/in-memory-store.js";
import { InMemoryRateLimiter } from "../abuse/rate-limiter.js";
import type {
  CaptchaVerifier,
  OAuthVerifier,
  VerificationMailer
} from "../auth/types.js";
import { InMemoryAuthStore } from "../auth/in-memory-store.js";
import { InMemoryCallStore } from "../calls/in-memory-store.js";
import { env } from "../config/env.js";
import { InMemoryMessageStore } from "../messages/in-memory-store.js";
import { InMemoryNumberStore } from "../numbers/in-memory-store.js";
import type {
  AvailableNumber,
  ProvisionedNumber,
  SmsResult,
  TelephonyProvider
} from "../telephony/telephony-provider.js";
import { buildApp } from "../server.js";
import { InMemorySubscriptionStore } from "./in-memory-store.js";
import type { RevenueCatPurchaseVerifier } from "./types.js";

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

class TestTelephonyProvider implements TelephonyProvider {
  async searchNumbers(areaCode: string): Promise<AvailableNumber[]> {
    const safeAreaCode = /^\d{3}$/.test(areaCode) ? areaCode : "415";
    return [
      {
        locality: "San Francisco",
        nationalFormat: `(${safeAreaCode}) 555-0199`,
        phoneNumber: `+1${safeAreaCode}5550199`,
        provider: "bandwidth",
        region: "CA"
      }
    ];
  }

  async provisionNumber(phoneNumber: string): Promise<ProvisionedNumber> {
    return {
      externalId: `test-${phoneNumber.replace(/\D/g, "")}`,
      phoneNumber,
      provider: "bandwidth"
    };
  }

  async releaseNumber(): Promise<void> {
    return;
  }

  async sendSms(_from: string, _to: string, _body: string): Promise<SmsResult> {
    return {
      externalId: `test-sms-${Date.now()}`,
      status: "queued"
    };
  }

  async createVoiceToken(identity: string): Promise<string> {
    return `voice-token:${identity}`;
  }

  verifySmsStatusSignature(): boolean {
    return true;
  }
}

class FakeRevenueCatPurchaseVerifier implements RevenueCatPurchaseVerifier {
  constructor(
    private readonly verifiedPurchases: Record<
      string,
      {
        appUserId: string;
        expiresAt: string | null;
        metadata?: Record<string, unknown>;
        transactionId?: string;
      }
    > = {}
  ) {}

  async verifyPurchase(input: {
    expectedEntitlements: string[];
    platform: "ios" | "android";
    productId: string;
    transactionId: string;
    userId: string;
    verificationToken?: string | null;
  }) {
    const purchase = this.verifiedPurchases[input.productId];
    if (!purchase) {
      throw new Error(`Missing fake RevenueCat purchase for ${input.productId}`);
    }

    return {
      appUserId: purchase.appUserId,
      expiresAt: purchase.expiresAt,
      metadata: {
        expectedEntitlements: input.expectedEntitlements,
        platform: input.platform,
        revenueCatAppUserId: purchase.appUserId,
        sandbox: false,
        verificationMode: "revenuecat",
        ...(purchase.metadata ?? {})
      },
      transactionId: purchase.transactionId ?? input.transactionId
    };
  }
}

async function createSubscriptionsTestApp(input: {
  revenueCatVerifier?: RevenueCatPurchaseVerifier;
} = {}) {
  const analyticsOutputFile = path.join(
    process.cwd(),
    ".runtime",
    `phase5-analytics-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`
  );
  const authStore = new InMemoryAuthStore();
  const numberStore = new InMemoryNumberStore();
  const messageStore = new InMemoryMessageStore();
  const callStore = new InMemoryCallStore();
  const abuseStore = new InMemoryAbuseStore();
  const rateLimiter = new InMemoryRateLimiter();
  const subscriptionStore = new InMemorySubscriptionStore();
  const app = await buildApp({
    analyticsService: new AnalyticsService(analyticsOutputFile),
    appleVerifier: new StaticOAuthVerifier("apple", "apple"),
    abuseStore,
    authStore,
    callStore,
    captchaVerifier: new PassCaptchaVerifier(),
    checkPostgres: async () => true,
    checkRedis: async () => true,
    emailMailer: new PreviewMailer(),
    googleVerifier: new StaticOAuthVerifier("google", "google"),
    messageStore,
    numberStore,
    rateLimiter,
    revenueCatVerifier: input.revenueCatVerifier,
    subscriptionStore,
    telephonyProvider: new TestTelephonyProvider()
  });

  return {
    analyticsOutputFile,
    app,
    numberStore
  };
}

async function authenticateAndClaimNumber(
  app: Awaited<ReturnType<typeof createSubscriptionsTestApp>>["app"],
  suffix: string
): Promise<{ accessToken: string; assignmentId: string; phoneNumber: string; userId: string }> {
  const authResponse = await app.inject({
    method: "POST",
    payload: {
      fingerprint: `phase5-device-${suffix}`,
      identityToken: `phase5-token-${suffix}`,
      platform: "ios"
    },
    url: "/v1/auth/oauth/apple"
  });

  assert.equal(authResponse.statusCode, 200);
  const authBody = authResponse.json() as {
    tokens: { accessToken: string };
    user: { id: string };
  };
  const lineNumber = String(
    Array.from(suffix).reduce((total, character) => total + character.charCodeAt(0), 0) %
      9000
  ).padStart(4, "0");
  const phoneNumber = `+1415555${lineNumber}`;
  const nationalFormat = `(415) 555-${lineNumber}`;

  const claimResponse = await app.inject({
    method: "POST",
    payload: {
      areaCode: "415",
      locality: "San Francisco",
      nationalFormat,
      phoneNumber,
      region: "CA"
    },
    headers: {
      authorization: `Bearer ${authBody.tokens.accessToken}`
    },
    url: "/v1/numbers/claim"
  });

  assert.equal(claimResponse.statusCode, 200);
  const claimBody = claimResponse.json() as {
    number: { assignmentId: string; phoneNumber: string };
  };

  return {
    accessToken: authBody.tokens.accessToken,
    assignmentId: claimBody.number.assignmentId,
    phoneNumber: claimBody.number.phoneNumber,
    userId: authBody.user.id
  };
}

test("premium verification enables elevated caps and disables ads", async () => {
  const { app } = await createSubscriptionsTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "premium");

  const verifyResponse = await app.inject({
    method: "POST",
    payload: {
      platform: "ios",
      productId: "freeline.premium.monthly",
      provider: "dev",
      transactionId: "premium-ios-1",
      verificationToken: "dev-freeline.premium.monthly"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/subscriptions/verify"
  });

  assert.equal(verifyResponse.statusCode, 200);
  const verifyBody = verifyResponse.json() as {
    allowances: {
      calls: { monthlyCapMinutes: number };
      messages: { monthlyCap: number; tier: string };
    };
    status: {
      adsEnabled: boolean;
      displayTier: string;
      numberLock: boolean;
      premiumCaps: boolean;
    };
    verifiedEntitlements: Array<{ entitlementKey: string }>;
  };
  assert.equal(verifyBody.status.adsEnabled, false);
  assert.equal(verifyBody.status.displayTier, "premium");
  assert.equal(verifyBody.status.numberLock, true);
  assert.equal(verifyBody.status.premiumCaps, true);
  assert.equal(verifyBody.allowances.messages.monthlyCap, env.ELEVATED_TIER_MONTHLY_SMS_CAP);
  assert.equal(
    verifyBody.allowances.calls.monthlyCapMinutes,
    env.ELEVATED_TIER_MONTHLY_CALL_MINUTES_CAP
  );
  assert.deepEqual(
    verifyBody.verifiedEntitlements.map((entitlement) => entitlement.entitlementKey).sort(),
    ["ad_free", "number_lock", "premium_caps"]
  );

  const rewardsResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/rewards/status"
  });
  assert.equal(rewardsResponse.statusCode, 200);
  const rewardsBody = rewardsResponse.json() as {
    calls: { monthlyCapMinutes: number };
    messages: { monthlyCap: number; tier: string };
    tier: string;
  };
  assert.equal(rewardsBody.tier, "elevated");
  assert.equal(rewardsBody.messages.tier, "elevated");
  assert.equal(rewardsBody.messages.monthlyCap, env.ELEVATED_TIER_MONTHLY_SMS_CAP);
  assert.equal(
    rewardsBody.calls.monthlyCapMinutes,
    env.ELEVATED_TIER_MONTHLY_CALL_MINUTES_CAP
  );
});

test("ad-free status persists through status fetch and keeps free-tier caps", async () => {
  const { app } = await createSubscriptionsTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "adfree");

  const verifyResponse = await app.inject({
    method: "POST",
    payload: {
      platform: "ios",
      productId: "freeline.ad_free.monthly",
      provider: "dev",
      transactionId: "adfree-ios-1",
      verificationToken: "dev-freeline.ad_free.monthly"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/subscriptions/verify"
  });

  assert.equal(verifyResponse.statusCode, 200);

  const statusResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/subscriptions/status"
  });

  assert.equal(statusResponse.statusCode, 200);
  const statusBody = statusResponse.json() as {
    catalog: Array<{ id: string }>;
    rewardClaims: { remainingClaims: number };
    status: {
      adsEnabled: boolean;
      adFree: boolean;
      displayTier: string;
      numberLock: boolean;
      premiumCaps: boolean;
    };
    usagePlan: { monthlyCallCapMinutes: number; monthlySmsCap: number };
  };
  assert.equal(statusBody.status.displayTier, "ad_free");
  assert.equal(statusBody.status.adsEnabled, false);
  assert.equal(statusBody.status.numberLock, false);
  assert.equal(statusBody.status.premiumCaps, false);
  assert.equal(statusBody.usagePlan.monthlySmsCap, env.FREE_TIER_MONTHLY_SMS_CAP);
  assert.equal(
    statusBody.usagePlan.monthlyCallCapMinutes,
    env.FREE_TIER_MONTHLY_CALL_MINUTES_CAP
  );
  assert.equal(statusBody.rewardClaims.remainingClaims, env.MAX_REWARDED_CLAIMS_PER_MONTH);
  assert.equal(statusBody.catalog.length, 3);
});

test("lock-my-number entitlement skips inactivity reclaim sweeps", async () => {
  const { app, numberStore } = await createSubscriptionsTestApp();
  const { accessToken, assignmentId, phoneNumber, userId } =
    await authenticateAndClaimNumber(app, "locked");

  const lockedResponse = await app.inject({
    method: "POST",
    payload: {
      platform: "ios",
      productId: "freeline.lock_number.monthly",
      provider: "dev",
      transactionId: "lock-ios-1",
      verificationToken: "dev-freeline.lock_number.monthly"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/subscriptions/verify"
  });
  assert.equal(lockedResponse.statusCode, 200);

  const now = new Date();
  const staleDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
  numberStore.debugUpdateAssignment({
    assignmentId,
    patch: {
      activationDeadline: staleDate,
      assignedAt: staleDate,
      lastActivityAt: staleDate
    }
  });

  const lifecycleResponse = await app.inject({
    method: "POST",
    payload: {
      now: now.toISOString()
    },
    headers: {
      "x-maintenance-key": env.MAINTENANCE_API_KEY
    },
    url: "/v1/internal/numbers/lifecycle/run"
  });

  assert.equal(lifecycleResponse.statusCode, 200);
  const lifecycleBody = lifecycleResponse.json() as {
    inactivitySweep: { reclaimedCount: number; warningCount: number };
  };
  assert.equal(lifecycleBody.inactivitySweep.reclaimedCount, 0);
  assert.equal(lifecycleBody.inactivitySweep.warningCount, 0);

  const currentNumber = await numberStore.findCurrentNumberByUser(userId);
  assert.equal(currentNumber?.phoneNumber, phoneNumber);
  assert.equal(currentNumber?.status, "assigned");
});

test("revenuecat verification stores entitlements without dev receipts", async () => {
  const { app } = await createSubscriptionsTestApp({
    revenueCatVerifier: new FakeRevenueCatPurchaseVerifier({
      "freeline.ad_free.monthly": {
        appUserId: "rc_test_user_1",
        expiresAt: "2030-01-01T00:00:00.000Z",
        metadata: {
          revenueCatStores: ["app_store"]
        },
        transactionId: "rc-adfree-1"
      }
    })
  });
  const { accessToken } = await authenticateAndClaimNumber(app, "revenuecat");

  const verifyResponse = await app.inject({
    method: "POST",
    payload: {
      platform: "ios",
      productId: "freeline.ad_free.monthly",
      provider: "revenuecat",
      transactionId: "client-transaction-id",
      verificationToken: "rc_test_user_1"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/subscriptions/verify"
  });

  assert.equal(verifyResponse.statusCode, 200);
  const verifyBody = verifyResponse.json() as {
    status: {
      adsEnabled: boolean;
      displayTier: string;
    };
    verifiedEntitlements: Array<{
      expiresAt: string | null;
      metadata: Record<string, unknown>;
      provider: string;
      transactionId: string;
    }>;
  };
  assert.equal(verifyBody.status.adsEnabled, false);
  assert.equal(verifyBody.status.displayTier, "ad_free");
  assert.equal(verifyBody.verifiedEntitlements.length, 1);
  assert.equal(verifyBody.verifiedEntitlements[0]?.provider, "revenuecat");
  assert.equal(verifyBody.verifiedEntitlements[0]?.transactionId, "rc-adfree-1:ad_free");
  assert.equal(
    verifyBody.verifiedEntitlements[0]?.metadata.verificationMode,
    "revenuecat"
  );
  assert.deepEqual(verifyBody.verifiedEntitlements[0]?.metadata.revenueCatStores, ["app_store"]);
});

test("analytics event route records ad telemetry", async () => {
  const { analyticsOutputFile, app } = await createSubscriptionsTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "analytics");

  const eventResponse = await app.inject({
    method: "POST",
    payload: {
      eventType: "rewarded_video_complete",
      properties: {
        adType: "rewarded",
        placement: "settings_earn_more",
        rewardType: "text_events"
      }
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/analytics/events"
  });

  assert.equal(eventResponse.statusCode, 200);
  const fileContents = await readFile(analyticsOutputFile, "utf8");
  const entries = fileContents
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { eventType: string; properties: { placement: string } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.eventType, "rewarded_video_complete");
  assert.equal(entries[0]?.properties.placement, "settings_earn_more");

  await rm(analyticsOutputFile, { force: true });
});
