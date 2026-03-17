import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { InMemoryAbuseStore } from "../abuse/in-memory-store.js";
import { InMemoryRateLimiter } from "../abuse/rate-limiter.js";
import { AbuseService } from "../abuse/service.js";
import { InMemoryAuthStore } from "../auth/in-memory-store.js";
import type {
  CaptchaVerifier,
  OAuthVerifier,
  VerificationMailer
} from "../auth/types.js";
import { InMemoryMessageStore } from "../messages/in-memory-store.js";
import type { PushNotifier } from "../notifications/types.js";
import { InMemoryNumberStore } from "../numbers/in-memory-store.js";
import { env } from "../config/env.js";
import { buildApp } from "../server.js";
import { computeWebhookSignature } from "../telephony/signing.js";
import type {
  AvailableNumber,
  ProvisionedNumber,
  SmsResult,
  TelephonyProvider
} from "../telephony/telephony-provider.js";
import { InMemoryCallStore } from "./in-memory-store.js";
import { CallService } from "./service.js";

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
  private readonly webhookSecret = "phase3b-test-secret";

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
      externalId: `test-${phoneNumber.replace(/\D/g, "")}`,
      phoneNumber,
      provider: "bandwidth"
    };
  }

  async releaseNumber(_phoneNumber: string): Promise<void> {
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

  verifySmsStatusSignature(payload: string, signature: string | undefined): boolean {
    return computeWebhookSignature(this.webhookSecret, payload) === signature;
  }

  signPayload(payload: string): string {
    return computeWebhookSignature(this.webhookSecret, payload);
  }
}

class TestPushNotifier implements PushNotifier {
  readonly inboundCalls: Array<{
    action: string;
    callerNumber: string;
    providerCallId: string;
    tokenCount: number;
  }> = [];

  readonly inboundMessages: Array<{
    conversationId: string;
    messageId: string;
  }> = [];

  readonly missedCalls: Array<{
    callerNumber: string;
    providerCallId: string;
    tokenCount: number;
  }> = [];

  readonly voicemails: Array<{
    callerNumber: string;
    providerCallId: string;
    tokenCount: number;
    voicemailId: string;
  }> = [];

  async sendInboundCall(input: {
    plan: {
      action: "ring" | "voicemail";
      callerNumber: string;
      providerCallId: string;
    };
    tokens: Array<{
      token: string;
    }>;
  }): Promise<void> {
    this.inboundCalls.push({
      action: input.plan.action,
      callerNumber: input.plan.callerNumber,
      providerCallId: input.plan.providerCallId,
      tokenCount: input.tokens.length
    });
  }

  async sendInboundMessage(input: {
    conversation: { id: string };
    message: { id: string };
    tokens: Array<{ token: string }>;
  }): Promise<void> {
    this.inboundMessages.push({
      conversationId: input.conversation.id,
      messageId: input.message.id
    });
  }

  async sendNumberLifecycle(): Promise<void> {
    return;
  }

  async sendMissedCall(input: {
    call: {
      providerCallId: string;
      remoteNumber: string;
    };
    tokens: Array<{ token: string }>;
  }): Promise<void> {
    this.missedCalls.push({
      callerNumber: input.call.remoteNumber,
      providerCallId: input.call.providerCallId,
      tokenCount: input.tokens.length
    });
  }

  async sendVoicemail(input: {
    tokens: Array<{ token: string }>;
    voicemail: {
      callerNumber: string;
      id: string;
      providerCallId: string;
    };
  }): Promise<void> {
    this.voicemails.push({
      callerNumber: input.voicemail.callerNumber,
      providerCallId: input.voicemail.providerCallId,
      tokenCount: input.tokens.length,
      voicemailId: input.voicemail.id
    });
  }
}

