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
import { env } from "../config/env.js";
import { buildApp } from "../server.js";
import { FanoutRealtimePublisher } from "../notifications/fanout-realtime-publisher.js";
import { MessageRealtimeGateway } from "../notifications/realtime-gateway.js";
import type { PushNotifier, RealtimePublisher } from "../notifications/types.js";
import { InMemoryNumberStore } from "../numbers/in-memory-store.js";
import { InMemoryCallStore } from "../calls/in-memory-store.js";
import { computeWebhookSignature } from "../telephony/signing.js";
import type {
  AvailableNumber,
  ProvisionedNumber,
  SmsResult,
  TelephonyProvider
} from "../telephony/telephony-provider.js";
import { InMemoryMessageStore } from "./in-memory-store.js";
import { MessageService } from "./service.js";
import type { RawData, WebSocket } from "ws";

const HELP_REPLY =
  "FreeLine: Free calls & texts. Reply STOP to opt out. Support: support@freeline.dev";
const STOP_REPLY = "FreeLine: You have been opted out. Reply HELP for support.";

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
  readonly sentMessages: Array<{ body: string; from: string; to: string }> = [];
  private readonly webhookSecret = "phase2b-test-secret";
  private smsCounter = 0;

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

  async sendSms(from: string, to: string, body: string): Promise<SmsResult> {
    this.smsCounter += 1;
    this.sentMessages.push({ body, from, to });

    return {
      externalId: `test-sms-${this.smsCounter}`,
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
  readonly events: Array<{
    conversationId: string;
    messageId: string;
    preview: string;
    tokens: string[];
  }> = [];

  async sendInboundCall(): Promise<void> {
    return;
  }

  async sendInboundMessage(input: {
    conversation: { id: string };
    message: { body: string; id: string };
    tokens: Array<{ token: string }>;
  }): Promise<void> {
    this.events.push({
      conversationId: input.conversation.id,
      messageId: input.message.id,
      preview: input.message.body,
      tokens: input.tokens.map((token) => token.token)
    });
  }

  async sendNumberLifecycle(): Promise<void> {
    return;
  }

  async sendMissedCall(): Promise<void> {
    return;
  }

  async sendVoicemail(): Promise<void> {
    return;
  }
}

class TestRealtimePublisher implements RealtimePublisher {
  readonly events: Array<{
    conversationId: string;
    messageId: string;
    type: "message:inbound" | "message:status";
    userId: string;
  }> = [];

  async publish(event: {
    conversation: { id: string };
    message: { id: string };
    type: "message:inbound" | "message:status";
    userId: string;
  }): Promise<void> {
    this.events.push({
      conversationId: event.conversation.id,
      messageId: event.message.id,
      type: event.type,
      userId: event.userId
    });
  }
}

async function createMessageTestApp(options: {
  dailyCap?: number;
  monthlyCap?: number;
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
      freeTierDailySmsCap: options.dailyCap,
      freeTierMonthlySmsCap: options.monthlyCap,
      standardTierDailySmsCap: options.dailyCap,
      standardTierDailyUniqueContactsCap: options.dailyCap,
      freeTierDailyUniqueContactsCap: options.dailyCap
    },
    rateLimiter,
    store: abuseStore
  });
  const telephonyProvider = new TestTelephonyProvider();
  const pushNotifier = new TestPushNotifier();
  const realtimePublisher = new TestRealtimePublisher();
  const realtimeGateway = new MessageRealtimeGateway();
  const messageService = new MessageService(
    messageStore,
    numberStore,
    telephonyProvider,
    pushNotifier,
    new FanoutRealtimePublisher([realtimePublisher, realtimeGateway]),
    {
      abuseService,
      dailyCap: options.dailyCap,
      monthlyCap: options.monthlyCap
    }
  );

  const app = await buildApp({
    appleVerifier: new StaticOAuthVerifier("apple", "apple"),
    abuseService,
    abuseStore,
    authStore,
    captchaVerifier: new PassCaptchaVerifier(),
    callStore,
    checkPostgres: async () => true,
    checkRedis: async () => true,
    emailMailer: new PreviewMailer(),
    googleVerifier: new StaticOAuthVerifier("google", "google"),
    messageService,
    messageStore,
    numberStore,
    pushNotifier,
    rateLimiter,
    realtimeGateway,
    telephonyProvider
  });

  return {
    app,
    abuseService,
    abuseStore,
    authStore,
    pushNotifier,
    realtimePublisher,
    telephonyProvider
  };
}

