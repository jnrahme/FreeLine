import type { FastifyReply, FastifyRequest } from "fastify";

import { AppError } from "../auth/errors.js";
import { verifyAdminAccessToken } from "./tokens.js";

export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(
      401,
      "invalid_admin_token",
      "Missing admin bearer token."
    );
  }

  const token = authorization.slice("Bearer ".length).trim();
  const payload = await verifyAdminAccessToken(token);
  request.adminUser = payload;
}
