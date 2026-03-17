import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import type { AbuseService } from "../abuse/service.js";
import { AppError } from "../auth/errors.js";
import { requireAuth } from "../auth/guard.js";
import { SubscriptionService } from "../subscriptions/service.js";

const verifySubscriptionSchema = z.object({
  expiresAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  platform: z.enum(["ios", "android"]),
  productId: z.string().trim().min(1),
  provider: z.enum(["dev", "revenuecat"]).default("dev"),
  transactionId: z.string().trim().min(1),
  verificationToken: z.string().trim().min(1).optional()
});

function handleSubscriptionsError(reply: FastifyReply, error: unknown): void {
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

export async function registerSubscriptionRoutes(
  app: FastifyInstance,
  subscriptionService: SubscriptionService,
  abuseService: AbuseService
): Promise<void> {
  app.get("/v1/subscriptions/status", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const [statusPayload, rewardStatus] = await Promise.all([
        subscriptionService.getStatus(request.authUser.userId),
        abuseService.getRewardsStatus(request.authUser.userId)
      ]);

      return {
        allowances: {
          calls: rewardStatus.calls,
          messages: rewardStatus.messages
        },
        catalog: SubscriptionService.productCatalog(),
        products: statusPayload.products,
        rewardClaims: rewardStatus.rewardClaims,
        status: statusPayload.status,
        usagePlan: statusPayload.usagePlan
      };
    } catch (error) {
      handleSubscriptionsError(reply, error);
    }
  });

  app.post("/v1/subscriptions/verify", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = verifySubscriptionSchema.parse(request.body);
      const payload = await subscriptionService.verifyPurchase({
        expiresAt: body.expiresAt ?? null,
        metadata: body.metadata,
        platform: body.platform,
        productId: body.productId,
        provider: body.provider,
        transactionId: body.transactionId,
        userId: request.authUser.userId,
        verificationToken: body.verificationToken
      });
      const rewardStatus = await abuseService.getRewardsStatus(request.authUser.userId);

      return {
        allowances: {
          calls: rewardStatus.calls,
          messages: rewardStatus.messages
        },
        product: payload.product,
        status: payload.status,
        verifiedEntitlements: payload.verifiedEntitlements
      };
    } catch (error) {
      handleSubscriptionsError(reply, error);
    }
  });
}