async function authenticateAndClaimNumber(
  app: Awaited<ReturnType<typeof createMessageTestApp>>["app"],
  suffix: string
): Promise<{ accessToken: string; phoneNumber: string; userId: string }> {
  const authResponse = await app.inject({
    method: "POST",
    payload: {
      fingerprint: `messages-test-device-${suffix}`,
      identityToken: `messages-test-token-${suffix}`,
      platform: "ios"
    },
    url: "/v1/auth/oauth/apple"
  });

  const authBody = authResponse.json() as {
    tokens: { accessToken: string };
    user: { id: string };
  };
  const accessToken = authBody.tokens.accessToken;
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
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/numbers/claim"
  });

  const claimedPhoneNumber = (
    claimResponse.json() as { number: { phoneNumber: string } }
  ).number.phoneNumber;

  return {
    accessToken,
    phoneNumber: claimedPhoneNumber,
    userId: authBody.user.id
  };
}

async function registerPushToken(
  app: Awaited<ReturnType<typeof createMessageTestApp>>["app"],
  accessToken: string,
  deviceId = "ios-device-1",
  token = "push-token-1"
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    payload: {
      deviceId,
      platform: "ios",
      token
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/devices/push-token"
  });

  assert.equal(response.statusCode, 200);
}

async function postInboundWebhook(input: {
  app: Awaited<ReturnType<typeof createMessageTestApp>>["app"];
  body: string;
  from: string;
  telephonyProvider: TestTelephonyProvider;
  to: string;
}) {
  const payload = JSON.stringify({
    events: [
      {
        body: input.body,
        from: input.from,
        to: input.to
      }
    ]
  });

  return input.app.inject({
    method: "POST",
    payload,
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": input.telephonyProvider.signPayload(payload)
    },
    url: "/v1/webhooks/telecom/messages/inbound"
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

async function postTwilioInboundWebhook(input: {
  app: Awaited<ReturnType<typeof createMessageTestApp>>["app"];
  authToken: string;
  body: string;
  from: string;
  to: string;
}) {
  const params = {
    Body: input.body,
    From: input.from,
    To: input.to
  };

  return input.app.inject({
    method: "POST",
    payload: new URLSearchParams(params).toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": buildTwilioSignature({
        authToken: input.authToken,
        params,
        url: "http://localhost/v1/webhooks/twilio/messages/inbound"
      })
    },
    url: "/v1/webhooks/twilio/messages/inbound"
  });
}

async function postTwilioStatusWebhook(input: {
  app: Awaited<ReturnType<typeof createMessageTestApp>>["app"];
  authToken: string;
  providerMessageId: string;
  status: string;
}) {
  const params = {
    MessageSid: input.providerMessageId,
    MessageStatus: input.status
  };

  return input.app.inject({
    method: "POST",
    payload: new URLSearchParams(params).toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": buildTwilioSignature({
        authToken: input.authToken,
        params,
        url: "http://localhost/v1/webhooks/twilio/messages/status"
      })
    },
    url: "/v1/webhooks/twilio/messages/status"
  });
}