async function createCallTestApp(options: {
  monthlyCapMinutes?: number;
} = {}) {
  const authStore = new InMemoryAuthStore();
  const numberStore = new InMemoryNumberStore();
  const messageStore = new InMemoryMessageStore();
  const callStore = new InMemoryCallStore();
  const abuseStore = new InMemoryAbuseStore();
  const rateLimiter = new InMemoryRateLimiter();
  const abuseService = new AbuseService({
    authStore,
    callStore,
    messageStore,
    policy: {
      freeTierMonthlyCallMinutesCap: options.monthlyCapMinutes,
      standardTierDailyCallMinutesCap: options.monthlyCapMinutes,
      freeTierDailyCallMinutesCap: options.monthlyCapMinutes
    },
    rateLimiter,
    store: abuseStore
  });
  const telephonyProvider = new TestTelephonyProvider();
  const pushNotifier = new TestPushNotifier();
  const callService = new CallService(
    callStore,
    numberStore,
    telephonyProvider,
    pushNotifier,
    {
      abuseService,
      monthlyCapMinutes: options.monthlyCapMinutes
    }
  );

  const app = await buildApp({
    appleVerifier: new StaticOAuthVerifier("apple", "apple"),
    abuseService,
    abuseStore,
    authStore,
    callService,
    callStore,
    captchaVerifier: new PassCaptchaVerifier(),
    checkPostgres: async () => true,
    checkRedis: async () => true,
    emailMailer: new PreviewMailer(),
    googleVerifier: new StaticOAuthVerifier("google", "google"),
    messageStore,
    numberStore,
    pushNotifier,
    rateLimiter,
    telephonyProvider
  });

  return {
    app,
    pushNotifier,
    telephonyProvider
  };
}

async function authenticateAndClaimNumber(
  app: Awaited<ReturnType<typeof createCallTestApp>>["app"],
  suffix: string
): Promise<{ accessToken: string; phoneNumber: string }> {
  const authResponse = await app.inject({
    method: "POST",
    payload: {
      fingerprint: `calls-test-device-${suffix}`,
      identityToken: `calls-test-token-${suffix}`,
      platform: "ios"
    },
    url: "/v1/auth/oauth/apple"
  });

  const accessToken = (authResponse.json() as { tokens: { accessToken: string } }).tokens
    .accessToken;

  const claimResponse = await app.inject({
    method: "POST",
    payload: {
      areaCode: "415",
      locality: "San Francisco",
      nationalFormat: "(415) 555-0101",
      phoneNumber: "+14155550101",
      region: "CA"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/numbers/claim"
  });

  const phoneNumber = (claimResponse.json() as { number: { phoneNumber: string } }).number
    .phoneNumber;

  return {
    accessToken,
    phoneNumber
  };
}

async function registerCallPushToken(input: {
  accessToken: string;
  app: Awaited<ReturnType<typeof createCallTestApp>>["app"];
  channel?: "alert" | "voip";
  deviceId?: string;
  platform?: "ios" | "android";
  token?: string;
}) {
  return input.app.inject({
    method: "POST",
    payload: {
      channel: input.channel ?? "alert",
      deviceId: input.deviceId ?? "ios-device-1",
      platform: input.platform ?? "ios",
      token: input.token ?? "push-token-1"
    },
    headers: {
      authorization: `Bearer ${input.accessToken}`
    },
    url: "/v1/devices/call-push-token"
  });
}

async function postCallStatusWebhook(input: {
  app: Awaited<ReturnType<typeof createCallTestApp>>["app"];
  events: Array<{
    durationSeconds?: number;
    endedAt?: string;
    from: string;
    providerCallId: string;
    startedAt?: string;
    status: string;
    to: string;
  }>;
  telephonyProvider: TestTelephonyProvider;
}) {
  const payload = JSON.stringify({
    events: input.events
  });

  return input.app.inject({
    method: "POST",
    payload,
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": input.telephonyProvider.signPayload(payload)
    },
    url: "/v1/webhooks/telecom/calls/status"
  });
}

async function postInboundCallWebhook(input: {
  app: Awaited<ReturnType<typeof createCallTestApp>>["app"];
  events: Array<{
    from: string;
    providerCallId: string;
    startedAt?: string;
    to: string;
  }>;
  telephonyProvider: TestTelephonyProvider;
}) {
  const payload = JSON.stringify({
    events: input.events
  });

  return input.app.inject({
    method: "POST",
    payload,
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": input.telephonyProvider.signPayload(payload)
    },
    url: "/v1/webhooks/telecom/calls/inbound"
  });
}

