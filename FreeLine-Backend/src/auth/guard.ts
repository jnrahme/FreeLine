import type { FastifyReply, FastifyRequest } from "fastify";

import { verifyAccessToken } from "./tokens.js";

export function getBearerToken(
  authorization: string | string[] | undefined
): string | null {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}

export async function authenticateAccessToken(token: string): Promise<{
  email: string;
  userId: string;
}> {
  const payload = await verifyAccessToken(token);

  return {
    email: payload.email,
    userId: payload.userId
  };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = getBearerToken(request.headers.authorization);

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
