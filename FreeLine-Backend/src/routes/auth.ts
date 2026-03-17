import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { AppError } from "../auth/errors.js";
import { requireAuth } from "../auth/guard.js";
import type { AuthService } from "../auth/service.js";
import type { DevicePlatform } from "../auth/types.js";

const devicePlatformSchema = z.enum(["ios", "android"]);

const emailStartSchema = z.object({
  captchaToken: z.string().optional().nullable(),
  email: z.email(),
  inviteCode: z.string().min(4).max(32).optional().nullable(),
  password: z.string().min(8)
});

const emailVerifySchema = z.object({
  fingerprint: z.string().min(4).optional(),
  platform: devicePlatformSchema.optional(),
  pushToken: z.string().optional().nullable(),
  token: z.string().min(16)
});

const oauthSchema = z.object({
  captchaToken: z.string().optional().nullable(),
  fingerprint: z.string().min(4).optional(),
  identityToken: z.string().min(4),
  inviteCode: z.string().min(4).max(32).optional().nullable(),
  platform: devicePlatformSchema.optional(),
  pushToken: z.string().optional().nullable()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16)
});

const deviceRegisterSchema = z.object({
  fingerprint: z.string().min(4),
  platform: devicePlatformSchema,
  pushToken: z.string().optional().nullable()
});

function handleAppError(reply: FastifyReply, error: unknown): void {
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

export async function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService
): Promise<void> {
  app.post("/v1/auth/email/start", async (request, reply) => {
    try {
      const body = emailStartSchema.parse(request.body);
      const result = await authService.startEmailAuth(body);
      return reply.status(202).send(result);
    } catch (error) {
      handleAppError(reply, error);
    }
  });

  app.post("/v1/auth/email/verify", async (request, reply) => {
    try {
      const body = emailVerifySchema.parse(request.body);
      if ((body.fingerprint && !body.platform) || (!body.fingerprint && body.platform)) {
        throw new AppError(
          400,
          "invalid_device_registration",
          "Fingerprint and platform must be provided together."
        );
      }

      return await authService.verifyEmail({
        fingerprint: body.fingerprint,
        platform: body.platform as DevicePlatform | undefined,
        pushToken: body.pushToken,
        token: body.token
      });
    } catch (error) {
      handleAppError(reply, error);
    }
  });

  app.post("/v1/auth/oauth/apple", async (request, reply) => {
    try {
      const body = oauthSchema.parse(request.body);
      return await authService.oauthSignIn({
        captchaToken: body.captchaToken,
        fingerprint: body.fingerprint,
        identityToken: body.identityToken,
        inviteCode: body.inviteCode,
        platform: body.platform as DevicePlatform | undefined,
        provider: "apple",
        pushToken: body.pushToken
      });
    } catch (error) {
      handleAppError(reply, error);
    }
  });

  app.post("/v1/auth/oauth/google", async (request, reply) => {
    try {
      const body = oauthSchema.parse(request.body);
      return await authService.oauthSignIn({
        captchaToken: body.captchaToken,
        fingerprint: body.fingerprint,
        identityToken: body.identityToken,
        inviteCode: body.inviteCode,
        platform: body.platform as DevicePlatform | undefined,
        provider: "google",
        pushToken: body.pushToken
      });
    } catch (error) {
      handleAppError(reply, error);
    }
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);
      return await authService.refreshAuth(body);
    } catch (error) {
      handleAppError(reply, error);
    }
  });

  app.post("/v1/devices/register", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      const body = deviceRegisterSchema.parse(request.body);
      const device = await authService.registerDevice({
        fingerprint: body.fingerprint,
        platform: body.platform,
        pushToken: body.pushToken,
        userId: request.authUser.userId
      });

      return {
        device
      };
    } catch (error) {
      handleAppError(reply, error);
    }
  });

  app.delete("/v1/account", { preHandler: requireAuth }, async (request, reply) => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "invalid_token", "Missing authenticated user.");
      }

      await authService.deleteAccount(request.authUser.userId);
      return reply.status(204).send();
    } catch (error) {
      handleAppError(reply, error);
    }
  });
}