async function postVoicemailWebhook(input: {
  app: Awaited<ReturnType<typeof createCallTestApp>>["app"];
  events: Array<{
    audioUrl: string;
    durationSeconds?: number;
    from: string;
    providerCallId: string;
    to: string;
    transcription?: string;
  }>;
  telephonyProvider: TestTelephonyProvider;
}) {
  const payload = JSON.stringify({
    events: input.events
  });

  return input.app.inject({
    method: "POST",
    payload,
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": input.telephonyProvider.signPayload(payload)
    },
    url: "/v1/webhooks/telecom/calls/voicemail"
  });
}

function buildTwilioSignature(input: {
  authToken: string;
  params: Record<string, string>;
  url: string;
}): string {
  const signaturePayload = Object.keys(input.params)
    .sort()
    .reduce((value, key) => value + key + input.params[key], input.url);

  return crypto
    .createHmac("sha1", input.authToken)
    .update(Buffer.from(signaturePayload, "utf8"))
    .digest("base64");
}

test("voice token issuance returns token and remaining minutes", async () => {
  const { app } = await createCallTestApp({ monthlyCapMinutes: 15 });
  const { accessToken } = await authenticateAndClaimNumber(app, "token");

  const tokenResponse = await app.inject({
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/calls/token"
  });

  assert.equal(tokenResponse.statusCode, 200);
  const body = tokenResponse.json() as {
    allowance: { monthlyCapMinutes: number; monthlyRemainingMinutes: number; monthlyUsedMinutes: number };
    expiresInSeconds: number;
    fromNumber: string;
    token: string;
  };

  assert.equal(body.token.startsWith("voice-token:"), true);
  assert.equal(body.expiresInSeconds, 3600);
  assert.equal(body.fromNumber, "+14155550101");
  assert.equal(body.allowance.monthlyCapMinutes, 15);
  assert.equal(body.allowance.monthlyRemainingMinutes, 15);
  assert.equal(body.allowance.monthlyUsedMinutes, 0);

  await app.close();
});

test("call status webhook creates and updates outbound call records and history order", async () => {
  const { app, telephonyProvider } = await createCallTestApp({ monthlyCapMinutes: 15 });
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "history");

  const firstCallStart = "2026-03-17T12:00:00.000Z";
  const firstCallEnd = "2026-03-17T12:02:05.000Z";
  const secondCallStart = "2026-03-17T13:00:00.000Z";
  const secondCallEnd = "2026-03-17T13:00:45.000Z";

  const firstResponse = await postCallStatusWebhook({
    app,
    events: [
      {
        from: phoneNumber,
        providerCallId: "call-1",
        startedAt: firstCallStart,
        status: "initiated",
        to: "+14155550400"
      },
      {
        from: phoneNumber,
        providerCallId: "call-1",
        startedAt: firstCallStart,
        status: "ringing",
        to: "+14155550400"
      },
      {
        from: phoneNumber,
        providerCallId: "call-1",
        startedAt: firstCallStart,
        status: "answered",
        to: "+14155550400"
      },
      {
        durationSeconds: 125,
        endedAt: firstCallEnd,
        from: phoneNumber,
        providerCallId: "call-1",
        startedAt: firstCallStart,
        status: "completed",
        to: "+14155550400"
      }
    ],
    telephonyProvider
  });

  const secondResponse = await postCallStatusWebhook({
    app,
    events: [
      {
        durationSeconds: 45,
        endedAt: secondCallEnd,
        from: phoneNumber,
        providerCallId: "call-2",
        startedAt: secondCallStart,
        status: "completed",
        to: "+14155550401"
      }
    ],
    telephonyProvider
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal((firstResponse.json() as { updatedCount: number }).updatedCount, 4);
  assert.equal((secondResponse.json() as { updatedCount: number }).updatedCount, 1);

  const historyResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/calls/history"
  });

  assert.equal(historyResponse.statusCode, 200);
  const historyBody = historyResponse.json() as {
    allowance: { monthlyRemainingMinutes: number; monthlyUsedMinutes: number };
    calls: Array<{
      direction: string;
      durationSeconds: number;
      providerCallId: string;
      remoteNumber: string;
      status: string;
    }>;
  };

  assert.deepEqual(
    historyBody.calls.map((call) => call.remoteNumber),
    ["+14155550401", "+14155550400"]
  );
  assert.equal(historyBody.calls[0]?.providerCallId, "call-2");
  assert.equal(historyBody.calls[0]?.status, "completed");
  assert.equal(historyBody.calls[1]?.durationSeconds, 125);
  assert.equal(historyBody.calls[1]?.direction, "outbound");
  assert.equal(historyBody.allowance.monthlyUsedMinutes, 3);
  assert.equal(historyBody.allowance.monthlyRemainingMinutes, 12);

  await app.close();
});

