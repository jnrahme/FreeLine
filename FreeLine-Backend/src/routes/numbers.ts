import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { AppError } from "../auth/errors.js";
import { requireAuth } from "../auth/guard.js";
import type { NumberService } from "../numbers/service.js";

const searchQuerySchema = z.object({
  areaCode: z.string().regex(/^\d{3}$/).optional()
});

const claimSchema = z.object({
  areaCode: z.string().regex(/^\d{3}$/),
  locality: z.string().min(1),
  nationalFormat: z.string().min(4),
  phoneNumber: z.string().regex(/^\+1\d{10}$/),
  region: z.string().min(2)
});

function handleNumbersError(reply: FastifyReply, error: unknown): void {
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

export async function registerNumberRoutes(
  app: FastifyInstance,
  numberService: NumberService
): Promise<void> {
  app.get("/v1/numbers/search", async (request, reply) => {
    try {
      const query = searchQuerySchema.parse(request.query);
      const areaCode = query.areaCode ?? "415";
      const numbers = await numberService.searchNumbers(areaCode);

      return {
        areaCode,
        numbers
      };
    } catch (error) {
      handleNumbersError(reply, error);
    }
  });

  app.get("/v1/numbers/me", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      return {
        number: await numberService.getCurrentNumber(request.authUser.userId)
      };
    } catch (error) {
      handleNumbersError(reply, error);
    }
  });

  app.post("/v1/numbers/claim", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = claimSchema.parse(request.body);
      return {
        number: await numberService.claimNumber({
          selection: body,
          userId: request.authUser.userId
        })
      };
    } catch (error) {
      handleNumbersError(reply, error);
    }
  });

  app.post("/v1/numbers/release", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      return {
        number: await numberService.releaseCurrentNumber(request.authUser.userId)
      };
    } catch (error) {
      handleNumbersError(reply, error);
    }
  });
}
