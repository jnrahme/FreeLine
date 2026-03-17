import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryAbuseStore } from "../abuse/in-memory-store.js";
import { InMemoryRateLimiter } from "../abuse/rate-limiter.js";
import { InMemoryAuthStore } from "../auth/in-memory-store.js";
import type {
  CaptchaVerifier,
  OAuthVerifier,
  VerificationMailer
} from "../auth/types.js";
import type {
  AvailableNumber,
  ProvisionedNumber,
  SmsResult,
  TelephonyProvider
} from "../telephony/telephony-provider.js";
import { InMemoryNumberStore } from "./in-memory-store.js";
import { buildApp } from "../server.js";

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

class TrackingTelephonyProvider implements TelephonyProvider {
  readonly releasedNumbers: string[] = [];

  async searchNumbers(areaCode: string): Promise<AvailableNumber[]> {
    const safeAreaCode = /^\d{3}$/.test(areaCode) ? areaCode : "415";

    return [
      {
        locality: "San Francisco",
        nationalFormat: `(${safeAreaCode}) 555-0101`,
        phoneNumber: `+1${safeAreaCode}5550101`,
        provider: "bandwidth",
        region: "CA"
      }
    ];
  }

  async provisionNumber(phoneNumber: string): Promise<ProvisionedNumber> {
    return {
      externalId: `tracked-${phoneNumber.replace(/\D/g, "")}`,
      phoneNumber,
      provider: "bandwidth"
    };
  }

  async releaseNumber(phoneNumber: string): Promise<void> {
    this.releasedNumbers.push(phoneNumber);
  }

  async sendSms(): Promise<SmsResult> {
    return {
      externalId: "tracked-sms",
      status: "queued"
    };
  }

  async createVoiceToken(): Promise<string> {
    return "tracked-voice-token";
  }

  verifySmsStatusSignature(): boolean {
    return true;
  }
}

async function createNumberTestApp(options: {
  telephonyProvider?: TelephonyProvider;
} = {}) {
  const numberStore = new InMemoryNumberStore();
  const app = await buildApp({
    appleVerifier: new StaticOAuthVerifier("apple", "apple"),
    abuseStore: new InMemoryAbuseStore(),
    authStore: new InMemoryAuthStore(),
    captchaVerifier: new PassCaptchaVerifier(),
    checkPostgres: async () => true,
    checkRedis: async () => true,
    emailMailer: new PreviewMailer(),
    googleVerifier: new StaticOAuthVerifier("google", "google"),
    numberStore,
    rateLimiter: new InMemoryRateLimiter(),
    telephonyProvider: options.telephonyProvider
  });

  return {
    app,
    numberStore
  };
}

async function authenticate(
  app: Awaited<ReturnType<typeof createNumberTestApp>>["app"]
) {
  const response = await app.inject({
    method: "POST",
    payload: {
      fingerprint: "number-test-device",
      identityToken: "number-test-token",
      platform: "ios"
    },
    url: "/v1/auth/oauth/apple"
  });

  const body = response.json() as {
    user: { id: string };
    tokens: { accessToken: string };
  };

  return {
    accessToken: body.tokens.accessToken,
    userId: body.user.id
  };
}