test("call minute cap refuses token issuance after completed usage reaches the limit", async () => {
  const { app, telephonyProvider } = await createCallTestApp({ monthlyCapMinutes: 1 });
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "cap");

  const webhookResponse = await postCallStatusWebhook({
    app,
    events: [
      {
        durationSeconds: 61,
        endedAt: "2026-03-17T12:01:01.000Z",
        from: phoneNumber,
        providerCallId: "cap-call",
        startedAt: "2026-03-17T12:00:00.000Z",
        status: "completed",
        to: "+14155550402"
      }
    ],
    telephonyProvider
  });

  assert.equal(webhookResponse.statusCode, 200);

  const tokenResponse = await app.inject({
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/calls/token"
  });

  assert.equal(tokenResponse.statusCode, 429);
  assert.equal(
    (tokenResponse.json() as { error: { message: string } }).error.message,
    "Free tier call limit reached. Watch an ad or upgrade."
  );

  await app.close();
});

test("reward claims expand monthly call allowance", async () => {
  const { app } = await createCallTestApp({ monthlyCapMinutes: 15 });
  const { accessToken } = await authenticateAndClaimNumber(app, "call-reward");

  const initialStatus = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/rewards/status"
  });

  assert.equal(initialStatus.statusCode, 200);
  assert.equal(
    (initialStatus.json() as { calls: { monthlyCapMinutes: number } }).calls
      .monthlyCapMinutes,
    15
  );

  const rewardResponse = await app.inject({
    method: "POST",
    payload: {
      rewardType: "call_minutes"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/rewards/claim"
  });

  assert.equal(rewardResponse.statusCode, 200);
  const rewardBody = rewardResponse.json() as {
    calls: { monthlyCapMinutes: number };
    claimedReward: { callMinutesGranted: number; remainingClaims: number };
  };
  assert.equal(rewardBody.calls.monthlyCapMinutes, 20);
  assert.equal(rewardBody.claimedReward.callMinutesGranted, 5);
  assert.equal(rewardBody.claimedReward.remainingClaims, 3);

  await app.close();
});

test("inbound webhook sends push and returns ring instructions", async () => {
  const { app, pushNotifier, telephonyProvider } = await createCallTestApp({
    monthlyCapMinutes: 15
  });
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "inbound");

  const pushTokenResponse = await registerCallPushToken({
    accessToken,
    app,
    channel: "alert",
    token: "call-alert-token"
  });
  assert.equal(pushTokenResponse.statusCode, 200);

  const inboundResponse = await postInboundCallWebhook({
    app,
    events: [
      {
        from: "+14155550999",
        providerCallId: "inbound-call-1",
        startedAt: "2026-03-17T14:00:00.000Z",
        to: phoneNumber
      }
    ],
    telephonyProvider
  });

  assert.equal(inboundResponse.statusCode, 200);
  const body = inboundResponse.json() as {
    createdCount: number;
    droppedCount: number;
    plans: Array<{
      action: string;
      callerNumber: string;
      identity: string | null;
      providerCallId: string;
      ringSeconds: number;
      tokens: Array<{ token: string }>;
    }>;
  };

  assert.equal(body.createdCount, 1);
  assert.equal(body.droppedCount, 0);
  assert.equal(body.plans[0]?.action, "ring");
  assert.equal(body.plans[0]?.callerNumber, "+14155550999");
  assert.equal(body.plans[0]?.providerCallId, "inbound-call-1");
  assert.equal(body.plans[0]?.ringSeconds, 30);
  assert.equal(body.plans[0]?.identity?.includes(":"), true);
  assert.equal(body.plans[0]?.tokens.length, 1);
  assert.deepEqual(pushNotifier.inboundCalls, [
    {
      action: "ring",
      callerNumber: "+14155550999",
      providerCallId: "inbound-call-1",
      tokenCount: 1
    }
  ]);

  await app.close();
});

