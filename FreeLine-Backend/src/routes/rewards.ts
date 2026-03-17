import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import type { AbuseService } from "../abuse/service.js";
import { AppError } from "../auth/errors.js";
import { requireAuth } from "../auth/guard.js";

const rewardClaimSchema = z.object({
  rewardType: z.enum(["text_events", "call_minutes"])
});

function handleRewardsError(reply: FastifyReply, error: unknown): void {
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

export async function registerRewardRoutes(
  app: FastifyInstance,
  abuseService: AbuseService
): Promise<void> {
  app.get("/v1/rewards/status", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      return await abuseService.getRewardsStatus(request.authUser.userId);
    } catch (error) {
      handleRewardsError(reply, error);
    }
  });

  app.post("/v1/rewards/claim", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = rewardClaimSchema.parse(request.body);
      return await abuseService.claimReward({
        rewardType: body.rewardType,
        userId: request.authUser.userId
      });
    } catch (error) {
      handleRewardsError(reply, error);
    }
  });
}