test("authenticated user can claim, fetch, and release a number", async () => {
  const telephonyProvider = new TrackingTelephonyProvider();
  const { app } = await createNumberTestApp({
    telephonyProvider
  });
  const { accessToken } = await authenticate(app);

  const searchResponse = await app.inject({
    method: "GET",
    url: "/v1/numbers/search?areaCode=415"
  });
  assert.equal(searchResponse.statusCode, 200);

  const searchBody = searchResponse.json() as {
    numbers: Array<{
      areaCode?: string;
      locality: string;
      nationalFormat: string;
      phoneNumber: string;
      region: string;
    }>;
  };

  const number = searchBody.numbers[0];
  assert.ok(number);

  const claimResponse = await app.inject({
    method: "POST",
    url: "/v1/numbers/claim",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      areaCode: "415",
      locality: number?.locality,
      nationalFormat: number?.nationalFormat,
      phoneNumber: number?.phoneNumber,
      region: number?.region
    }
  });

  assert.equal(claimResponse.statusCode, 200);
  const claimBody = claimResponse.json() as {
    number: { phoneNumber: string; status: string };
  };
  assert.equal(claimBody.number.phoneNumber, number?.phoneNumber);
  assert.equal(claimBody.number.status, "assigned");

  const meResponse = await app.inject({
    method: "GET",
    url: "/v1/numbers/me",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  assert.equal(meResponse.statusCode, 200);
  assert.equal(
    (meResponse.json() as { number: { phoneNumber: string } }).number.phoneNumber,
    number?.phoneNumber
  );

  const releaseResponse = await app.inject({
    method: "POST",
    url: "/v1/numbers/release",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  assert.equal(releaseResponse.statusCode, 200);
  assert.equal(
    (releaseResponse.json() as { number: { status: string } }).number.status,
    "quarantined"
  );
  assert.deepEqual(telephonyProvider.releasedNumbers, []);

  await app.close();
});

test("second claim by the same user returns 409", async () => {
  const { app } = await createNumberTestApp();
  const { accessToken } = await authenticate(app);

  const firstClaim = await app.inject({
    method: "POST",
    url: "/v1/numbers/claim",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      areaCode: "415",
      locality: "San Francisco",
      nationalFormat: "(415) 555-0101",
      phoneNumber: "+14155550101",
      region: "CA"
    }
  });

  const secondClaim = await app.inject({
    method: "POST",
    url: "/v1/numbers/claim",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      areaCode: "415",
      locality: "San Francisco",
      nationalFormat: "(415) 555-0102",
      phoneNumber: "+14155550102",
      region: "CA"
    }
  });

  assert.equal(firstClaim.statusCode, 200);
  assert.equal(secondClaim.statusCode, 409);

  await app.close();
});

test("maintenance lifecycle route releases unactivated numbers with a structured response", async () => {
  const { app, numberStore } = await createNumberTestApp();
  const { accessToken } = await authenticate(app);

  const claimResponse = await app.inject({
    method: "POST",
    url: "/v1/numbers/claim",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      areaCode: "415",
      locality: "San Francisco",
      nationalFormat: "(415) 555-0103",
      phoneNumber: "+14155550103",
      region: "CA"
    }
  });

  assert.equal(claimResponse.statusCode, 200);
  const claimBody = claimResponse.json() as {
    number: { assignmentId: string };
  };

  numberStore.debugUpdateAssignment({
    assignmentId: claimBody.number.assignmentId,
    patch: {
      activationDeadline: "2026-03-16T11:00:00.000Z",
      assignedAt: "2026-03-16T11:00:00.000Z"
    }
  });

  const lifecycleResponse = await app.inject({
    method: "POST",
    url: "/v1/internal/numbers/lifecycle/run",
    headers: {
      "x-maintenance-key": "dev-maintenance-key"
    },
    payload: {
      now: "2026-03-17T12:00:00.000Z"
    }
  });

  assert.equal(lifecycleResponse.statusCode, 200);
  const lifecycleBody = lifecycleResponse.json() as {
    activationSweep: {
      released: Array<{ phoneNumber: string; releaseReason: string; status: string }>;
      releasedCount: number;
    };
  };
  assert.equal(lifecycleBody.activationSweep.releasedCount, 1);
  assert.equal(
    lifecycleBody.activationSweep.released[0]?.phoneNumber,
    "+14155550103"
  );
  assert.equal(lifecycleBody.activationSweep.released[0]?.releaseReason, "not_activated");
  assert.equal(lifecycleBody.activationSweep.released[0]?.status, "available");

  await app.close();
});

test("maintenance restore route reassigns a quarantined number to a user", async () => {
  const { app, numberStore } = await createNumberTestApp();
  const { accessToken, userId } = await authenticate(app);

  const claimResponse = await app.inject({
    method: "POST",
    url: "/v1/numbers/claim",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      areaCode: "415",
      locality: "San Francisco",
      nationalFormat: "(415) 555-0104",
      phoneNumber: "+14155550104",
      region: "CA"
    }
  });

  assert.equal(claimResponse.statusCode, 200);
  const claimBody = claimResponse.json() as {
    number: { assignmentId: string };
  };

  numberStore.debugUpdateAssignment({
    assignmentId: claimBody.number.assignmentId,
    patch: {
      assignedAt: "2026-03-01T12:00:00.000Z",
      lastActivityAt: "2026-03-01T12:00:00.000Z"
    }
  });

  const reclaimResponse = await app.inject({
    method: "POST",
    url: "/v1/internal/numbers/lifecycle/run",
    headers: {
      "x-maintenance-key": "dev-maintenance-key"
    },
    payload: {
      now: "2026-03-15T12:00:00.000Z"
    }
  });

  assert.equal(reclaimResponse.statusCode, 200);
  const restoreResponse = await app.inject({
    method: "POST",
    url: "/v1/internal/numbers/restore",
    headers: {
      "x-maintenance-key": "dev-maintenance-key"
    },
    payload: {
      now: "2026-03-15T13:00:00.000Z",
      phoneNumber: "+14155550104",
      userId
    }
  });

  assert.equal(restoreResponse.statusCode, 200);
  const restoreBody = restoreResponse.json() as {
    number: { phoneNumber: string; status: string; userId: string };
  };
  assert.equal(restoreBody.number.phoneNumber, "+14155550104");
  assert.equal(restoreBody.number.status, "assigned");
  assert.equal(restoreBody.number.userId, userId);

  await app.close();
});