test("inbound webhook routes directly to voicemail when allowance is exhausted", async () => {
  const { app, pushNotifier, telephonyProvider } = await createCallTestApp({
    monthlyCapMinutes: 1
  });
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "limit-inbound");

  await registerCallPushToken({
    accessToken,
    app,
    channel: "alert",
    token: "call-alert-token"
  });

  const usageResponse = await postCallStatusWebhook({
    app,
    events: [
      {
        durationSeconds: 61,
        endedAt: "2026-03-17T15:01:01.000Z",
        from: phoneNumber,
        providerCallId: "limit-outbound-1",
        startedAt: "2026-03-17T15:00:00.000Z",
        status: "completed",
        to: "+14155550402"
      }
    ],
    telephonyProvider
  });
  assert.equal(usageResponse.statusCode, 200);

  const inboundResponse = await postInboundCallWebhook({
    app,
    events: [
      {
        from: "+14155550888",
        providerCallId: "inbound-call-cap",
        startedAt: "2026-03-17T15:10:00.000Z",
        to: phoneNumber
      }
    ],
    telephonyProvider
  });

  assert.equal(inboundResponse.statusCode, 200);
  const body = inboundResponse.json() as {
    plans: Array<{
      action: string;
      identity: string | null;
      reason: string | null;
    }>;
  };

  assert.equal(body.plans[0]?.action, "voicemail");
  assert.equal(body.plans[0]?.identity, null);
  assert.equal(body.plans[0]?.reason, "cap_reached");
  assert.equal(pushNotifier.inboundCalls.length, 0);

  await app.close();
});

test("voicemail webhook saves recording and read/delete work end-to-end", async () => {
  const { app, pushNotifier, telephonyProvider } = await createCallTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "voicemail");

  await registerCallPushToken({
    accessToken,
    app,
    channel: "alert",
    token: "call-alert-token"
  });

  const voicemailResponse = await postVoicemailWebhook({
    app,
    events: [
      {
        audioUrl: "https://media.freeline.test/recordings/vm-1.mp3",
        durationSeconds: 42,
        from: "+14155550777",
        providerCallId: "vm-call-1",
        to: phoneNumber,
        transcription: "Testing one two"
      }
    ],
    telephonyProvider
  });

  assert.equal(voicemailResponse.statusCode, 200);
  assert.equal(pushNotifier.voicemails.length, 1);
  assert.equal(pushNotifier.voicemails[0]?.callerNumber, "+14155550777");

  const listResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/voicemails"
  });

  assert.equal(listResponse.statusCode, 200);
  const listBody = listResponse.json() as {
    voicemails: Array<{
      audioUrl: string;
      callerNumber: string;
      durationSeconds: number;
      id: string;
      isRead: boolean;
      transcription: string | null;
    }>;
  };

  assert.equal(listBody.voicemails.length, 1);
  assert.equal(listBody.voicemails[0]?.audioUrl, "https://media.freeline.test/recordings/vm-1.mp3");
  assert.equal(listBody.voicemails[0]?.durationSeconds, 42);
  assert.equal(listBody.voicemails[0]?.isRead, false);
  assert.equal(listBody.voicemails[0]?.transcription, "Testing one two");

  const voicemailId = listBody.voicemails[0]!.id;

  const readResponse = await app.inject({
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/voicemails/${voicemailId}/read`
  });

  assert.equal(readResponse.statusCode, 200);
  assert.equal(
    (readResponse.json() as { voicemail: { isRead: boolean } }).voicemail.isRead,
    true
  );

  const deleteResponse = await app.inject({
    method: "DELETE",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/voicemails/${voicemailId}`
  });

  assert.equal(deleteResponse.statusCode, 204);

  const emptyListResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/voicemails"
  });

  assert.equal(
    (emptyListResponse.json() as { voicemails: unknown[] }).voicemails.length,
    0
  );

  await app.close();
});