async function openRealtimeSocket(
  app: Awaited<ReturnType<typeof createMessageTestApp>>["app"],
  accessToken: string
): Promise<{
  socket: WebSocket;
  waitForEvent: (predicate: (payload: {
    conversation?: { id?: string; participantNumber?: string };
    message?: { body?: string; id?: string; status?: string };
    type?: string;
  }) => boolean) => Promise<{
    conversation?: { id?: string; participantNumber?: string };
    message?: { body?: string; id?: string; status?: string };
    type?: string;
  }>;
}> {
  type RealtimePayload = {
    conversation?: { id?: string; participantNumber?: string };
    message?: { body?: string; id?: string; status?: string };
    type?: string;
  };

  const events: RealtimePayload[] = [];
  const waiters: Array<{
    predicate: (payload: RealtimePayload) => boolean;
    reject: (error: Error) => void;
    resolve: (payload: RealtimePayload) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  let socketError: Error | null = null;

  const socket = await app.injectWS(
    `/v1/realtime/messages?accessToken=${encodeURIComponent(accessToken)}`,
    {},
    {
      onInit: (websocket) => {
        websocket.on("close", () => {
          const error = new Error(
            "Realtime websocket closed before the expected event arrived."
          );
          socketError = error;
          while (waiters.length > 0) {
            const waiter = waiters.shift();
            if (!waiter) {
              continue;
            }

            clearTimeout(waiter.timeout);
            waiter.reject(error);
          }
        });

        websocket.on("error", (error: Error) => {
          socketError = error;
          while (waiters.length > 0) {
            const waiter = waiters.shift();
            if (!waiter) {
              continue;
            }

            clearTimeout(waiter.timeout);
            waiter.reject(error);
          }
        });

        websocket.on("message", (rawData: RawData) => {
          const text = typeof rawData === "string" ? rawData : rawData.toString();
          const payload = JSON.parse(text) as RealtimePayload;
          events.push(payload);

          for (const [index, waiter] of waiters.entries()) {
            if (!waiter.predicate(payload)) {
              continue;
            }

            clearTimeout(waiter.timeout);
            waiters.splice(index, 1);
            waiter.resolve(payload);
            break;
          }
        });
      }
    }
  );

  return {
    socket,
    waitForEvent: async (predicate) => {
      const existing = events.find((payload) => predicate(payload));
      if (existing) {
        return existing;
      }

      if (socketError) {
        throw socketError;
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.timeout === timeout);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(new Error("Timed out waiting for a realtime websocket event."));
        }, 5_000);

        waiters.push({
          predicate,
          reject,
          resolve,
          timeout
        });
      });
    }
  };
}

test("outbound SMS saves the message and calls the provider", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "send");

  const sendResponse = await app.inject({
    method: "POST",
    payload: {
      body: "Hello from FreeLine",
      to: "+14155550199"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  assert.equal(sendResponse.statusCode, 200);

  const sendBody = sendResponse.json() as {
    allowance: { dailyRemaining: number; monthlyRemaining: number };
    conversation: { participantNumber: string };
    message: { body: string; providerMessageId: string; status: string };
  };

  assert.equal(sendBody.conversation.participantNumber, "+14155550199");
  assert.equal(sendBody.message.body, "Hello from FreeLine");
  assert.equal(sendBody.message.status, "pending");
  assert.equal(sendBody.allowance.dailyRemaining, 9);
  assert.equal(sendBody.allowance.monthlyRemaining, 39);
  assert.equal(telephonyProvider.sentMessages.length, 1);
  assert.deepEqual(telephonyProvider.sentMessages[0], {
    body: "Hello from FreeLine",
    from: phoneNumber,
    to: "+14155550199"
  });

  await app.close();
});

test("outbound SMS rejects non-U.S. +1 destinations", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "send-canada");

  const sendResponse = await app.inject({
    method: "POST",
    payload: {
      body: "This should not send",
      to: "+14165550199"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  assert.equal(sendResponse.statusCode, 400);
  assert.equal(
    (sendResponse.json() as { error: { code: string } }).error.code,
    "invalid_phone_number"
  );
  assert.equal(telephonyProvider.sentMessages.length, 0);

  await app.close();
});

test("authenticated websocket receives inbound message events", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "ws-inbound");
  const realtimeSocket = await openRealtimeSocket(app, accessToken);

  const inboundResponse = await postInboundWebhook({
    app,
    body: "Realtime inbound",
    from: "+14155550250",
    telephonyProvider,
    to: phoneNumber
  });

  assert.equal(inboundResponse.statusCode, 200);

  const realtimeEvent = await realtimeSocket.waitForEvent(
    (payload) =>
      payload.type === "message:inbound" &&
      payload.message?.body === "Realtime inbound"
  );

  assert.equal(realtimeEvent.type, "message:inbound");
  assert.equal(realtimeEvent.message?.body, "Realtime inbound");
  assert.equal(realtimeEvent.conversation?.participantNumber, "+14155550250");

  realtimeSocket.socket.close();
  await app.close();
});

test("authenticated websocket receives delivery status events", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "ws-status");
  const realtimeSocket = await openRealtimeSocket(app, accessToken);

  const sendResponse = await app.inject({
    method: "POST",
    payload: {
      body: "Realtime status",
      to: "+14155550251"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  const sendBody = sendResponse.json() as {
    message: { id: string; providerMessageId: string };
  };
  const payload = JSON.stringify({
    events: [
      {
        providerMessageId: sendBody.message.providerMessageId,
        status: "delivered"
      }
    ]
  });

  const webhookResponse = await app.inject({
    method: "POST",
    payload,
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": telephonyProvider.signPayload(payload)
    },
    url: "/v1/webhooks/telecom/messages/status"
  });

  assert.equal(webhookResponse.statusCode, 200);

  const realtimeEvent = await realtimeSocket.waitForEvent(
    (event) =>
      event.type === "message:status" && event.message?.id === sendBody.message.id
  );

  assert.equal(realtimeEvent.type, "message:status");
  assert.equal(realtimeEvent.message?.status, "delivered");

  realtimeSocket.socket.close();
  await app.close();
});

