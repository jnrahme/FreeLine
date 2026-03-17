import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { z } from "zod";
import twilio from "twilio";

import type { CallService } from "../calls/service.js";
import type { VoicemailArchive } from "../calls/voicemail-archive.js";
import { AppError } from "../auth/errors.js";
import { requireAuth } from "../auth/guard.js";
import {
  buildTwilioClientDialTwiml,
  buildTwilioDialTwiml,
  buildTwilioRecordVoicemailTwiml,
  buildTwilioSayTwiml,
  isEmergencyDestination,
  normalizeUsDialTarget,
  parseTwilioClientIdentity,
  requireUsE164Number
} from "../calls/twilio-voice.js";
import { env } from "../config/env.js";
import type { NumberStore } from "../numbers/types.js";

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const callPushTokenSchema = z.object({
  channel: z.enum(["alert", "voip"]),
  deviceId: z.string().trim().min(1).max(200),
  platform: z.enum(["ios", "android"]),
  token: z.string().trim().min(1).max(4000)
});

const voicemailParamsSchema = z.object({
  voicemailId: z.string().uuid()
});

const webhookSchema = z.object({
  events: z
    .array(
      z.object({
        durationSeconds: z.coerce.number().int().min(0).optional(),
        endedAt: z.string().datetime().optional(),
        from: z.string().regex(/^\+1\d{10}$/),
        providerCallId: z.string().min(1),
        startedAt: z.string().datetime().optional(),
        status: z.string().min(1),
        to: z.string().regex(/^\+1\d{10}$/)
      })
    )
    .min(1)
});

const inboundWebhookSchema = z.object({
  events: z
    .array(
      z.object({
        from: z.string().regex(/^\+1\d{10}$/),
        providerCallId: z.string().min(1),
        startedAt: z.string().datetime().optional(),
        to: z.string().regex(/^\+1\d{10}$/)
      })
    )
    .min(1)
});

const voicemailWebhookSchema = z.object({
  events: z
    .array(
      z.object({
        audioUrl: z.string().trim().min(1).max(4000),
        durationSeconds: z.coerce.number().int().min(0).optional(),
        from: z.string().regex(/^\+1\d{10}$/),
        providerCallId: z.string().min(1),
        to: z.string().regex(/^\+1\d{10}$/),
        transcription: z.string().trim().max(4000).optional()
      })
    )
    .min(1)
});

function getHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function getQueryValue(
  query: FastifyRequest["query"],
  key: string
): string | undefined {
  if (!query || typeof query !== "object") {
    return undefined;
  }

  const value = (query as Record<string, unknown>)[key];
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function buildRequestUrl(request: FastifyRequest): string {
  const protocol =
    getHeaderValue(request.headers["x-forwarded-proto"]) ?? request.protocol;
  const host =
    getHeaderValue(request.headers["x-forwarded-host"]) ??
    getHeaderValue(request.headers.host) ??
    request.hostname;

  return `${protocol}://${host}${request.url}`;
}

function buildUrl(pathname: string, query: Record<string, string | null | undefined> = {}): string {
  const url = new URL(pathname, env.PUBLIC_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function getFormParams(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") {
    return {};
  }

  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value[0] !== undefined && value[0] !== null) {
        params[key] = String(value[0]);
      }
      continue;
    }

    if (value !== undefined && value !== null) {
      params[key] = String(value);
    }
  }

  return params;
}

function sendTwiml(reply: FastifyReply, xml: string): void {
  reply.type("text/xml; charset=utf-8").send(xml);
}

function validateTwilioRequest(
  request: FastifyRequest,
  params: Record<string, string>
): boolean {
  const signature = getHeaderValue(request.headers["x-twilio-signature"]);

  if (!env.TWILIO_AUTH_TOKEN || !signature) {
    return false;
  }

  return twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    buildRequestUrl(request),
    params
  );
}

function handleCallsError(reply: FastifyReply, error: unknown): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        details: error.details,
        message: error.message
      }
    });
    return;
  }

  if (error instanceof z.ZodError) {
    reply.status(400).send({
      error: {
        code: "invalid_input",
        issues: error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path
        })),
        message: "Request payload is invalid."
      }
    });
    return;
  }

  throw error;
}

