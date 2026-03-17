import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryAdminStore } from "../admin/in-memory-store.js";
import { InMemoryAbuseStore } from "../abuse/in-memory-store.js";
import { InMemoryRateLimiter } from "../abuse/rate-limiter.js";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import { InMemoryAuthStore } from "./in-memory-store.js";
import type {
  CaptchaVerifier,
  OAuthVerifier,
  VerificationMailer
} from "./types.js";
import { buildApp } from "../server.js";

class PassCaptchaVerifier implements CaptchaVerifier {
  async verify(): Promise<void> {
    return;
  }
}

class FailCaptchaVerifier implements CaptchaVerifier {
  async verify(): Promise<void> {
    throw new AppError(400, "captcha_required", "CAPTCHA token is required.");
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

function extractVerificationToken(previewLink: string): string {
  const url = new URL(previewLink);
  const token = url.searchParams.get("token");

  if (!token) {
    throw new Error("Missing verification token in preview link.");
  }

  return token;
}

async function createTestApp(
  overrides: Partial<Parameters<typeof buildApp>[0]> = {}
) {
  const app = await buildApp({
    appleVerifier: new StaticOAuthVerifier("apple", "apple"),
    adminStore: new InMemoryAdminStore(),
    abuseStore: new InMemoryAbuseStore(),
    authStore: new InMemoryAuthStore(),
    captchaVerifier: new PassCaptchaVerifier(),
    checkPostgres: async () => true,
    checkRedis: async () => true,
    emailMailer: new PreviewMailer(),
    googleVerifier: new StaticOAuthVerifier("google", "google"),
    rateLimiter: new InMemoryRateLimiter(),
    ...overrides
  });

  return app;
}

test("email verification flow returns tokens and user", async () => {
  const app = await createTestApp();

  const startResponse = await app.inject({
    method: "POST",
    payload: {
      email: "person@example.com",
      password: "supersecure123"
    },
    url: "/v1/auth/email/start"
  });

  assert.equal(startResponse.statusCode, 202);
  const startBody = startResponse.json() as { previewLink: string };
  const token = extractVerificationToken(startBody.previewLink);

  const verifyResponse = await app.inject({
    method: "POST",
    payload: {
      fingerprint: "device-a",
      platform: "ios",
      token
    },
    url: "/v1/auth/email/verify"
  });

  const verifyBody = verifyResponse.json() as {
    tokens: { accessToken: string; refreshToken: string };
    user: { email: string };
  };

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(verifyBody.user.email, "person@example.com");
  assert.ok(verifyBody.tokens.accessToken.length > 20);
  assert.ok(verifyBody.tokens.refreshToken.length > 20);

  await app.close();
});

test("beta mode requires an invite code for new email signups and consumes it on verify", async () => {
  const previousBetaMode = env.BETA_MODE;
  env.BETA_MODE = true;

  try {
    const adminStore = new InMemoryAdminStore();
    await adminStore.createInviteCode({
      code: "EMAILBETA",
      maxUses: 1
    });

    const app = await createTestApp({
      adminStore
    });

    try {
      const blockedResponse = await app.inject({
        method: "POST",
        payload: {
          email: "beta-blocked@example.com",
          password: "supersecure123"
        },
        url: "/v1/auth/email/start"
      });

      assert.equal(blockedResponse.statusCode, 403);
      assert.equal(
        (blockedResponse.json() as { error: { code: string } }).error.code,
        "invite_code_required"
      );

      const allowedResponse = await app.inject({
        method: "POST",
        payload: {
          email: "beta-allowed@example.com",
          inviteCode: "EMAILBETA",
          password: "supersecure123"
        },
        url: "/v1/auth/email/start"
      });

      assert.equal(allowedResponse.statusCode, 202);
      const token = extractVerificationToken(
        (allowedResponse.json() as { previewLink: string }).previewLink
      );

      const verifyResponse = await app.inject({
        method: "POST",
        payload: {
          token
        },
        url: "/v1/auth/email/verify"
      });

      assert.equal(verifyResponse.statusCode, 200);
      const inviteCode = await adminStore.findInviteCodeByCode("EMAILBETA");
      assert.equal(inviteCode?.currentUses, 1);
    } finally {
      await app.close();
    }
  } finally {
    env.BETA_MODE = previousBetaMode;
  }
});

test("beta mode requires an invite code for first-time oauth signup", async () => {
  const previousBetaMode = env.BETA_MODE;
  env.BETA_MODE = true;

  try {
    const adminStore = new InMemoryAdminStore();
    await adminStore.createInviteCode({
      code: "OAUTHBETA",
      maxUses: 1
    });

    const app = await createTestApp({
      adminStore
    });

    try {
      const blockedResponse = await app.inject({
        method: "POST",
        payload: {
          identityToken: "oauth-beta-blocked"
        },
        url: "/v1/auth/oauth/google"
      });

      assert.equal(blockedResponse.statusCode, 403);
      assert.equal(
        (blockedResponse.json() as { error: { code: string } }).error.code,
        "invite_code_invalid"
      );

      const allowedResponse = await app.inject({
        method: "POST",
        payload: {
          identityToken: "oauth-beta-allowed",
          inviteCode: "OAUTHBETA"
        },
        url: "/v1/auth/oauth/google"
      });

      assert.equal(allowedResponse.statusCode, 200);
      const inviteCode = await adminStore.findInviteCodeByCode("OAUTHBETA");
      assert.equal(inviteCode?.currentUses, 1);
    } finally {
      await app.close();
    }
  } finally {
    env.BETA_MODE = previousBetaMode;
  }
});

test("refresh token rotates successfully", async () => {
  const app = await createTestApp();

  const startResponse = await app.inject({
    method: "POST",
    payload: {
      email: "refresh@example.com",
      password: "supersecure123"
    },
    url: "/v1/auth/email/start"
  });

  const token = extractVerificationToken(
    (startResponse.json() as { previewLink: string }).previewLink
  );

  const verifyResponse = await app.inject({
    method: "POST",
    payload: {
      token
    },
    url: "/v1/auth/email/verify"
  });

  const refreshToken = (
    verifyResponse.json() as {
      tokens: { refreshToken: string };
    }
  ).tokens.refreshToken;

  const refreshResponse = await app.inject({
    method: "POST",
    payload: {
      refreshToken
    },
    url: "/v1/auth/refresh"
  });

  assert.equal(refreshResponse.statusCode, 200);
  assert.notEqual(
    (refreshResponse.json() as { tokens: { refreshToken: string } }).tokens
      .refreshToken,
    refreshToken
  );

  await app.close();
});

test("oauth endpoints issue tokens for Apple and Google", async () => {
  const app = await createTestApp();

  const appleResponse = await app.inject({
    method: "POST",
    payload: {
      identityToken: "apple-token-1"
    },
    url: "/v1/auth/oauth/apple"
  });

  const googleResponse = await app.inject({
    method: "POST",
    payload: {
      identityToken: "google-token-1"
    },
    url: "/v1/auth/oauth/google"
  });

  assert.equal(appleResponse.statusCode, 200);
  assert.equal(googleResponse.statusCode, 200);
  assert.equal(
    (appleResponse.json() as { user: { email: string } }).user.email,
    "apple+apple-token-1@example.com"
  );
  assert.equal(
    (googleResponse.json() as { user: { email: string } }).user.email,
    "google+google-token-1@example.com"
  );

  await app.close();
});

test("protected routes reject missing access token", async () => {
  const app = await createTestApp();

  const response = await app.inject({
    method: "POST",
    payload: {
      fingerprint: "device-a",
      platform: "ios"
    },
    url: "/v1/devices/register"
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});

test("third account from same device fingerprint is rejected", async () => {
  const app = await createTestApp();

  const first = await app.inject({
    method: "POST",
    payload: {
      fingerprint: "shared-device",
      identityToken: "apple-token-one",
      platform: "ios"
    },
    url: "/v1/auth/oauth/apple"
  });

  const second = await app.inject({
    method: "POST",
    payload: {
      fingerprint: "shared-device",
      identityToken: "google-token-two",
      platform: "android"
    },
    url: "/v1/auth/oauth/google"
  });

  const third = await app.inject({
    method: "POST",
    payload: {
      fingerprint: "shared-device",
      identityToken: "apple-token-three",
      platform: "ios"
    },
    url: "/v1/auth/oauth/apple"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(third.statusCode, 403);

  await app.close();
});

test("invalid oauth payloads return 400 instead of 500", async () => {
  const app = await createTestApp();

  const response = await app.inject({
    method: "POST",
    payload: {
      identityToken: "bad"
    },
    url: "/v1/auth/oauth/apple"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    (
      response.json() as {
        error: { code: string; issues: Array<{ path: string[] }> };
      }
    ).error.code,
    "invalid_input"
  );
  assert.deepEqual(
    (
      response.json() as {
        error: { code: string; issues: Array<{ path: string[] }> };
      }
    ).error.issues[0]?.path,
    ["identityToken"]
  );

  await app.close();
});

test("captcha verifier errors are surfaced", async () => {
  const app = await createTestApp({
    captchaVerifier: new FailCaptchaVerifier()
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      email: "blocked@example.com",
      password: "supersecure123"
    },
    url: "/v1/auth/email/start"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    (response.json() as { error: { code: string } }).error.code,
    "captcha_required"
  );

  await app.close();
});
