import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import type { NumberLifecycleService } from "../numbers/lifecycle-service.js";

const runLifecycleSchema = z
  .object({
    now: z.string().datetime().optional()
  })
  .default({});

const restoreSchema = z.object({
  now: z.string().datetime().optional(),
  phoneNumber: z.string().regex(/^\+1\d{10}$/),
  userId: z.string().min(8)
});

function requireMaintenanceKey(request: FastifyRequest): void {
  const maintenanceKey = request.headers["x-maintenance-key"];
  const token = Array.isArray(maintenanceKey) ? maintenanceKey[0] : maintenanceKey;

  if (!token || token !== env.MAINTENANCE_API_KEY) {
    throw new AppError(
      403,
      "maintenance_key_required",
      "A valid maintenance key is required for this route."
    );
  }
}

function handleLifecycleError(reply: FastifyReply, error: unknown): void {
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

export async function registerNumberLifecycleRoutes(
  app: FastifyInstance,
  numberLifecycleService: NumberLifecycleService
): Promise<void> {
  app.post("/v1/internal/numbers/lifecycle/run", async (request, reply) => {
    try {
      requireMaintenanceKey(request);
      const body = runLifecycleSchema.parse(request.body ?? {});
      const [activationSweep, inactivitySweep, quarantineSweep] = await Promise.all([
        numberLifecycleService.runActivationExpirySweep({
          now: body.now
        }),
        numberLifecycleService.runInactivitySweep({
          now: body.now
        }),
        numberLifecycleService.runQuarantineAvailabilitySweep({
          now: body.now
        })
      ]);

      return {
        activationSweep: {
          released: activationSweep.released,
          releasedCount: activationSweep.released.length
        },
        inactivitySweep: {
          reclaimed: inactivitySweep.reclaimed,
          reclaimedCount: inactivitySweep.reclaimed.length,
          warningCount: inactivitySweep.warnings.length,
          warnings: inactivitySweep.warnings
        },
        quarantineSweep: {
          available: quarantineSweep.available,
          availableCount: quarantineSweep.available.length
        }
      };
    } catch (error) {
      handleLifecycleError(reply, error);
    }
  });

  app.post("/v1/internal/numbers/restore", async (request, reply) => {
    try {
      requireMaintenanceKey(request);
      const body = restoreSchema.parse(request.body);
      return {
        number: await numberLifecycleService.restoreQuarantinedNumber(body)
      };
    } catch (error) {
      handleLifecycleError(reply, error);
    }
  });
}