export async function registerCallRoutes(
  app: FastifyInstance,
  callService: CallService,
  numberStore: NumberStore,
  voicemailArchive: VoicemailArchive
): Promise<void> {
  app.post("/v1/calls/token", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      return await callService.issueVoiceToken({
        userId: request.authUser.userId
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.get("/v1/calls/history", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const query = paginationSchema.parse(request.query);
      return await callService.listCallHistory({
        limit: query.limit,
        offset: query.offset,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.get("/v1/voicemails", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const query = paginationSchema.parse(request.query);
      return await callService.listVoicemails({
        limit: query.limit,
        offset: query.offset,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.get("/v1/voicemails/media/:voicemailId", async (request, reply) => {
    try {
      const params = voicemailParamsSchema.parse(request.params);
      const recording = await voicemailArchive.readRecording({
        voicemailId: params.voicemailId
      });

      if (!recording) {
        reply.status(404).send();
        return;
      }

      reply.type(recording.contentType).send(recording.body);
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.patch(
    "/v1/voicemails/:voicemailId/read",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        if (!request.authUser) {
          throw new AppError(401, "invalid_token", "Missing authenticated user.");
        }

        const params = voicemailParamsSchema.parse(request.params);
        return await callService.markVoicemailRead({
          userId: request.authUser.userId,
          voicemailId: params.voicemailId
        });
      } catch (error) {
        handleCallsError(reply, error);
      }
    }
  );

  app.delete(
    "/v1/voicemails/:voicemailId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        if (!request.authUser) {
          throw new AppError(401, "invalid_token", "Missing authenticated user.");
        }

        const params = voicemailParamsSchema.parse(request.params);
        await callService.deleteVoicemail({
          userId: request.authUser.userId,
          voicemailId: params.voicemailId
        });
        reply.status(204).send();
      } catch (error) {
        handleCallsError(reply, error);
      }
    }
  );

  app.post(
    "/v1/devices/call-push-token",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        if (!request.authUser) {
          throw new AppError(401, "invalid_token", "Missing authenticated user.");
        }

        const body = callPushTokenSchema.parse(request.body);
        return await callService.registerCallPushToken({
          channel: body.channel,
          deviceId: body.deviceId,
          platform: body.platform,
          token: body.token,
          userId: request.authUser.userId
        });
      } catch (error) {
        handleCallsError(reply, error);
      }
    }
  );

  app.post("/v1/devices/voip-token", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = callPushTokenSchema.omit({ channel: true }).parse(request.body);
      return await callService.registerCallPushToken({
        channel: "voip",
        deviceId: body.deviceId,
        platform: body.platform,
        token: body.token,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.post("/v1/webhooks/telecom/calls/status", async (request, reply) => {
    try {
      const body = webhookSchema.parse(request.body);
      const signature = getHeaderValue(request.headers["x-bandwidth-signature"]);

      return await callService.handleStatusWebhook({
        events: body.events,
        payload: JSON.stringify(body),
        signature
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.post("/v1/webhooks/telecom/calls/inbound", async (request, reply) => {
    try {
      const body = inboundWebhookSchema.parse(request.body);
      const signature = getHeaderValue(request.headers["x-bandwidth-signature"]);

      return await callService.handleInboundWebhook({
        events: body.events,
        payload: JSON.stringify(body),
        signature
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.post("/v1/webhooks/telecom/calls/voicemail", async (request, reply) => {
    try {
      const body = voicemailWebhookSchema.parse(request.body);
      const signature = getHeaderValue(request.headers["x-bandwidth-signature"]);

      return await callService.handleVoicemailWebhook({
        events: body.events,
        payload: JSON.stringify(body),
        signature
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.post("/v1/webhooks/twilio/voice/outbound", async (request, reply) => {
    try {
      const params = getFormParams(request.body);

      if (!validateTwilioRequest(request, params)) {
        sendTwiml(
          reply.status(401),
          buildTwilioSayTwiml("The request could not be verified.")
        );
        return;
      }

      const identity = parseTwilioClientIdentity(params.From ?? params.Caller);
      const to = normalizeUsDialTarget(params.to ?? params.To);

      if (!identity) {
        sendTwiml(reply, buildTwilioSayTwiml("Invalid caller identity."));
        return;
      }

      if (!to || isEmergencyDestination(to)) {
        sendTwiml(
          reply,
          buildTwilioSayTwiml(
            "Emergency and invalid destinations must use the native dialer."
          )
        );
        return;
      }

      const currentNumber = await numberStore.findCurrentNumberByUser(identity.userId);
      if (!currentNumber || currentNumber.phoneNumberId !== identity.phoneNumberId) {
        sendTwiml(reply, buildTwilioSayTwiml("Caller identity is not authorized."));
        return;
      }

      sendTwiml(
        reply,
        buildTwilioDialTwiml({
          callerId: currentNumber.phoneNumber,
          statusCallbackUrl: `${env.PUBLIC_BASE_URL}/v1/webhooks/twilio/voice/status`,
          to
        })
      );
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.post("/v1/webhooks/twilio/voice/inbound", async (request, reply) => {
    try {
      const params = getFormParams(request.body);

      if (!validateTwilioRequest(request, params)) {
        sendTwiml(
          reply.status(401),
          buildTwilioSayTwiml("The request could not be verified.")
        );
        return;
      }

      const from = requireUsE164Number(params.From ?? params.Caller ?? params.CallerId);
      const to = requireUsE164Number(params.To ?? params.Called ?? params.CalledNumber);
      const providerCallId = params.CallSid?.trim();

      if (!from || !to || !providerCallId) {
        sendTwiml(reply, buildTwilioSayTwiml("Inbound call payload is invalid."));
        return;
      }

      const planned = await callService.planInboundCalls({
        events: [
          {
            from,
            providerCallId,
            startedAt: new Date().toISOString(),
            to
          }
        ]
      });
      const plan = planned.plans[0];

      if (!plan) {
        sendTwiml(reply, buildTwilioSayTwiml("The destination line is unavailable."));
        return;
      }

      const voicemailWebhookUrl = buildUrl("/v1/webhooks/twilio/voice/voicemail", {
        from,
        providerCallId,
        to
      });

      if (plan.action === "ring" && plan.identity) {
        sendTwiml(
          reply,
          buildTwilioClientDialTwiml({
            callerNumber: from,
            identity: plan.identity,
            ringSeconds: plan.ringSeconds,
            statusCallbackUrl: `${env.PUBLIC_BASE_URL}/v1/webhooks/twilio/voice/status`,
            voicemailWebhookUrl
          })
        );
        return;
      }

      sendTwiml(
        reply,
        buildTwilioRecordVoicemailTwiml({
          voicemailWebhookUrl
        })
      );
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.post("/v1/webhooks/twilio/voice/voicemail", async (request, reply) => {
    try {
      const params = getFormParams(request.body);

      if (!validateTwilioRequest(request, params)) {
        sendTwiml(
          reply.status(401),
          buildTwilioSayTwiml("The request could not be verified.")
        );
        return;
      }

      const from =
        requireUsE164Number(getQueryValue(request.query, "from")) ??
        requireUsE164Number(params.From ?? params.Caller ?? params.CallerId);
      const to =
        requireUsE164Number(getQueryValue(request.query, "to")) ??
        requireUsE164Number(params.To ?? params.Called ?? params.CalledNumber);
      const providerCallId =
        getQueryValue(request.query, "providerCallId") ?? params.CallSid?.trim();
      const audioUrl = params.RecordingUrl?.trim();
      const durationSeconds =
        params.RecordingDuration && /^\d+$/.test(params.RecordingDuration)
          ? Number(params.RecordingDuration)
          : undefined;

      if (!from || !to || !providerCallId || !audioUrl) {
        sendTwiml(reply, buildTwilioSayTwiml("Voicemail payload is invalid."));
        return;
      }

      await callService.recordVoicemails({
        events: [
          {
            audioUrl: `${audioUrl}.mp3`,
            durationSeconds,
            from,
            providerCallId,
            to
          }
        ]
      });

      sendTwiml(reply, buildTwilioSayTwiml("Thank you. Your voicemail has been saved."));
    } catch (error) {
      handleCallsError(reply, error);
    }
  });

  app.post("/v1/webhooks/twilio/voice/status", async (request, reply) => {
    try {
      const params = getFormParams(request.body);

      if (!validateTwilioRequest(request, params)) {
        throw new AppError(
          401,
          "invalid_webhook_signature",
          "The Twilio webhook signature could not be verified."
        );
      }

      const providerCallId = params.CallSid?.trim();
      const status = params.CallStatus?.trim();
      const from = requireUsE164Number(params.From ?? params.Caller ?? params.CallerId);
      const to = requireUsE164Number(params.To ?? params.Called);

      if (!providerCallId || !status || !from || !to) {
        throw new AppError(
          400,
          "invalid_input",
          "Twilio voice status callback is missing required fields."
        );
      }

      const durationSeconds =
        params.CallDuration && /^\d+$/.test(params.CallDuration)
          ? Number(params.CallDuration)
          : undefined;
      const endedAt =
        status.toLowerCase() === "completed" || durationSeconds !== undefined
          ? new Date().toISOString()
          : undefined;

      return await callService.recordStatusEvents({
        events: [
          {
            durationSeconds,
            endedAt,
            from,
            providerCallId,
            status,
            to
          }
        ]
      });
    } catch (error) {
      handleCallsError(reply, error);
    }
  });
}