test("delivery webhook updates the stored message status and emits realtime status", async () => {
  const { app, realtimePublisher, telephonyProvider } = await createMessageTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "webhook");

  const sendResponse = await app.inject({
    method: "POST",
    payload: {
      body: "Webhook me",
      to: "+14155550200"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  const sendBody = sendResponse.json() as {
    conversation: { id: string };
    message: { id: string; providerMessageId: string };
  };

  const payload = JSON.stringify({
    events: [
      {
        providerMessageId: sendBody.message.providerMessageId,
        status: "delivered"
      }
    ]
  });

  const webhookResponse = await app.inject({
    method: "POST",
    payload,
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": telephonyProvider.signPayload(payload)
    },
    url: "/v1/webhooks/telecom/messages/status"
  });

  assert.equal(webhookResponse.statusCode, 200);
  assert.equal((webhookResponse.json() as { updatedCount: number }).updatedCount, 1);
  assert.deepEqual(realtimePublisher.events[0], {
    conversationId: sendBody.conversation.id,
    messageId: sendBody.message.id,
    type: "message:status",
    userId: realtimePublisher.events[0]?.userId
  });

  const threadResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/conversations/${sendBody.conversation.id}/messages`
  });

  assert.equal(threadResponse.statusCode, 200);
  assert.equal(
    (threadResponse.json() as { messages: Array<{ status: string }> }).messages[0]?.status,
    "delivered"
  );

  await app.close();
});

test("delivery webhook rejects an invalid signature", async () => {
  const { app } = await createMessageTestApp();

  const webhookResponse = await app.inject({
    method: "POST",
    payload: JSON.stringify({
      events: [
        {
          providerMessageId: "missing-message",
          status: "delivered"
        }
      ]
    }),
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": "invalid-signature"
    },
    url: "/v1/webhooks/telecom/messages/status"
  });

  assert.equal(webhookResponse.statusCode, 401);
  assert.equal(
    (webhookResponse.json() as { error: { code: string } }).error.code,
    "invalid_webhook_signature"
  );

  await app.close();
});

test("twilio status webhook updates the stored message status", async () => {
  const previousAuthToken = env.TWILIO_AUTH_TOKEN;
  env.TWILIO_AUTH_TOKEN = "phase2b-twilio-test-secret";

  try {
    const { app } = await createMessageTestApp();
    const { accessToken } = await authenticateAndClaimNumber(app, "twilio-status");

    const sendResponse = await app.inject({
      method: "POST",
      payload: {
        body: "Twilio status me",
        to: "+14155550298"
      },
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      url: "/v1/messages"
    });

    const sendBody = sendResponse.json() as {
      conversation: { id: string };
      message: { providerMessageId: string };
    };

    const webhookResponse = await postTwilioStatusWebhook({
      app,
      authToken: env.TWILIO_AUTH_TOKEN,
      providerMessageId: sendBody.message.providerMessageId,
      status: "delivered"
    });

    assert.equal(webhookResponse.statusCode, 200);
    assert.equal((webhookResponse.json() as { updatedCount: number }).updatedCount, 1);

    const threadResponse = await app.inject({
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      url: `/v1/conversations/${sendBody.conversation.id}/messages`
    });

    assert.equal(threadResponse.statusCode, 200);
    assert.equal(
      (threadResponse.json() as { messages: Array<{ status: string }> }).messages[0]?.status,
      "delivered"
    );

    await app.close();
  } finally {
    env.TWILIO_AUTH_TOKEN = previousAuthToken;
  }
});

test("twilio inbound webhook saves the message and updates unread state", async () => {
  const previousAuthToken = env.TWILIO_AUTH_TOKEN;
  env.TWILIO_AUTH_TOKEN = "phase2b-twilio-test-secret";

  try {
    const { app } = await createMessageTestApp();
    const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "twilio-inbound");

    const inboundResponse = await postTwilioInboundWebhook({
      app,
      authToken: env.TWILIO_AUTH_TOKEN,
      body: "Twilio inbound",
      from: "+14155550388",
      to: phoneNumber
    });

    assert.equal(inboundResponse.statusCode, 200);
    assert.equal((inboundResponse.json() as { createdCount: number }).createdCount, 1);

    const conversationsResponse = await app.inject({
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      url: "/v1/conversations"
    });

    assert.equal(conversationsResponse.statusCode, 200);
    const conversationsBody = conversationsResponse.json() as {
      conversations: Array<{ participantNumber: string; unreadCount: number }>;
    };
    assert.equal(conversationsBody.conversations[0]?.participantNumber, "+14155550388");
    assert.equal(conversationsBody.conversations[0]?.unreadCount, 1);

    await app.close();
  } finally {
    env.TWILIO_AUTH_TOKEN = previousAuthToken;
  }
});

test("twilio inbound webhook rejects an invalid signature", async () => {
  const previousAuthToken = env.TWILIO_AUTH_TOKEN;
  env.TWILIO_AUTH_TOKEN = "phase2b-twilio-test-secret";

  try {
    const { app } = await createMessageTestApp();

    const webhookResponse = await app.inject({
      method: "POST",
      payload: new URLSearchParams({
        Body: "Nope",
        From: "+14155550399",
        To: "+14155550101"
      }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "invalid-signature"
      },
      url: "/v1/webhooks/twilio/messages/inbound"
    });

    assert.equal(webhookResponse.statusCode, 401);
    assert.equal(
      (webhookResponse.json() as { error: { code: string } }).error.code,
      "invalid_webhook_signature"
    );

    await app.close();
  } finally {
    env.TWILIO_AUTH_TOKEN = previousAuthToken;
  }
});

test("conversations are listed in most recent order and thread messages paginate oldest first", async () => {
  const { app } = await createMessageTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "ordering");

  const firstSend = await app.inject({
    method: "POST",
    payload: {
      body: "First conversation",
      to: "+14155550201"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  const conversationId = (
    firstSend.json() as { conversation: { id: string } }
  ).conversation.id;

  await new Promise((resolve) => setTimeout(resolve, 10));

  await app.inject({
    method: "POST",
    payload: {
      body: "Second message same thread",
      to: "+14155550201"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  await app.inject({
    method: "POST",
    payload: {
      body: "Different thread",
      to: "+14155550202"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  const conversationsResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/conversations"
  });

  assert.equal(conversationsResponse.statusCode, 200);
  assert.deepEqual(
    (conversationsResponse.json() as {
      conversations: Array<{ participantNumber: string }>;
    }).conversations.map((conversation) => conversation.participantNumber),
    ["+14155550202", "+14155550201"]
  );

  const threadPage = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/conversations/${conversationId}/messages?limit=1&offset=0`
  });

  const nextThreadPage = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/conversations/${conversationId}/messages?limit=1&offset=1`
  });

  assert.equal(threadPage.statusCode, 200);
  assert.equal(nextThreadPage.statusCode, 200);
  assert.equal(
    (threadPage.json() as { messages: Array<{ body: string }> }).messages[0]?.body,
    "First conversation"
  );
  assert.equal(
    (nextThreadPage.json() as { messages: Array<{ body: string }> }).messages[0]?.body,
    "Second message same thread"
  );

  await app.close();
});

test("usage caps return 429 with the upgrade prompt", async () => {
  const { app } = await createMessageTestApp({
    dailyCap: 1,
    monthlyCap: 1
  });
  const { accessToken } = await authenticateAndClaimNumber(app, "caps");

  const firstSend = await app.inject({
    method: "POST",
    payload: {
      body: "Allowed send",
      to: "+14155550203"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  const blockedSend = await app.inject({
    method: "POST",
    payload: {
      body: "Blocked send",
      to: "+14155550204"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  assert.equal(firstSend.statusCode, 200);
  assert.equal(blockedSend.statusCode, 429);
  const blockedBody = blockedSend.json() as {
    error: {
      details: {
        bucket: string;
        retryAfterSeconds: number;
        upgradePrompt: string;
      };
      message: string;
    };
  };
  assert.equal(
    blockedBody.error.message,
    "Free tier limit reached. Watch an ad or upgrade."
  );
  assert.equal(blockedBody.error.details.bucket, "sms_daily");
  assert.equal(blockedBody.error.details.retryAfterSeconds > 0, true);
  assert.equal(
    blockedBody.error.details.upgradePrompt,
    "Watch a rewarded ad or upgrade to Ad-Free or Premium for more usage."
  );

  await app.close();
});

test("inbound webhook saves the message, increments unread, and triggers notifications", async () => {
  const { app, pushNotifier, realtimePublisher, telephonyProvider } =
    await createMessageTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "inbound");

  await registerPushToken(app, accessToken);

  const inboundResponse = await postInboundWebhook({
    app,
    body: "Reply inbound",
    from: "+14155550300",
    telephonyProvider,
    to: phoneNumber
  });

  assert.equal(inboundResponse.statusCode, 200);
  assert.equal((inboundResponse.json() as { createdCount: number }).createdCount, 1);
  assert.equal((inboundResponse.json() as { droppedCount: number }).droppedCount, 0);
  assert.equal(pushNotifier.events.length, 1);
  assert.deepEqual(pushNotifier.events[0]?.tokens, ["push-token-1"]);
  assert.equal(realtimePublisher.events[0]?.type, "message:inbound");

  const conversationsResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/conversations"
  });

  assert.equal(conversationsResponse.statusCode, 200);

  const conversationsBody = conversationsResponse.json() as {
    allowance: { dailyUsed: number; monthlyUsed: number };
    conversations: Array<{ id: string; participantNumber: string; unreadCount: number }>;
  };

  assert.equal(conversationsBody.allowance.dailyUsed, 1);
  assert.equal(conversationsBody.allowance.monthlyUsed, 1);
  assert.equal(conversationsBody.conversations[0]?.participantNumber, "+14155550300");
  assert.equal(conversationsBody.conversations[0]?.unreadCount, 1);

  const threadResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/conversations/${conversationsBody.conversations[0]?.id}/messages`
  });

  assert.equal(threadResponse.statusCode, 200);
  assert.equal(
    (threadResponse.json() as { messages: Array<{ direction: string; body: string }> })
      .messages[0]?.direction,
    "inbound"
  );
  assert.equal(
    (threadResponse.json() as { messages: Array<{ direction: string; body: string }> })
      .messages[0]?.body,
    "Reply inbound"
  );

  await app.close();
});

