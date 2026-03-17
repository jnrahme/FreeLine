import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { AppError } from "../auth/errors.js";
import { requireAuth } from "../auth/guard.js";
import { AnalyticsService } from "../analytics/service.js";

const analyticsEventSchema = z.object({
  eventType: z.enum([
    "ad_impression",
    "ad_click",
    "rewarded_video_complete",
    "rewarded_video_abandoned"
  ]),
  properties: z.record(z.string(), z.unknown())
});

function handleAnalyticsError(reply: FastifyReply, error: unknown): void {
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

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  analyticsService: AnalyticsService
): Promise<void> {
  app.post("/v1/analytics/events", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = analyticsEventSchema.parse(request.body);
      return await analyticsService.trackEvent({
        eventType: body.eventType,
        properties: body.properties,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleAnalyticsError(reply, error);
    }
  });
}