test("missed inbound call sends notification and updates history", async () => {
  const { app, pushNotifier, telephonyProvider } = await createCallTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "missed");

  await registerCallPushToken({
    accessToken,
    app,
    channel: "alert",
    token: "call-alert-token"
  });

  const inboundResponse = await postInboundCallWebhook({
    app,
    events: [
      {
        from: "+14155550666",
        providerCallId: "missed-call-1",
        startedAt: "2026-03-17T16:00:00.000Z",
        to: phoneNumber
      }
    ],
    telephonyProvider
  });
  assert.equal(inboundResponse.statusCode, 200);

  const missedResponse = await postCallStatusWebhook({
    app,
    events: [
      {
        endedAt: "2026-03-17T16:00:30.000Z",
        from: "+14155550666",
        providerCallId: "missed-call-1",
        startedAt: "2026-03-17T16:00:00.000Z",
        status: "missed",
        to: phoneNumber
      }
    ],
    telephonyProvider
  });

  assert.equal(missedResponse.statusCode, 200);
  assert.deepEqual(pushNotifier.missedCalls, [
    {
      callerNumber: "+14155550666",
      providerCallId: "missed-call-1",
      tokenCount: 1
    }
  ]);

  const historyResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/calls/history"
  });

  assert.equal(historyResponse.statusCode, 200);
  const historyBody = historyResponse.json() as {
    calls: Array<{
      direction: string;
      remoteNumber: string;
      status: string;
    }>;
  };

  assert.equal(historyBody.calls[0]?.direction, "inbound");
  assert.equal(historyBody.calls[0]?.remoteNumber, "+14155550666");
  assert.equal(historyBody.calls[0]?.status, "missed");

  await app.close();
});

test("twilio inbound webhook returns client dial twiml for an active line", async () => {
  const previousAuthToken = env.TWILIO_AUTH_TOKEN;
  const previousBaseUrl = env.PUBLIC_BASE_URL;
  env.TWILIO_AUTH_TOKEN = "phase3b-twilio-test-secret";
  env.PUBLIC_BASE_URL = "http://localhost";

  const { app } = await createCallTestApp({ monthlyCapMinutes: 15 });

  try {
    const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "twilio-inbound");
    await registerCallPushToken({
      accessToken,
      app,
      channel: "voip",
      token: "ios-voip-token"
    });

    const params = {
      CallSid: "CA1234567890",
      Caller: "+14155550777",
      From: "+14155550777",
      To: phoneNumber
    };

    const response = await app.inject({
      method: "POST",
      headers: {
        host: "localhost",
        "x-twilio-signature": buildTwilioSignature({
          authToken: env.TWILIO_AUTH_TOKEN,
          params,
          url: "http://localhost/v1/webhooks/twilio/voice/inbound"
        })
      },
      payload: params,
      url: "/v1/webhooks/twilio/voice/inbound"
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<Dial answerOnBridge="true"/);
    assert.match(response.body, /<Client[^>]*>[^<]+<\/Client>/);
    assert.match(response.body, /\/v1\/webhooks\/twilio\/voice\/voicemail/);
  } finally {
    env.TWILIO_AUTH_TOKEN = previousAuthToken;
    env.PUBLIC_BASE_URL = previousBaseUrl;
    await app.close();
  }
});