test("read endpoint resets unread count after inbound delivery", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "read");

  await postInboundWebhook({
    app,
    body: "Unread me",
    from: "+14155550301",
    telephonyProvider,
    to: phoneNumber
  });

  const conversationsResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/conversations"
  });

  const conversationId = (
    conversationsResponse.json() as {
      conversations: Array<{ id: string; unreadCount: number }>;
    }
  ).conversations[0]?.id;

  const markReadResponse = await app.inject({
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/conversations/${conversationId}/read`
  });

  assert.equal(markReadResponse.statusCode, 200);
  assert.equal(
    (markReadResponse.json() as { conversation: { unreadCount: number } }).conversation
      .unreadCount,
    0
  );

  const refreshedResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/conversations"
  });

  assert.equal(
    (refreshedResponse.json() as {
      conversations: Array<{ unreadCount: number }>;
    }).conversations[0]?.unreadCount,
    0
  );

  await app.close();
});

test("STOP inbound opt-outs the conversation and blocks future outbound messages", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "stop");

  const inboundResponse = await postInboundWebhook({
    app,
    body: "STOP",
    from: "+14155550302",
    telephonyProvider,
    to: phoneNumber
  });

  assert.equal(inboundResponse.statusCode, 200);
  assert.equal(telephonyProvider.sentMessages.length, 1);
  assert.deepEqual(telephonyProvider.sentMessages[0], {
    body: STOP_REPLY,
    from: phoneNumber,
    to: "+14155550302"
  });

  const conversationsResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/conversations"
  });

  assert.equal(
    (conversationsResponse.json() as {
      conversations: Array<{ isOptedOut: boolean }>;
    }).conversations[0]?.isOptedOut,
    true
  );

  const outboundResponse = await app.inject({
    method: "POST",
    payload: {
      body: "Are you there?",
      to: "+14155550302"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  assert.equal(outboundResponse.statusCode, 403);
  assert.equal(
    (outboundResponse.json() as { error: { code: string } }).error.code,
    "conversation_opted_out"
  );

  await app.close();
});

test("HELP inbound sends an auto-reply and keeps the conversation sendable", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "help");

  const inboundResponse = await postInboundWebhook({
    app,
    body: "help",
    from: "+14155550303",
    telephonyProvider,
    to: phoneNumber
  });

  assert.equal(inboundResponse.statusCode, 200);
  assert.equal(telephonyProvider.sentMessages.length, 1);
  assert.deepEqual(telephonyProvider.sentMessages[0], {
    body: HELP_REPLY,
    from: phoneNumber,
    to: "+14155550303"
  });

  const outboundResponse = await app.inject({
    method: "POST",
    payload: {
      body: "We can still reply",
      to: "+14155550303"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  assert.equal(outboundResponse.statusCode, 200);

  await app.close();
});

test("blocking, unblocking, and reporting a number works end-to-end", async () => {
  const { app, telephonyProvider } = await createMessageTestApp();
  const { accessToken, phoneNumber } = await authenticateAndClaimNumber(app, "block");
  const blockedNumber = "+14155550304";

  const blockResponse = await app.inject({
    method: "POST",
    payload: {
      blockedNumber
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/blocks"
  });

  assert.equal(blockResponse.statusCode, 200);
  assert.equal(
    (blockResponse.json() as { block: { blockedNumber: string } }).block.blockedNumber,
    blockedNumber
  );

  const blockedInboundResponse = await postInboundWebhook({
    app,
    body: "You should not see this",
    from: blockedNumber,
    telephonyProvider,
    to: phoneNumber
  });

  assert.equal(blockedInboundResponse.statusCode, 200);
  assert.equal((blockedInboundResponse.json() as { createdCount: number }).createdCount, 0);
  assert.equal((blockedInboundResponse.json() as { droppedCount: number }).droppedCount, 1);

  const outboundBlockedResponse = await app.inject({
    method: "POST",
    payload: {
      body: "Blocked outbound",
      to: blockedNumber
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  assert.equal(outboundBlockedResponse.statusCode, 403);
  assert.equal(
    (outboundBlockedResponse.json() as { error: { code: string } }).error.code,
    "blocked_number"
  );

  const reportResponse = await app.inject({
    method: "POST",
    payload: {
      reason: "spam",
      reportedNumber: blockedNumber
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/reports"
  });

  assert.equal(reportResponse.statusCode, 200);
  assert.equal(
    (reportResponse.json() as { report: { reason: string } }).report.reason,
    "spam"
  );

  const unblockResponse = await app.inject({
    method: "DELETE",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: `/v1/blocks/${encodeURIComponent(blockedNumber)}`
  });

  assert.equal(unblockResponse.statusCode, 204);

  const allowedInboundResponse = await postInboundWebhook({
    app,
    body: "Now visible",
    from: blockedNumber,
    telephonyProvider,
    to: phoneNumber
  });

  assert.equal(allowedInboundResponse.statusCode, 200);
  assert.equal((allowedInboundResponse.json() as { createdCount: number }).createdCount, 1);

  await app.close();
});

test("reward claims expand monthly message allowance and stop after four unlocks", async () => {
  const { app } = await createMessageTestApp();
  const { accessToken } = await authenticateAndClaimNumber(app, "rewards");

  const initialStatus = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/rewards/status"
  });

  assert.equal(initialStatus.statusCode, 200);
  assert.equal(
    (initialStatus.json() as { messages: { monthlyCap: number } }).messages.monthlyCap,
    40
  );

  for (let index = 0; index < 4; index += 1) {
    const claimResponse = await app.inject({
      method: "POST",
      payload: {
        rewardType: "text_events"
      },
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      url: "/v1/rewards/claim"
    });

    assert.equal(claimResponse.statusCode, 200);
  }

  const exhaustedClaim = await app.inject({
    method: "POST",
    payload: {
      rewardType: "text_events"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/rewards/claim"
  });

  assert.equal(exhaustedClaim.statusCode, 409);
  assert.equal(
    (exhaustedClaim.json() as { error: { code: string } }).error.code,
    "reward_claim_limit_reached"
  );

  const statusResponse = await app.inject({
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/rewards/status"
  });

  assert.equal(statusResponse.statusCode, 200);
  const statusBody = statusResponse.json() as {
    messages: { monthlyCap: number; monthlyBonus: number };
    rewardClaims: { remainingClaims: number; textEventsGranted: number; totalClaims: number };
  };
  assert.equal(statusBody.messages.monthlyCap, 80);
  assert.equal(statusBody.messages.monthlyBonus, 40);
  assert.equal(statusBody.rewardClaims.totalClaims, 4);
  assert.equal(statusBody.rewardClaims.remainingClaims, 0);
  assert.equal(statusBody.rewardClaims.textEventsGranted, 40);

  await app.close();
});

test("reports and blocks against a FreeLine number reduce trust and block the device after suspension", async () => {
  const { app, abuseStore, authStore } = await createMessageTestApp();
  const target = await authenticateAndClaimNumber(app, "trust-target");
  const reporter = await authenticateAndClaimNumber(app, "trust-reporter");

  for (let index = 0; index < 2; index += 1) {
    const reportResponse = await app.inject({
      method: "POST",
      payload: {
        reason: `spam-${index}`,
        reportedNumber: target.phoneNumber
      },
      headers: {
        authorization: `Bearer ${reporter.accessToken}`
      },
      url: "/v1/reports"
    });

    assert.equal(reportResponse.statusCode, 200);
  }

  const blockResponse = await app.inject({
    method: "POST",
    payload: {
      blockedNumber: target.phoneNumber
    },
    headers: {
      authorization: `Bearer ${reporter.accessToken}`
    },
    url: "/v1/blocks"
  });

  assert.equal(blockResponse.statusCode, 200);

  const targetUser = await authStore.findUserById(target.userId);
  assert.equal(targetUser?.trustScore, 10);
  assert.equal(targetUser?.status, "suspended");

  const targetEvents = abuseStore.listEventsForUser(target.userId).map((event) => event.eventType);
  assert.deepEqual(targetEvents.slice(-4), ["report", "report", "block", "suspension"]);

  const blockedAuthResponse = await app.inject({
    method: "POST",
    payload: {
      fingerprint: "messages-test-device-trust-target",
      identityToken: "new-user-on-blocked-device",
      platform: "ios"
    },
    url: "/v1/auth/oauth/google"
  });

  assert.equal(blockedAuthResponse.statusCode, 403);
  assert.equal(
    (blockedAuthResponse.json() as { error: { code: string } }).error.code,
    "device_abuse_blocked"
  );

  await app.close();
});

test("url-first-message spam heuristics flag outbound sends and auto-suspend after five hits", async () => {
  const { app, abuseStore, authStore } = await createMessageTestApp();
  const { accessToken, userId } = await authenticateAndClaimNumber(app, "spam-flag");

  for (let index = 0; index < 4; index += 1) {
    const response = await app.inject({
      method: "POST",
      payload: {
        body: `Visit https://spam.example/${index} now`,
        to: `+14155550${String(500 + index).padStart(3, "0")}`
      },
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      url: "/v1/messages"
    });

    assert.equal(response.statusCode, 403);
    assert.equal(
      (response.json() as { error: { code: string; details: { flags: string[] } } }).error
        .code,
      "message_flagged_for_review"
    );
  }

  const finalResponse = await app.inject({
    method: "POST",
    payload: {
      body: "Visit https://spam.example/final now",
      to: "+14155550599"
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    url: "/v1/messages"
  });

  assert.equal(finalResponse.statusCode, 403);
  assert.equal(
    (finalResponse.json() as { error: { code: string } }).error.code,
    "account_suspended"
  );

  const user = await authStore.findUserById(userId);
  assert.equal(user?.status, "suspended");
  assert.equal(
    abuseStore.listEventsForUser(userId).filter((event) => event.eventType === "spam_flag")
      .length,
    5
  );
  assert.equal(
    abuseStore.listEventsForUser(userId).some((event) => event.eventType === "suspension"),
    true
  );

  await app.close();
});

test("inbound webhook rejects an invalid signature", async () => {
  const { app } = await createMessageTestApp();

  const webhookResponse = await app.inject({
    method: "POST",
    payload: JSON.stringify({
      events: [
        {
          body: "Nope",
          from: "+14155550399",
          to: "+14155550101"
        }
      ]
    }),
    headers: {
      "content-type": "application/json",
      "x-bandwidth-signature": "invalid-signature"
    },
    url: "/v1/webhooks/telecom/messages/inbound"
  });

  assert.equal(webhookResponse.statusCode, 401);
  assert.equal(
    (webhookResponse.json() as { error: { code: string } }).error.code,
    "invalid_webhook_signature"
  );

  await app.close();
});
