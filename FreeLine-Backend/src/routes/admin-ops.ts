import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { requireAdmin } from "../admin/guard.js";
import type { AdminOpsService } from "../admin/ops-service.js";
import { AppError } from "../auth/errors.js";

const userParamsSchema = z.object({
  userId: z.string().min(8)
});

const abuseEventParamsSchema = z.object({
  abuseEventId: z.string().min(8)
});

const searchUsersQuerySchema = z.object({
  q: z.string().default("")
});

const suspendSchema = z.object({
  reason: z.string().trim().min(3).max(120).optional().nullable()
});

const abuseQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["all", "open"]).optional()
});

const numbersQuerySchema = z.object({
  status: z.enum(["assigned", "available", "quarantined"]).optional()
});

const restoreNumberSchema = z.object({
  phoneNumber: z.string().regex(/^\+1\d{10}$/),
  userId: z.string().min(8)
});

function handleAdminOpsError(reply: FastifyReply, error: unknown): void {
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

export async function registerAdminOpsRoutes(
  app: FastifyInstance,
  adminOpsService: AdminOpsService
): Promise<void> {
  app.get("/v1/admin/users", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const query = searchUsersQuerySchema.parse(request.query);
      return await adminOpsService.searchUsers(query.q);
    } catch (error) {
      handleAdminOpsError(reply, error);
    }
  });

  app.get("/v1/admin/users/:userId", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const params = userParamsSchema.parse(request.params);
      return await adminOpsService.getUserDetail(params.userId);
    } catch (error) {
      handleAdminOpsError(reply, error);
    }
  });

  app.post(
    "/v1/admin/users/:userId/suspend",
    { preHandler: requireAdmin },
    async (request, reply) => {
      try {
        if (!request.adminUser) {
          throw new AppError(401, "invalid_admin_token", "Missing admin context.");
        }

        const params = userParamsSchema.parse(request.params);
        const body = suspendSchema.parse(request.body ?? {});
        return await adminOpsService.suspendUser({
          adminUserId: request.adminUser.adminUserId,
          reason: body.reason,
          userId: params.userId
        });
      } catch (error) {
        handleAdminOpsError(reply, error);
      }
    }
  );

  app.post(
    "/v1/admin/users/:userId/unsuspend",
    { preHandler: requireAdmin },
    async (request, reply) => {
      try {
        if (!request.adminUser) {
          throw new AppError(401, "invalid_admin_token", "Missing admin context.");
        }

        const params = userParamsSchema.parse(request.params);
        return await adminOpsService.unsuspendUser({
          adminUserId: request.adminUser.adminUserId,
          userId: params.userId
        });
      } catch (error) {
        handleAdminOpsError(reply, error);
      }
    }
  );

  app.post(
    "/v1/admin/users/:userId/force-release-number",
    { preHandler: requireAdmin },
    async (request, reply) => {
      try {
        const params = userParamsSchema.parse(request.params);
        return await adminOpsService.forceReleaseNumber({
          userId: params.userId
        });
      } catch (error) {
        handleAdminOpsError(reply, error);
      }
    }
  );

  app.get("/v1/admin/abuse-queue", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const query = abuseQueueQuerySchema.parse(request.query);
      return await adminOpsService.listAbuseQueue(query);
    } catch (error) {
      handleAdminOpsError(reply, error);
    }
  });

  app.post(
    "/v1/admin/abuse-queue/:abuseEventId/dismiss",
    { preHandler: requireAdmin },
    async (request, reply) => {
      try {
        if (!request.adminUser) {
          throw new AppError(401, "invalid_admin_token", "Missing admin context.");
        }

        const params = abuseEventParamsSchema.parse(request.params);
        return await adminOpsService.dismissAbuseEvent({
          abuseEventId: params.abuseEventId,
          adminUserId: request.adminUser.adminUserId
        });
      } catch (error) {
        handleAdminOpsError(reply, error);
      }
    }
  );

  app.post(
    "/v1/admin/abuse-queue/:abuseEventId/confirm",
    { preHandler: requireAdmin },
    async (request, reply) => {
      try {
        if (!request.adminUser) {
          throw new AppError(401, "invalid_admin_token", "Missing admin context.");
        }

        const params = abuseEventParamsSchema.parse(request.params);
        return await adminOpsService.confirmAbuseEvent({
          abuseEventId: params.abuseEventId,
          adminUserId: request.adminUser.adminUserId
        });
      } catch (error) {
        handleAdminOpsError(reply, error);
      }
    }
  );

  app.get("/v1/admin/numbers", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const query = numbersQuerySchema.parse(request.query);
      return await adminOpsService.listNumbers(query);
    } catch (error) {
      handleAdminOpsError(reply, error);
    }
  });

  app.post("/v1/admin/numbers/restore", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      const body = restoreNumberSchema.parse(request.body);
      return await adminOpsService.restoreNumber(body);
    } catch (error) {
      handleAdminOpsError(reply, error);
    }
  });

  app.get("/v1/admin/cost", { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      return await adminOpsService.getCostDashboard();
    } catch (error) {
      handleAdminOpsError(reply, error);
    }
  });

  app.get("/v1/admin/system-status", { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      return adminOpsService.getSystemStatus();
    } catch (error) {
      handleAdminOpsError(reply, error);
    }
  });
}
