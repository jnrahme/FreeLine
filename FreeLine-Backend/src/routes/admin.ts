import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { AppError } from "../auth/errors.js";
import { requireAdmin } from "../admin/guard.js";
import type { AdminService } from "../admin/service.js";

const adminLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8)
});

const createInviteCodeSchema = z.object({
  code: z.string().min(4).max(32).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  maxUses: z.number().int().min(1)
});

function handleAdminError(reply: FastifyReply, error: unknown): void {
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

export async function registerAdminRoutes(
  app: FastifyInstance,
  adminService: AdminService
): Promise<void> {
  app.post("/v1/admin/auth/login", async (request, reply) => {
    try {
      const body = adminLoginSchema.parse(request.body);
      return adminService.login(body);
    } catch (error) {
      handleAdminError(reply, error);
    }
  });

  app.get("/v1/admin/me", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      if (!request.adminUser) {
        throw new AppError(401, "invalid_admin_token", "Missing admin context.");
      }

      return {
        admin: await adminService.getAdminUser(request.adminUser.adminUserId)
      };
    } catch (error) {
      handleAdminError(reply, error);
    }
  });

  app.get("/v1/admin/invite-codes", { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      return {
        inviteCodes: await adminService.listInviteCodes()
      };
    } catch (error) {
      handleAdminError(reply, error);
    }
  });

  app.post("/v1/admin/invite-codes", { preHandler: requireAdmin }, async (request, reply) => {
    try {
      if (!request.adminUser) {
        throw new AppError(401, "invalid_admin_token", "Missing admin context.");
      }

      const body = createInviteCodeSchema.parse(request.body);
      return {
        inviteCode: await adminService.createInviteCode({
          adminUserId: request.adminUser.adminUserId,
          code: body.code,
          expiresAt: body.expiresAt,
          maxUses: body.maxUses
        })
      };
    } catch (error) {
      handleAdminError(reply, error);
    }
  });
}
