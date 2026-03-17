import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { AppError } from "../auth/errors.js";
import {
  authenticateAccessToken,
  getBearerToken,
  requireAuth
} from "../auth/guard.js";
import type { RealtimeGateway } from "../notifications/types.js";
import type { MessageService } from "../messages/service.js";

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  to: z.string().regex(/^\+1\d{10}$/)
});

const statusWebhookSchema = z.object({
  events: z
    .array(
      z.object({
        providerMessageId: z.string().min(1),
        status: z.string().min(1)
      })
    )
    .min(1)
});

const inboundWebhookSchema = z.object({
  events: z
    .array(
      z.object({
        body: z.string().max(1000),
        from: z.string().regex(/^\+1\d{10}$/),
        to: z.string().regex(/^\+1\d{10}$/)
      })
    )
    .min(1)
});

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid()
});

const pushTokenSchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
  platform: z.enum(["ios", "android"]),
  token: z.string().trim().min(1).max(4000)
});

const blockSchema = z.object({
  blockedNumber: z.string().regex(/^\+1\d{10}$/)
});

const reportSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  reportedNumber: z.string().regex(/^\+1\d{10}$/)
});

const phoneNumberParamSchema = z.object({
  phoneNumber: z.string().regex(/^\+1\d{10}$/)
});

const realtimeQuerySchema = z.object({
  accessToken: z.string().trim().min(1).optional()
});

function handleMessagesError(reply: FastifyReply, error: unknown): void {
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

function getHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

export async function registerMessageRoutes(
  app: FastifyInstance,
  messageService: MessageService,
  realtimeGateway: RealtimeGateway
): Promise<void> {
  app.post("/v1/messages", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = sendMessageSchema.parse(request.body);
      return await messageService.sendMessage({
        body: body.body,
        to: body.to,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleMessagesError(reply, error);
    }
  });

  app.get("/v1/conversations", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const query = paginationSchema.parse(request.query);
      return await messageService.listConversations({
        limit: query.limit,
        offset: query.offset,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleMessagesError(reply, error);
    }
  });

  app.get(
    "/v1/conversations/:conversationId/messages",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        if (!request.authUser) {
          throw new AppError(401, "invalid_token", "Missing authenticated user.");
        }

        const params = conversationParamsSchema.parse(request.params);
        const query = paginationSchema.parse(request.query);

        return await messageService.listMessages({
          conversationId: params.conversationId,
          limit: query.limit,
          offset: query.offset,
          userId: request.authUser.userId
        });
      } catch (error) {
        handleMessagesError(reply, error);
      }
    }
  );

  app.post("/v1/webhooks/telecom/messages/status", async (request, reply) => {
    try {
      const body = statusWebhookSchema.parse(request.body);
      const signature = getHeaderValue(request.headers["x-bandwidth-signature"]);

      return await messageService.handleStatusWebhook({
        events: body.events,
        payload: JSON.stringify(body),
        signature
      });
    } catch (error) {
      handleMessagesError(reply, error);
    }
  });

  app.post("/v1/webhooks/telecom/messages/inbound", async (request, reply) => {
    try {
      const body = inboundWebhookSchema.parse(request.body);
      const signature = getHeaderValue(request.headers["x-bandwidth-signature"]);

      return await messageService.handleInboundWebhook({
        events: body.events,
        payload: JSON.stringify(body),
        signature
      });
    } catch (error) {
      handleMessagesError(reply, error);
    }
  });

  app.post("/v1/devices/push-token", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = pushTokenSchema.parse(request.body);
      return await messageService.registerPushToken({
        deviceId: body.deviceId,
        platform: body.platform,
        token: body.token,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleMessagesError(reply, error);
    }
  });

  app.patch(
    "/v1/conversations/:conversationId/read",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        if (!request.authUser) {
          throw new AppError(401, "invalid_token", "Missing authenticated user.");
        }

        const params = conversationParamsSchema.parse(request.params);
        return await messageService.markConversationRead({
          conversationId: params.conversationId,
          userId: request.authUser.userId
        });
      } catch (error) {
        handleMessagesError(reply, error);
      }
    }
  );

  app.post("/v1/blocks", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = blockSchema.parse(request.body);
      return await messageService.blockNumber({
        blockedNumber: body.blockedNumber,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleMessagesError(reply, error);
    }
  });

  app.delete(
    "/v1/blocks/:phoneNumber",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        if (!request.authUser) {
          throw new AppError(401, "invalid_token", "Missing authenticated user.");
        }

        const params = phoneNumberParamSchema.parse(request.params);
        await messageService.unblockNumber({
          blockedNumber: params.phoneNumber,
          userId: request.authUser.userId
        });
        reply.status(204).send();
      } catch (error) {
        handleMessagesError(reply, error);
      }
    }
  );

  app.post("/v1/reports", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = reportSchema.parse(request.body);
      return await messageService.reportNumber({
        reason: body.reason,
        reportedNumber: body.reportedNumber,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleMessagesError(reply, error);
    }
  });

  app.get<{ Querystring: { accessToken?: string } }>(
    "/v1/realtime/messages",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const query = realtimeQuerySchema.parse(request.query);
        const token = getBearerToken(request.headers.authorization) ?? query.accessToken;

        if (!token) {
          reply.status(401).send({
            error: {
              code: "invalid_token",
              message: "Missing bearer token."
            }
          });
          return;
        }

        try {
          request.authUser = await authenticateAccessToken(token);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid or expired access token.";

          reply.status(401).send({
            error: {
              code: "invalid_token",
              message
            }
          });
        }
      }
    },
    async (socket, request) => {
      if (!request.authUser) {
        socket.close(4401, "Missing authenticated user.");
        return;
      }

      realtimeGateway.attachConnection({
        socket,
        userId: request.authUser.userId
      });
    }
  );
}