test("twilio inbound webhook routes directly to voicemail when call allowance is exhausted", async () => {
  const previousAuthToken = env.TWILIO_AUTH_TOKEN;
  const previousBaseUrl = env.PUBLIC_BASE_URL;
  env.TWILIO_AUTH_TOKEN = "phase3b-twilio-test-secret";
  env.PUBLIC_BASE_URL = "http://localhost";

  const { app } = await createCallTestApp({ monthlyCapMinutes: 0 });

  try {
    const { phoneNumber } = await authenticateAndClaimNumber(app, "twilio-inbound-cap");

    const params = {
      CallSid: "CA0987654321",
      Caller: "+14155550888",
      From: "+14155550888",
      To: phoneNumber
    };

    const response = await app.inject({
      method: "POST",
      headers: {
        host: "localhost",
        "x-twilio-signature": buildTwilioSignature({
          authToken: env.TWILIO_AUTH_TOKEN,
          params,
          url: "http://localhost/v1/webhooks/twilio/voice/inbound"
        })
      },
      payload: params,
      url: "/v1/webhooks/twilio/voice/inbound"
    });

    assert.equal(response.statusCode, 200);
    assert.match(
      response.body,
      /<Record action="http:\/\/localhost\/v1\/webhooks\/twilio\/voice\/voicemail/
    );
    assert.doesNotMatch(response.body, /<Client/);
  } finally {
    env.TWILIO_AUTH_TOKEN = previousAuthToken;
    env.PUBLIC_BASE_URL = previousBaseUrl;
    await app.close();
  }
});

test("twilio voicemail webhook saves voicemail records", async () => {
  const previousAuthToken = env.TWILIO_AUTH_TOKEN;
  const previousBaseUrl = env.PUBLIC_BASE_URL;
  env.TWILIO_AUTH_TOKEN = "phase3b-twilio-test-secret";
  env.PUBLIC_BASE_URL = "http://localhost";

  const { app } = await createCallTestApp({ monthlyCapMinutes: 15 });

  try {
    const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "twilio-voicemail");
    await registerCallPushToken({
      accessToken,
      app,
      channel: "alert",
      token: "ios-alert-token"
    });

    const query = new URLSearchParams({
      from: "+14155550666",
      providerCallId: "CA111222333",
      to: phoneNumber
    }).toString();
    const params = {
      CallSid: "CA111222333",
      Caller: "+14155550666",
      From: "+14155550666",
      RecordingDuration: "42",
      RecordingUrl: "https://media.freeline.test/recordings/twilio-voicemail",
      To: phoneNumber
    };

    const response = await app.inject({
      method: "POST",
      headers: {
        host: "localhost",
        "x-twilio-signature": buildTwilioSignature({
          authToken: env.TWILIO_AUTH_TOKEN,
          params,
          url: `http://localhost/v1/webhooks/twilio/voice/voicemail?${query}`
        })
      },
      payload: params,
      url: `/v1/webhooks/twilio/voice/voicemail?${query}`
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Your voicemail has been saved/);

    const listResponse = await app.inject({
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      url: "/v1/voicemails"
    });

    assert.equal(listResponse.statusCode, 200);
    const body = listResponse.json() as {
      voicemails: Array<{
        audioUrl: string;
        callerNumber: string;
        durationSeconds: number;
      }>;
    };

    assert.equal(body.voicemails.length, 1);
    assert.equal(
      body.voicemails[0]?.audioUrl,
      "https://media.freeline.test/recordings/twilio-voicemail.mp3"
    );
    assert.equal(body.voicemails[0]?.callerNumber, "+14155550666");
    assert.equal(body.voicemails[0]?.durationSeconds, 42);
  } finally {
    env.TWILIO_AUTH_TOKEN = previousAuthToken;
    env.PUBLIC_BASE_URL = previousBaseUrl;
    await app.close();
  }
});

test("call status webhook rejects an invalid signature", async () => {
  const { app } = await createCallTestApp();

  const webhookResponse = await app.inject({
    method: "POST",
    payload: JSON.stringify({
      events: [
        {
          from: "+14155550101",
          providerCallId: "invalid-call",
          status: "completed",
          to: "+14155550403"
        }
      ]
    }),
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": "invalid-signature"
    },
    url: "/v1/webhooks/telecom/calls/status"
  });

  assert.equal(webhookResponse.statusCode, 401);
  assert.equal(
    (webhookResponse.json() as { error: { code: string } }).error.code,
    "invalid_webhook_signature"
  );

  await app.close();
});
